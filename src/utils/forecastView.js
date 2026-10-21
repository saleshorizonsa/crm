// ── What the Forecast page shows, from the bundle — pure ───────────────────────
//
// Every figure comes from forecastFor (calcDivisionMetrics → computeTiers), so
// the page, the snapshot writer, numbers-check and the tests all read the same
// computation. This module only arranges it: scope, phasing, the director
// tables, flags, risk lists and the drill trees.

import {
  forecastFor, divisionGroupsOf, pickableAchievers, monthlyTargetByOwner, openDealsInScope,
} from 'utils/forecastData';
import {
  phasedPeriods, outlierReason, coverageRatio, riskList, topDeals, groupBreakdown,
  TIER_LABEL, TIER_EXPLAIN, STAGE_PROBABILITY,
} from 'utils/forecastTiers';
import { achievedAmount, returnAmount } from 'utils/planningCalculations';

const amt = (d) => parseFloat(d?.amount) || 0;

/** ids / division for the page's filters (person beats division beats company). */
export function scopeFor(bundle, { personId = null, divisionId = null } = {}) {
  if (personId) return { kind: 'person', ids: [personId], divisionId: divisionId || null, divisionRow: false };
  if (divisionId) {
    const g = divisionGroupsOf(bundle).find((x) => x.id === divisionId);
    return { kind: 'division', ids: g?.userIds || [], divisionId, divisionRow: true };
  }
  return { kind: 'company', ids: bundle.scopeIds, divisionId: null, divisionRow: false };
}

/** The owner's monthly target used for the "check value" rule, per deal. */
export function targetLookup(bundle, today) {
  const cache = {};
  const ofMonth = (key) => { if (!cache[key]) cache[key] = monthlyTargetByOwner(bundle, key); return cache[key]; };
  return (deal) => {
    const due = deal?.expected_close_date ? String(deal.expected_close_date).slice(0, 10) : null;
    const key = (due && due >= today ? due : today).slice(0, 7);
    return ofMonth(key)[deal.owner_id] || 0;
  };
}

export function buildForecastView({ bundle, period, filters = {}, today, linesByDeal = {} }) {
  const users = new Map((bundle.users || []).map((u) => [u.id, u]));
  const ownerName = (id) => users.get(id)?.full_name || '—';
  const scope = scopeFor(bundle, filters);
  const run = (ids, start, end, divisionId = scope.divisionId, divisionRow = scope.divisionRow) =>
    forecastFor(bundle, { ids, start, end, divisionId, divisionRow });

  const main = run(scope.ids, period.start, period.end);
  const tiers = main.tiers;
  const targetOf = targetLookup(bundle, today);

  // Outliers among the deals counted: flagged, still counted.
  const flaggedRows = tiers.dealRows.filter((r) => outlierReason(r.deal, targetOf(r.deal)));
  const flagged = flaggedRows.map((r) => ({ ...r.deal, outlier: outlierReason(r.deal, targetOf(r.deal)) }));
  const sumOf = (k) => flaggedRows.reduce((s, r) => s + r[k], 0);
  const without = flaggedRows.length
    ? { commit: tiers.commit - sumOf('commit'), mostLikely: tiers.mostLikely - sumOf('mostLikely'), bestCase: tiers.bestCase - sumOf('bestCase') }
    : null;
  const flagsOf = (d) => (outlierReason(d, targetOf(d)) ? ['CHECK VALUE'] : []);

  // Time-phased: this month, +1, +2, and the quarter — same scope.
  const { months, quarter } = phasedPeriods(today);
  const phased = [...months, { ...quarter, isQuarter: true }].map((p) => {
    const m = run(scope.ids, p.start, p.end);
    return { ...p, target: m.target, tiers: m.tiers, metrics: m };
  });

  // Director tables: by division and by salesman, for the selected period.
  const divisionRows = (scope.kind === 'company' ? divisionGroupsOf(bundle) : [])
    .map((g) => {
      const m = run(g.userIds, period.start, period.end, g.id, true);
      return rowOf({ id: g.id, name: g.name, m });
    })
    // A group with no target, nothing forecast and nothing past due (e.g. an
    // Unassigned group holding only a director) is a row of zeros: left out.
    .filter((r) => r.target > 0 || r.tiers.bestCase > 0 || r.tiers.pastDue.length > 0);
  const personRows = pickableAchievers(bundle, scope.kind === 'person' ? null : scope.divisionId)
    .filter((u) => scope.kind !== 'person' || u.id === filters.personId)
    .map((u) => rowOf({ id: u.id, name: u.full_name || u.email || '—', m: run([u.id], period.start, period.end, scope.divisionId, false) }));

  // Lists.
  const top = topDeals(tiers, 10).map((r) => ({
    key: r.deal.id, dealId: r.deal.id, title: r.deal.title || 'Untitled', owner: ownerName(r.deal.owner_id),
    stage: stageText(r.deal.stage), due: r.deal.expected_close_date, value: r.value, mostLikely: r.mostLikely, flags: flagsOf(r.deal),
  }));
  const risks = riskList({ openDeals: openDealsInScope(bundle, scope), today, targetOf }).map((x) => ({
    key: x.deal.id, dealId: x.deal.id, title: x.deal.title || 'Untitled', owner: ownerName(x.deal.owner_id),
    stage: stageText(x.deal.stage), due: x.deal.expected_close_date, value: amt(x.deal),
    daysInStage: x.daysInStage, daysOverdue: x.daysOverdue, flags: x.reasons,
  }));
  const redating = [...tiers.pastDue]
    .sort((a, b) => amt(b) - amt(a))
    .map((d) => ({
      key: d.id, dealId: d.id, title: d.title || 'Untitled', owner: ownerName(d.owner_id), stage: stageText(d.stage),
      due: d.expected_close_date, value: amt(d),
      daysOverdue: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(d.expected_close_date).slice(0, 10)}T00:00:00Z`)) / 86400000),
      flags: flagsOf(d),
    }));

  const byStage = Object.keys(STAGE_PROBABILITY).map((stage) => {
    const rs = tiers.dealRows.filter((r) => r.deal.stage === stage);
    return { stage, label: stageText(stage), count: rs.length, total: rs.reduce((s, r) => s + r.value, 0) };
  });
  const groups = groupBreakdown(tiers.dealRows, linesByDeal);

  return {
    scope, main, tiers, target: main.target, flagged, without, phased, divisionRows, personRows,
    top, risks, redating, byStage, groups, ownerName,
  };

  function rowOf({ id, name, m }) {
    return {
      id, name, target: m.target, tiers: m.tiers, metrics: m,
      coverage: coverageRatio({ target: m.target, achieved: m.tiers.achieved, openDue: m.tiers.openFull, plan: m.tiers.planTotal }),
    };
  }
}

const STAGE_TEXT = { lead: 'Lead', contact_made: 'Contact made', proposal_sent: 'Proposal sent', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const stageText = (s) => STAGE_TEXT[s] || s || '—';

// ── Drill trees (DrillSheet) ─────────────────────────────────────────────────

export const DRILL_COLUMNS = [
  { key: 'name', label: 'Deal / item' },
  { key: 'owner', label: 'Owner' },
  { key: 'stage', label: 'Stage / basis' },
  { key: 'date', label: 'Close date / month', type: 'date' },
  { key: 'value', label: 'Value', type: 'money' },
  { key: 'counted', label: 'Counted', type: 'money' },
  { key: 'flags', label: 'Flags', type: 'flags' },
];

/**
 * The tree behind one card: its parts, each with the rows summed into it.
 * Every part's total equals its rows' Counted sum, and the parts add up to the
 * card — the tests assert both.
 */
export function drillTree({ metrics, tierKey, ownerName, flagsOf = () => [] }) {
  const t = metrics.tiers;
  const conv = t.conversionPct / 100;
  const achievedRows = [
    ...(metrics.drill?.invoicedRows || []).map((d) => ({
      id: `inv-${d.id}`, dealId: d.id, name: d.title || 'Invoiced deal', owner: ownerName(d.owner_id),
      stage: 'Invoiced', date: d.invoice_date, value: achievedAmount(d), counted: achievedAmount(d), flags: [],
    })),
    ...(metrics.drill?.returnRows || []).map((r) => ({
      id: `ret-${r.id}`, dealId: r.deal_id, name: 'Credit note', owner: ownerName(r.owner_id),
      stage: 'Return', date: r.return_date, value: -returnAmount(r), counted: -returnAmount(r), flags: [],
    })),
  ];
  const wniRows = (t.wniRows || []).map((d) => ({
    id: `wni-${d.id}`, dealId: d.id, name: d.title || 'Won deal', owner: ownerName(d.owner_id),
    stage: 'Won, not invoiced', date: d.closed_at, value: achievedAmount(d), counted: achievedAmount(d), flags: [],
  }));
  const dealRow = (r, counted, basis) => ({
    id: `deal-${r.deal.id}`, dealId: r.deal.id, name: r.deal.title || 'Untitled', owner: ownerName(r.deal.owner_id),
    stage: basis, date: r.deal.expected_close_date, value: r.value, counted, flags: flagsOf(r.deal),
  });
  const planRow = (p, counted, basis) => ({
    id: `plan-${p.id}`, dealId: null, name: p.customer_name || 'Plan item', owner: ownerName(p.owner_id),
    stage: basis, date: p.expected_month, value: parseFloat(p.planned_amount) || 0, counted, flags: [],
  });
  const node = (id, name, rows) => ({ id, name, total: rows.reduce((s, r) => s + r.counted, 0), rows });

  const achievedNode = node('achieved', 'Achieved (invoiced, net of returns)', achievedRows);
  const wniNode = node('wni', 'Won, not yet invoiced', wniRows);
  if (tierKey === 'achieved') return { title: 'Achieved', explain: 'Won and invoiced deals dated by invoice date, net of credit notes.', total: t.achieved, children: null, rows: achievedRows };
  if (tierKey === 'wni') return { title: 'Won, not invoiced', explain: 'Won deals not yet invoiced, as of today. Counted only in a period that contains today.', total: t.wni, children: null, rows: wniRows };
  if (tierKey === 'target') {
    const rows = (metrics.drill?.targetRows || []).map((r, i) => ({
      id: `t-${i}`, dealId: null, name: r.target_type || 'Target', owner: ownerName(r.assigned_to),
      stage: r.product_group || '', date: r.period_start, value: parseFloat(r.target_amount) || 0, counted: parseFloat(r.target_amount) || 0, flags: [],
    }));
    return { title: 'Target', explain: 'Monthly target rows of the achievers in scope, by the shared per-person rule.', total: metrics.target, children: null, rows };
  }
  let parts;
  if (tierKey === 'commit') {
    parts = [achievedNode, wniNode,
      node('negotiation', 'Open deals in negotiation, due in the period (full value)',
        t.dealRows.filter((r) => r.commit > 0).map((r) => dealRow(r, r.commit, 'Negotiation · 100%')))];
  } else if (tierKey === 'mostLikely') {
    parts = [achievedNode, wniNode,
      node('open', 'Open deals due in the period × stage probability',
        t.dealRows.map((r) => dealRow(r, r.mostLikely, `${stageText(r.deal.stage)} · ${Math.round(r.probability * 100)}%`))),
      node('plan', `Open plan items × conversion (${t.conversionPct.toFixed(1)}%)`,
        t.planRows.map((p) => planRow(p, (parseFloat(p.planned_amount) || 0) * conv, `Plan · ${t.conversionPct.toFixed(1)}%`)))];
  } else {
    parts = [achievedNode, wniNode,
      node('open', 'Every open deal due in the period (full value)', t.dealRows.map((r) => dealRow(r, r.bestCase, `${stageText(r.deal.stage)} · 100%`))),
      node('plan', 'Open plan items (full value)', t.planRows.map((p) => planRow(p, parseFloat(p.planned_amount) || 0, 'Plan · 100%')))];
  }
  return { title: TIER_LABEL[tierKey], explain: TIER_EXPLAIN[tierKey], total: t[tierKey], children: parts, rows: null };
}
