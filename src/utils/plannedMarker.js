// The "already planned this month" marker, split by WHO planned it (session 25).
//
// The marker exists to stop TWO DIFFERENT people planning one customer. It is
// not meant to stop the same owner adding a second item for a customer he
// already has this month — the balance of a deal invoiced for less than
// planned, for instance (CEO decision 2026-10-13).
//
// planned_contacts_this_month(p_company, p_month, p_exclude_owner) returns the
// customers planned this month by anyone OTHER than p_exclude_owner, and the
// function honours that argument only when it is the caller himself
// (migrations/planned_marker_exclude_owner.sql). Until that migration is
// applied the three-argument call fails, this returns null, and the caller
// keeps today's rule: anyone's item blocks.
import { supabase } from 'lib/supabase';

const idsOf = (rows) => new Set((rows || [])
  .map((r) => (typeof r === 'string' ? r : r?.planned_contacts_this_month ?? r?.contact_id))
  .filter(Boolean));

/** Customers planned this month by someone other than `userId`, or null when unavailable. */
export async function fetchPlannedByOthers({ companyId, monthStart, userId }) {
  if (!companyId || !monthStart || !userId) return null;
  try {
    const { data, error } = await supabase.rpc('planned_contacts_this_month', {
      p_company: companyId,
      p_month: monthStart,
      p_exclude_owner: userId,
    });
    if (!error && Array.isArray(data)) return idsOf(data);
  } catch (e) {
    console.warn('plannedMarker: owner-aware marker unavailable:', e?.message);
  }
  return null;
}

/**
 * Whether a customer row is blocked from planning.
 *
 * @param plannedIds       customers with an open or converted item this month, anyone's
 * @param plannedByOthers  the same, excluding the viewer's own items; null = unknown
 * @param newItemOwnerId   who the new item would belong to
 * @param viewerId         the signed-in user
 */
export function isPlanBlocked({ customerId, plannedIds, plannedByOthers, newItemOwnerId, viewerId }) {
  if (!plannedIds?.has(customerId)) return false;
  // Unknown who planned it (migration not applied): today's rule.
  if (!plannedByOthers) return true;
  // The new item would be someone else's: that is a second person, so blocked.
  if (!viewerId || newItemOwnerId !== viewerId) return true;
  // Only the viewer's own items: he may add another.
  return plannedByOthers.has(customerId);
}
