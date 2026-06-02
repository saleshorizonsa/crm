import { supabase } from '../lib/supabase';

const DEAL_SELECT = `
  id, title, amount, stage,
  created_at, closed_at, lost_at,
  expected_close_date,
  contact:contacts!contact_id(
    id, first_name, last_name, company_name
  ),
  owner:users!owner_id(id, full_name),
  deal_products(
    id, line_total, uom_value, unit_price,
    product:products(
      id, material, description, material_group
    )
  )
`;

async function getTeamUserIds(userId, role, companyId) {
  if (['director', 'admin', 'ceo'].includes(role)) return null;
  if (role === 'salesman') return [userId];

  // supervisor / manager / sales_manager → own team + self
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('supervisor_id', userId)
    .eq('company_id', companyId)
    .eq('is_active', true);

  return [userId, ...(data || []).map((u) => u.id)];
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
