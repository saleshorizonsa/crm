import { supabase } from '../lib/supabase';

const DEAL_SELECT = `
  id, title, amount, stage, created_at, expected_close_date, won_at, lost_at,
  contact:contacts!contact_id(id, first_name, last_name, company_name, city, country),
  owner:users!owner_id(id, full_name),
  deal_products(id, line_total, uom_value, unit_price,
    product:products(id, material, description, material_group))
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

    if (teamIds)  query = query.in('owner_id', teamIds);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo)   query = query.lte('created_at', dateTo);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data: data || [], error };
  },
};
