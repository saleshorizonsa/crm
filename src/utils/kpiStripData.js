import { supabase } from 'lib/supabase';
import {
  CONTRIBUTOR_ROLES,
  fetchMonthlyTargets,
  targetPerPerson,
  computeAnnualTarget,
  computeRequiredRaw,
  computeCarryIn,
  computePlannedGap,
} from 'utils/planningCalculations';

// TEMP: set true to re-enable the KPI diagnostic logs (see end of the function).
const KPI_DEBUG = false;

// CONTRIBUTOR_ROLES, and the target/carry-in/required/gap rules, now live in
// utils/planningCalculations.js so Planning, Coverage Console and the
// dashboards cannot drift apart again.

const EMPTY_TOTALS = {
  target: 0, achieved: 0, deficit: 0,
  winRate3m: 0, winRateIsDefault: true,
  planned: 0, required: 0, requiredRaw: 0, futureCarryover: 0, plannedGap: 0,
};

function monthBounds() {
  const n = new Date();
  const startD = new Date(n.getFullYear(), n.getMonth(), 1);
  const endD = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59);
  return {
    startISO: startD.toISOString(),
    endISO: endD.toISOString(),
    startDate: `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-01`,
    endDate: new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().split('T')[0],
  };
}

// The 3 completed calendar months before the current one (current month excluded).
function threeMonthWindow() {
  const n = new Date();
  const start = new Date(n.getFullYear(), n.getMonth() - 3, 1);
  const end = new Date(n.getFullYear(), n.getMonth(), 0, 23, 59, 59);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

// Compute the 5 KPI-strip metrics — per salesman and as scope totals.
//
//   Target      = sum of each month's target per person across the selected
//                 period (total_value, else the by_clients breakdown of the
//                 same goal; by_products never counts). For "This Year",
//                 the explicit annual target row is preferred when one exists.
//   Achieved    = won-deal value closed this month
//   Deficit     = max(0, Target − Achieved)
//   Win Rate    = 3-month average (won ÷ total created, last 3 completed months;
//                 defaults to 50% with no history)
//   Planned Gap = max(0, Required − Planned), where
//                 Required = Target ÷ WinRate%, Planned = open Current-Sales-Plan
//                 (opportunities) value for this month
//
// `ownerIds`: null = whole company (director); an array = that scope
// (manager/supervisor team, or a single salesman). Empty array = nobody.
// `range`: optional { start, end, isAnnual } (yyyy-mm-dd) — the Target/Achieved
// window. Omitted = current month. isAnnual makes Target the company yearly target
// (win rate stays a 3-month rolling average, planned/coverage stay current-month).
export async function computeKpiStripData({ companyId, ownerIds = null, range = null }) {
  const empty = { salesmanData: [], totals: { ...EMPTY_TOTALS } };
  if (!companyId) return empty;
  if (Array.isArray(ownerIds) && ownerIds.length === 0) return empty;

  // 1. Owner-role users in scope (the rows).
  let uq = supabase
    .from('users')
    .select('id, full_name, role')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('role', CONTRIBUTOR_ROLES);
  if (Array.isArray(ownerIds)) uq = uq.in('id', ownerIds);
  const { data: users } = await uq;
  const userList = users || [];
  const scopeIds = userList.map((u) => u.id);
  if (scopeIds.length === 0) return empty;

  const mb = monthBounds();
  const w3 = threeMonthWindow();
  // Achieved + target window: the selected range, or the current month by default.
  const winStart = range?.start || mb.startDate;
  const winEnd = range?.end || mb.endDate;

  // 2a. Per-contributor MONTHLY targets overlapping the window. A person can hold
  //     a `total_value` (overall) target and/or `by_clients` targets — the overall
  //     value is the manager-set goal, so: use total_value when present, otherwise
  //     sum the by_clients rows (never mix the two — they're two views of one goal).
  const targetRows = await fetchMonthlyTargets({
    companyId, contributorIds: scopeIds, start: winStart, end: winEnd,
  });
  const targetPer = targetPerPerson(targetRows);
  // 2b. Annual view → prefer an explicit YEARLY target for this scope (the company
  //     yearly for a director; a manager/supervisor's own if assigned); otherwise
  //     annualize the monthly quotas (×12) — e.g. a salesman with no yearly target.
  let annualTargetTotal = null;
  if (range?.isAnnual) {
    annualTargetTotal = await computeAnnualTarget({
      companyId,
      ownerIds,
      monthlyTotal: Object.values(targetPer).reduce((sum, v) => sum + v, 0),
    });
  }
  // 3. Achieved — INVOICED won deals for this month (by invoice_date). Achievement
  //    is only counted once a deal is invoiced, not merely won/closed (director rule).
  const { data: wonDeals } = await supabase
    .from('deals')
    .select('owner_id, amount, final_amount, invoice_date')
    .eq('company_id', companyId)
    .eq('stage', 'won')
    .eq('is_invoiced', true)
    .in('owner_id', scopeIds)
    .gte('invoice_date', winStart)
    .lte('invoice_date', winEnd);
  const achievedPer = {};
  (wonDeals || []).forEach((d) => {
    const amt = parseFloat(d.final_amount ?? d.amount) || 0;
    achievedPer[d.owner_id] = (achievedPer[d.owner_id] || 0) + amt;
  });

  // 4. Win rate — deals created in the last 3 completed months, grouped by owner.
  //    fetchWinRate3m() in utils/winRate3m.js is the canonical source for the
  //    3-month rate as a single number, and anything needing just that figure
  //    must use it rather than re-deriving the window here. This block keeps its
  //    own query only because it needs the raw rows to group per owner, which
  //    that helper does not return — the window and formula are identical.
  const { data: deals3 } = await supabase
    .from('deals')
    .select('owner_id, stage, created_at')
    .eq('company_id', companyId)
    .in('owner_id', scopeIds)
    .gte('created_at', w3.startISO)
    .lte('created_at', w3.endISO);
  const wrPer = {};
  (deals3 || []).forEach((d) => {
    if (!wrPer[d.owner_id]) wrPer[d.owner_id] = { won: 0, total: 0 };
    wrPer[d.owner_id].total += 1;
    if (d.stage === 'won') wrPer[d.owner_id].won += 1;
  });

  // Company-wide 3-month win rate — the fallback for salesmen with zero history.
  const total3 = (deals3 || []).length;
  const won3 = (deals3 || []).filter((d) => d.stage === 'won').length;
  const companyWinRate3m = total3 > 0 ? (won3 / total3) * 100 : 0;

  // New-salesman exception: anyone with NO deals in the 90-day window uses their
  // ACTUAL win rate over all their history — however few deals (1 won of 2 = 50%,
  // 0 of 1 = 0%). Only a salesman with zero deals ever falls back to the company
  // average. Fetch all-history once for just those salesmen (usually new joiners).
  const noWindowIds = scopeIds.filter((id) => !wrPer[id] || wrPer[id].total === 0);
  const allWrPer = {};
  if (noWindowIds.length) {
    const { data: allDeals } = await supabase
      .from('deals')
      .select('owner_id, stage')
      .eq('company_id', companyId)
      .in('owner_id', noWindowIds);
    (allDeals || []).forEach((d) => {
      if (!allWrPer[d.owner_id]) allWrPer[d.owner_id] = { won: 0, total: 0 };
      allWrPer[d.owner_id].total += 1;
      if (d.stage === 'won') allWrPer[d.owner_id].won += 1;
    });
  }

  // 3-step win rate for a salesman: 90-day window → all history → company average.
  // Only the last step is a "default" (no personal data at all).
  const resolveWinRate = (id) => {
    const w = wrPer[id];
    if (w && w.total > 0) return { rate: (w.won / w.total) * 100, isDefault: false };
    const a = allWrPer[id];
    if (a && a.total > 0) return { rate: (a.won / a.total) * 100, isDefault: false };
    return { rate: companyWinRate3m, isDefault: true };
  };

  // 5. Planned — open Current-Sales-Plan (opportunities) value for this month.
  const { data: opps } = await supabase
    .from('opportunities')
    .select('owner_id, planned_amount')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .in('owner_id', scopeIds)
    .gte('expected_month', mb.startDate)
    .lte('expected_month', mb.endDate);
  const plannedPer = {};
  (opps || []).forEach((o) => {
    plannedPer[o.owner_id] = (plannedPer[o.owner_id] || 0) + (parseFloat(o.planned_amount) || 0);
  });

  // 6. Funnel value — open (not won/lost) deal amounts, for the coverage check.
  const { data: openDeals } = await supabase
    .from('deals')
    .select('owner_id, amount')
    .eq('company_id', companyId)
    .in('owner_id', scopeIds)
    .not('stage', 'in', '("won","lost")');
  const funnelValue = (openDeals || []).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);

  // 7. Future-order carryover — pending future orders for NEXT month count toward
  //    the required plan (customers already committed), reducing the new pipeline
  //    still needed. Only 'pending' orders (moved ones are already in the plan).
  const { total: carryInTotal, perPerson: carryPer } = await computeCarryIn({
    companyId, contributorIds: scopeIds,
  });
  const salesmanData = userList
    .map((u) => {
      const target = targetPer[u.id] || 0;
      const achieved = achievedPer[u.id] || 0;
      const deficit = Math.max(0, target - achieved);
      const { rate: winRate3m, isDefault: winRateIsDefault } = resolveWinRate(u.id);
      const planned = plannedPer[u.id] || 0;
      const requiredRaw = computeRequiredRaw({ target, winRatePct: winRate3m });
      const futureCarryover = carryPer[u.id] || 0;
      const { required, plannedGap } = computePlannedGap({
        requiredRaw, carryIn: futureCarryover, planned,
      });
      return {
        id: u.id, full_name: u.full_name, role: u.role,
        target, achieved, deficit,
        winRate3m, winRateIsDefault,
        planned, required, requiredRaw, futureCarryover, plannedGap,
      };
    })
    .sort((a, b) => b.target - a.target || b.achieved - a.achieved);

  // Totals across the whole scope. Annual view uses the company yearly target.
  const target = range?.isAnnual
    ? (annualTargetTotal || 0)
    : Object.values(targetPer).reduce((s, v) => s + v, 0);
  const achieved = Object.values(achievedPer).reduce((s, v) => s + v, 0);
  const deficit = Math.max(0, target - achieved);
  // Scope total win rate = company/team 3-month average (already computed above).
  const winRateIsDefault = total3 === 0;
  const winRate3m = companyWinRate3m;
  const planned = Object.values(plannedPer).reduce((s, v) => s + v, 0);
  const requiredRaw = computeRequiredRaw({ target, winRatePct: winRate3m });
  const futureCarryover = carryInTotal;
  const { required, plannedGap } = computePlannedGap({
    requiredRaw, carryIn: futureCarryover, planned,
  });
  const attainmentPct = target > 0 ? (achieved / target) * 100 : 0;

  // Coverage check: Achieved + (Funnel × WinRate) + (Planning × WinRate) ≥ Target.
  const wrFrac = winRate3m / 100;
  const coverageValue = achieved + funnelValue * wrFrac + planned * wrFrac;
  const coverageHealthy = target > 0 ? coverageValue >= target : true;
  const coveragePct = target > 0 ? (coverageValue / target) * 100 : 100;

  // Pacing check (linear): attainment% should keep up with the % of the month elapsed
  // (within a 15-point tolerance).
  const nowD = new Date();
  const totalDaysInMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
  const daysElapsed = nowD.getDate();
  const pacingPct = totalDaysInMonth > 0 ? (daysElapsed / totalDaysInMonth) * 100 : 0;
  const pacingHealthy = attainmentPct >= pacingPct - 15;
  const isHealthy = coverageHealthy && pacingHealthy;

  const totals = {
    target, achieved, deficit, winRate3m, winRateIsDefault,
    planned, required, requiredRaw, futureCarryover, plannedGap,
    attainmentPct, funnelValue,
    coverageValue, coverageHealthy, coveragePct,
    pacingPct, pacingHealthy, daysElapsed, totalDaysInMonth, isHealthy,
  };

  // TEMP debug — helps diagnose wrong team/director KPI values. Remove once fixed.
  if (KPI_DEBUG) {
    /* eslint-disable no-console */
    console.log('=== KPI DEBUG ===');
    console.log('companyId:', companyId);
    console.log('ownerIds (scope requested):', ownerIds === null ? 'NULL → whole company' : ownerIds);
    console.log('users/scopeIds:', scopeIds.length, userList.map((u) => `${u.full_name} (${u.role})`));
    console.log('targets rows fetched:', (targets || []).length, targets);
    console.log('won deals this month:', (wonDeals || []).length);
    console.log('deals (3-mo window):', (deals3 || []).length, '| won:', won3);
    console.log('opportunities (open, this month):', (opps || []).length);
    console.log('salesmanData built:', salesmanData);
    console.log('TOTALS:', totals);
    /* eslint-enable no-console */
  }

  return { salesmanData, totals };
}

// Director annual view: the company's YEARLY target from management vs the
// year-to-date invoiced achievement. Directors track the full-year number;
// managers/supervisors/salesmen keep the monthly figures from computeKpiStripData.
export async function computeDirectorAnnual({ companyId }) {
  const empty = {
    target: 0, achieved: 0, deficit: 0, dealCount: 0,
    attainmentPct: 0, year: new Date().getFullYear(), yearStart: null, yearEnd: null,
  };
  if (!companyId) return empty;

  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // Annual target = the company's yearly targets for this year (the management
  // target the director is measured against, e.g. 40,660,779 SAR).
  //
  // Delegated to computeAnnualTarget() so this card obeys the same rules as
  // every other Target in the app: active rows only, total_value only, and MAX
  // per person rather than a sum — a revised yearly target REPLACES the old
  // one, and summing both silently doubled the director's annual target.
  // ownerIds = null: the whole company, which is what a director is measured on.
  const target = await computeAnnualTarget({
    companyId,
    ownerIds: null,
    monthlyTotal: 0,
  });

  // YTD achieved = invoiced won deals this calendar year (final value where set).
  const { data: won } = await supabase
    .from('deals')
    .select('amount, final_amount')
    .eq('company_id', companyId)
    .eq('stage', 'won')
    .eq('is_invoiced', true)
    .gte('invoice_date', yearStart)
    .lte('invoice_date', yearEnd);
  const achieved = (won || []).reduce((s, d) => s + (parseFloat(d.final_amount ?? d.amount) || 0), 0);
  const dealCount = (won || []).length;

  const deficit = Math.max(0, target - achieved);
  const attainmentPct = target > 0 ? (achieved / target) * 100 : 0;
  return { target, achieved, deficit, dealCount, attainmentPct, year, yearStart, yearEnd };
}
