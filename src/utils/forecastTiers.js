// ── THE FORECAST TIERS — one definition (CEO decisions 2026-10-21) ────────────
//
// Per period, over the scope the page is filtered to:
//
//   COMMIT      = Achieved + won-not-invoiced + open NEGOTIATION deals due in
//                 the period, at full value
//   MOST LIKELY = Achieved + won-not-invoiced
//                 + open deals due in the period × stage probability
//                 + open plan items for the period × the conversion rate
//   BEST CASE   = Achieved + won-not-invoiced
//                 + every open deal due in the period, at full value
//                 + open plan items, at full value
//
// Rules every tier shares:
//   - Achieved is the shared rule (computeAchieved / fetchAchieved).
//   - Won-not-invoiced is a STATUS as of today, so it counts only in a period
//     that contains today.
//   - An open deal counts in the period of its expected_close_date. An
//     UNDATED open deal counts in the period that contains today, nowhere else.
//   - PAST-DUE open deals (expected_close_date before today) are in NO tier.
//     They are listed for re-dating instead.
//   - Plan items of months already over are stale and count nowhere.
//   - Won-not-invoiced, open deals and plan items are FORWARD-LOOKING: the
//     ACTIVE achievers' only (decision 2026-10-21; calcDivisionMetrics passes
//     its forward set). Achieved keeps its own scope.
//   - Outliers are FLAGGED, never removed.
//
// This module is pure: no reads. calcDivisionMetrics calls computeTiers, which
// is how the Forecast page's Most likely and Insights' Expected are one figure.

import { wonNotInvoicedList, summarizeWonNotInvoiced } from 'utils/planningCalculations';

/** Stage probability for Most likely (CEO 2026-10-21). */
export const STAGE_PROBABILITY = {
  lead: 0.10,
  contact_made: 0.25,
  proposal_sent: 0.50,
  negotiation: 0.75,
};
export const COMMIT_STAGE = 'negotiation';

/** A deal above either threshold is flagged "check value" (still counted). */
export const OUTLIER_ABSOLUTE = 1000000;
export const OUTLIER_TARGET_SHARE = 0.5;
/** Same stage for longer than this = stalled (risk list). */
export const STALLED_DAYS = 14;
/** Coverage ratio at or above this is healthy. */
export const HEALTHY_COVERAGE = 3;

export const TIER_KEYS = ['commit', 'mostLikely', 'bestCase'];
export const TIER_LABEL = { commit: 'Commit', mostLikely: 'Most likely', bestCase: 'Best case' };
export const TIER_EXPLAIN = {
  commit: 'Achieved, plus won deals not yet invoiced, plus open deals in negotiation due in this period at full value.',
  mostLikely: 'Achieved, plus won not invoiced, plus open deals due in this period at their stage probability (lead 10%, contact 25%, proposal 50%, negotiation 75%), plus open plan items at the conversion rate.',
  bestCase: 'Achieved, plus won not invoiced, plus every open deal due in this period and every open plan item, at full value.',
};

const pad = (n) => String(n).padStart(2, '0');
/** yyyy-MM-dd of a Date in local time (the app's dates are Riyadh dates). */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (v) => (v ? String(v).slice(0, 10) : null);
const amt = (d) => parseFloat(d?.amount) || 0;
export const isOpenDeal = (d) => !!d && !['won', 'lost'].includes(d.stage);

/** Where a period sits relative to today. */
export function periodPosition({ start, end, today }) {
  return {
    containsToday: start <= today && today <= end,
    isPast: end < today,
    isFuture: start > today,
  };
}

/**
 * Does this OPEN deal count in [start, end]?
 *   'pastDue' — due before today: in no period, listed for re-dating
 *   'in'      — counts in this period
 *   'out'     — belongs to another period
 */
export function dealTiming(deal, { start, end, today }) {
  const due = day(deal?.expected_close_date);
  if (!due) return start <= today && today <= end ? 'in' : 'out';
  if (due < today) return 'pastDue';
  return due >= start && due <= end ? 'in' : 'out';
}

export const probabilityOf = (deal) => STAGE_PROBABILITY[deal?.stage] ?? 0;

/** Plan items that count in the period: open, and not of a month already over. */
export function planItemCounts(item, { today }) {
  const month = day(item?.expected_month);
  if (!month) return true;
  return month.slice(0, 7) >= today.slice(0, 7);
}

/**
 * THE three tiers for one scope and period, from rows already narrowed to the
 * scope.
 *
 * @param {object}   p
 * @param {string}   p.start, p.end    yyyy-MM-dd, inclusive
 * @param {string}   p.today           yyyy-MM-dd
 * @param {number}   p.achieved        the shared Achieved for the scope and period
 * @param {object[]} p.wonDeals        deal rows in scope; won-not-invoiced is derived (shared helper)
 * @param {string[]} p.wniOwnerIds     whose won-not-invoiced counts (the ACTIVE achievers)
 * @param {object[]} p.openDeals       OPEN deal rows of the active achievers, any date
 * @param {object[]} p.planRows        OPEN plan items of the active achievers for the period
 * @param {number}   p.conversionPct   the scope's conversion rate (session 24 rule), 0–100
 */
export function computeTiers({
  start, end, today,
  achieved = 0,
  wonDeals = [], wniOwnerIds = null,
  openDeals = [], planRows = [],
  conversionPct = 0,
}) {
  const pos = periodPosition({ start, end, today });

  const wniList = wonNotInvoicedList({ deals: wonDeals, ownerIds: wniOwnerIds });
  const wniAll = summarizeWonNotInvoiced(wniList);
  const wni = pos.containsToday ? wniAll.total : 0;

  const inPeriod = [];
  const pastDue = [];
  (openDeals || []).forEach((d) => {
    if (!isOpenDeal(d)) return;
    const t = dealTiming(d, { start, end, today });
    if (t === 'in') inPeriod.push(d);
    else if (t === 'pastDue') pastDue.push(d);
  });

  const plans = (planRows || []).filter((p) => planItemCounts(p, { today }));
  const planTotal = plans.reduce((s, p) => s + (parseFloat(p.planned_amount) || 0), 0);
  const conv = (Number(conversionPct) || 0) / 100;

  const dealRows = inPeriod.map((d) => {
    const value = amt(d);
    const p = probabilityOf(d);
    return {
      deal: d,
      value,
      probability: p,
      commit: d.stage === COMMIT_STAGE ? value : 0,
      mostLikely: value * p,
      bestCase: value,
    };
  });
  const sum = (k) => dealRows.reduce((s, r) => s + r[k], 0);
  const openCommit = sum('commit');
  const openWeighted = sum('mostLikely');
  const openFull = sum('bestCase');

  const base = (Number(achieved) || 0) + wni;
  return {
    start, end, today, ...pos,
    achieved: Number(achieved) || 0,
    wni,
    wniCount: pos.containsToday ? wniAll.count : 0,
    wniRows: pos.containsToday ? wniList : [],
    openCommit,
    openWeighted,
    openFull,
    planTotal,
    planWeighted: planTotal * conv,
    conversionPct: Number(conversionPct) || 0,
    commit: base + openCommit,
    mostLikely: base + openWeighted + planTotal * conv,
    bestCase: base + openFull + planTotal,
    dealRows,
    planRows: plans,
    pastDue,
    pastDueTotal: pastDue.reduce((s, d) => s + amt(d), 0),
  };
}

/** Days from yyyy-MM-dd `a` to `b` (b − a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * "Check value": a deal worth more than 1,000,000, or more than half its
 * owner's monthly target. Flag only — the deal is still counted.
 */
export function outlierReason(deal, ownerMonthlyTarget = 0) {
  const v = amt(deal);
  if (v > OUTLIER_ABSOLUTE) return `over ${OUTLIER_ABSOLUTE.toLocaleString('en-US')}`;
  const t = Number(ownerMonthlyTarget) || 0;
  if (t > 0 && v > t * OUTLIER_TARGET_SHARE) return `over half of the owner's monthly target (${Math.round(t).toLocaleString('en-US')})`;
  return null;
}

/** Days in the current stage, from stage_changed_at (else created_at). */
export function daysInStage(deal, today) {
  const since = day(deal?.stage_changed_at) || day(deal?.created_at);
  return since ? Math.max(0, daysBetween(since, today)) : 0;
}

/**
 * Coverage ratio = (open deals due + open plan) ÷ (target − achieved).
 * null when the target is already met (nothing left to cover) or there is no target.
 */
export function coverageRatio({ target, achieved, openDue, plan }) {
  const left = (Number(target) || 0) - (Number(achieved) || 0);
  if (left <= 0) return null;
  return ((Number(openDue) || 0) + (Number(plan) || 0)) / left;
}

/**
 * Risk list over open deals in scope: past-due, no close date, stalled, outlier.
 * One row per deal with every reason that applies.
 */
export function riskList({ openDeals, today, targetOf = () => 0 }) {
  const out = [];
  (openDeals || []).forEach((d) => {
    if (!isOpenDeal(d)) return;
    const reasons = [];
    const due = day(d.expected_close_date);
    if (due && due < today) reasons.push('PAST DUE');
    if (!due) reasons.push('NO CLOSE DATE');
    const inStage = daysInStage(d, today);
    if (inStage > STALLED_DAYS) reasons.push('STALLED');
    const outlier = outlierReason(d, targetOf(d));
    if (outlier) reasons.push('CHECK VALUE');
    if (reasons.length) {
      out.push({
        deal: d,
        reasons,
        daysOverdue: due && due < today ? daysBetween(due, today) : null,
        daysInStage: inStage,
        outlier,
      });
    }
  });
  return out.sort((a, b) => amt(b.deal) - amt(a.deal));
}

/** The deals that decide the period: largest Most-likely contribution first. */
export function topDeals(tiers, n = 10) {
  return [...(tiers?.dealRows || [])].sort((a, b) => b.mostLikely - a.mostLikely).slice(0, n);
}

/**
 * Pipeline by product group, each deal's AMOUNT allocated across its lines in
 * proportion to their line totals (the lines do not add up to the deal amount,
 * so their own totals cannot be used). Lines with no line totals share the deal
 * equally; a deal with no lines goes under "No products". The groups therefore
 * add up to the pipeline exactly.
 *
 * @param {object[]} dealRows  computeTiers(...).dealRows
 * @param {object}   linesByDeal  { dealId: [{ line_total, material_group }] }
 */
export const NO_PRODUCTS = 'No products';
export function groupBreakdown(dealRows, linesByDeal = {}) {
  const groups = {};
  const add = (name, dealId, value, weighted) => {
    if (!groups[name]) groups[name] = { name, dealIds: new Set(), totalValue: 0, weightedValue: 0 };
    groups[name].dealIds.add(dealId);
    groups[name].totalValue += value;
    groups[name].weightedValue += weighted;
  };
  (dealRows || []).forEach((r) => {
    const lines = linesByDeal[r.deal.id] || [];
    if (!lines.length) { add(NO_PRODUCTS, r.deal.id, r.value, r.mostLikely); return; }
    const lineSum = lines.reduce((s, l) => s + Math.max(0, parseFloat(l.line_total) || 0), 0);
    lines.forEach((l) => {
      const share = lineSum > 0 ? Math.max(0, parseFloat(l.line_total) || 0) / lineSum : 1 / lines.length;
      add(l.material_group || 'Uncategorized', r.deal.id, r.value * share, r.mostLikely * share);
    });
  });
  return Object.values(groups)
    .map((g) => ({ name: g.name, dealCount: g.dealIds.size, totalValue: g.totalValue, weightedValue: g.weightedValue }))
    .sort((a, b) => b.weightedValue - a.weightedValue);
}

// ── Periods ──────────────────────────────────────────────────────────────────

export function monthBoundsOfKey(key) {
  const [y, m] = key.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}
export function addMonthsKey(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function monthLabelOf(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
/** This month, +1, +2 and the quarter containing today — the time-phased view. */
export function phasedPeriods(today) {
  const k = today.slice(0, 7);
  const months = [0, 1, 2].map((i) => {
    const key = addMonthsKey(k, i);
    return { id: key, label: monthLabelOf(key), ...monthBoundsOfKey(key) };
  });
  const [y, m] = k.split('-').map(Number);
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const qs = `${y}-${pad(qStartMonth)}`;
  const quarter = {
    id: `Q${Math.floor((m - 1) / 3) + 1}-${y}`,
    label: `Q${Math.floor((m - 1) / 3) + 1} ${y}`,
    start: monthBoundsOfKey(qs).start,
    end: monthBoundsOfKey(addMonthsKey(qs, 2)).end,
  };
  return { months, quarter };
}

// ── Snapshots ────────────────────────────────────────────────────────────────

/**
 * The start of the snapshot week: the most recent Sunday 06:00 Riyadh
 * (= Sunday 03:00 UTC; Riyadh has no daylight saving).
 */
export function snapshotWeekStart(now = new Date()) {
  const t = new Date(now.getTime());
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 3, 0, 0));
  while (d.getUTCDay() !== 0 || d > t) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** Compact record of the open deals behind a snapshot, for "since last week". */
export function snapshotDealRecord(dealRows) {
  return (dealRows || []).map((r) => ({
    id: r.deal.id,
    stage: r.deal.stage,
    amount: r.value,
    due: day(r.deal.expected_close_date),
  }));
}

/**
 * What changed since a snapshot of the same scope and period.
 *   added   — counted now, not then
 *   slipped — counted then, still open now, but no longer due in the period
 *   won / lost — counted then, now won / lost
 */
export function sinceSnapshot({ snapshot, tiers, currentById = {} }) {
  if (!snapshot) return null;
  const then = new Map((snapshot.open_deal_ids || []).map((r) => [r.id, r]));
  const nowIds = new Set((tiers?.dealRows || []).map((r) => r.deal.id));
  const added = (tiers?.dealRows || []).filter((r) => !then.has(r.deal.id)).map((r) => r.deal);
  const slipped = [];
  const won = [];
  const lost = [];
  then.forEach((rec, id) => {
    if (nowIds.has(id)) return;
    const cur = currentById[id];
    if (cur?.stage === 'won') won.push({ ...rec, ...cur });
    else if (cur?.stage === 'lost') lost.push({ ...rec, ...cur });
    else slipped.push({ ...rec, ...(cur || {}) });
  });
  const delta = {};
  [['achieved', 'achieved'], ['wni', 'wni'], ['commit', 'commit'], ['mostLikely', 'most_likely'], ['bestCase', 'best_case']]
    .forEach(([k, col]) => { delta[k] = (Number(tiers?.[k]) || 0) - (Number(snapshot[col]) || 0); });
  return { snapshotDate: snapshot.snapshot_date, delta, added, slipped, won, lost };
}

/**
 * Accuracy: last month's Most likely, as forecast in the FIRST WEEK of that month
 * (the earliest snapshot dated day 1–7), against last month's actual Achieved.
 */
export function accuracyOf({ snapshots, lastMonthKey, actualAchieved, today }) {
  const weekOne = (snapshots || [])
    .filter((s) => String(s.period_month).slice(0, 7) === lastMonthKey
      && String(s.snapshot_date).slice(0, 7) === lastMonthKey
      && Number(String(s.snapshot_date).slice(8, 10)) <= 7)
    .sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)))[0];
  if (!weekOne) {
    // The first month that can have a week-1 snapshot is this one if we are
    // still in its first week, else next month; its result arrives after it ends.
    const thisKey = today.slice(0, 7);
    const firstKey = Number(today.slice(8, 10)) <= 7 ? thisKey : addMonthsKey(thisKey, 1);
    return { status: 'collecting', firstResultAfter: monthLabelOf(firstKey) };
  }
  const forecast = Number(weekOne.most_likely) || 0;
  const actual = Number(actualAchieved) || 0;
  return {
    status: 'ok',
    snapshotDate: weekOne.snapshot_date,
    forecast,
    actual,
    error: forecast - actual,
    errorPct: actual > 0 ? ((forecast - actual) / actual) * 100 : null,
  };
}
