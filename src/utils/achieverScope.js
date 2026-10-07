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

/**
 * THE ACTIVE/INACTIVE RULE (CEO decision 2026-10-07).
 *
 * A COMPANY-scope total — Achieved and Target on a director or whole-company
 * view, any period — includes EVERYONE who was ever in it, active or not. A
 * PERSON or TEAM total stays active-only.
 *
 * WHY THEY MOVE TOGETHER. September 2026 invoiced 1,518,070 against monthly
 * targets of 3,050,494. Counting the revenue of people who have since left
 * while dropping their targets read 1,518,070 / 1,481,075 = 103% attainment for
 * a month that actually came in at 50%. A past month cannot be re-targeted, so
 * the only two consistent answers are "both" or "neither", and management needs
 * the historical truth: both.
 *
 * CONVERSION (3m) IS EXCLUDED, at every scope. It is a RATE, not a total, and
 * it is the divisor in Required Plan and New Pipeline Needed on every screen
 * including team and person ones — widening it would move 67.8% to 62.7% and
 * raise everybody's required pipeline by about 8%, which is a different
 * decision from reporting history correctly. fetchWinRate3m therefore keeps the
 * active-only default and is deliberately NOT given this option.
 *
 * An ownerIds of null is what every caller already uses for "the whole
 * company", so the rule needs no new plumbing at the call sites.
 */
export function isCompanyScope(ownerIds) {
  return !Array.isArray(ownerIds);
}

/** The option object for a TOTALS scope (Achieved, Target) — not for a rate. */
export function totalsScopeOpts(ownerIds) {
  return { includeInactive: isCompanyScope(ownerIds) };
}

/**
 * Ids of the contributors in a list of user rows (needs role + is_active).
 *
 * ACTIVE ONLY BY DEFAULT. `includeInactive` is the company-totals rule above;
 * every caller that has not opted in behaves exactly as before.
 */
export function contributorIdsFrom(users, { includeInactive = false } = {}) {
  return (users || [])
    .filter((u) => u && (includeInactive || u.is_active === true)
      && CONTRIBUTOR_ROLES.includes(u.role))
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
export function isAchievedOnly(user, { includeInactive = false } = {}) {
  return !!user
    && (includeInactive || user.is_active === true)
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
export function achieverIdsFrom(users, opts = {}) {
  // The filter callback is written out rather than passed isAchievedOnly
  // directly: Array.prototype.filter would hand it the INDEX as its second
  // argument, which is now the options object.
  return [
    ...contributorIdsFrom(users, opts),
    ...(users || []).filter((u) => isAchievedOnly(u, opts)).map((u) => u.id),
  ];
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
export async function fetchAchieverIds({
  companyId, ownerIds = null, includeInactive = false,
}) {
  if (!companyId) return [];
  if (Array.isArray(ownerIds) && ownerIds.length === 0) return [];
  let q = supabase
    .from('users')
    .select('id, role, is_active, is_contributor')
    .eq('company_id', companyId);
  // Both the query AND the in-memory predicates have to be widened, or the
  // rows arrive and are then dropped.
  if (!includeInactive) q = q.eq('is_active', true);
  if (Array.isArray(ownerIds)) q = q.in('id', ownerIds);
  const { data, error } = await q;
  if (error) {
    console.error('fetchAchieverIds:', error);
    return [];
  }
  return achieverIdsFrom(data || [], { includeInactive });
}

/**
 * The TOTALS scope for Achieved and Target: the company rule applied for you.
 * A caller measuring a total passes its ownerIds and gets the right set;
 * a caller measuring a RATE must not use this.
 */
export async function fetchTotalsScopeIds({ companyId, ownerIds = null }) {
  return fetchAchieverIds({ companyId, ownerIds, ...totalsScopeOpts(ownerIds) });
}
