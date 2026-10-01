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
//   date    none. An open deal counts whenever it is expected to close.
//   scope   the viewer's own hierarchy, ACTIVE people only: contributor roles
//           plus anyone individually flagged is_contributor. Never company-wide.

/** Stages that are NOT in the funnel. Everything else is. */
export const CLOSED_STAGES = ['won', 'lost'];

const CLOSED_STAGES_PG = `("${CLOSED_STAGES.join('","')}")`;

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
export async function fetchOpenFunnel({ companyId, ownerIds = null, scopeIds = null }) {
  const empty = { total: 0, dealCount: 0, rows: [], scopeIds: [] };
  if (!companyId) return empty;

  const ids = scopeIds || await resolveFunnelScopeIds({ companyId, ownerIds });
  if (!ids.length) return empty;

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

  const rows = data || [];
  return {
    total: rows.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0),
    dealCount: rows.length,
    rows,
    scopeIds: ids,
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
