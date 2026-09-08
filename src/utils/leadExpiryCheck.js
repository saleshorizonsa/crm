import { supabase } from '../lib/supabase';

const DAY_MS = 1000 * 60 * 60 * 24;

// Days a converted lead may sit in the Lead stage with no contact before it is
// moved out of the Funnel and parked in Future Orders.
const SLA_DAYS = 3;

export const SLA_REASON = 'No contact within 3-day SLA';

// Opportunity status used once a lead has been parked in Future Orders. It is
// deliberately NOT 'open': 'open' is what the Current Sales Plan, the KPI strip
// and Customer Master query for current-month planning, and a bounced lead must
// not reappear there.
//
// opportunities.status carries a CHECK constraint that currently only permits
// open / converted / won / lost, so this value is rejected (SQLSTATE 23514)
// until migrations/add_opportunity_moved_to_future_status.sql has been applied.
// Until then we fall back to leaving the row 'open' but pushing expected_month
// to the Future Order's month, which is what actually takes it out of the
// current month's plan — every current-plan query filters status AND month.
const FUTURE_STATUS = 'moved_to_future';
const CHECK_VIOLATION = '23514';
const UNDEFINED_COLUMN = '42703';

// Returns the "last activity" reference time for a converted lead: stage_changed_at
// (updated whenever the deal's stage changes) with fallbacks to converted_at /
// created_at. A lead that advances resets its timer via stage_changed_at; one that
// never leaves stage='lead' is moved to Future Orders after 3 days.
function referenceTime(lead) {
  return new Date(lead.stage_changed_at || lead.converted_at || lead.created_at);
}

// First day of next month, as a YYYY-MM-01 date string — Future Orders are
// planned a month out, never into the month that is already being executed.
function nextMonthDate(now) {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
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

// Remove a deal from the Funnel, clearing the child rows that would otherwise
// block the delete.
//
// This is the fix for the bug that stalled the whole sweep: `activities.deal_id`
// carries a restricting foreign key (migrations/add_activity_log.sql tried to
// declare it ON DELETE SET NULL via ADD COLUMN IF NOT EXISTS, but the column
// already existed so the clause never applied). Every lead that has been worked
// at all has activities, so a bare delete fails with 23503 on exactly the deals
// this sweep is meant to clear. dealService.deleteDealWithCascade() works around
// the same constraint on the manual delete path; the sweep now does too.
//
// Returns { error } — null only when the deal is genuinely gone.
async function deleteDealCascade(dealId) {
  await supabase.from('deal_products').delete().eq('deal_id', dealId);
  await supabase.from('activities').delete().eq('deal_id', dealId);
  await supabase.from('tasks').update({ deal_id: null }).eq('deal_id', dealId);

  const first = await supabase.from('deals').delete().eq('id', dealId);
  if (!first.error) return { error: null };

  // Last resort: unlink every remaining referrer, then retry once. Covers FKs
  // that are declared NO ACTION rather than SET NULL.
  const referrers = [
    ['meetings', 'deal_id'],
    ['contact_reports', 'deal_id'],
    ['deal_amount_changes', 'deal_id'],
    ['escalation_logs', 'deal_id'],
    ['bounce_back_logs', 'deal_id'],
    ['future_orders', 'source_deal_id'],
    ['opportunities', 'deal_id'],
    ['opportunities', 'replaces_deal_id'],
  ];
  for (const [table, column] of referrers) {
    await supabase.from(table).update({ [column]: null }).eq(column, dealId);
  }

  const retry = await supabase.from('deals').delete().eq('id', dealId);
  return { error: retry.error || null };
}

// Escalate when a salesman has had a 2nd (or later) lead bounce back in the SAME
// month. Flags the salesman once per month and notifies their manager + them.
// Idempotent: the month flag is created only once (subsequent bounces no-op).
async function checkSecondBounce(companyId, ownerId, opportunityId, now) {
  if (!companyId || !ownerId) return;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const flagMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  // Count this salesman's REAL-TIME bounces this month (across every
  // opportunity). Rows flagged backlog_cleanup are excluded: they came from the
  // one-off 2026-09-08 sweep that cleared the backlog left by the broken
  // expiry check, and were never enforced against the salesman at the time.
  const baseQuery = () => supabase
    .from('bounce_back_logs')
    .select('id')
    .eq('company_id', companyId)
    .eq('owner_id', ownerId)
    .gte('bounced_at', monthStart)
    .lte('bounced_at', monthEnd);

  let { data: monthBounces, error: countErr } = await baseQuery().eq('backlog_cleanup', false);
  if (countErr?.code === UNDEFINED_COLUMN) {
    // migrations/add_bounce_back_logs_backlog_cleanup.sql not applied yet.
    ({ data: monthBounces } = await baseQuery());
  }
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

  // Mark this month's real-time bounce logs for this salesman as escalated,
  // leaving the historical backlog rows untouched.
  const markEscalated = () => supabase
    .from('bounce_back_logs')
    .update({ escalated: true, escalated_at: now.toISOString() })
    .eq('company_id', companyId)
    .eq('owner_id', ownerId)
    .gte('bounced_at', monthStart)
    .lte('bounced_at', monthEnd);

  const { error: markErr } = await markEscalated().eq('backlog_cleanup', false);
  if (markErr?.code === UNDEFINED_COLUMN) await markEscalated();

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

// Move one expired lead out of the Funnel and into Future Orders.
//
// Order matters: the future_orders row is written first (while the deal still
// exists, so source_deal_id is valid), then the deal is deleted, and only once
// the deal is really gone do we touch the opportunity and write the bounce log.
// The previous version reset the opportunity BEFORE the delete, so when the
// delete failed the opportunity was flipped to 'open' while the deal stayed in
// the Funnel — the exact half-applied state this backlog was stuck in.
//
// Works for leads with and without an opportunity_id; the opportunity reset is
// simply skipped when there is nothing linked.
async function moveLeadToFutureOrders(lead, companyId, userId, now) {
  const name = lead.opportunity?.customer_name || lead.title || 'Lead';

  const { data: future, error: insErr } = await supabase
    .from('future_orders')
    .insert({
      company_id:     companyId,
      owner_id:       lead.owner_id,
      created_by:     userId || lead.owner_id,
      contact_id:     lead.contact_id || null,
      customer_name:  lead.title || name,
      planned_amount: Number(lead.amount) || 0,
      expected_month: nextMonthDate(now),
      status:         'pending',
      reason:         SLA_REASON,
      opportunity_id: lead.opportunity_id || null,
      source_deal_id: lead.id,
      moved_at:       now.toISOString(),
      created_at:     now.toISOString(),
      updated_at:     now.toISOString(),
    })
    .select('id')
    .single();

  if (insErr) {
    console.error('🔴 checkExpiredLeads: future_orders insert failed for deal', lead.id, insErr);
    return false;
  }

  const { error: delErr } = await deleteDealCascade(lead.id);
  if (delErr) {
    // Roll the future_orders row back so the next sweep retries cleanly instead
    // of stacking a duplicate entry every 6 hours.
    console.error('🔴 checkExpiredLeads: could not delete deal', lead.id, delErr);
    await supabase.from('future_orders').delete().eq('id', future.id);
    return false;
  }

  // ── Opportunity reset (only when one is linked) ──
  let bounceCount = 1;
  if (lead.opportunity_id) {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('bounce_count')
      .eq('id', lead.opportunity_id)
      .single();
    bounceCount = (opp?.bounce_count || 0) + 1;

    const base = {
      deal_id:         null,
      converted_at:    null,
      bounce_count:    bounceCount,
      last_bounced_at: now.toISOString(),
      updated_at:      now.toISOString(),
    };

    const { error: oppErr } = await supabase
      .from('opportunities')
      .update({ ...base, status: FUTURE_STATUS })
      .eq('id', lead.opportunity_id);

    if (oppErr?.code === CHECK_VIOLATION) {
      // Constraint not migrated yet — keep it valid, but move it off the
      // current month so it stops counting toward this month's plan.
      const { error: fallbackErr } = await supabase
        .from('opportunities')
        .update({ ...base, status: 'open', expected_month: nextMonthDate(now) })
        .eq('id', lead.opportunity_id);
      if (fallbackErr) {
        console.error('🔴 checkExpiredLeads: opportunity reset failed', lead.opportunity_id, fallbackErr);
      } else {
        console.warn(
          `checkExpiredLeads: opportunity ${lead.opportunity_id} parked as open/${nextMonthDate(now)} — ` +
          'apply migrations/add_opportunity_moved_to_future_status.sql for a dedicated status.',
        );
      }
    } else if (oppErr) {
      console.error('🔴 checkExpiredLeads: opportunity reset failed', lead.opportunity_id, oppErr);
    }
  }

  // ── Bounce log: written for every expired lead, linked opportunity or not ──
  const { error: logErr } = await supabase.from('bounce_back_logs').insert({
    company_id:     companyId,
    deal_id:        null, // the deal is gone; the FK must stay valid
    opportunity_id: lead.opportunity_id || null,
    owner_id:       lead.owner_id,
    bounce_count:   bounceCount,
    bounced_at:     now.toISOString(),
    reason:         SLA_REASON,
    escalated:      false,
    created_at:     now.toISOString(),
  });
  if (logErr) {
    console.error('🔴 checkExpiredLeads: bounce_back_logs insert failed for deal', lead.id, logErr);
  }

  await notify({
    userId: lead.owner_id,
    companyId,
    type: 'lead_moved_to_future',
    title: '📅 Lead Moved to Future Orders',
    message: `"${name}" had no contact for ${SLA_DAYS} days and has been moved to Future Orders for next month. Re-plan it there when the customer is ready.`,
    metadata: { opportunity_id: lead.opportunity_id || null, future_order_id: future.id },
  });

  await checkSecondBounce(companyId, lead.owner_id, lead.opportunity_id || null, now);
  return true;
}

/**
 * Move converted leads to Future Orders when they've sat in the Lead stage for
 * 3+ days with no contact, and warn the owner on day 2.
 *
 * Covers every deal in stage 'lead' for the company — including those with no
 * opportunity_id, which an earlier `.not('opportunity_id','is',null)` filter
 * excluded from the sweep entirely.
 *
 * @returns {{ warnings:number, expired:number, failed:number }}
 */
export async function checkExpiredLeads(companyId, userId) {
  if (!companyId) return { warnings: 0, expired: 0, failed: 0 };

  try {
    const { data: leads, error } = await supabase
      .from('deals')
      .select(`
        id, title, amount, opportunity_id, contact_id, stage_changed_at, converted_at, created_at,
        lead_warning_sent, owner_id,
        opportunity:opportunities!opportunity_id(id, customer_name, planned_amount, owner_id)
      `)
      .eq('stage', 'lead')
      .eq('company_id', companyId);

    if (error) {
      console.error('🔴 checkExpiredLeads: lead query failed', error);
      return { warnings: 0, expired: 0, failed: 0 };
    }
    if (!leads?.length) return { warnings: 0, expired: 0, failed: 0 };

    const now = new Date();
    let warned = 0;
    let expired = 0;
    let failed = 0;

    for (const lead of leads) {
      const daysSince = Math.floor((now - referenceTime(lead)) / DAY_MS);
      const name = lead.opportunity?.customer_name || lead.title || 'Lead';

      if (daysSince >= SLA_DAYS) {
        const ok = await moveLeadToFutureOrders(lead, companyId, userId, now);
        if (ok) expired += 1; else failed += 1;
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
            message: `"${name}" has been in the Lead stage for ${daysSince} days with no contact. Move it forward or it goes to Future Orders tomorrow.`,
            metadata: { deal_id: lead.id, opportunity_id: lead.opportunity_id },
          });
        } else {
          console.error('🔴 checkExpiredLeads: warning update failed for deal', lead.id, updErr);
        }
      }
    }

    if (failed) {
      console.error(`🔴 checkExpiredLeads: ${failed} expired lead(s) could not be moved to Future Orders`);
    }
    return { warnings: warned, expired, failed };
  } catch (err) {
    console.error('🔴 checkExpiredLeads FAILED:', err);
    return { warnings: 0, expired: 0, failed: 0 };
  }
}
