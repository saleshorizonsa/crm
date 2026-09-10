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
 * Per-person target from monthly sales_targets rows.
 *
 * A person may record one goal in either of two views: `total_value` (the
 * overall number) or `by_clients` (the same number broken down per client).
 * Use total_value when present, else the by_clients rows — never both, they are
 * two views of one goal.
 *
 * `by_products` is a THIRD view and never counts toward Target. It used to fall
 * into the total_value bucket via an `else`, which added a phantom 750,000 to
 * one salesman and to every roll-up above him.
 *
 * The choice is made PER MONTH then summed. Made once per person across a
 * multi-month range, a month recorded in the other style is silently dropped.
 *
 * @returns {Record<string, number>} assigned_to -> target
 */
export function targetPerPerson(targetRows) {
  const split = {};   // uid -> month -> { total_value, by_clients, breakdown }
  (targetRows || []).forEach((t) => {
    const k = t.assigned_to;
    const m = t.period_start || 'unknown';
    if (!k) return;
    if (!split[k]) split[k] = {};
    if (!split[k][m]) split[k][m] = { total_value: 0, by_clients: 0, breakdown: 0 };
    const amt = parseFloat(t.target_amount) || 0;
    if (t.target_type === 'total_value') split[k][m].total_value += amt;
    else if (t.target_type === 'by_clients') split[k][m].by_clients += amt;
    else split[k][m].breakdown += amt;   // by_products etc — a view, not a goal
  });

  const per = {};
  Object.entries(split).forEach(([k, months]) => {
    per[k] = Object.values(months).reduce(
      (sum, v) => sum + (v.total_value > 0 ? v.total_value : v.by_clients),
      0,
    );
  });
  return per;
}

/** Monthly target rows overlapping [start, end] for these contributors. */
export async function fetchMonthlyTargets({ companyId, contributorIds, start, end }) {
  if (!companyId || !contributorIds?.length) return [];
  const { data, error } = await supabase
    .from('sales_targets')
    .select('target_amount, assigned_to, target_type, period_start')
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
