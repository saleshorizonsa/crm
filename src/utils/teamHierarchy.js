import { supabase } from 'lib/supabase';

const DIRECTOR_ROLES = ['director', 'admin', 'head'];
const TEAM_LEAD_ROLES = ['manager', 'supervisor'];

// Resolve the role-scoped list of team members a user may drill into via the
// salesman selector (Planning → Customer Master / Opportunities).
//
//   • director / admin / head → every salesman, supervisor and manager in the
//     company.
//   • manager / supervisor    → their FULL downline: direct reports plus every
//     salesman/supervisor beneath those reports, walked recursively through
//     `supervisor_id` (so a manager sees his supervisors AND the salesmen under
//     them, not just the direct reports).
//
// HIERARCHY COLUMN: `supervisor_id`, not `reports_to`. users carries both, and
// only supervisor_id is maintained — it is the column every write path sets
// (updateUserHierarchy, InviteUserModal, UserDetailModal, accept-invitation, the
// create-user edge function) and the one every RLS/permission function resolves
// the tree through (get_user_subordinates, can_manage_user_contacts,
// can_assign_target_to_user). NOTHING writes reports_to: it is a one-time
// partial backfill, so every manager change made since has left it stale.
// Reading it here meant Planning, the Coverage Console and Insights rolled up a
// different team from the dashboards, which already used supervisor_id.
//   • anyone else (salesman)  → empty (no selector).
//
// Returns objects shaped { id, full_name, role }, sorted by name.
export async function fetchTeamHierarchy({ companyId, userId, role }) {
  if (!companyId || !userId) return [];

  if (DIRECTOR_ROLES.includes(role)) {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, role')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in('role', ['salesman', 'supervisor', 'manager'])
      .order('full_name');
    return data || [];
  }

  if (!TEAM_LEAD_ROLES.includes(role)) return [];

  // Pull every active user in the company once, then walk the supervisor_id tree
  // downward from the current user. Cheaper and simpler than N recursive queries.
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, full_name, role, supervisor_id')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!allUsers?.length) return [];

  const seen = new Set(); // guards against a cyclic supervisor_id chain
  const team = [];
  const walk = (managerId) => {
    for (const u of allUsers) {
      if (u.supervisor_id === managerId && !seen.has(u.id)) {
        seen.add(u.id);
        team.push({ id: u.id, full_name: u.full_name, role: u.role });
        walk(u.id);
      }
    }
  };
  walk(userId);

  team.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  return team;
}

// ── Pure helpers, for deciding permission from an already-loaded users list ──
// No queries: the pages that need this (the pipeline) already hold every company
// user with `supervisor_id` from userService.getCompanyUsers, so asking the
// database again would only add a round trip and a second answer to the same
// question.

/**
 * Is `ancestorId` anywhere ABOVE `descendantId` in the supervisor_id chain?
 *
 * Walks upward from the descendant, which is the cheap direction: one step per
 * level rather than a scan per level. Guarded against a cyclic chain the same
 * way fetchTeamHierarchy guards the downward walk — a bad supervisor_id must not
 * hang the UI.
 */
export function isAboveInChain({ users, ancestorId, descendantId }) {
  if (!ancestorId || !descendantId || ancestorId === descendantId) return false;
  const byId = new Map((users || []).filter((u) => u?.id).map((u) => [u.id, u]));
  const seen = new Set([descendantId]);
  let current = byId.get(descendantId);
  while (current?.supervisor_id) {
    if (current.supervisor_id === ancestorId) return true;
    if (seen.has(current.supervisor_id)) return false;   // cycle
    seen.add(current.supervisor_id);
    current = byId.get(current.supervisor_id);
  }
  return false;
}

/**
 * Roles that may correct any deal's invoice number, wherever it sits.
 *
 * The same three the rest of the app treats as company-wide (DIRECTOR_ROLES
 * above, fetchOpenFunnel's isDirector, the deal_returns import gate), so a head
 * is not the one role that can see every deal and fix none of them.
 */
const INVOICE_CORRECTION_ROLES = ['admin', 'director', 'head'];

/**
 * May this user correct the invoice number on this deal?
 *
 * The deal owner, anyone above the owner in the supervisor_id chain, and
 * admin/director/head. A PEER salesman must not: an invoice number is what a
 * credit note is matched by, so changing someone else's moves real money
 * between two people's Achieved.
 *
 * `users` is the company's user list; without it only the owner and
 * admin/director checks can be answered, which is the safe direction to fail.
 */
export function canCorrectInvoice({ users, viewer, deal }) {
  const viewerId = viewer?.id;
  if (!viewerId || !deal) return false;
  if (INVOICE_CORRECTION_ROLES.includes(viewer?.role)) return true;
  if (deal.owner_id && deal.owner_id === viewerId) return true;
  return isAboveInChain({ users, ancestorId: viewerId, descendantId: deal.owner_id });
}
