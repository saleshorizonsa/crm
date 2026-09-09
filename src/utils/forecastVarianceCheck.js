import { supabase } from '../lib/supabase';

// Forecast vs Actual (±10%) variance check.
//
// Follows the same shape as checkPlanDeadlines / checkExpiredLeads: a sweep the
// app calls on login, scoped to a company, idempotent, and safe to run again.
//
// Scope-level, one row per contributor per month:
//   forecast = SUM(deals.forecast_amount) for deals whose expected_close_date
//              falls in the month  — the prediction that was made FOR that month
//   actual   = SUM(final_amount || amount) for won + invoiced deals whose
//              invoice_date falls in the month — the achievement rule already
//              used by the KPI strip
//   variance = (actual - forecast) / forecast x 100, flagged when it exceeds
//              TOLERANCE_PCT in either direction
//
// Informational only. It writes forecast_flags and nothing else — no
// notifications, no escalation, by explicit decision: the SLA machinery has not
// been running long enough to penalise anyone on its output.
const TOLERANCE_PCT = 10;

// Only assess in the last few days of the month: earlier than that, a shortfall
// is just a month still in progress. Matches the "after the 25th" style of
// checkPlanDeadlines rather than inventing a new schedule.
const ASSESS_LAST_DAYS = 3;

const UNDEFINED_TABLE = '42P01';
export const isMissingForecastFlagsTable = (error) =>
  error?.code === UNDEFINED_TABLE || /forecast_flags/i.test(error?.message || '');

// True in the final ASSESS_LAST_DAYS days of the month.
export function isAssessmentWindow(d = new Date()) {
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() > lastDay - ASSESS_LAST_DAYS;
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

/**
 * Assess every contributor's forecast accuracy for the current month.
 *
 * @returns {{ checked:number, flagged:number, skipped:number }}
 */
export async function checkForecastVariance(companyId) {
  const none = { checked: 0, flagged: 0, skipped: 0 };
  if (!companyId) return none;

  const now = new Date();
  if (!isAssessmentWindow(now)) return none; // month still has room to close

  const periodMonth = monthKey(now);
  const monthStart = periodMonth;
  const endD = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEnd = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;

  try {
    const { data: contributors } = await supabase
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in('role', ['salesman', 'supervisor']);
    if (!contributors?.length) return none;
    const ids = contributors.map((c) => c.id);

    // Existing flags for this month — the idempotence guard. Read once for the
    // whole company rather than per person.
    const { data: existing, error: exErr } = await supabase
      .from('forecast_flags')
      .select('owner_id')
      .eq('company_id', companyId)
      .eq('period_month', periodMonth);
    if (isMissingForecastFlagsTable(exErr)) {
      // migrations/add_forecast_flags.sql not applied yet — do nothing quietly.
      return none;
    }
    const already = new Set((existing || []).map((r) => r.owner_id));

    // Forecast for the month: what was predicted to close in it.
    const { data: fDeals } = await supabase
      .from('deals')
      .select('owner_id, forecast_amount')
      .eq('company_id', companyId)
      .in('owner_id', ids)
      .gte('expected_close_date', monthStart)
      .lte('expected_close_date', monthEnd);
    const forecastPer = {};
    (fDeals || []).forEach((d) => {
      forecastPer[d.owner_id] = (forecastPer[d.owner_id] || 0) + (parseFloat(d.forecast_amount) || 0);
    });

    // Actual: invoiced achievement, the same rule the KPI strip uses.
    const { data: aDeals } = await supabase
      .from('deals')
      .select('owner_id, amount, final_amount')
      .eq('company_id', companyId)
      .eq('stage', 'won')
      .eq('is_invoiced', true)
      .in('owner_id', ids)
      .gte('invoice_date', monthStart)
      .lte('invoice_date', monthEnd);
    const actualPer = {};
    (aDeals || []).forEach((d) => {
      actualPer[d.owner_id] = (actualPer[d.owner_id] || 0) + (parseFloat(d.final_amount ?? d.amount) || 0);
    });

    const rows = [];
    let checked = 0;
    let skipped = 0;

    for (const id of ids) {
      if (already.has(id)) { skipped += 1; continue; } // already assessed this month
      const forecast = forecastPer[id] || 0;
      const actual = actualPer[id] || 0;

      // A zero forecast has no percentage to measure against — dividing would
      // give Infinity and flag everyone who simply had nothing due this month.
      if (forecast <= 0) { skipped += 1; continue; }

      checked += 1;
      const variancePct = ((actual - forecast) / forecast) * 100;
      if (Math.abs(variancePct) <= TOLERANCE_PCT) continue; // within tolerance

      rows.push({
        company_id: companyId,
        owner_id: id,
        period_month: periodMonth,
        forecast_amount: forecast,
        actual_amount: actual,
        variance_pct: Math.round(variancePct * 100) / 100,
        tolerance_pct: TOLERANCE_PCT,
        flagged: true,
        reviewed: false,
        created_at: now.toISOString(),
      });
    }

    if (!rows.length) return { checked, flagged: 0, skipped };

    // The unique index on (company_id, owner_id, period_month) makes a
    // concurrent second login a no-op rather than a duplicate.
    const { error: insErr } = await supabase
      .from('forecast_flags')
      .upsert(rows, { onConflict: 'company_id,owner_id,period_month', ignoreDuplicates: true });
    if (insErr) {
      console.error('🔴 checkForecastVariance: insert failed:', insErr);
      return { checked, flagged: 0, skipped };
    }
    return { checked, flagged: rows.length, skipped };
  } catch (err) {
    console.error('🔴 checkForecastVariance FAILED:', err);
    return none;
  }
}
