import { supabase } from 'lib/supabase';

// WHO COUNTS — the one definition of the scope every revenue figure is measured
// over, in a LEAF module so anything may import it.
//
// It lives here rather than in utils/planningCalculations.js because
// utils/winRate3m.js needs it, and planningCalculations imports winRate3m: a
// cycle between the two files every screen depends on is a temporal-dead-zone
// crash waiting for a bundler to reorder something. planningCalculations
// re-exports all of these, so no call site had to change.
// The KPI numbers aggregate over individual contributors. Managers are excluded
// on purpose: they carry a YEARLY team roll-up, not a monthly total_value quota,
// so including them would dwarf and double-count the monthly numbers — and their
// future orders must not offset a target they never contributed to.
//
// A manager flagged users.is_contributor = true is the exception, and the list
// of what he counts in has grown by decision: ACHIEVED first, then TARGET, and
// now CONVERSION (see achieverIdsFrom). Planned and Carry-In remain
// contributor-roles-only — he carries no monthly plan.
export const CONTRIBUTOR_ROLES = ['salesman', 'supervisor'];

/** Ids of the ACTIVE contributors in a list of user rows (needs role + is_active). */
export function contributorIdsFrom(users) {
  return (users || [])
    .filter((u) => u && u.is_active === true && CONTRIBUTOR_ROLES.includes(u.role))
    .map((u) => u.id);
}

/**
 * An active user OUTSIDE CONTRIBUTOR_ROLES who is individually flagged
 * users.is_contributor = true: a manager who sells himself.
 *
 * Their own invoiced deals count toward ACHIEVED, and so toward every team and
 * company Achieved total that contains them. Nothing else widens: Target, Win
 * Rate, Planned and Carry-In stay on CONTRIBUTOR_ROLES, because a flagged
 * manager still carries no monthly quota. Counting him in those would skew them
 * rather than fix Achieved.
 */
export function isAchievedOnly(user) {
  return !!user
    && user.is_active === true
    && user.is_contributor === true
    && !CONTRIBUTOR_ROLES.includes(user.role);
}

/**
 * Ids whose deals count toward ACHIEVED, TARGET and CONVERSION in a list of user
 * rows: the contributors plus the flagged achieved-only users. Rows need role,
 * is_active, is_contributor.
 *
 * CEO DECISION D4, 2026-10-05: CONVERSION USES THE SAME SCOPE AS ACHIEVED.
 * Conversion (3m) and the information-only pipeline conversion are measured
 * over the ACHIEVERS — active contributor roles plus anyone individually
 * flagged users.is_contributor — exactly the people whose revenue and monthly
 * target count. Before this, conversion was contributor-roles-only while
 * Achieved and Target already included the flagged managers, and a flagged
 * manager viewed on his own produced FOUR different rates on four screens:
 * the KPI strip 0.0% (no contributors in his scope), Planning 92.3% (its
 * fallback widened to the raw scope), the Coverage Console and Insights 65.4%
 * (the borrowed company rate) and his own strip row "—" (null by design).
 * For JASCO PVC the company figures move from 65.4%/53.6% to 67.8%/55.3%.
 *
 * Still NOT this scope: Planned and Carry-In, which stay on
 * contributorIdsFrom, because a flagged manager carries no monthly plan.
 */
export function achieverIdsFrom(users) {
  return [...contributorIdsFrom(users), ...(users || []).filter(isAchievedOnly).map((u) => u.id)];
}

/**
 * Whose monthly TARGET counts — now exactly whose Achieved counts.
 *
 * Achieved was widened for flagged managers first, and Target was deliberately
 * left on roles alone. That asymmetry flattered a flagged manager: his invoiced
 * revenue counted everywhere while the target he set himself counted almost
 * nowhere, so his attainment read high and the company's target read low. The
 * two scopes are one thing now, under two names so each call site still says
 * which side of the equation it is on.
 *
 * A plain manager is still excluded: only CONTRIBUTOR_ROLES plus individually
 * flagged users. And only MONTHLY rows are ever summed (fetchMonthlyTargets and
 * every caller filter period_type = 'monthly'), so a manager's yearly
 * allocation — 40,660,779 for the manager this was built for — can never be
 * pulled into a monthly total.
 */
export const targetOwnerIdsFrom = achieverIdsFrom;

/**
 * The achiever ids for a scope, straight from the database.
 *
 * `ownerIds = null` means the whole company. An EMPTY array means "nobody in
 * scope" and returns [] rather than silently widening to everyone — the same
 * contract as fetchOpenFunnel and fetchWinRate3m.
 *
 * One query, because the callers that need this (fetchWinRate3m) are already
 * issuing one of their own and a second round trip per rate is not free.
 */
export async function fetchAchieverIds({ companyId, ownerIds = null }) {
  if (!companyId) return [];
  if (Array.isArray(ownerIds) && ownerIds.length === 0) return [];
  let q = supabase
    .from('users')
    .select('id, role, is_active, is_contributor')
    .eq('company_id', companyId)
    .eq('is_active', true);
  if (Array.isArray(ownerIds)) q = q.in('id', ownerIds);
  const { data, error } = await q;
  if (error) {
    console.error('fetchAchieverIds:', error);
    return [];
  }
  return achieverIdsFrom(data || []);
}
