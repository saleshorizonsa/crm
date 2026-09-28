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
