import { supabase } from '../lib/supabase';

const DEAL_SELECT = `
  id, title, amount, final_amount, is_invoiced, invoice_date, stage_changed_at,
  stage,
  created_at, closed_at, lost_at,
  expected_close_date,
  contact:contacts!contact_id(
    id, first_name, last_name, company_name
  ),
  owner:users!owner_id(id, full_name, is_active),
  deal_products(
    id, line_total, uom_value, unit_price,
    product:products(
      id, material, description, material_group
    )
  )
`;

// Reports is a HISTORICAL view, so this scope deliberately differs from the
// "current" team scopes in teamHierarchy.js / Coverage Console in two ways:
//
//   1. NO is_active filter. A deactivated former team member's deals are still
//      part of what this manager's team actually did, so they must keep showing
//      in their Reports page and in the By Salesman dropdown. Filtering here was
//      also what made a deactivated user's whole subtree unreachable: with the
//      middle node missing from the result set there was no edge left to walk
//      through, so their reports vanished too even while active. Only "current
//      period" screens (Coverage Console, Planning, Forecast, owner pickers)
//      exclude inactive users.
//
//   2. It RECURSES. This was a single query for direct reports only, so a
//      manager saw himself plus his supervisors and nothing beneath them —
//      Mohamed Kamal's Reports covered 2 people out of an actual team of 7.
//      Same downward walk as fetchTeamHierarchy() and the Coverage Console's
//      subtreeOf(), and the same shape as the database's own recursive
//      get_user_subordinates().
//
// Hierarchy is read from `supervisor_id`, NOT `reports_to`. That is deliberate:
// every SECURITY DEFINER function behind RLS (can_user_access_data,
// can_assign_target_to_user, can_manage_user_contacts, get_user_subordinates)
// resolves the tree through supervisor_id, so reading anything else here would
// let this scope disagree with what the database will actually return.
async function getTeamUserIds(userId, role, companyId) {
  // head = company-wide access (scoped to their own company via companyId).
  if (['director', 'admin', 'ceo', 'head'].includes(role)) return null;
  if (role === 'salesman') return [userId];

  // supervisor / manager / sales_manager → own team + self, all levels down.
  // One fetch of the company then an in-memory walk, rather than a query per
  // level: cheaper, and it keeps the traversal identical to the other two.
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, supervisor_id')
    .eq('company_id', companyId);

  const childrenOf = new Map();
  (allUsers || []).forEach((u) => {
    if (!u.supervisor_id) return;
    if (!childrenOf.has(u.supervisor_id)) childrenOf.set(u.supervisor_id, []);
    childrenOf.get(u.supervisor_id).push(u.id);
  });

  const team = [userId];
  const seen = new Set([userId]); // guards against a cyclic supervisor_id chain
  const queue = [userId];
  while (queue.length) {
    for (const childId of childrenOf.get(queue.shift()) || []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      team.push(childId);
      queue.push(childId);
    }
  }

  return team;
}

export function computeDateRange(period) {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth();

  switch (period) {
    case 'this_month':
      return { from: new Date(y, m, 1).toISOString(),     to: new Date(y, m + 1, 0, 23, 59, 59).toISOString() };
    case 'last_month':
      return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 0, 23, 59, 59).toISOString() };
    case 'this_quarter': {
      const q = Math.floor(m / 3);
      return { from: new Date(y, q * 3, 1).toISOString(), to: new Date(y, q * 3 + 3, 0, 23, 59, 59).toISOString() };
    }
    case 'last_quarter': {
      let q = Math.floor(m / 3) - 1, qy = y;
      if (q < 0) { q = 3; qy = y - 1; }
      return { from: new Date(qy, q * 3, 1).toISOString(), to: new Date(qy, q * 3 + 3, 0, 23, 59, 59).toISOString() };
    }
    case 'this_year':
      return { from: new Date(y, 0, 1).toISOString(),     to: new Date(y, 11, 31, 23, 59, 59).toISOString() };
    case 'last_year':
      return { from: new Date(y - 1, 0, 1).toISOString(), to: new Date(y - 1, 11, 31, 23, 59, 59).toISOString() };
    default:
      return { from: null, to: null };
  }
}

export const reportService = {
  async getReportDeals(companyId, userId, role, dateFrom, dateTo) {
    const teamIds = await getTeamUserIds(userId, role, companyId);

    let query = supabase
      .from('deals')
      .select(DEAL_SELECT)
      .eq('company_id', companyId);

    if (teamIds) query = query.in('owner_id', teamIds);

    // Fetch without date filter first — filter client-side because different
    // stages use different date fields:
    //   won deals  → closed_at
    //   lost deals → closed_at or lost_at
    //   open deals → created_at
    const { data: allData, error } = await query
      .order('created_at', { ascending: false });

    if (error) return { data: [], error };

    const filtered = (allData || []).filter(deal => {
      if (!dateFrom && !dateTo) return true;

      let dateToCheck;
      if (deal.stage === 'won') {
        dateToCheck = deal.closed_at || deal.expected_close_date || deal.created_at;
      } else if (deal.stage === 'lost') {
        dateToCheck = deal.closed_at || deal.lost_at || deal.created_at;
      } else {
        dateToCheck = deal.created_at;
      }

      if (!dateToCheck) return false;
      const d = new Date(dateToCheck);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo   && d > new Date(dateTo))   return false;
      return true;
    });

    return { data: filtered, error: null };
  },
};
