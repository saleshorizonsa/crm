// WHAT IS BEHIND EACH PART OF THE COVERAGE RAIL.
//
// The rail says "invoiced 39K, funnel 1.4M, planning 822K, short 1.4M" and
// until now that was the end of it: no way to ask which deals, whose, or why.
// This module turns each part into the rows it was summed from, grouped by
// division and by person.
//
// IT GROUPS, IT DOES NOT RECOMPUTE. Every row set arrives on metrics.drill,
// carried out of calcDivisionMetrics / calcCoverageMetrics — the same arrays
// those functions passed to computeCoverage and computeAchieved. So a segment
// total here is the rail's own figure re-added, not a second implementation
// that has to be kept in step. /numbers-check asserts the equality anyway
// ("panel L1 total = rail value"), because "by construction" is a claim worth
// testing.
//
// The one figure with no rows of its own is SHORTFALL: a gap is an absence, so
// its breakdown is per-person target, achieved, coverage and gap — which is
// the only shape that answers "where is it short".

import {
  computeCoverage,
  computeRequiredRaw,
  achievedAmount,
  returnAmount,
} from 'utils/planningCalculations';

/** Days between two dates, floored, ignoring time of day. */
function daysBetween(fromISO, to = new Date()) {
  if (!fromISO) return null;
  const from = new Date(fromISO);
  if (Number.isNaN(from.getTime())) return null;
  return Math.floor((to - from) / 86400000);
}

/** yyyy-MM-dd from local parts — never toISOString (Asia/Riyadh is UTC+3). */
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A deal sitting in one stage this long counts as stuck. */
export const STUCK_DAYS = 14;
/** A plan item this close to month end that has not converted gets flagged. */
export const NOT_CONVERTED_DAYS = 7;

/**
 * The rail's parts, in the order they are drawn.
 *
 * `inCoverage: false` marks the fourth part, Won-not-invoiced: it is drawn on
 * the rail because a manager needs to see it, and it is deliberately NOT added
 * to coverage, Expected % of target or the shortfall (decision 2026-10-07).
 * Money already won but not yet invoiced is neither revenue nor pipeline, and
 * folding it into coverage would let a month look covered by invoices nobody has
 * raised.
 */
export const RAIL_SEGMENTS = [
  { key: 'invoiced', label: 'Invoiced', color: '#064e3b', inCoverage: true },
  { key: 'funnel', label: 'Funnel (weighted)', color: '#10b981', inCoverage: true },
  { key: 'planning', label: 'Planning (weighted)', color: '#3b82f6', inCoverage: true },
  { key: 'shortfall', label: 'Shortfall', color: '#dc2626', inCoverage: true },
  {
    key: 'wonNotInvoiced',
    label: 'Won, not invoiced',
    color: '#10b981',
    inCoverage: false,
    hatched: true,
  },
];

export const SEGMENT_BY_KEY = RAIL_SEGMENTS.reduce((m, s) => { m[s.key] = s; return m; }, {});

const nameOf = (users, id) => (users || []).find((u) => u.id === id)?.full_name || 'Unassigned';
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The customer on a deal, from whichever shape the query gave us. */
function dealCustomer(d) {
  const c = d.contacts || d.contact || null;
  if (c) {
    const company = c.company_name || '';
    const person = [c.first_name, c.last_name].filter(Boolean).join(' ');
    if (company || person) return company || person;
  }
  return d.title || '—';
}

/**
 * Per-segment rows for ONE person.
 *
 * Each row is shaped for display, carries `value` (what it contributes to the
 * segment total) and keeps `dealId` / `oppId` so level 3 can open the record.
 */
function rowsFor(segment, ownerId, drill, ctx) {
  const { now, monthEnd } = ctx;
  const rate = num(drill.winRatePct) / 100;

  if (segment === 'invoiced') {
    const invoices = (drill.invoicedRows || [])
      .filter((d) => d.owner_id === ownerId)
      .map((d) => ({
        kind: 'invoice',
        dealId: d.id,
        customer: dealCustomer(d),
        invoiceNo: d.invoice_number || '—',
        invoiceDate: d.invoice_date || null,
        value: achievedAmount(d),
      }));
    // Credit notes as their own lines, negative, so a net figure is traceable
    // to the invoice it came off rather than just being smaller than expected.
    const credits = (drill.returnRows || [])
      .filter((r) => r.owner_id === ownerId)
      .map((r) => ({
        kind: 'return',
        dealId: r.deal_id || null,
        customer: `Return · ${dealCustomer(r.deals || r)}`,
        invoiceNo: r.credit_note_number || r.invoice_number || '—',
        invoiceDate: r.return_date || null,
        value: -returnAmount(r),
      }));
    return [...invoices, ...credits].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  if (segment === 'funnel') {
    return (drill.funnelRows || [])
      .filter((d) => d.owner_id === ownerId)
      .map((d) => {
        const stageDays = daysBetween(d.stage_changed_at || d.created_at, now);
        const dated = !!d.expected_close_date;
        return {
          kind: 'deal',
          dealId: d.id,
          customer: dealCustomer(d),
          stage: String(d.stage || '').replace(/_/g, ' '),
          amount: num(d.amount),
          probability: d.forecast_probability != null ? num(d.forecast_probability) : null,
          // EXACTLY computeCoverage's expression, so the rows add to the bar.
          value: d.forecast_amount || num(d.amount) * rate || 0,
          expectedClose: d.expected_close_date || null,
          stageDays,
          flags: [
            dated && d.expected_close_date < ymd(now) ? 'OVERDUE' : null,
            !dated ? 'UNDATED' : null,
            stageDays != null && stageDays >= STUCK_DAYS ? 'STUCK' : null,
          ].filter(Boolean),
        };
      })
      .sort((a, b) => b.value - a.value);
  }

  if (segment === 'planning') {
    const daysLeft = monthEnd ? daysBetween(ymd(now), new Date(monthEnd)) : null;
    return (drill.planRows || [])
      .filter((o) => o.owner_id === ownerId)
      .map((o) => ({
        kind: 'opportunity',
        oppId: o.id,
        customer: o.customer_name || '—',
        planned: num(o.planned_amount),
        value: num(o.planned_amount) * rate,
        status: o.status || 'open',
        expectedMonth: o.expected_month || null,
        flags: daysLeft != null && daysLeft <= NOT_CONVERTED_DAYS && (o.status || 'open') === 'open'
          ? ['NOT CONVERTED']
          : [],
      }))
      .sort((a, b) => b.value - a.value);
  }

  if (segment === 'wonNotInvoiced') {
    return (drill.wonNotInvoicedRows || [])
      .filter((d) => d.owner_id === ownerId)
      .map((d) => ({
        kind: 'deal',
        dealId: d.id,
        customer: dealCustomer(d),
        wonDate: d.closed_at || null,
        value: achievedAmount(d),
        daysSinceWon: d.daysSinceWon != null ? d.daysSinceWon : daysBetween(d.closed_at, now),
        flags: d.isStale ? ['STALE'] : [],
      }))
      .sort((a, b) => (b.daysSinceWon || 0) - (a.daysSinceWon || 0));
  }

  return [];
}

/** One person's SHORTFALL line: there are no rows, so this is the breakdown. */
function shortfallFor(ownerId, drill) {
  const target = num((drill.targetPerPerson || {})[ownerId]);
  const achieved = num((drill.invoicedPerPerson || {})[ownerId]);
  const rate = num(drill.winRatePct);
  const mine = (rows, pick) => (rows || [])
    .filter((r) => r.owner_id === ownerId)
    .reduce((s, r) => s + pick(r), 0);

  const weightedFunnel = mine(drill.funnelRows, (d) => d.forecast_amount || num(d.amount) * (rate / 100) || 0);
  const planned = mine(drill.planRows, (o) => num(o.planned_amount));
  const { coverage } = computeCoverage({
    invoiced: achieved, openDeals: (drill.funnelRows || []).filter((d) => d.owner_id === ownerId),
    planned, winRatePct: rate,
  });
  const gap = Math.max(0, target - coverage);
  const deficit = Math.max(0, target - achieved);
  return {
    kind: 'shortfall',
    target,
    achieved,
    coverage,
    weightedFunnel,
    planned,
    value: gap,
    newPipelineNeeded: Math.max(0, computeRequiredRaw({ target: deficit, winRatePct: rate }) - (planned + mine(drill.funnelRows, (d) => num(d.amount)))),
  };
}

/**
 * The whole drill-down for one rail.
 *
 * @param {object} p
 * @param {object} p.metrics   calcDivisionMetrics / calcCoverageMetrics result
 * @param {object[]} p.users   user rows, for names (and divisions, if grouping)
 * @param {object[]} [p.divisions]  company divisions, to group a company view
 * @param {boolean} [p.byDivision]  group level 1 by division first
 * @returns {{ segments: object, order: string[] }} segments keyed by rail key,
 *   each { key, label, total, inCoverage, people: [{id,name,total,rows}],
 *   divisions?: [{id,name,total,people}] }
 */
export function buildCoverageDrill({
  metrics, users = [], divisions = [], byDivision = false, now = new Date(),
  monthEnd = null,
}) {
  const drill = metrics?.drill;
  const empty = { segments: {}, order: RAIL_SEGMENTS.map((s) => s.key) };
  if (!drill) return empty;

  // monthEnd is passed in rather than read off the metrics: calcDivisionMetrics
  // does not return it, and the NOT CONVERTED flag needs to know when the month
  // ends. Absent, the flag is simply not raised.
  const ctx = { now, monthEnd };

  // Segment totals come from the METRICS, never from re-adding the rows: the
  // rail draws these, so the panel's header has to be the same number.
  const shortfall = Math.max(0, num(metrics.target) - num(metrics.coverage));
  const totals = {
    invoiced: num(metrics.achieved ?? metrics.invoiced),
    funnel: num(metrics.weightedFunnel),
    planning: num(metrics.weightedPlanning),
    shortfall,
    wonNotInvoiced: (drill.wonNotInvoicedRows || []).reduce((s, d) => s + achievedAmount(d), 0),
  };

  // Everyone who contributes to any segment, so a person with only a plan item
  // still appears under Planning.
  const ownerIds = [...new Set([
    ...(drill.invoicedRows || []).map((d) => d.owner_id),
    ...(drill.returnRows || []).map((r) => r.owner_id),
    ...(drill.funnelRows || []).map((d) => d.owner_id),
    ...(drill.planRows || []).map((o) => o.owner_id),
    ...(drill.wonNotInvoicedRows || []).map((d) => d.owner_id),
    ...Object.keys(drill.targetPerPerson || {}),
  ])].filter(Boolean);

  const divisionOf = (id) => {
    const u = (users || []).find((x) => x.id === id);
    return u?.sales_division_id || null;
  };
  const divName = (did) => (divisions || []).find((d) => d.id === did)?.name || 'Unassigned';

  const segments = {};
  RAIL_SEGMENTS.forEach((seg) => {
    const people = ownerIds
      .map((id) => {
        if (seg.key === 'shortfall') {
          const line = shortfallFor(id, drill);
          // Only people with a target can be short of it.
          if (!(line.target > 0)) return null;
          return { id, name: nameOf(users, id), total: line.value, rows: [line] };
        }
        const rows = rowsFor(seg.key, id, drill, ctx);
        if (!rows.length) return null;
        return {
          id,
          name: nameOf(users, id),
          total: rows.reduce((s, r) => s + num(r.value), 0),
          rows,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.total - a.total);

    const out = {
      key: seg.key,
      label: seg.label,
      color: seg.color,
      hatched: !!seg.hatched,
      inCoverage: seg.inCoverage,
      total: totals[seg.key],
      people,
      // What the people add up to. Equal to `total` for every segment except
      // Shortfall, where a company gap is NOT the sum of personal gaps: one
      // person's overshoot does not fill another's hole, and the rail's figure
      // is the company's own target less the company's own coverage. The panel
      // says so rather than quietly showing two numbers.
      peopleTotal: people.reduce((s, p) => s + p.total, 0),
    };

    if (byDivision) {
      const byId = {};
      people.forEach((p) => {
        const did = divisionOf(p.id) || 'unassigned';
        if (!byId[did]) byId[did] = { id: did, name: divName(did), total: 0, people: [] };
        byId[did].people.push(p);
        byId[did].total += p.total;
      });
      out.divisions = Object.values(byId).sort((a, b) => b.total - a.total);
    }
    segments[seg.key] = out;
  });

  return { segments, order: RAIL_SEGMENTS.map((s) => s.key) };
}

/** Column definitions per segment — shared by the panel and the Excel export. */
export const DRILL_COLUMNS = {
  invoiced: [
    { key: 'customer', label: 'Customer' },
    { key: 'invoiceNo', label: 'Invoice no' },
    { key: 'invoiceDate', label: 'Invoice date', type: 'date' },
    { key: 'value', label: 'Value', type: 'money' },
  ],
  funnel: [
    { key: 'customer', label: 'Customer' },
    { key: 'stage', label: 'Stage' },
    { key: 'amount', label: 'Amount', type: 'money' },
    { key: 'probability', label: 'Probability', type: 'pct' },
    { key: 'value', label: 'Weighted value', type: 'money' },
    { key: 'expectedClose', label: 'Expected close', type: 'date' },
    { key: 'stageDays', label: 'Days in stage', type: 'int' },
    { key: 'flags', label: 'Flags', type: 'flags' },
  ],
  planning: [
    { key: 'customer', label: 'Customer' },
    { key: 'planned', label: 'Planned amount', type: 'money' },
    { key: 'value', label: 'Weighted', type: 'money' },
    { key: 'status', label: 'Status' },
    { key: 'expectedMonth', label: 'Expected month', type: 'month' },
    { key: 'flags', label: 'Flags', type: 'flags' },
  ],
  shortfall: [
    { key: 'target', label: 'Target', type: 'money' },
    { key: 'achieved', label: 'Achieved', type: 'money' },
    { key: 'coverage', label: 'Coverage', type: 'money' },
    { key: 'value', label: 'Gap', type: 'money' },
    { key: 'newPipelineNeeded', label: 'New pipeline needed', type: 'money' },
  ],
  wonNotInvoiced: [
    { key: 'customer', label: 'Customer' },
    { key: 'wonDate', label: 'Won date', type: 'date' },
    { key: 'value', label: 'Value', type: 'money' },
    { key: 'daysSinceWon', label: 'Days since won', type: 'int' },
    { key: 'flags', label: 'Flags', type: 'flags' },
  ],
};
