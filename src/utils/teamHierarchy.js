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
//     `reports_to` (so a manager sees his supervisors AND the salesmen under
//     them, not just the direct reports).
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

  // Pull every active user in the company once, then walk the reports_to tree
  // downward from the current user. Cheaper and simpler than N recursive queries.
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, full_name, role, reports_to')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!allUsers?.length) return [];

  const seen = new Set(); // guards against a cyclic reports_to chain
  const team = [];
  const walk = (managerId) => {
    for (const u of allUsers) {
      if (u.reports_to === managerId && !seen.has(u.id)) {
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
