// Which divisions a person belongs to.
//
// A person has ONE primary division (users.sales_division_id, unchanged) and
// any number of additional ones (user_sales_divisions). Every read unions the
// two, so a single-division user — no rows in the join table — behaves exactly
// as before, and nothing here looks at role: a contributor-flagged manager or
// supervisor splits across divisions by the same mechanism as a salesman.
//
// A DEAL's division is deals.division_id, not its owner's. Inferring it from
// the owner was fine while everyone had one division; with several it is
// ambiguous, and it would count one person's revenue in every division they
// belong to. The column is backfilled from the owner's primary division, which
// is exactly what was previously inferred, so no historical figure moved.

import { supabase } from 'lib/supabase';

/** The sentinel groupByDivision uses for people with no division. */
export const UNASSIGNED = 'unassigned';

/** How many divisions one person may hold in total (primary + additional). */
export const MAX_DIVISIONS_PER_USER = 4;

/**
 * Additional-division rows for a set of users, as { userId: [divisionId, …] }.
 * Never throws: a failure degrades to "no additional divisions", which is the
 * pre-multi-division behaviour, rather than blanking a screen.
 */
export async function fetchAdditionalDivisions({ companyId, userIds = null }) {
  if (!companyId) return {};
  let q = supabase
    .from('user_sales_divisions')
    .select('user_id, division_id')
    .eq('company_id', companyId);
  if (Array.isArray(userIds)) {
    if (!userIds.length) return {};
    q = q.in('user_id', userIds);
  }
  const { data, error } = await q;
  if (error) {
    console.error('fetchAdditionalDivisions:', error);
    return {};
  }
  const byUser = {};
  (data || []).forEach((r) => {
    (byUser[r.user_id] = byUser[r.user_id] || []).push(r.division_id);
  });
  return byUser;
}

/**
 * Every division id a user belongs to: primary first, then additional, with
 * duplicates removed (the primary may legitimately also sit in the join table).
 *
 * @param {object} user               needs id and sales_division_id
 * @param {object} additionalByUser   from fetchAdditionalDivisions()
 */
export function divisionIdsForUser(user, additionalByUser = {}) {
  if (!user?.id) return [];
  const extra = additionalByUser[user.id] || [];
  const all = [user.sales_division_id, ...extra].filter(Boolean);
  return [...new Set(all)];
}

/** True when this user belongs to this division, by either route. */
export function userInDivision(user, divisionId, additionalByUser = {}) {
  if (divisionId === UNASSIGNED) return divisionIdsForUser(user, additionalByUser).length === 0;
  return divisionIdsForUser(user, additionalByUser).includes(divisionId);
}

/** How many divisions this user holds — for the UI's cap. */
export function divisionCountForUser(user, additionalByUser = {}) {
  return divisionIdsForUser(user, additionalByUser).length;
}

/**
 * A predicate selecting the deals that count toward one division.
 *
 * Deals are filtered by deals.division_id, NOT by their owner's divisions —
 * without this, a person in two divisions would have every deal counted in
 * both and the divisions would sum to more than the company.
 *
 * `divisionId` null/undefined means "no division filter" (the company-level
 * view), which is what every caller did before this existed.
 */
export function dealInDivision(divisionId) {
  if (!divisionId) return () => true;
  if (divisionId === UNASSIGNED) return (d) => !d?.division_id;
  return (d) => d?.division_id === divisionId;
}

/** { userId: primaryDivisionId } from user rows — the fallback for a NULL row. */
export function primaryDivisionByUser(users) {
  const out = {};
  (users || []).forEach((u) => { if (u?.id) out[u.id] = u.sales_division_id || null; });
  return out;
}

/**
 * The same predicate for a TARGET ROW, a PLAN ITEM or a FUTURE ORDER.
 *
 * WHY THIS EXISTS. Deals were attributed by deals.division_id while targets and
 * plan items were attributed PER PERSON — so a person in two divisions had
 * their whole target and whole plan counted in BOTH. Mohamed Kamal is in Export
 * and PVC Compound, and the panel's October targets summed to 5.75M against a
 * company target of 3.70M. Business decision 2026-10-06 (option 2): attribute
 * them by division, exactly the way deals already are.
 *
 * `row.division_id` wins. A row that has none falls back to its owner's PRIMARY
 * division, which is what the old per-person attribution effectively meant for
 * a single-division person — so nothing moves for anyone in one division, and a
 * row inserted before migrations/division_attribution.sql is applied still
 * lands somewhere rather than vanishing.
 *
 * @param {string|null} divisionId  null = no filter (the company-level view)
 * @param {object} p
 * @param {object} p.primaryByUser  from primaryDivisionByUser()
 * @param {string} [p.ownerKey]     'owner_id', or 'assigned_to' for a target row
 */
export function rowInDivision(divisionId, { primaryByUser = {}, ownerKey = 'owner_id' } = {}) {
  if (!divisionId) return () => true;
  const effective = (row) => row?.division_id || primaryByUser[row?.[ownerKey]] || null;
  if (divisionId === UNASSIGNED) return (row) => !effective(row);
  return (row) => effective(row) === divisionId;
}
