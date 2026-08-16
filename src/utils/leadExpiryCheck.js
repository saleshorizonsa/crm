import { supabase } from '../lib/supabase';

const DAY_MS = 1000 * 60 * 60 * 24;

// Returns the "last activity" reference time for a converted lead: stage_changed_at
// (updated whenever the deal's stage changes) with fallbacks to converted_at /
// created_at. A lead that advances resets its timer via stage_changed_at; one that
// never leaves stage='lead' is returned to Opportunities after 3 days.
function referenceTime(lead) {
  return new Date(lead.stage_changed_at || lead.converted_at || lead.created_at);
}

// Fire-and-forget notification insert using the actual notifications schema
// (is_read + metadata; there is no related_id / read column). Never throws.
async function notify({ userId, companyId, type, title, message, metadata }) {
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({
      user_id:    userId,
      company_id: companyId,
      type,
      title,
      message,
      metadata:   metadata || null,
      is_read:    false,
    });
  } catch (_) { /* notifications are best-effort */ }
}

// Escalate when a salesman has had a 2nd (or later) lead bounce back in the SAME
// month. Flags the salesman once per month and notifies their manager + them.
// Idempotent: the month flag is created only once (subsequent bounces no-op).
async function checkSecondBounce(companyId, ownerId, opportunityId, now) {
  if (!companyId || !ownerId) return;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const flagMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  // Count ALL of this salesman's bounces this month (across every opportunity).
  const { data: monthBounces } = await supabase
    .from('bounce_back_logs')
    .select('id')
    .eq('company_id', companyId)
    .eq('owner_id', ownerId)
    .gte('bounced_at', monthStart)
    .lte('bounced_at', monthEnd);
  const totalBounces = monthBounces?.length || 0;
  if (totalBounces < 2) return; // not the 2nd bounce yet

  // Only flag/notify once per salesman per month.
  const { data: existingFlag } = await supabase
    .from('salesman_flags')
    .select('id')
    .eq('company_id', companyId)
    .eq('owner_id', ownerId)
    .eq('flag_type', 'bounce_back_2nd')
    .eq('flag_month', flagMonth)
    .maybeSingle();
  if (existingFlag) return;

  await supabase.from('salesman_flags').insert({
    company_id: companyId,
    owner_id: ownerId,
    flag_type: 'bounce_back_2nd',
    flag_month: flagMonth,
    details: { bounce_count: totalBounces, opportunity_id: opportunityId, month: flagMonth },
    flagged_at: now.toISOString(),
    reviewed: false,
    created_at: now.toISOString(),
  });

  // Mark this month's bounce logs for this salesman as escalated.
  await supabase
    .from('bounce_back_logs')
    .update({ escalated: true, escalated_at: now.toISOString() })
    .eq('company_id', companyId)
    .eq('owner_id', ownerId)
    .gte('bounced_at', monthStart)
    .lte('bounced_at', monthEnd);

  const { data: salesman } = await supabase
    .from('users')
    .select('full_name, reports_to')
    .eq('id', ownerId)
    .single();

  await notify({
    userId: salesman?.reports_to,
    companyId,
    type: 'bounce_back_escalation',
    title: '🚨 Escalation: 2nd Bounce-Back',
    message: `${salesman?.full_name || 'A salesman'} has had ${totalBounces} leads bounce back this month without contact. This requires your immediate attention. Please review and intervene.`,
    metadata: { owner_id: ownerId, bounce_count: totalBounces, month: flagMonth },
  });
  await notify({
    userId: ownerId,
    companyId,
    type: 'bounce_back_warning',
    title: '⚠️ Multiple Bounce-Backs',
    message: `You have had ${totalBounces} leads bounce back this month. Your manager has been notified. Please ensure you contact leads within 3 days.`,
    metadata: { bounce_count: totalBounces, month: flagMonth },
  });
}

/**
 * Return converted leads to Opportunities when they've sat in the Lead stage for
 * 3+ days with no progress, and warn the owner on day 2.
 *
 * @returns {{ warnings:number, expired:number }}
 */
export async function checkExpiredLeads(companyId, _userId) {
  if (!companyId) return { warnings: 0, expired: 0 };

  try {
    const { data: leads, error } = await supabase
      .from('deals')
      .select(`
        id, title, amount, opportunity_id, stage_changed_at, converted_at, created_at,
        lead_warning_sent, owner_id,
        opportunity:opportunities!opportunity_id(id, customer_name, planned_amount, owner_id)
      `)
      .eq('stage', 'lead')
      .eq('company_id', companyId)
      .not('opportunity_id', 'is', null);

    if (error || !leads?.length) return { warnings: 0, expired: 0 };

    const now = new Date();
    let warned = 0;
    let expired = 0;

    for (const lead of leads) {
      const daysSince = Math.floor((now - referenceTime(lead)) / DAY_MS);
      const name = lead.opportunity?.customer_name || lead.title || 'Lead';

      if (daysSince >= 3) {
        // ── Expire: return the opportunity to "open" and remove the deal ──
        if (lead.opportunity_id) {
          await supabase
            .from('opportunities')
            .update({ status: 'open', deal_id: null, converted_at: null, updated_at: now.toISOString() })
            .eq('id', lead.opportunity_id);
        }
        const { error: delErr } = await supabase.from('deals').delete().eq('id', lead.id);
        if (!delErr) {
          expired += 1;
          await notify({
            userId: lead.owner_id,
            companyId,
            type: 'lead_returned',
            title: '🔄 Lead Returned to Current Sales Plan',
            message: `"${name}" had no activity for 3 days and has been returned to your Current Sales Plan. Plan your next action and convert again when ready.`,
            metadata: { opportunity_id: lead.opportunity_id },
          });

          // ── Bounce-back tracking + 2nd-bounce escalation ──
          if (lead.opportunity_id) {
            const { data: opp } = await supabase
              .from('opportunities')
              .select('bounce_count')
              .eq('id', lead.opportunity_id)
              .single();
            const newBounceCount = (opp?.bounce_count || 0) + 1;

            await supabase
              .from('opportunities')
              .update({
                bounce_count: newBounceCount,
                last_bounced_at: now.toISOString(),
                updated_at: now.toISOString(),
              })
              .eq('id', lead.opportunity_id);

            await supabase.from('bounce_back_logs').insert({
              company_id: companyId,
              deal_id: lead.id,
              opportunity_id: lead.opportunity_id,
              owner_id: lead.owner_id,
              bounce_count: newBounceCount,
              bounced_at: now.toISOString(),
              reason: 'No contact within 3 days',
              escalated: false,
              created_at: now.toISOString(),
            });

            await checkSecondBounce(companyId, lead.owner_id, lead.opportunity_id, now);
          }
        }
      } else if (daysSince >= 2 && !lead.lead_warning_sent) {
        // ── Warn on day 2 (once) ──
        const { error: updErr } = await supabase
          .from('deals')
          .update({ lead_warning_sent: true, updated_at: now.toISOString() })
          .eq('id', lead.id);
        if (!updErr) {
          warned += 1;
          await notify({
            userId: lead.owner_id,
            companyId,
            type: 'lead_expiry_warning',
            title: '⚠ Lead Expiring Soon',
            message: `"${name}" has been in the Lead stage for ${daysSince} days with no progress. Move it forward or it returns to your Current Sales Plan tomorrow.`,
            metadata: { deal_id: lead.id, opportunity_id: lead.opportunity_id },
          });
        }
      }
    }

    return { warnings: warned, expired };
  } catch (err) {
    console.error('checkExpiredLeads:', err);
    return { warnings: 0, expired: 0 };
  }
}
