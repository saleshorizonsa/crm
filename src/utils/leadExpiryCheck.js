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
            title: '🔄 Lead Returned to Opportunities',
            message: `"${name}" had no activity for 3 days and has been returned to your Opportunities. Plan your next action and convert again when ready.`,
            metadata: { opportunity_id: lead.opportunity_id },
          });
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
            message: `"${name}" has been in the Lead stage for ${daysSince} days with no progress. Move it forward or it returns to Opportunities tomorrow.`,
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
