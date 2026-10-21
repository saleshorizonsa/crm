// ── The Forecast page's data: Insights' rows, read once, sliced per period ─────
//
// The page computes every figure through calcDivisionMetrics — the function
// behind Insights — with the tiers of utils/forecastTiers.js inside it. So the
// rows here are Insights' rows, column for column, with three differences:
//   - every read is PAGED (utils/fetchAllRows), so no list stops at 1,000 rows;
//   - targets, plan items and returns cover a WINDOW (the selected period, the
//     next three months and the quarter), and forecastFor slices them;
//   - deal lines are read for the product-group breakdown.
// The viewer's scope is Insights' (scopeUserIds): director/head/admin = the
// company, manager/supervisor = their subtree, salesman = himself.

import { supabase } from 'lib/supabase';
import { fetchAllRows } from 'utils/fetchAllRows';
import {
  calcDivisionMetrics, scopeUserIds, groupByDivision, divisionRowOwners,
} from 'utils/salesDivisionMetrics';
import { fetchAdditionalDivisions } from 'utils/divisionMembership';
import { fetchConversionBaseOrDeals, targetPerPerson } from 'utils/planningCalculations';
import { achieverIdsFrom, activeIdsFrom } from 'utils/achieverScope';
import { dayKey, isOpenDeal } from 'utils/forecastTiers';

const DEAL_COLS = 'id, title, stage, amount, final_amount, is_invoiced, invoice_date, owner_id, division_id, forecast_amount, expected_close_date, stage_changed_at, created_at, closed_at, contacts!contact_id(first_name, last_name, company_name)';

export async function loadForecastBundle({ companyId, viewerId, role, windowStart, windowEnd, now = new Date() }) {
  const [usersRes, divisionsRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, role, supervisor_id, is_active, sales_division_id, is_contributor')
      .eq('company_id', companyId),
    supabase
      .from('sales_divisions')
      .select('id, name, sort_order')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true }),
  ]);
  if (usersRes.error) throw usersRes.error;
  const allUsers = usersRes.data || [];
  const scopeIds = scopeUserIds({ users: allUsers, viewerId, role });
  const users = allUsers.filter((u) => scopeIds.includes(u.id));
  const divisions = divisionsRes.error ? [] : divisionsRes.data || [];
  const empty = {
    users, allUsers, divisions, scopeIds, deals: [], targets: [], deals3m: [], opps: [],
    futureOrders: [], returns: [], conversionBase: {}, additionalByUser: {}, now,
  };
  if (!scopeIds.length) return empty;

  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  const [dealsRes, targetsRes, deals3mRes, oppsRes, returnsRes] = await Promise.all([
    fetchAllRows(() => supabase
      .from('deals')
      .select(DEAL_COLS, { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .not('stage', 'eq', 'lost')),
    fetchAllRows(() => supabase
      .from('sales_targets')
      .select('id, assigned_to, target_amount, period_type, target_type, period_start, period_end, product_group, division_id, client_targets(target_amount)', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('status', 'active')
      .eq('period_type', 'monthly')
      .in('assigned_to', scopeIds)
      .lte('period_start', windowEnd)
      .gte('period_end', windowStart)),
    fetchAllRows(() => supabase
      .from('deals')
      .select('id, stage, owner_id, division_id, created_at, closed_at, invoice_number', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .gte('created_at', threeMonthsAgo)
      .lte('created_at', lastMonthEnd)),
    fetchAllRows(() => supabase
      .from('opportunities')
      .select('id, owner_id, planned_amount, division_id, expected_month, customer_name, contact_id', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .eq('status', 'open')
      .gte('expected_month', windowStart)
      .lte('expected_month', windowEnd)),
    fetchAllRows(() => supabase
      .from('deal_returns')
      .select('id, deal_id, return_date, return_amount, deals!inner(owner_id, division_id)', { count: 'exact' })
      .eq('company_id', companyId)
      .in('deals.owner_id', scopeIds)
      .gte('return_date', windowStart)
      .lte('return_date', windowEnd)),
  ]);
  const failed = [dealsRes, targetsRes, deals3mRes, oppsRes].find((r) => r.error);
  if (failed) throw failed.error;

  const [additionalByUser, conversionBase] = await Promise.all([
    fetchAdditionalDivisions({ companyId, userIds: scopeIds }),
    fetchConversionBaseOrDeals({ companyId, divisionIds: divisions.map((d) => d.id) }),
  ]);

  return {
    ...empty,
    deals: dealsRes.data || [],
    targets: targetsRes.data || [],
    deals3m: deals3mRes.data || [],
    opps: oppsRes.data || [],
    returns: returnsRes.error ? [] : (returnsRes.data || []).map((r) => ({
      ...r, owner_id: r.deals?.owner_id ?? null, division_id: r.deals?.division_id ?? null,
    })),
    additionalByUser: additionalByUser || {},
    conversionBase: conversionBase || {},
  };
}

/** The bundle's rows for one period, in the shape calcDivisionMetrics takes. */
export function sliceForPeriod(bundle, { start, end }) {
  const today = dayKey(bundle.now || new Date());
  return {
    ...bundle,
    targets: (bundle.targets || []).filter((t) => t.period_start <= end && t.period_end >= start),
    opps: (bundle.opps || []).filter((o) => {
      const m = String(o.expected_month || '').slice(0, 10);
      return m >= start && m <= end;
    }),
    returns: (bundle.returns || []).filter((r) => {
      const d = String(r.return_date || '').slice(0, 10);
      return d >= start && d <= end;
    }),
    monthStart: start,
    monthEnd: end,
    isCurrentMonth: start.slice(0, 7) === today.slice(0, 7) && end.slice(0, 7) === today.slice(0, 7),
    isAllTime: false,
  };
}

/**
 * Metrics (with tiers) for one scope and period — exactly what Insights shows
 * for the same people, division and window.
 *   company:  ids = bundle.scopeIds
 *   division: ids = the division group's userIds, divisionId, divisionRow = true
 *   person:   ids = [userId], divisionId = the page's division filter (or null)
 */
export function forecastFor(bundle, { ids, start, end, divisionId = null, divisionRow = false }) {
  return calcDivisionMetrics(ids, { ...sliceForPeriod(bundle, { start, end }), divisionId, divisionRow });
}

/** Insights' division groups for the bundle (members plus row owners). */
export function divisionGroupsOf(bundle) {
  const all = groupByDivision({
    users: bundle.users,
    divisions: bundle.divisions,
    scopeIds: bundle.scopeIds,
    additionalByUser: bundle.additionalByUser || {},
    rowOwners: divisionRowOwners({
      users: bundle.users, deals: bundle.deals, returns: bundle.returns, opps: bundle.opps,
      futureOrders: bundle.futureOrders || [], targets: bundle.targets,
    }),
  });
  const touched = all.filter((g) => (g.userIds || []).length > 0);
  return touched.length ? touched : all;
}

/** The people a manager can pick: ACTIVE achievers in scope (salesman, supervisor, is_contributor). */
export function pickableAchievers(bundle, divisionId = null) {
  const active = activeIdsFrom(achieverIdsFrom(bundle.users), bundle.users);
  let ids = active;
  if (divisionId) {
    const g = divisionGroupsOf(bundle).find((x) => x.id === divisionId);
    const inDiv = new Set(g?.userIds || []);
    ids = active.filter((id) => inDiv.has(id));
  }
  return bundle.users
    .filter((u) => ids.includes(u.id))
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
}

/** Each person's monthly target for the month of `key` (yyyy-MM), every division. */
export function monthlyTargetByOwner(bundle, key) {
  const start = `${key}-01`;
  const [y, m] = key.split('-').map(Number);
  const end = `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  return targetPerPerson((bundle.targets || []).filter((t) => t.period_start <= end && t.period_end >= start));
}

/** Open deals of the ACTIVE achievers in scope (optionally one division / one person). */
export function openDealsInScope(bundle, { ids, divisionId = null }) {
  const forward = new Set(activeIdsFrom(achieverIdsFrom(bundle.users.filter((u) => ids.includes(u.id))), bundle.users));
  return (bundle.deals || []).filter((d) => isOpenDeal(d) && forward.has(d.owner_id)
    && (!divisionId || (divisionId === 'unassigned' ? !d.division_id : d.division_id === divisionId)));
}

/** Deal lines with their product group, for the breakdown. Chunked id lists. */
export async function fetchDealLines(dealIds) {
  const out = {};
  const ids = [...new Set(dealIds || [])];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('deal_products')
      .select('deal_id, line_total, product:products(material_group)')
      .in('deal_id', ids.slice(i, i + 200));
    if (error) { console.error('fetchDealLines:', error); return { linesByDeal: out, error }; }
    (data || []).forEach((l) => {
      (out[l.deal_id] = out[l.deal_id] || []).push({ line_total: l.line_total, material_group: l.product?.material_group || null });
    });
  }
  return { linesByDeal: out, error: null };
}
