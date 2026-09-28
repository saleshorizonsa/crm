// ─────────────────────────────────────────────────────────────────────────────
// PLANNING PAGE ONLY — the Sales Manager's summary formulas.
//
// This file exists BESIDE utils/planningCalculations.js and deliberately does
// NOT change it. The shared file defines Required Plan as raw Target ÷ win rate,
// netted against next month's Future Orders carry-in, and the Coverage Console,
// the dashboards and the KPI strip all depend on that definition. The Planning
// page now wants a different chain:
//
//   Remaining Target            = Target − Achieved (this period), floor 0
//   Required Plan               = Remaining Target ÷ 3-month win rate
//                                (NO carry-in netting — deliberate difference)
//   Available Planning Coverage = untransferred plan value + open funnel value,
//                                both RAW and UNWEIGHTED (deliberately NOT
//                                computeCoverage(), which weights by win rate)
//   Planned Gap                 = max(0, Required Plan − Available Coverage)
//   Planning Coverage %         = Available Coverage ÷ Required Plan × 100
//
// Every primitive underneath is imported from the shared file, so Achieved, the
// win rate and the target-row reading stay one definition app-wide. Only the
// arithmetic on top is local.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from 'lib/supabase';
import {
  fetchContributors,
  fetchMonthlyTargets,
  targetPerPerson,
  computeWinRate,
  computeRequiredRaw,
  fetchAchieved,
  fetchAchievedOnlyUsers,
} from './planningCalculations';

/**
 * Product groups are free text typed into the opportunity form, so the same
 * group arrives as "PVC PIPE AND FITTING", "pvc pipe and fitting" and
 * "PVC pipe and Fitting". Collapsing case and runs of whitespace merges those
 * into one bucket.
 *
 * It does NOT map synonyms: "PVC PIPE" and "PVC PIPE AND FITTING" stay separate,
 * and the typo "PVC PIPE AND FITTINF" stays its own bucket rather than being
 * guessed into the right one. Inventing that mapping would quietly move money
 * between groups; the typos belong in a data clean-up instead.
 *
 * NOTE on the source: products.material_group was the intended canonical list,
 * but it holds ERP SKU codes (USHT, SPIP, UPFT, PVC COMPO) and ZERO of them
 * match anything typed on an opportunity — verified against live data. So the
 * options come from the opportunities in scope, normalised as above.
 */
export const normalizeGroup = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** True when a row's free-text group belongs to the selected bucket. */
export const matchesGroup = (rowGroup, selected) =>
  !selected || normalizeGroup(rowGroup) === normalizeGroup(selected);

/**
 * The Product Group options for the filter, newest spelling wins as the label.
 *
 * @returns {Promise<Array<{value:string,label:string,count:number,variants:string[]}>>}
 *          value is the normalised key to filter by; label is a real spelling
 *          from the data so the dropdown reads the way the team writes it.
 */
export async function fetchProductGroups({ companyId, ownerIds = null }) {
  if (!companyId) return [];
  let q = supabase
    .from('opportunities')
    .select('material_group, owner_id')
    .eq('company_id', companyId)
    .not('material_group', 'is', null);
  if (Array.isArray(ownerIds) && ownerIds.length) q = q.in('owner_id', ownerIds);

  const { data, error } = await q;
  if (error) { console.error('fetchProductGroups:', error); return []; }

  const buckets = new Map();
  (data || []).forEach((row) => {
    const key = normalizeGroup(row.material_group);
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, { value: key, label: String(row.material_group).trim(), count: 0, variants: [] });
    const b = buckets.get(key);
    b.count += 1;
    const raw = String(row.material_group).trim();
    if (!b.variants.includes(raw)) b.variants.push(raw);
  });

  return [...buckets.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Untransferred plan value: OPEN opportunities whose expected_month falls in the
 * selected period. "Untransferred" is what status='open' already means — once an
 * opportunity becomes a deal it is 'converted', and once it is pushed out it is
 * 'moved_to_future'.
 */
async function fetchPlannedOpen({ companyId, ownerIds, start, end, productGroup }) {
  if (!companyId || !ownerIds?.length) return { total: 0, untagged: 0 };
  const { data, error } = await supabase
    .from('opportunities')
    .select('owner_id, planned_amount, material_group')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .in('owner_id', ownerIds)
    .gte('expected_month', start)
    .lte('expected_month', end);
  if (error) { console.error('fetchPlannedOpen:', error); return { total: 0, untagged: 0 }; }

  let total = 0;
  let untagged = 0;
  (data || []).forEach((row) => {
    const amt = parseFloat(row.planned_amount) || 0;
    if (!row.material_group) untagged += amt;
    if (matchesGroup(row.material_group, productGroup)) total += amt;
  });
  return { total, untagged };
}

/**
 * Open funnel value for the selected period: deals still in play, summed RAW.
 *
 * Dated by expected_close_date — the field the pipeline and the reports already
 * filter "this month" by. created_at would measure when the deal was typed in,
 * and stage_changed_at when it last moved, neither of which is the month the
 * business expects the money in.
 *
 * Product group: a deal carries no group of its own (there is no such column on
 * deals, and deal_products points at products.material_group, a disjoint SKU-code
 * vocabulary). The only group a deal can honestly be attributed to is the one on
 * the opportunity it came from. Deals with no such link are UNTAGGED: they are
 * counted when no group is selected and excluded when one is, and their value is
 * returned separately so the screen can say how much it is leaving out.
 */
async function fetchOpenFunnel({ companyId, ownerIds, start, end, productGroup }) {
  if (!companyId || !ownerIds?.length) return { total: 0, untagged: 0 };
  const { data, error } = await supabase
    .from('deals')
    .select('id, owner_id, amount')
    .eq('company_id', companyId)
    .in('owner_id', ownerIds)
    .not('stage', 'in', '("won","lost")')
    .gte('expected_close_date', start)
    .lte('expected_close_date', end);
  if (error) { console.error('fetchOpenFunnel:', error); return { total: 0, untagged: 0 }; }

  const rows = data || [];
  const amountOf = (d) => parseFloat(d.amount) || 0;

  // No group selected: every open deal counts, no lookup needed.
  if (!productGroup) {
    return { total: rows.reduce((s, d) => s + amountOf(d), 0), untagged: 0 };
  }

  const ids = rows.map((d) => d.id);
  const groupByDeal = new Map();
  if (ids.length) {
    const { data: opps } = await supabase
      .from('opportunities')
      .select('deal_id, material_group')
      .eq('company_id', companyId)
      .in('deal_id', ids)
      .not('material_group', 'is', null);
    (opps || []).forEach((o) => { if (o.deal_id) groupByDeal.set(o.deal_id, o.material_group); });
  }

  let total = 0;
  let untagged = 0;
  rows.forEach((d) => {
    const g = groupByDeal.get(d.id);
    if (!g) { untagged += amountOf(d); return; }
    if (matchesGroup(g, productGroup)) total += amountOf(d);
  });
  return { total, untagged };
}

/**
 * The Planning page's five summary cards, for one period + one owner scope +
 * one optional product group.
 *
 * Owner scope is resolved to the people whose numbers may be counted, the same
 * way the rest of the app resolves it: contributors (active salesmen and
 * supervisors) PLUS any active user flagged users.is_contributor — a manager who
 * sells himself. Without the flagged half, filtering to such a manager would
 * show Target 0 and every card would read zero for someone who genuinely holds a
 * target. When exactly one person is selected and the narrowing would leave
 * nobody, that person is used: choosing a single name means that person, not
 * "nobody".
 *
 * Win rate stays contributor-only, matching the shared primitive everywhere else.
 *
 * @param {object}   p
 * @param {string}   p.companyId
 * @param {string[]|null} p.ownerIds  null = whole company
 * @param {string}   p.start  yyyy-MM-dd, first day of the selected period
 * @param {string}   p.end    yyyy-MM-dd, last day of the selected period
 * @param {string|null} p.productGroup  normalised group key, or null for all
 */
export async function computePlanningPageSummary({
  companyId, ownerIds = null, start, end, productGroup = null,
}) {
  const empty = {
    target: 0, achieved: 0, remainingTarget: 0,
    attainmentPct: null,
    winRatePct: 0, winRateIsDefault: true,
    requiredPlan: 0,
    plannedOpen: 0, openFunnel: 0, availableCoverage: 0,
    plannedGap: 0, coveragePct: null,
    hasTargetRows: false, untaggedPlanned: 0, untaggedFunnel: 0,
    scopeIds: [], contributorIds: [],
  };
  if (!companyId || !start || !end) return empty;

  const [contributors, flagged] = await Promise.all([
    fetchContributors({ companyId, ownerIds }),
    fetchAchievedOnlyUsers({ companyId, ownerIds }),
  ]);
  const contributorIds = contributors.map((c) => c.id);
  let scopeIds = [...new Set([...contributorIds, ...flagged.map((u) => u.id)])];
  if (!scopeIds.length) {
    if (Array.isArray(ownerIds) && ownerIds.length === 1) scopeIds = [...ownerIds];
    else return empty;
  }

  // ── Target: ACTIVE MONTHLY rows overlapping the period, per the shared rule.
  // fetchMonthlyTargets filters period_type='monthly', which is what keeps a
  // manager's YEARLY roll-up row (Kamal's 40,660,779) out of a monthly sum.
  const targetRows = await fetchMonthlyTargets({
    companyId, contributorIds: scopeIds, start, end,
  });
  const target = Object.values(targetPerPerson(targetRows)).reduce((s, v) => s + v, 0);

  // ── Achieved: the one strict definition — won AND invoiced, by invoice_date.
  const { total: achieved } = await fetchAchieved({
    companyId, contributorIds: scopeIds, start, end,
  });

  // Every contributor-flagged person in scope counts here in full, including a
  // manager whose only target row is yearly. His invoiced revenue lands in
  // Achieved while his yearly allocation is never spread into the monthly
  // Target, so attainment can read above 100% — an accepted consequence of
  // measuring him like any other flagged manager (business decision, 2026-09-28).
  const remainingTarget = Math.max(0, target - achieved);

  const { winRatePct, isDefault } = await computeWinRate({
    companyId, ownerIds, withFallback: true,
    contributorIds: contributorIds.length ? contributorIds : scopeIds,
  });

  // Required Plan over what is STILL missing, not over the whole target, and
  // with no Future Orders netting — both deliberate departures from the shared
  // computePlanningSummary(), which other screens keep using unchanged.
  const requiredPlan = remainingTarget > 0
    ? computeRequiredRaw({ target: remainingTarget, winRatePct })
    : 0;

  const [planned, funnel] = await Promise.all([
    fetchPlannedOpen({ companyId, ownerIds: scopeIds, start, end, productGroup }),
    fetchOpenFunnel({ companyId, ownerIds: scopeIds, start, end, productGroup }),
  ]);

  const availableCoverage = planned.total + funnel.total;
  const plannedGap = Math.max(0, requiredPlan - availableCoverage);

  // Required Plan 0 means nothing is being asked for, so coverage is not a
  // ratio — null, rendered as "Fully covered"/"—" rather than Infinity or NaN.
  const coveragePct = requiredPlan > 0 ? (availableCoverage / requiredPlan) * 100 : null;

  return {
    target,
    achieved,
    attainmentPct: target > 0 ? (achieved / target) * 100 : null,
    remainingTarget,
    winRatePct, winRateIsDefault: isDefault,
    requiredPlan,
    plannedOpen: planned.total,
    openFunnel: funnel.total,
    availableCoverage,
    plannedGap,
    coveragePct,
    hasTargetRows: targetRows.length > 0,
    untaggedPlanned: planned.untagged,
    untaggedFunnel: funnel.untagged,
    scopeIds, contributorIds,
  };
}
