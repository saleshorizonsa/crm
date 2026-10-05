import { supabase } from 'lib/supabase';
import {
  CONTRIBUTOR_ROLES,
  fetchMonthlyTargets,
  targetPerPerson,
  computeAnnualTarget,
  computeRequiredRaw,
  computeCarryIn,
  fetchAchieved,
  fetchContributors,
  fetchAchievedOnlyUsers,
  wonNotInvoicedList,
  summarizeWonNotInvoiced,
  computeCoverage,
} from 'utils/planningCalculations';
import { fetchOpenFunnel, funnelInWindow } from 'utils/openFunnel';
// Pacing is only meaningful for the current month — see where it is computed.
import { isCurrentMonthRange } from 'utils/dashboardDateUtils';
// Imported history never counts in a rate (CEO decision, 2026-10-05).
import { isImportedDeal, isSameDayOrder, queryDealsWithImportFlag } from 'utils/importedDeals';

// TEMP: set true to re-enable the KPI diagnostic logs (see end of the function).
const KPI_DEBUG = false;

// CONTRIBUTOR_ROLES, and the target/carry-in/required/gap rules, now live in
// utils/planningCalculations.js so Planning, Coverage Console and the
// dashboards cannot drift apart again.

const EMPTY_WON_NOT_INVOICED = { count: 0, total: 0, staleCount: 0, staleValue: 0, oldestDays: 0, items: [] };

const EMPTY_TOTALS = {
  target: 0, achieved: 0, deficit: 0,
  winRate3m: 0, winRateIsDefault: true,
  planned: 0, required: 0, requiredRaw: 0, futureCarryover: 0, plannedGap: 0,
  wonNotInvoiced: EMPTY_WON_NOT_INVOICED,
  pacingApplies: false, coverageIsCurrentMonth: true,
  hasTarget: false,
  pipelineConversion3m: 0, pipelineWon3m: 0, pipelineTotal3m: 0, importedExcluded3m: 0,
};

function monthBounds() {
  const n = new Date();
  const startD = new Date(n.getFullYear(), n.getMonth(), 1);
  const endD = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59);
  return {
    startISO: startD.toISOString(),
    endISO: endD.toISOString(),
    startDate: `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-01`,
    // From local parts, like startDate. Via toISOString() the local midnight of
    // the month's last day becomes 21:00 the day before in Riyadh (UTC+3), so
    // October ended on the 30th and every window built from this dropped the
    // month's final day.
    endDate: `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`,
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
//   Achieved    = invoiced won deals in the window, by invoice_date, final value —
//                 fetchAchieved() in utils/planningCalculations.js
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

  // Flagged achieved-only users (users.is_contributor) are resolved FIRST now,
  // because Target uses the same scope as Achieved: a flagged manager's own
  // monthly target counts exactly like a salesman's. Only MONTHLY rows are ever
  // read (fetchMonthlyTargets filters period_type), so his yearly allocation
  // cannot leak into a monthly sum.
  const achievedOnlyUsers = await fetchAchievedOnlyUsers({ companyId, ownerIds });
  const achievedScopeIds = [...scopeIds, ...achievedOnlyUsers.map((u) => u.id)];

  // 2a. Per-contributor MONTHLY targets overlapping the window. A person can hold
  //     a `total_value` (overall) target and/or `by_clients` targets — the overall
  //     value is the manager-set goal, so: use total_value when present, otherwise
  //     sum the by_clients rows (never mix the two — they're two views of one goal).
  const targetRows = await fetchMonthlyTargets({
    companyId, contributorIds: achievedScopeIds, start: winStart, end: winEnd,
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
      // The year the WINDOW is about. Without this, computeAnnualTarget fell
      // back to new Date().getFullYear(), so an annual range over 2025 was
      // measured against 2026's 40,660,779 yearly row — 2025's achievement
      // against next year's target.
      year: Number(String(winStart).slice(0, 4)) || undefined,
    });
  }
  // 3. Achieved — the one shared rule (utils/planningCalculations.js): INVOICED won
  //    deals by invoice_date in the window, final value, over the same scope as
  //    Target above. Win Rate, Planned and Carry-In still stay on scopeIds: those
  //    measure a quota-carrying contributor's pipeline discipline.
  const { perPerson: achievedPer, count: wonDealCount } = await fetchAchieved({
    companyId,
    contributorIds: achievedScopeIds,
    start: winStart,
    end: winEnd,
  });

  // 3b. Won, not yet invoiced — a status, not a monthly figure, so it is NOT
  //     windowed by `range` the way Achieved is: a deal won last quarter and
  //     still sitting uninvoiced belongs here until it's invoiced. Visibility
  //     only; see wonNotInvoicedList in utils/planningCalculations.js.
  const { data: wonDeals } = await supabase
    .from('deals')
    .select(
      'id, title, owner_id, stage, is_invoiced, invoice_number, amount, final_amount, closed_at, stage_changed_at, created_at, contact_id, contacts!contact_id(first_name, last_name, company_name)',
    )
    .eq('company_id', companyId)
    .eq('stage', 'won')
    .in('owner_id', achievedScopeIds);
  const wonNotInvoicedItems = wonNotInvoicedList({ deals: wonDeals, ownerIds: achievedScopeIds });

  // Drill-down detail for the popup: who each owner DIRECTLY reports to (name and
  // role; that person is often a supervisor, not a manager), and a customer label.
  // Resolved through supervisor_id — the hierarchy column the app maintains —
  // falling back to reports_to only when supervisor_id is empty. In JASCO Steels
  // and IMDADAT reports_to is a stale backfill that disagrees with supervisor_id,
  // so reading it first would name the wrong person there.
  const ownerIdsForReportsTo = [...new Set(wonNotInvoicedItems.map((d) => d.owner_id).filter(Boolean))];
  const reportsToOf = {}; // owner_id -> { name, role }
  if (ownerIdsForReportsTo.length) {
    const { data: owners } = await supabase
      .from('users')
      .select('id, supervisor_id, reports_to')
      .in('id', ownerIdsForReportsTo);
    const reportsToIdOf = Object.fromEntries(
      (owners || []).map((u) => [u.id, u.supervisor_id || u.reports_to || null]),
    );
    const reportsToIds = [...new Set(Object.values(reportsToIdOf).filter(Boolean))];
    const { data: superiors } = reportsToIds.length
      ? await supabase.from('users').select('id, full_name, role').in('id', reportsToIds)
      : { data: [] };
    const superiorById = Object.fromEntries((superiors || []).map((s) => [s.id, s]));
    Object.entries(reportsToIdOf).forEach(([ownerId, sId]) => {
      const s = sId ? superiorById[sId] : null;
      reportsToOf[ownerId] = s ? { name: s.full_name || null, role: s.role || null } : null;
    });
  }
  const customerOf = (d) => {
    const c = d.contacts;
    if (c?.company_name) return c.company_name;
    const person = [c?.first_name, c?.last_name].filter(Boolean).join(' ');
    return person || null;
  };
  const wonNotInvoiced = summarizeWonNotInvoiced(
    wonNotInvoicedItems.map((d) => ({
      ...d,
      customer: customerOf(d),
      reportsToName: reportsToOf[d.owner_id]?.name || null,
      reportsToRole: reportsToOf[d.owner_id]?.role || null,
    })),
  );

  // 4. Win rate — deals created in the last 3 completed months, grouped by owner.
  //    fetchWinRate3m() in utils/winRate3m.js is the canonical source for the
  //    3-month rate as a single number, and anything needing just that figure
  //    must use it rather than re-deriving the window here. This block keeps its
  //    own query only because it needs the raw rows to group per owner, which
  //    that helper does not return — the window and formula are identical.
  //
  // IMPORTED history is excluded, exactly as fetchWinRate3m excludes it:
  // loaded-in invoices can only be "won", so they inflated every per-person
  // rate and so understated every per-person Required Plan.
  const { data: deals3Raw } = await queryDealsWithImportFlag((select) => supabase
    .from('deals')
    .select(select)
    .eq('company_id', companyId)
    .in('owner_id', scopeIds)
    .gte('created_at', w3.startISO)
    .lte('created_at', w3.endISO), 'owner_id, stage, created_at, closed_at, invoice_number');
  const deals3 = (deals3Raw || []).filter((d) => !isImportedDeal(d));
  const wrPer = {};
  (deals3 || []).forEach((d) => {
    if (!wrPer[d.owner_id]) wrPer[d.owner_id] = { won: 0, total: 0 };
    wrPer[d.owner_id].total += 1;
    if (d.stage === 'won') wrPer[d.owner_id].won += 1;
  });

  // Company-wide 3-month conversion — the fallback for salesmen with zero
  // history, and the scope figure shown on the strip.
  const total3 = (deals3 || []).length;
  const won3 = (deals3 || []).filter((d) => d.stage === 'won').length;
  const companyWinRate3m = total3 > 0 ? (won3 / total3) * 100 : 0;

  // PIPELINE CONVERSION — INFORMATION ONLY (CEO decision D2, 2026-10-05).
  // The same window and scope as the rate above, minus orders created and
  // won inside a day: real sales, but logged after the fact, so counting
  // them measures data entry rather than selling. Dropped from both halves
  // of the ratio. NOTHING calculates with this — Required Plan, the deficit
  // and every coverage figure stay on the rate above.
  const pipeline3 = (deals3 || []).filter((d) => !isSameDayOrder(d));
  const pipelineWon3 = pipeline3.filter((d) => d.stage === 'won').length;
  const pipelineConversion3m = pipeline3.length
    ? (pipelineWon3 / pipeline3.length) * 100
    : 0;
  const importedExcluded3m = (deals3Raw || []).length - (deals3 || []).length;

  // New-salesman exception: anyone with NO deals in the 90-day window uses their
  // ACTUAL win rate over all their history — however few deals (1 won of 2 = 50%,
  // 0 of 1 = 0%). Only a salesman with zero deals ever falls back to the company
  // average. Fetch all-history once for just those salesmen (usually new joiners).
  const noWindowIds = scopeIds.filter((id) => !wrPer[id] || wrPer[id].total === 0);
  const allWrPer = {};
  if (noWindowIds.length) {
    const { data: allDealsRaw } = await queryDealsWithImportFlag((select) => supabase
      .from('deals')
      .select(select)
      .eq('company_id', companyId)
      .in('owner_id', noWindowIds), 'owner_id, stage, invoice_number');
    // Imported history excluded here as well: a salesman whose only rows are
    // loaded-in invoices would otherwise read 100%, and 100% makes Required
    // Plan equal to the target.
    const allDeals = (allDealsRaw || []).filter((d) => !isImportedDeal(d));
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

  // 6. Funnel value — utils/openFunnel.js, the one shared definition.
  //
  // Scoped to achievedScopeIds, NOT scopeIds. That is the behaviour change: this
  // used to count contributor ROLES only, so a manager flagged is_contributor
  // was missing from his own funnel while his Planning card included him — for
  // Kamal, 308,750 across 2 of his own open deals, which is why the strip read
  // 1,843,031.87 against Planning's 2,151,781.87. Same people now.
  // Current-month bound, like Planning and Funnel Analytics — the util decides
  // the window, so the three cannot drift apart again.
  const funnel = await fetchOpenFunnel({ companyId, scopeIds: achievedScopeIds });
  const funnelValue = funnel.total;
  // The slice of that funnel dated INTO the window, which is what nets off the
  // pipeline requirement — same rule as planningPageSummary.js, the Coverage
  // Console and Insights. `funnelValue` above stays every open deal, for the
  // coverage check. Taken from the rows already read, so there is no second
  // query that could drift from the definition.
  // Taken from allOpenRows, not from the counted rows: this slice follows the
  // strip's OWN window (which may be an annual view), and must not be narrowed
  // to the current month first or an annual plan gap would be computed from one
  // month of funnel.
  const { per: monthFunnelPer, total: monthFunnelTotal } = funnelInWindow(funnel.allOpenRows, winStart, winEnd);

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
      // Over what is STILL MISSING (deficit), not the untouched target — the
      // same basis as planningPageSummary.js, the Coverage Console and Insights.
      // Dividing the raw target kept demanding pipeline from a salesman who had
      // already made his month.
      const requiredRaw = computeRequiredRaw({ target: deficit, winRatePct: winRate3m });
      // Carry-in is NEXT month's commitment and is no longer netted off THIS
      // month's requirement — the rule the Coverage Console and Insights moved
      // to, with Planning as the standard. It is still reported.
      const futureCarryover = carryPer[u.id] || 0;
      const required = requiredRaw;
      const plannedGap = Math.max(0, requiredRaw - (planned + (monthFunnelPer[u.id] || 0)));
      return {
        id: u.id, full_name: u.full_name, role: u.role,
        target, achieved, deficit,
        winRate3m, winRateIsDefault,
        planned, required, requiredRaw, futureCarryover, plannedGap,
      };
    })
    // A flagged achieved-only user gets a row too, so the rows still add up to the
    // Achieved total. It carries Achieved only: no quota, and Win Rate / Planned
    // are not measured for him (null win rate, shown as "—").
    // A flagged user's row now carries Target and Deficit as well as Achieved —
    // the whole point of this parity pass. Win Rate and Planned Gap stay blank
    // for him ("—"), since those remain contributor-only measures.
    .concat(achievedOnlyUsers.map((u) => {
      const target = targetPer[u.id] || 0;
      const achieved = achievedPer[u.id] || 0;
      return {
        id: u.id, full_name: u.full_name, role: u.role, achievedOnly: true,
        target, achieved, deficit: Math.max(0, target - achieved),
        winRate3m: null, winRateIsDefault: false,
        planned: 0, required: 0, requiredRaw: 0, futureCarryover: 0, plannedGap: 0,
      };
    }))
    .sort((a, b) => b.target - a.target || b.achieved - a.achieved);

  // Totals across the whole scope. Annual view uses the company yearly target.
  const target = range?.isAnnual
    ? (annualTargetTotal || 0)
    : Object.values(targetPer).reduce((s, v) => s + v, 0);
  const achieved = Object.values(achievedPer).reduce((s, v) => s + v, 0);
  // Everyone in scope counts in full, including a contributor-flagged manager
  // whose only target row is yearly: his revenue is in `achieved` and his
  // yearly allocation is never spread into the monthly Target, so attainment
  // can exceed 100% (business decision, 2026-09-28).
  const deficit = Math.max(0, target - achieved);
  // Scope total win rate = company/team 3-month average (already computed above).
  const winRateIsDefault = total3 === 0;
  const winRate3m = companyWinRate3m;
  const planned = Object.values(plannedPer).reduce((s, v) => s + v, 0);
  // Over the scope's own deficit, matching the per-salesman rows above. Missing
  // this left the strip's headline card demanding pipeline (952,885.34 for
  // JASCO PVC in September 2026) while every row beneath it read 0.00.
  const requiredRaw = computeRequiredRaw({ target: deficit, winRatePct: winRate3m });
  // No carry-in netting here either: required, less what THIS month already
  // covers (open plan + funnel dated into the window). Carry-in is still
  // reported as futureCarryover.
  const futureCarryover = carryInTotal;
  const required = requiredRaw;
  const plannedGap = Math.max(0, requiredRaw - (planned + monthFunnelTotal));
  const attainmentPct = target > 0 ? (achieved / target) * 100 : 0;

  // Coverage check: Achieved + weighted funnel + weighted planning ≥ Target,
  // through the SHARED rule (planningCalculations.js computeCoverage) rather
  // than a fourth local copy. The difference that rule makes: a deal with a
  // stored forecast_amount is weighted at that amount instead of
  // amount × rate, which is what the Coverage Console and Insights already
  // did — so the three screens could disagree about the same funnel.
  //
  // The funnel half is the CURRENT MONTH's open deals from openFunnel
  // (funnel.rows), the same rows the funnel card shows.
  const coverageSplit = computeCoverage({
    invoiced: achieved,
    openDeals: funnel.rows,
    planned,
    winRatePct: winRate3m,
  });
  const coverageValue = coverageSplit.coverage;
  const coverageHealthy = target > 0 ? coverageValue >= target : true;
  const coveragePct = target > 0 ? (coverageValue / target) * 100 : 100;

  // Pacing check (linear): attainment% should keep up with the % of the month elapsed
  // (within a 15-point tolerance).
  //
  // ONLY MEANINGFUL FOR THE CURRENT MONTH. It divides by today's date, so for
  // a past month it compares a finished month's attainment against a fraction
  // of a month that is not the one on screen, and for a multi-month or annual
  // range it is simply the wrong denominator. September read "Pacing 103% /
  // 16%" in the middle of October. The verdict is still computed, and
  // `pacingApplies` tells the strip whether it may be shown; isHealthy falls
  // back to coverage alone when it does not apply, rather than inheriting a
  // meaningless pass.
  const pacingApplies = isCurrentMonthRange(winStart, winEnd);
  const nowD = new Date();
  const totalDaysInMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
  const daysElapsed = nowD.getDate();
  const pacingPct = totalDaysInMonth > 0 ? (daysElapsed / totalDaysInMonth) * 100 : 0;
  const pacingHealthy = attainmentPct >= pacingPct - 15;
  const isHealthy = pacingApplies ? (coverageHealthy && pacingHealthy) : coverageHealthy;

  const totals = {
    // Whether a target EXISTS for this scope and window, which is not the
    // same question as whether it has been met. With no target row at all,
    // deficit is 0 and attainment is 0 — so the strip used to report "Target
    // met ✓" and "0.0% of target" for a period nobody had set a target for.
    hasTarget: target > 0,
    target, achieved, deficit, winRate3m, winRateIsDefault,
    // Information only; see where it is computed.
    pipelineConversion3m, pipelineWon3m: pipelineWon3, pipelineTotal3m: pipeline3.length,
    // How many loaded-in history rows were set aside from the rate, so the
    // screen can explain the number rather than leaving it unaccounted for.
    importedExcluded3m,
    planned, monthFunnel: monthFunnelTotal, required, requiredRaw, futureCarryover, plannedGap,
    attainmentPct, funnelValue,
    coverageValue, coverageHealthy, coveragePct,
    pacingPct, pacingHealthy, daysElapsed, totalDaysInMonth, isHealthy,
    // Coverage's funnel and planning halves are read for the CURRENT month
    // whatever range is selected (see the reads above), so the strip has to
    // say so rather than implying the selected period.
    pacingApplies, coverageIsCurrentMonth: true,
    wonNotInvoiced,
  };

  // TEMP debug — helps diagnose wrong team/director KPI values. Remove once fixed.
  if (KPI_DEBUG) {
    /* eslint-disable no-console */
    console.log('=== KPI DEBUG ===');
    console.log('companyId:', companyId);
    console.log('ownerIds (scope requested):', ownerIds === null ? 'NULL → whole company' : ownerIds);
    console.log('users/scopeIds:', scopeIds.length, userList.map((u) => `${u.full_name} (${u.role})`));
    console.log('targets rows fetched:', (targets || []).length, targets);
    console.log('won deals this month:', wonDealCount);
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
export async function computeDirectorAnnual({ companyId, year: yearArg = null }) {
  // The year the director is LOOKING at. Hard-coding the current year made
  // "Last Year" show 2025's achievement against 2026's annual target.
  const year = Number(yearArg) > 1970 ? Number(yearArg) : new Date().getFullYear();
  const empty = {
    target: 0, achieved: 0, deficit: 0, dealCount: 0,
    attainmentPct: 0, year, yearStart: null, yearEnd: null,
  };
  if (!companyId) return empty;

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // The scope every figure here uses: contributors plus flagged
  // achieved-only users — the same scope as the KPI strip's annual Achieved.
  const contributors = await fetchContributors({ companyId });
  const achievedOnlyUsers = await fetchAchievedOnlyUsers({ companyId });
  const scopeIds = [...contributors, ...achievedOnlyUsers].map((c) => c.id);

  // The MONTHLY fallback: that year's monthly rows, by the shared per-person
  // rule. Without it a year with no yearly row — 2025 in this database —
  // showed its achievement against a target of 0, so "Last Year" read as
  // infinite attainment against nothing. computeAnnualTarget returns this
  // when it finds no yearly total_value row for the year.
  const monthlyRows = await fetchMonthlyTargets({
    companyId, contributorIds: scopeIds, start: yearStart, end: yearEnd,
  });
  const monthlyTotal = Object.values(targetPerPerson(monthlyRows))
    .reduce((sum, v) => sum + v, 0);

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
    monthlyTotal,
    year,
  });

  // YTD achieved — the one shared rule (utils/planningCalculations.js): invoiced
  // won deals in that calendar year, at final value.
  const { total: achieved, count: dealCount } = await fetchAchieved({
    companyId,
    contributorIds: scopeIds,
    start: yearStart,
    end: yearEnd,
  });

  const deficit = Math.max(0, target - achieved);
  const attainmentPct = target > 0 ? (achieved / target) * 100 : 0;
  // hasTarget: 2025 has no yearly row and no monthly rows in this database,
  // so its target is 0 while its Achieved is real. The card has to say "no
  // target set" rather than imply 0% of something.
  return {
    target, achieved, deficit, dealCount, attainmentPct,
    hasTarget: target > 0, year, yearStart, yearEnd,
  };
}
