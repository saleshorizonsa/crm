import { supabase } from 'lib/supabase';
import { fetchWinRate3m } from 'utils/winRate3m';
import { isImportedDeal, queryDealsWithImportFlag } from 'utils/importedDeals';
// The one supervisor_id walk. It skips inactive users, which is exactly the
// scope rule computeAnnualAllocation needs — see its doc comment.
import { subtreeIdsOf } from 'utils/teamHierarchy';
// IMPORTED as well as re-exported below, because `export { x } from '...'` does
// NOT bind x in this module's own scope — computeWinRate calls fetchAchieverIds,
// and the re-export alone left it undefined at runtime.
import {
  CONTRIBUTOR_ROLES,
  isAchievedOnly,
  achieverIdsFrom,
  fetchAchieverIds,
} from 'utils/achieverScope';

// ─────────────────────────────────────────────────────────────────────────────
// The single definition of the five planning numbers.
//
// These rules were implemented four separate times — in kpiStripData.js, in
// planning/index.jsx, in coverage-console/index.jsx and again inside
// DirectorDashboard.jsx — and had drifted apart. For one manager in one month
// the same Target read 3,050,494 on Planning and 2,300,494 on the dashboards
// (a by_products row leaking into the Target on the copies that used an `else`),
// and carry-in read 1,054,750 or 875,250 depending on which screen you opened.
//
// Every consumer now calls these functions instead of restating the rule.
// ─────────────────────────────────────────────────────────────────────────────


/** Active contributors in scope. `ownerIds = null` means the whole company. */
export async function fetchContributors({ companyId, ownerIds = null }) {
  if (!companyId) return [];
  if (Array.isArray(ownerIds) && ownerIds.length === 0) return [];
  let q = supabase
    .from('users')
    .select('id, full_name, role')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('role', CONTRIBUTOR_ROLES);
  if (Array.isArray(ownerIds)) q = q.in('id', ownerIds);
  const { data, error } = await q;
  if (error) { console.error('fetchContributors:', error); return []; }
  return data || [];
}

// ── 1. TARGET ───────────────────────────────────────────────────────────────
/**
 * The value ONE sales_targets row contributes to Target.
 *
 * A row with linked `client_targets` is a HEADER: the children are that same
 * goal broken down per client, so counting the row AND its children would
 * double it. This is symmetric — `total_value` and `by_clients` rows behave
 * identically when they have children, because the test is whether children
 * EXIST, never what target_type says (12 of the 20 parent rows in this database
 * are total_value, so keying off the type would be wrong).
 *
 * Takes the HIGHER of the row and its children, not the children alone: five
 * rows here are only partly allocated across clients (e.g. a 315,108 target
 * with 241,836 spread over 15 clients). Using the children's sum would let an
 * unfinished breakdown quietly LOWER an agreed target and flatter the owner's
 * attainment. The higher value keeps the commitment intact, and the 15 rows
 * whose children match their parent exactly are unaffected either way.
 *
 * @param {object} row a sales_targets row, with `client_targets` embedded
 */
export function targetRowValue(row) {
  const own = parseFloat(row?.target_amount) || 0;
  const kids = row?.client_targets;
  if (!Array.isArray(kids) || kids.length === 0) return own;
  const childSum = kids.reduce((sum, c) => sum + (parseFloat(c.target_amount) || 0), 0);
  return Math.max(own, childSum);
}

/**
 * Per-person target from monthly sales_targets rows.
 *
 * Rows are ADDITIVE: a person's target for a month is the sum of every
 * applicable row, because each records a DIFFERENT commitment —
 *   total_value  the overall value goal
 *   by_products  a product-group commitment (e.g. CPVC 300,000)
 *   by_clients   a per-client goal
 * so "CPVC 300,000 + client ABC 200,000 + by value 100,000" reads 600,000.
 * A person holding both a total_value and a by_clients row in one month has
 * two commitments and gets both: confirmed with the Sales Manager for the
 * June/July 2026 rows that prompted the question.
 *
 * The ONE thing never counted twice is a row and its own client breakdown,
 * which targetRowValue() collapses. client_targets are reached only through
 * their parent row, so there is no second pass that could add them again —
 * the double count is prevented structurally, not by a check.
 *
 * This replaced an either/or rule (total_value ?? by_clients). That rule was
 * correct while those were two views of one goal, and became wrong once a
 * person could hold several genuinely different commitments in one month.
 *
 * Summing is done PER MONTH then across months, so a multi-month range cannot
 * blur one month's rows into another's.
 *
 * @param {Array} targetRows sales_targets rows with `client_targets` embedded.
 *   Rows fetched WITHOUT the embed still work — a childless row counts its own
 *   amount — but a header row would then contribute its own value instead of
 *   its children's. Use fetchMonthlyTargets(), which embeds them.
 * @returns {Record<string, number>} assigned_to -> target
 */
export function targetPerPerson(targetRows) {
  const split = {};   // uid -> month -> summed value
  (targetRows || []).forEach((t) => {
    const k = t.assigned_to;
    const m = t.period_start || 'unknown';
    if (!k) return;
    if (!split[k]) split[k] = {};
    split[k][m] = (split[k][m] || 0) + targetRowValue(t);
  });

  const per = {};
  Object.entries(split).forEach(([k, months]) => {
    per[k] = Object.values(months).reduce((sum, v) => sum + v, 0);
  });
  return per;
}

/** Monthly target rows overlapping [start, end] for these contributors. */
export async function fetchMonthlyTargets({ companyId, contributorIds, start, end }) {
  if (!companyId || !contributorIds?.length) return [];
  const { data, error } = await supabase
    .from('sales_targets')
    .select(
      'target_amount, assigned_to, target_type, period_start, product_group, client_targets(target_amount)',
    )
    .eq('company_id', companyId)
    .eq('status', 'active')
    .eq('period_type', 'monthly')
    .in('assigned_to', contributorIds)
    .lte('period_start', end)
    .gte('period_end', start);
  if (error) { console.error('fetchMonthlyTargets:', error); return []; }
  return data || [];
}

/**
 * Annual target for a scope: the explicit yearly total_value rows, MAX per
 * person (a revised annual target replaces, it does not add). Falls back to the
 * year-to-date monthly sum when nobody in scope holds one — NOT monthlySum x 12,
 * which invented targets for months that have not happened.
 */
export async function computeAnnualTarget({ companyId, ownerIds, monthlyTotal, year = null }) {
  // The year the caller is LOOKING at, not the year it happens to be. With
  // `new Date().getFullYear()` hard-coded, the Director's "Last Year" view
  // showed 2025's achievement against 2026's annual target.
  const y = Number(year) > 1970 ? Number(year) : new Date().getFullYear();

  // The scope is resolved to ACTIVE users FIRST, always — including the
  // whole-company path. This previously applied `.in('assigned_to', ownerIds)`
  // only when ownerIds was an array, so a director's annual view (ownerIds =
  // null) read every yearly row in the company with no filter at all, and a
  // deactivated person's annual target would keep inflating the company number
  // indefinitely.
  //
  // Scoped to active users of ANY role, deliberately NOT to CONTRIBUTOR_ROLES,
  // which is the one place in this file that narrowing would be wrong. The
  // annual target IS the manager's yearly team roll-up — that is exactly what
  // the comment at the top of this file describes managers as carrying, and
  // what this function exists to read. Narrowing to salesman/supervisor would
  // discard it: the only yearly total_value row in this database belongs to a
  // manager, so the company annual target would collapse from 40,660,778.80 to
  // the monthly fallback. Excluding deactivated users is the fix here;
  // excluding managers would be a different, and incorrect, change.
  const { data: activeUsers, error: usersErr } = await supabase
    .from('users')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);
  if (usersErr) { console.error('computeAnnualTarget (users):', usersErr); return monthlyTotal; }

  let scopeIds = (activeUsers || []).map((u) => u.id);
  // An explicit scope narrows further; it never widens past the active set.
  if (Array.isArray(ownerIds)) scopeIds = scopeIds.filter((id) => ownerIds.includes(id));
  if (!scopeIds.length) return monthlyTotal;

  const { data, error } = await supabase
    .from('sales_targets')
    .select('target_amount, assigned_to, target_type')
    .eq('company_id', companyId)
    .eq('period_type', 'yearly')
    .eq('status', 'active')
    .eq('target_type', 'total_value')
    .gte('period_start', `${y}-01-01`)
    .lte('period_end', `${y}-12-31`)
    .in('assigned_to', scopeIds);
  if (error) { console.error('computeAnnualTarget:', error); return monthlyTotal; }

  const per = {};
  (data || []).forEach((t) => {
    const amt = parseFloat(t.target_amount) || 0;
    per[t.assigned_to] = Math.max(per[t.assigned_to] || 0, amt);
  });
  const yearlySum = Object.values(per).reduce((s, v) => s + v, 0);
  return yearlySum > 0 ? yearlySum : monthlyTotal;
}

/**
 * ANNUAL ALLOCATION — does a manager's monthly assigning add up to his year?
 *
 * CEO decision 2026-10-07: a manager's MONTHLY targets — the rows he assigns to
 * his team AND the rows he assigns to himself — must add up to the YEARLY
 * target the director assigned him by the end of that year. This reports how
 * far through that he is, and what per month is left to give out.
 *
 * SCOPE: the manager plus his ACTIVE subtree, all roles.
 *
 *   Active only. Decision 2026-10-07, after the figures were put side by side:
 *   including rows held by people who have since left adds 12,559,543 for
 *   JASCO PVC 2026 (Shaikh Osman Shoukat 12,049,543 over Jan–Sep and Mueataz
 *   Mohammed Ahmed 510,000 over Jan–Mar), which would read as 25,368,133
 *   assigned against 40,660,779 allocated. Active-only reads 12,808,590. The
 *   second is the figure management plans against, because the question the
 *   banner answers is "how much have I still got to give out", and allocation
 *   that left with a departed salesman is back in the manager's hands. The
 *   first is the better record of what was historically committed, and it is
 *   not what this screen is for. subtreeIdsOf() enforces this by construction:
 *   it walks active users only.
 *
 *   ALL ROLES, deliberately not the achiever scope. The manager's own rows are
 *   half of what the rule covers, and narrowing to CONTRIBUTOR_ROLES would
 *   count them only because he happens to carry is_contributor. For JASCO PVC
 *   today the two scopes give the same 12,808,589.56 — every monthly row
 *   belongs to an active achiever in Kamal's subtree — so this choice shows up
 *   only when a non-contributor manager assigns himself a row, where counting
 *   it is plainly right.
 *
 * NO NEW TARGET ARITHMETIC: the annual figure is computeAnnualTarget() and
 * every monthly sum is targetPerPerson(), the same two functions the dashboards
 * and Planning already use. This function chooses the SCOPE and does one
 * subtraction.
 *
 * @param {object} p
 * @param {string} p.companyId
 * @param {string} [p.managerId]  whose year this is. The annual figure is HIS
 *   own yearly row — "the yearly target the director assigned him" — not the
 *   subtree's, so a second manager below him with a yearly row of his own does
 *   not inflate it.
 * @param {number} p.year
 * @param {string[]} [p.ownerIds]  an explicit scope INSTEAD of a manager's
 *   subtree, for a caller that already has one (the Planning page passes its
 *   own viewer scope, so both screens run this one function rather than two
 *   copies of annual − assigned). Intersected with the active set, never
 *   widened past it.
 * @returns {Promise<{
 *   year: number, annual: number, assigned: number,
 *   byMonth: number[], remaining: number, overAllocated: boolean,
 *   monthsLeft: number, emptyMonths: number[], perMonthNeeded: number|null,
 *   scopeIds: string[],
 * }>} byMonth is 12 entries, index 0 = January. emptyMonths are 1-based month
 *   numbers with no rows yet, from the current month on.
 */
export async function computeAnnualAllocation({
  companyId, managerId = null, year, ownerIds = null,
}) {
  const y = Number(year) > 1970 ? Number(year) : new Date().getFullYear();
  const empty = {
    year: y, annual: 0, assigned: 0, byMonth: Array(12).fill(0),
    remaining: 0, overAllocated: false, monthsLeft: 0, emptyMonths: [],
    perMonthNeeded: null, scopeIds: [],
  };
  if (!companyId || (!managerId && !Array.isArray(ownerIds))) return empty;

  // ── scope ────────────────────────────────────────────────────────────────
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, supervisor_id, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true);
  if (usersErr) { console.error('computeAnnualAllocation (users):', usersErr); return empty; }

  const activeIds = (users || []).map((u) => u.id);
  let scopeIds;
  if (Array.isArray(ownerIds)) {
    scopeIds = activeIds.filter((id) => ownerIds.includes(id));
  } else {
    // Himself first, then everyone under him. A manager assigning himself a
    // monthly row is spending the same allocation as assigning his team one,
    // which is the whole point of the rule.
    scopeIds = [managerId, ...subtreeIdsOf({ users: users || [], rootId: managerId })]
      .filter((id) => activeIds.includes(id));
  }
  if (!scopeIds.length) return empty;

  // ── the two shared figures ───────────────────────────────────────────────
  // Literal date strings from the year number: never toISOString() on a local
  // date, which in Asia/Riyadh (UTC+3) turns the 1st into the previous month.
  const yearStart = `${y}-01-01`;
  const yearEnd = `${y}-12-31`;

  const annual = await computeAnnualTarget({
    companyId,
    ownerIds: managerId ? [managerId] : scopeIds,
    monthlyTotal: 0,
    year: y,
  });

  const rows = await fetchMonthlyTargets({
    companyId, contributorIds: scopeIds, start: yearStart, end: yearEnd,
  });

  // targetPerPerson sums per person per month and collapses a row against its
  // own client breakdown, so this is the same value every other screen reads.
  const assigned = Object.values(targetPerPerson(rows)).reduce((s, v) => s + v, 0);

  // Per month, through the SAME function rather than a second reduce over
  // target_amount — a month's figure here and the same month's figure on a
  // dashboard cannot disagree.
  const byMonth = Array(12).fill(0);
  for (let m = 0; m < 12; m += 1) {
    const mm = String(m + 1).padStart(2, '0');
    const inMonth = rows.filter((t) => String(t.period_start || '').slice(0, 7) === `${y}-${mm}`);
    byMonth[m] = Object.values(targetPerPerson(inMonth)).reduce((s, v) => s + v, 0);
  }

  // ── what is left, and over how many months ───────────────────────────────
  const remaining = annual - assigned;

  // "From the current month on": a month already carrying rows is spoken for,
  // and a month in the past cannot be allocated into. For a year that is not
  // the current one there is no "current month" to count from — a past year has
  // nothing left to allocate, and a future year has all twelve open.
  const now = new Date();
  const startMonth = (() => {
    if (y === now.getFullYear()) return now.getMonth() + 1;   // local, 1-based
    return y > now.getFullYear() ? 1 : 13;
  })();
  const emptyMonths = [];
  for (let m = startMonth; m <= 12; m += 1) {
    if (byMonth[m - 1] === 0) emptyMonths.push(m);
  }
  const monthsLeft = emptyMonths.length;

  return {
    year: y,
    annual,
    assigned,
    byMonth,
    remaining,
    // Assigning MORE than the year's allocation is not blocked anywhere — this
    // is information, never a gate — so the sign has to be reportable.
    overAllocated: remaining < 0,
    monthsLeft,
    emptyMonths,
    perMonthNeeded: monthsLeft > 0 ? remaining / monthsLeft : null,
    scopeIds,
  };
}

// ── 2. WIN RATE ─────────────────────────────────────────────────────────────
/**
 * 3-month rolling win rate for a scope, with the agreed 3-step fallback:
 * the 3 completed months -> this scope's whole history -> the company average.
 * Only the last step counts as a "default".
 *
 * ALWAYS narrowed to the ACHIEVER scope, whatever `ownerIds` the caller passes:
 * you cannot count someone's revenue and target but ignore how much of what he
 * starts he finishes. The narrowing now lives in fetchWinRate3m, so no caller
 * can reintroduce a leak by passing a wider scope and no caller has to remember
 * to narrow one.
 *
 * It was CONTRIBUTOR_ROLES only until 2026-10-05; see fetchWinRate3m for the
 * decision and what it changed.
 *
 * winRate3m.js stays the primitive for the windowed figure; this adds the
 * fallback chain on top of it.
 *
 * @param {string[]} [p.contributorIds] an already-resolved scope, to skip the
 *        extra users lookup. Resolved internally when omitted. Named for what
 *        it used to hold; it is now the achiever scope.
 */
export async function computeWinRate({
  companyId, ownerIds = null, withFallback = false, contributorIds = null,
}) {
  const scopeIds = contributorIds || await fetchAchieverIds({ companyId, ownerIds });
  if (!scopeIds.length) return { winRatePct: 0, isDefault: true };

  // scopeIds, not ownerIds: already resolved, so fetchWinRate3m skips its own
  // lookup rather than resolving the same set twice.
  const rate3m = await fetchWinRate3m({ companyId, scopeIds });
  const { winRate3m, total3m } = rate3m;
  if (total3m > 0) {
    return {
      winRatePct: winRate3m,
      isDefault: false,
      // Information only (CEO decision D2) — carried through so a screen can
      // show it beside the rate without a second query. null on the fallback
      // paths below, where there is no 3-month window to measure it over.
      pipelineConversion3m: rate3m.pipelineConversion3m,
      pipelineTotal3m: rate3m.pipelineTotal3m,
      importedExcluded: rate3m.importedExcluded,
    };
  }
  // The KPI strip deliberately reports 0% for a scope with no deals in the
  // window rather than borrowing another scope's rate; Planning walks the
  // fallback chain instead. Same rule, two documented policies -- opt in.
  if (!withFallback) return { winRatePct: 0, isDefault: true };

  // Step 2 - this scope's whole history, achievers only, and with
  // IMPORTED history excluded like every other rate (utils/importedDeals.js).
  // This fallback is the one most exposed to it: a salesman whose only rows
  // are loaded-in invoices would have read 100%, and 100% makes Required
  // Plan equal to the target — no new pipeline needed, ever.
  const { data: hist } = await queryDealsWithImportFlag((select) => supabase
    .from('deals')
    .select(select)
    .eq('company_id', companyId)
    .in('owner_id', scopeIds), 'stage, invoice_number');
  const worked = (hist || []).filter((d) => !isImportedDeal(d));
  if (worked.length) {
    const won = worked.filter((d) => d.stage === 'won').length;
    return { winRatePct: (won / worked.length) * 100, isDefault: false };
  }

  // Step 3 - the company average, also over the achiever scope.
  const companyAchievers = await fetchAchieverIds({ companyId });
  if (!companyAchievers.length) return { winRatePct: 0, isDefault: true };
  const { winRate3m: companyAvg } = await fetchWinRate3m({
    companyId, scopeIds: companyAchievers,
  });
  return { winRatePct: companyAvg, isDefault: true };
}

/**
 * Win rate from deal rows already in hand.
 *
 * The Coverage Console computes every level of the hierarchy from ONE fetch, so
 * it cannot await a query per node. This is the same won/total formula as
 * fetchWinRate3m() applied to rows the caller already has -- the caller is
 * responsible for having fetched the right 3-month window.
 *
 * @returns {{winRatePct:number, total:number}} percent, not a fraction.
 */
export function winRateFromDeals({ deals, ownerIds = null }) {
  // Imported history is dropped here too, so a screen that computes its own
  // levels from one read (the Coverage Console, Insights) gets the same rate
  // as fetchWinRate3m. The caller must have SELECTED invoice_number and, once
  // the migration is applied, is_imported — without them every row looks
  // worked and the rate goes back to being inflated.
  const scoped = Array.isArray(ownerIds)
    ? (deals || []).filter((d) => ownerIds.includes(d.owner_id))
    : (deals || []);
  const rows = scoped.filter((d) => !isImportedDeal(d));
  if (!rows.length) return { winRatePct: 0, total: 0 };
  const won = rows.filter((d) => d.stage === 'won').length;
  return { winRatePct: (won / rows.length) * 100, total: rows.length };
}

/**
 * Sum a planned_amount column per owner, for rows already in hand.
 * One definition of the reduce used by carry-in and by Planned.
 */
export function sumPlannedByOwner({ rows, ownerIds = null }) {
  const perPerson = {};
  (rows || []).forEach((o) => {
    if (Array.isArray(ownerIds) && !ownerIds.includes(o.owner_id)) return;
    perPerson[o.owner_id] = (perPerson[o.owner_id] || 0) + (parseFloat(o.planned_amount) || 0);
  });
  return { total: Object.values(perPerson).reduce((s, v) => s + v, 0), perPerson };
}

// ── 3. REQUIRED PLAN ────────────────────────────────────────────────────────
/** Target ÷ win rate. With no win rate at all, assume 50% (target x 2). */
export function computeRequiredRaw({ target, winRatePct }) {
  const t = Number(target) || 0;
  const wr = Number(winRatePct) || 0;
  return wr > 0 ? t / (wr / 100) : t * 2;
}

// ── 4. CARRY-IN ─────────────────────────────────────────────────────────────
/** First/last day of next month as yyyy-MM-dd, from local date parts. */
export function nextMonthBounds(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const e = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { startDate: fmt(s), endDate: fmt(e) };
}

/**
 * Pending future orders for NEXT month — customers already committed, so they
 * reduce the new pipeline still needed.
 *
 * Scoped to CONTRIBUTORS, not to everyone in ownerIds. Planning and Coverage
 * Console both used the wider scope, which let a manager's own future orders
 * offset a target the manager never contributed to.
 */
export async function computeCarryIn({ companyId, contributorIds }) {
  if (!companyId || !contributorIds?.length) return { total: 0, perPerson: {} };
  const { startDate, endDate } = nextMonthBounds();
  const { data, error } = await supabase
    .from('future_orders')
    .select('owner_id, planned_amount')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .in('owner_id', contributorIds)
    .gte('expected_month', startDate)
    .lte('expected_month', endDate);
  if (error) { console.error('computeCarryIn:', error); return { total: 0, perPerson: {} }; }
  return sumPlannedByOwner({ rows: data });
}

// ── 5. PLANNED GAP ──────────────────────────────────────────────────────────
/** required = max(0, raw − carryIn); gap = max(0, required − planned). */
export function computePlannedGap({ requiredRaw, carryIn, planned }) {
  const required = Math.max(0, (Number(requiredRaw) || 0) - (Number(carryIn) || 0));
  return { required, plannedGap: Math.max(0, required - (Number(planned) || 0)) };
}

/** Open Current-Sales-Plan value for the current month. */
export async function computePlanned({ companyId, contributorIds, monthStart, monthEnd }) {
  if (!companyId || !contributorIds?.length) return { total: 0, perPerson: {} };
  const { data, error } = await supabase
    .from('opportunities')
    .select('owner_id, planned_amount')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .in('owner_id', contributorIds)
    .gte('expected_month', monthStart)
    .lte('expected_month', monthEnd);
  if (error) { console.error('computePlanned:', error); return { total: 0, perPerson: {} }; }
  return sumPlannedByOwner({ rows: data });
}

// ── 6. COVERAGE ─────────────────────────────────────────────────────────────
/**
 * Coverage = achieved + weighted open pipeline + weighted plan.
 *
 * An open deal is weighted by its own forecast_amount when one was entered,
 * otherwise by amount x win rate; the month's planned value is weighted by the
 * win rate. Compared against Target: coverage >= target means the month is
 * covered.
 *
 * Operates on rows already in hand (like winRateFromDeals), so a page that
 * computes several levels from one fetch can call it per node.
 *
 * NOTE: coverage-console/index.jsx still carries its own inline copy of this
 * formula in calcMetrics. It was deliberately left untouched when this was
 * added; moving it onto this function is a logged follow-up.
 *
 * @param {number}   p.invoiced    achieved (won + invoiced) value in the window
 * @param {object[]} p.openDeals   open deal rows: { amount, forecast_amount }
 * @param {number}   p.planned     open Current-Sales-Plan value for the month
 * @param {number}   p.winRatePct  percent, not a fraction
 */
export function computeCoverage({ invoiced, openDeals, planned, winRatePct }) {
  const winRate = (Number(winRatePct) || 0) / 100;
  const weightedFunnel = (openDeals || []).reduce(
    (sum, d) => sum + (d.forecast_amount || d.amount * winRate || 0),
    0,
  );
  const weightedPlanning = (Number(planned) || 0) * winRate;
  return {
    weightedFunnel,
    weightedPlanning,
    coverage: (Number(invoiced) || 0) + weightedFunnel + weightedPlanning,
  };
}

// ── 7. ACHIEVED ─────────────────────────────────────────────────────────────
/**
 * The single definition of Achieved.
 *
 *   A deal counts when stage = 'won' AND is_invoiced = true, dated by its
 *   invoice_date (yyyy-MM-dd) inside [start, end]. Its value is
 *   final_amount ?? amount. Only ACHIEVERS' deals count: active salesmen and
 *   supervisors (CONTRIBUTOR_ROLES), plus any active user individually flagged
 *   users.is_contributor = true (a manager who sells himself). See achieverIdsFrom.
 *
 * Extracted from computeKpiStripData, which was the one correct copy. Five other
 * places had drifted: Performance Summary picked deals by close date, Company
 * Performance counted every owner (and one of its two writers was locked to the
 * current month), and the manager dashboard counted won-but-not-invoiced deals at
 * `amount`. For one month they showed 362,762 / 417,401 / 413,976 / 620,779 for
 * the same thing.
 */
export const achievedAmount = (deal) => parseFloat(deal?.final_amount ?? deal?.amount) || 0;

/** True when this one deal is invoiced achievement inside [start, end]. */
export function isAchievedDeal(deal, { start = null, end = null } = {}) {
  if (!deal || deal.stage !== 'won' || deal.is_invoiced !== true || !deal.invoice_date) return false;
  const day = String(deal.invoice_date).slice(0, 10);
  return (!start || day >= start) && (!end || day <= end);
}

// ── SALES RETURNS ───────────────────────────────────────────────────────────
/**
 * A return (ERP credit note) reduces Achieved. Three rules, all deliberate:
 *
 *   1. SIGN — deal_returns.return_amount is stored POSITIVE and subtracted
 *      here. The original invoice is never rewritten; deals.amount and
 *      deals.final_amount keep the figures they were invoiced at.
 *   2. PERIOD — a return reduces the month it HAPPENED in (return_date), not
 *      the month of the invoice it cancels. A January invoice returned in
 *      March reduces March. Past months therefore stay stable once reported.
 *      This is why returns are fetched over the window INDEPENDENTLY of the
 *      deals: the invoice being credited is usually not in that window at all.
 *   3. OWNER — a return belongs to the owner of the deal it was matched to.
 *      An unmatched return (deal_id null) has no owner and cannot reduce
 *      anyone's Achieved; it is kept for audit and surfaced in the importer.
 */
export const returnAmount = (row) => Math.abs(parseFloat(row?.return_amount) || 0);

/** True when this one return falls inside [start, end] by return_date. */
export function isReturnInPeriod(row, { start = null, end = null } = {}) {
  if (!row || !row.return_date) return false;
  const day = String(row.return_date).slice(0, 10);
  return (!start || day >= start) && (!end || day <= end);
}

/**
 * Total returns and per-person split, over the same scope and window Achieved
 * uses. Rows need { owner_id, return_date, return_amount }; owner_id comes from
 * the matched deal (see fetchReturns).
 */
export function computeReturns({ returns, contributorIds, start = null, end = null }) {
  const scope = new Set(contributorIds || []);
  const counted = (returns || []).filter(
    (r) => r && scope.has(r.owner_id) && isReturnInPeriod(r, { start, end }),
  );
  const perPerson = {};
  counted.forEach((r) => {
    perPerson[r.owner_id] = (perPerson[r.owner_id] || 0) + returnAmount(r);
  });
  return {
    total: Object.values(perPerson).reduce((s, v) => s + v, 0),
    perPerson,
    count: counted.length,
  };
}

/**
 * Returns straight from the database, flattened so each row carries the
 * owner_id of the deal it was matched to. Unmatched returns (deal_id null) are
 * excluded by the inner join — they have no owner to charge.
 */
export async function fetchReturns({ companyId, ownerIds = null, start = null, end = null }) {
  if (!companyId) return [];
  let q = supabase
    .from('deal_returns')
    .select('id, deal_id, return_date, return_amount, deals!inner(owner_id, division_id)')
    .eq('company_id', companyId);
  if (start) q = q.gte('return_date', start);
  if (end) q = q.lte('return_date', end);
  if (Array.isArray(ownerIds)) {
    if (!ownerIds.length) return [];
    q = q.in('deals.owner_id', ownerIds);
  }
  const { data, error } = await q;
  if (error) {
    // A reporting screen must not go blank because returns could not be read;
    // it degrades to gross Achieved, which is what it showed before returns
    // existed. Logged so the degradation is visible rather than silent.
    console.error('fetchReturns:', error);
    return [];
  }
  return (data || []).map((r) => ({
    id: r.id,
    deal_id: r.deal_id,
    return_date: r.return_date,
    return_amount: r.return_amount,
    owner_id: r.deals?.owner_id ?? null,
    // The DEAL's division, so a return can be scoped the same way its deal is.
    // Without it a credit note is subtracted once per division its owner
    // belongs to, which for a multi-division person double-counts it.
    division_id: r.deals?.division_id ?? null,
  }));
}


// ── WHO COUNTS ──────────────────────────────────────────────────────────────
// CONTRIBUTOR_ROLES and the three predicates below now live in
// utils/achieverScope.js, a LEAF module. They moved because utils/winRate3m.js
// has to narrow a conversion rate to the achiever scope and this file imports
// fetchWinRate3m from it — importing back would make the two most-depended-on
// modules in the app mutually recursive. Nothing else changed: every name is
// re-exported here, so every existing `from 'utils/planningCalculations'`
// import keeps working and there is still exactly ONE definition of each rule.
export {
  CONTRIBUTOR_ROLES,
  contributorIdsFrom,
  isAchievedOnly,
  achieverIdsFrom,
  targetOwnerIdsFrom,
  fetchAchieverIds,
} from 'utils/achieverScope';

/** Active flagged achieved-only users in scope (see isAchievedOnly). `ownerIds = null` = whole company. */
export async function fetchAchievedOnlyUsers({ companyId, ownerIds = null }) {
  if (!companyId) return [];
  if (Array.isArray(ownerIds) && ownerIds.length === 0) return [];
  let q = supabase
    .from('users')
    .select('id, full_name, role, is_active, is_contributor')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('is_contributor', true)
    .not('role', 'in', `(${CONTRIBUTOR_ROLES.join(',')})`);
  if (Array.isArray(ownerIds)) q = q.in('id', ownerIds);
  const { data, error } = await q;
  if (error) { console.error('fetchAchievedOnlyUsers:', error); return []; }
  return data || [];
}

/**
 * Achieved from deal rows already in hand — for pages that load their deals once.
 *
 * @param {object[]} p.deals           deal rows (stage, is_invoiced, invoice_date, amount, final_amount, owner_id)
 * @param {string[]} p.contributorIds  whose deals count (see contributorIdsFrom / fetchContributors)
 * @param {string}   [p.start]         yyyy-MM-dd, inclusive
 * @param {string}   [p.end]           yyyy-MM-dd, inclusive
 * @param {function} [p.amountOf]      value of one deal; defaults to achievedAmount. A
 *                                     screen that displays converted currency passes a
 *                                     converter around achievedAmount — the RULE stays the same.
 * @returns {{ total:number, perPerson:Record<string,number>, count:number, deals:object[] }}
 */
export function computeAchieved({
  deals, contributorIds, start = null, end = null, amountOf = achievedAmount, returns = [],
}) {
  const scope = new Set(contributorIds || []);
  const counted = (deals || []).filter((d) => scope.has(d.owner_id) && isAchievedDeal(d, { start, end }));
  const perPerson = {};
  counted.forEach((d) => {
    perPerson[d.owner_id] = (perPerson[d.owner_id] || 0) + amountOf(d);
  });
  const grossTotal = Object.values(perPerson).reduce((sum, v) => sum + v, 0);

  // Subtracted from the SAME person and the SAME window, and deliberately NOT
  // floored at zero. A month whose returns exceed its invoices really does have
  // negative net revenue, and that is what the ERP will say; clamping it to
  // zero would silently swallow the difference — which is the reconciliation
  // gap this exists to close. Downstream, a negative Achieved simply widens the
  // gap to target (target − achieved), which is the correct consequence: goods
  // that came back still have to be sold again.
  const ret = computeReturns({ returns, contributorIds, start, end });
  Object.entries(ret.perPerson).forEach(([ownerId, amt]) => {
    perPerson[ownerId] = (perPerson[ownerId] || 0) - amt;
  });
  const total = Object.values(perPerson).reduce((sum, v) => sum + v, 0);

  return {
    total,                              // net of returns — what every consumer wants
    perPerson,
    count: counted.length,
    deals: counted,
    grossTotal,                         // before returns, for "invoiced X, returned Y" displays
    returnsTotal: ret.total,
    returnsPerPerson: ret.perPerson,
    returnsCount: ret.count,
  };
}

/** Achieved straight from the database, same rule as computeAchieved. */
export async function fetchAchieved({ companyId, contributorIds, start = null, end = null }) {
  const empty = {
    total: 0, perPerson: {}, count: 0, deals: [],
    grossTotal: 0, returnsTotal: 0, returnsPerPerson: {}, returnsCount: 0,
  };
  if (!companyId || !contributorIds?.length) return empty;
  let q = supabase
    .from('deals')
    .select('id, owner_id, stage, is_invoiced, amount, final_amount, invoice_date')
    .eq('company_id', companyId)
    .eq('stage', 'won')
    .eq('is_invoiced', true)
    .in('owner_id', contributorIds);
  if (start) q = q.gte('invoice_date', start);
  if (end) q = q.lte('invoice_date', end);
  const { data, error } = await q;
  if (error) { console.error('fetchAchieved:', error); return empty; }
  // Returns are fetched over the same window but INDEPENDENTLY of the deals
  // above: a return dated this month usually belongs to an invoice from an
  // earlier month, which is not in `data` at all.
  const returns = await fetchReturns({ companyId, ownerIds: contributorIds, start, end });
  return computeAchieved({ deals: data, contributorIds, start, end, returns });
}

// ── WON, NOT YET INVOICED (visibility only) ────────────────────────────────
/**
 * Pure visibility into deals stuck between winning and invoicing. This never
 * changes Achieved (see isAchievedDeal above) — a deal here just hasn't
 * reached is_invoiced = true yet, and drops out of this list the moment it
 * does, becoming Achieved instead. No new table, no persistence: computed
 * from the same deal rows every screen already fetches.
 */
export const STALE_INVOICE_DAYS = 7;

/** Days since a deal was won: closed_at, else stage_changed_at, else created_at. */
export function daysSinceWon(deal, now = new Date()) {
  const wonAt = deal?.closed_at || deal?.stage_changed_at || deal?.created_at;
  if (!wonAt) return 0;
  return Math.max(0, Math.floor((now - new Date(wonAt)) / 86400000));
}

/** True when a deal is won but not (yet) invoiced. */
export function isWonNotInvoiced(deal) {
  return !!deal && deal?.stage === 'won' && deal?.is_invoiced !== true;
}

/**
 * Won-but-uninvoiced deals in scope, from deal rows already in hand, each
 * annotated with daysSinceWon and isStale (>= thresholdDays). Oldest first,
 * so the longest-waiting deal leads.
 *
 * @param {object[]} p.deals       deal rows (stage, is_invoiced, owner_id, plus a won-date field)
 * @param {string[]} [p.ownerIds]  scope; omitted/null = every owner in `deals`
 */
export function wonNotInvoicedList({ deals, ownerIds = null, now = new Date(), thresholdDays = STALE_INVOICE_DAYS }) {
  const scope = Array.isArray(ownerIds) ? new Set(ownerIds) : null;
  return (deals || [])
    .filter((d) => (!scope || scope.has(d.owner_id)) && isWonNotInvoiced(d))
    .map((d) => {
      const days = daysSinceWon(d, now);
      return { ...d, daysSinceWon: days, isStale: days >= thresholdDays };
    })
    .sort((a, b) => b.daysSinceWon - a.daysSinceWon);
}

/** Counts/values summary of a wonNotInvoicedList() result, for a KPI card. */
export function summarizeWonNotInvoiced(list) {
  const items = list || [];
  const stale = items.filter((d) => d.isStale);
  return {
    count: items.length,
    total: items.reduce((s, d) => s + achievedAmount(d), 0),
    staleCount: stale.length,
    staleValue: stale.reduce((s, d) => s + achievedAmount(d), 0),
    oldestDays: items.length ? items[0].daysSinceWon : 0,
    items,
  };
}

/**
 * Synthetic exceptions for STALE won-but-uninvoiced deals, shaped exactly
 * like the flag/escalation items buildExceptions() already produces
 * (utils/salesDivisionMetrics.js, coverage-console/index.jsx), so
 * ExceptionFeed / DivisionExceptionFeed render them with no changes.
 */
export function wonNotInvoicedExceptions({ deals, ownerIds = null, now = new Date(), thresholdDays = STALE_INVOICE_DAYS }) {
  return wonNotInvoicedList({ deals, ownerIds, now, thresholdDays })
    .filter((d) => d.isStale)
    .map((d) => ({
      sev: 'warning',
      type: 'stale_invoice',
      title: `Won ${d.daysSinceWon}d, Not Invoiced`,
      ownerId: d.owner_id,
      dealId: d.id,
      createdAt: d.closed_at || d.stage_changed_at || d.created_at,
      amount: achievedAmount(d),
      daysSinceWon: d.daysSinceWon,
    }));
}

// ── Orchestrator ────────────────────────────────────────────────────────────
/** First/last day of the current month, as ISO strings and yyyy-MM-dd. */
export function monthBounds(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), 1);
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
  return {
    startISO: s.toISOString(),
    endISO: e.toISOString(),
    startDate: `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-01`,
    endDate: `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`,
  };
}

/**
 * The whole chain in one call, so no consumer has to re-wire the sequence.
 *
 * @param {object} p
 * @param {string} p.companyId
 * @param {string[]|null} p.ownerIds  null = whole company
 * @param {{start:string,end:string,isAnnual:boolean}|null} p.range
 *        Target window. Omitted = current month.
 * @param {boolean} p.withFallback  win-rate policy - see computeWinRate().
 *        false (default) = report 0% for a scope with no deals in the window
 *        (the KPI-strip rule); true = walk the 3-step fallback chain (Planning).
 * @param {boolean} p.plannedFollowsRange  Planned window policy.
 *        false (default) = the CURRENT MONTH, matching the dashboards: the
 *        Current Sales Plan is a monthly artifact. true = the same window as
 *        Target, so a quarter's Required Plan is compared against a quarter of
 *        planned value (Planning's rule). The two are deliberately separate;
 *        they coincide for This Month and differ only for longer periods.
 *        Carry-in is always NEXT month - it is defined that way, not by range.
 */
export async function computePlanningSummary({
  companyId, ownerIds = null, range = null,
  withFallback = false, plannedFollowsRange = false,
}) {
  const empty = {
    target: 0, winRatePct: 0, winRateIsDefault: true,
    requiredRaw: 0, carryIn: 0, required: 0, planned: 0, plannedGap: 0,
    contributors: [], contributorIds: [], targetPer: {}, plannedPer: {}, carryInPer: {},
  };
  if (!companyId) return empty;

  const contributors = await fetchContributors({ companyId, ownerIds });
  const contributorIds = contributors.map((c) => c.id);
  if (!contributorIds.length) return empty;

  const mb = monthBounds();
  const start = range?.start || mb.startDate;
  const end = range?.end || mb.endDate;

  const targetRows = await fetchMonthlyTargets({ companyId, contributorIds, start, end });
  const targetPer = targetPerPerson(targetRows);
  const monthlyTotal = Object.values(targetPer).reduce((s, v) => s + v, 0);

  const target = range?.isAnnual
    ? await computeAnnualTarget({ companyId, ownerIds, monthlyTotal })
    : monthlyTotal;

  const { winRatePct, isDefault } = await computeWinRate({
    companyId, ownerIds, withFallback, contributorIds,
  });
  const requiredRaw = computeRequiredRaw({ target, winRatePct });

  const { total: carryIn, perPerson: carryInPer } = await computeCarryIn({ companyId, contributorIds });
  const { total: planned, perPerson: plannedPer } = await computePlanned({
    companyId,
    contributorIds,
    monthStart: plannedFollowsRange ? start : mb.startDate,
    monthEnd: plannedFollowsRange ? end : mb.endDate,
  });

  const { required, plannedGap } = computePlannedGap({ requiredRaw, carryIn, planned });

  return {
    target, winRatePct, winRateIsDefault: isDefault,
    requiredRaw, carryIn, required, planned, plannedGap,
    contributors, contributorIds, targetPer, plannedPer, carryInPer,
  };
}
