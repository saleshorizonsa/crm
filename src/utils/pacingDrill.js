/**
 * THE PACING RAIL, OPENED — one row per person, with their visits.
 *
 * Target and Achieved are the rail's OWN rows: metrics.drill.targetPerPerson
 * and invoicedPerPerson (net of returns), the maps calcDivisionMetrics and
 * calcCoverageMetrics already summed to produce the rail. Nothing is
 * recomputed, so the rows add up to the rail by construction — and
 * /numbers-check asserts it.
 *
 * People who have left are never named: their target, achieved and visits go
 * into one "No longer active" row, so the totals still add up.
 */

export const PACING_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'target', label: 'Target', type: 'money' },
  { key: 'achieved', label: 'Achieved', type: 'money' },
  { key: 'pacePct', label: 'Pace %', type: 'pct' },
  { key: 'visitsThisMonth', label: 'Visits this month', type: 'int' },
  { key: 'visitsLastMonth', label: 'Visits last month', type: 'int' },
  { key: 'lastVisit', label: 'Last visit' },
];

export const VISIT_COLUMNS = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'person', label: 'Person' },
  { key: 'customer', label: 'Customer' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'notes', label: 'Notes' },
  { key: 'source', label: 'Source' },
];

export const DEPARTED_ROW_ID = '__departed';
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pacePct = (a, t) => (t > 0 ? (a / t) * 100 : null);

/**
 * @param {object}   metrics       the rail's metrics (drill.targetPerPerson etc.)
 * @param {string[]} scopeIds      the level's people
 * @param {object[]} users         for names and is_active
 * @param {Map}      visitSummary  summariseVisits() for the same people
 */
export function buildPacingDrill({ metrics, scopeIds = [], users = [], visitSummary = new Map() }) {
  const drill = metrics?.drill || {};
  const tgt = drill.targetPerPerson || {};
  const ach = drill.invoicedPerPerson || {};
  const byId = new Map(users.map((u) => [u.id, u]));
  // The rail's own population (who has a target, who achieved, who sells
  // going forward), plus anyone in scope who logged a visit. Not the whole
  // scope: at company level that holds a director and a viewer, who would
  // read as two empty rows.
  const withVisits = scopeIds.filter((id) => (visitSummary.get(id)?.rows || []).length > 0);
  const ids = [...new Set([
    ...Object.keys(tgt), ...Object.keys(ach),
    ...(drill.forwardIds || []), ...(drill.achieverIds || []), ...withVisits,
  ])].filter((id) => !scopeIds.length || scopeIds.includes(id));

  const named = [];
  const departed = { target: 0, achieved: 0, visitsThisMonth: 0, visitsLastMonth: 0, lastVisit: null, visits: [], count: 0 };
  ids.forEach((id) => {
    const u = byId.get(id);
    const v = visitSummary.get(id) || { thisMonth: 0, lastMonth: 0, lastVisit: null, rows: [] };
    const t = num(tgt[id]);
    const a = num(ach[id]);
    const has = t !== 0 || a !== 0 || v.rows.length > 0;
    if (u && u.is_active === false) {
      if (!has) return;
      departed.count += 1;
      departed.target += t;
      departed.achieved += a;
      departed.visitsThisMonth += v.thisMonth;
      departed.visitsLastMonth += v.lastMonth;
      if (v.lastVisit && (!departed.lastVisit || v.lastVisit > departed.lastVisit)) departed.lastVisit = v.lastVisit;
      departed.visits.push(...v.rows);
      return;
    }
    // Active people in scope always get a row — 0 visits is a fact to show.
    if (!u && !has) return;
    named.push({
      id,
      name: u?.full_name || 'Unknown',
      target: t,
      achieved: a,
      pacePct: pacePct(a, t),
      visitsThisMonth: v.thisMonth,
      visitsLastMonth: v.lastMonth,
      lastVisit: v.lastVisit || 'none logged',
      visits: v.rows.map((r) => ({ ...r, person: u?.full_name || 'Unknown' })),
    });
  });
  named.sort((a, b) => (b.target - a.target) || a.name.localeCompare(b.name));

  const rows = [...named];
  if (departed.count) {
    rows.push({
      id: DEPARTED_ROW_ID,
      name: 'No longer active',
      target: departed.target,
      achieved: departed.achieved,
      pacePct: pacePct(departed.achieved, departed.target),
      visitsThisMonth: departed.visitsThisMonth,
      visitsLastMonth: departed.visitsLastMonth,
      lastVisit: departed.lastVisit || 'none logged',
      visits: departed.visits.map((r) => ({ ...r, person: 'No longer active' })),
    });
  }

  const sum = (f) => rows.reduce((s, r) => s + num(r[f]), 0);
  const lastAll = rows.map((r) => r.lastVisit).filter((d) => d && d !== 'none logged').sort().pop();
  const total = {
    id: '__total',
    name: 'Total',
    // The rail's own figures, not the sum: /numbers-check compares the two.
    target: num(metrics?.target),
    achieved: num(metrics?.achieved),
    pacePct: metrics?.pace == null ? pacePct(num(metrics?.achieved), num(metrics?.target)) : metrics.pace * 100,
    visitsThisMonth: sum('visitsThisMonth'),
    visitsLastMonth: sum('visitsLastMonth'),
    lastVisit: lastAll || 'none logged',
    visits: rows.flatMap((r) => r.visits).sort((a, b) => b.date.localeCompare(a.date)),
  };

  return {
    total,
    rows,
    sumTarget: sum('target'),
    sumAchieved: sum('achieved'),
  };
}
