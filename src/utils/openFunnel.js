import { supabase } from 'lib/supabase';
import { fetchContributors, fetchAchievedOnlyUsers } from 'utils/planningCalculations';

// THE definition of "funnel". One function, because three screens each had their
// own and all three disagreed for the same person at the same moment:
//
//   Planning "In Funnel"            2,151,781.87   73 deals
//   KPI strip funnel                1,843,031.87   71 deals
//   Funnel Analytics "Total Funnel" 1,778,761.08   49 deals
//
// The first two differed only in SCOPE — the strip counted contributor roles
// alone, so a manager flagged is_contributor had his own open deals left out of
// his own funnel (Kamal: 308,750 across 2 deals). The third was a different
// question entirely: the on-screen filtered list, company-wide, with won and
// lost deals included.
//
// The rule, now in one place:
//   stages  every stage EXCEPT won and lost
//   amount  `amount`, raw and unweighted — never final_amount, never weighted
//   date    the CURRENT calendar month, by expected_close_date — plus deals with
//           no expected_close_date at all (see below)
//   scope   the viewer's own hierarchy, ACTIVE people only: contributor roles
//           plus anyone individually flagged is_contributor. Never company-wide.

/** Stages that are NOT in the funnel. Everything else is. */
export const CLOSED_STAGES = ['won', 'lost'];

const CLOSED_STAGES_PG = `("${CLOSED_STAGES.join('","')}")`;

/**
 * UNDATED DEALS COUNT.
 *
 * An open deal with no expected_close_date is real work somebody has not dated,
 * not work that does not exist. Excluding it would make it invisible in every
 * funnel on every screen at once — for JASCO PVC that is 13 deals worth
 * 123,540.34, about 6% of the funnel, silently gone.
 *
 * So they are counted, and reported separately as `undated` so a screen can say
 * how much of the figure is undated rather than implying it is all due this
 * month. Flip this one flag to change the rule everywhere.
 */
export const INCLUDE_UNDATED = true;

const pad = (n) => String(n).padStart(2, '0');

/** First and last day of the month `now` falls in, as yyyy-MM-dd. */
export function currentMonthBounds(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}` };
}

/**
 * Narrow a hierarchy to the people whose deals count: active contributors, plus
 * an active manager/director flagged is_contributor because he sells himself.
 *
 * A single explicitly-picked owner is kept even if they are neither, so drilling
 * into one person never silently empties the figure.
 */
export async function resolveFunnelScopeIds({ companyId, ownerIds }) {
  if (!companyId || !ownerIds?.length) return [];
  const [contributors, flagged] = await Promise.all([
    fetchContributors({ companyId, ownerIds }),
    fetchAchievedOnlyUsers({ companyId, ownerIds }),
  ]);
  const ids = [...new Set([...contributors.map((c) => c.id), ...flagged.map((u) => u.id)])];
  if (ids.length) return ids;
  return ownerIds.length === 1 ? [...ownerIds] : [];
}

/**
 * The open funnel for a scope.
 *
 * `rows` is returned as well as the total so a caller that also needs a slice of
 * the funnel — the KPI strip wants the part dated into the current month — can
 * take it from the same read instead of issuing a second query against a
 * definition that could drift from this one.
 *
 * @param {string}   companyId
 * @param {string[]} ownerIds   the hierarchy to narrow (ignored if scopeIds given)
 * @param {string[]} scopeIds   an already-narrowed scope, to avoid re-resolving
 * @returns {{ total:number, dealCount:number, rows:object[], scopeIds:string[], failed?:boolean }}
 */
export async function fetchOpenFunnel({
  companyId, ownerIds = null, scopeIds = null,
  // Override the window. Omitted — which is how every screen calls it — means
  // the current calendar month, so all three agree without each passing a period.
  start = null, end = null,
}) {
  const bounds = (start && end) ? { start, end } : currentMonthBounds();
  const empty = {
    total: 0, dealCount: 0, rows: [], allOpenRows: [], scopeIds: [], bounds,
    undated: { total: 0, count: 0 }, outsideMonth: { total: 0, count: 0 },
  };
  if (!companyId) return empty;

  const ids = scopeIds || await resolveFunnelScopeIds({ companyId, ownerIds });
  if (!ids.length) return empty;

  // Every open deal in scope is read, then partitioned here rather than bounded
  // in the query. "In this month OR undated" is awkward to express in PostgREST,
  // and having all the rows is what lets the composition be reported and lets a
  // caller take a different slice from the same read.
  const { data, error } = await supabase
    .from('deals')
    .select('id, owner_id, amount, expected_close_date')
    .eq('company_id', companyId)
    .in('owner_id', ids)
    .not('stage', 'in', CLOSED_STAGES_PG);

  // Reported rather than swallowed: a funnel of 0 from a dropped read looks
  // exactly like an empty funnel, and callers that display or record it should
  // be able to tell the difference.
  if (error) {
    console.error('fetchOpenFunnel:', error);
    return { ...empty, scopeIds: ids, failed: true };
  }

  const allOpenRows = data || [];
  const amt = (d) => parseFloat(d.amount) || 0;

  const inMonth = [];
  const undated = [];
  const outside = [];
  allOpenRows.forEach((d) => {
    const due = d.expected_close_date;
    if (!due) undated.push(d);
    else if (due >= bounds.start && due <= bounds.end) inMonth.push(d);
    else outside.push(d);
  });

  const counted = INCLUDE_UNDATED ? [...inMonth, ...undated] : inMonth;
  const sum = (list) => list.reduce((s, d) => s + amt(d), 0);

  return {
    total: sum(counted),
    dealCount: counted.length,
    rows: counted,
    // The unbounded set, for a caller that needs its own window off the same
    // read (the KPI strip takes its plan-gap slice from this).
    allOpenRows,
    scopeIds: ids,
    bounds,
    // So a screen can say how much of the figure is undated rather than letting
    // it read as "all due this month".
    undated: { total: sum(undated), count: undated.length },
    outsideMonth: { total: sum(outside), count: outside.length },
  };
}

/** Sum of the funnel rows whose expected_close_date falls inside [start, end]. */
export function funnelInWindow(rows, start, end) {
  const per = {};
  let total = 0;
  (rows || []).forEach((d) => {
    const due = d.expected_close_date;
    if (!due || due < start || due > end) return;
    const amt = parseFloat(d.amount) || 0;
    per[d.owner_id] = (per[d.owner_id] || 0) + amt;
    total += amt;
  });
  return { per, total };
}
