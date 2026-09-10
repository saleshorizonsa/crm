import { supabase } from 'lib/supabase';
import { fetchWinRate3m } from 'utils/winRate3m';

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

// The KPI numbers aggregate over individual contributors. Managers are excluded
// on purpose: they carry a YEARLY team roll-up, not a monthly total_value quota,
// so including them would dwarf and double-count the monthly numbers — and their
// future orders must not offset a target they never contributed to.
export const CONTRIBUTOR_ROLES = ['salesman', 'supervisor'];

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
export async function computeAnnualTarget({ companyId, ownerIds, monthlyTotal }) {
  const y = new Date().getFullYear();
  let q = supabase
    .from('sales_targets')
    .select('target_amount, assigned_to, target_type')
    .eq('company_id', companyId)
    .eq('period_type', 'yearly')
    .eq('status', 'active')
    .eq('target_type', 'total_value')
    .gte('period_start', `${y}-01-01`)
    .lte('period_end', `${y}-12-31`);
  if (Array.isArray(ownerIds)) q = q.in('assigned_to', ownerIds);
  const { data, error } = await q;
  if (error) { console.error('computeAnnualTarget:', error); return monthlyTotal; }

  const per = {};
  (data || []).forEach((t) => {
    const amt = parseFloat(t.target_amount) || 0;
    per[t.assigned_to] = Math.max(per[t.assigned_to] || 0, amt);
  });
  const yearlySum = Object.values(per).reduce((s, v) => s + v, 0);
  return yearlySum > 0 ? yearlySum : monthlyTotal;
}

// ── 2. WIN RATE ─────────────────────────────────────────────────────────────
/**
 * 3-month rolling win rate for a scope, with the agreed 3-step fallback:
 * the 3 completed months -> this scope's whole history -> the company average.
 * Only the last step counts as a "default".
 *
 * ALWAYS narrowed to CONTRIBUTOR_ROLES, whatever `ownerIds` the caller passes.
 * You cannot count someone's target but ignore their sales -- and the mirror
 * holds: a manager carries no monthly target, so his own deals must not move
 * the team's monthly win rate either. Planning passed the raw scope (which for
 * a director meant every deal in the company), reading 65.06% where the
 * dashboards read 65.15% off the contributor set. The narrowing lives HERE so
 * no caller can reintroduce the leak by passing a wider scope.
 *
 * winRate3m.js stays the primitive for the windowed figure (11 other consumers
 * rely on it); this adds the contributor narrowing and the fallback chain.
 *
 * @param {string[]} [p.contributorIds] already-resolved contributors, to skip
 *        the extra users lookup. Resolved internally when omitted.
 */
export async function computeWinRate({
  companyId, ownerIds = null, withFallback = false, contributorIds = null,
}) {
  const scopeIds = contributorIds
    || (await fetchContributors({ companyId, ownerIds })).map((c) => c.id);
  if (!scopeIds.length) return { winRatePct: 0, isDefault: true };

  const { winRate3m, total3m } = await fetchWinRate3m({ companyId, ownerIds: scopeIds });
  if (total3m > 0) return { winRatePct: winRate3m, isDefault: false };
  // The KPI strip deliberately reports 0% for a scope with no deals in the
  // window rather than borrowing another scope's rate; Planning walks the
  // fallback chain instead. Same rule, two documented policies -- opt in.
  if (!withFallback) return { winRatePct: 0, isDefault: true };

  // Step 2 - this scope's whole history, contributors only.
  const { data: hist } = await supabase
    .from('deals')
    .select('stage')
    .eq('company_id', companyId)
    .in('owner_id', scopeIds);
  if (hist?.length) {
    const won = hist.filter((d) => d.stage === 'won').length;
    return { winRatePct: (won / hist.length) * 100, isDefault: false };
  }

  // Step 3 - the company average, also over contributors only.
  const companyContributors = (await fetchContributors({ companyId })).map((c) => c.id);
  if (!companyContributors.length) return { winRatePct: 0, isDefault: true };
  const { winRate3m: companyAvg } = await fetchWinRate3m({
    companyId, ownerIds: companyContributors,
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
  const rows = Array.isArray(ownerIds)
    ? (deals || []).filter((d) => ownerIds.includes(d.owner_id))
    : (deals || []);
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
