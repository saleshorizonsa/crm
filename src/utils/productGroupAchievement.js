import { supabase } from 'lib/supabase';

// Achievement for product-group targets.
//
// Director's rule: a deal counts FULLY toward a group if ANY of its product
// lines belongs to that group. Not the matching line's value — the whole deal.
//
// A consequence worth stating plainly, because it looks like a bug otherwise: a
// deal spanning two groups counts in full toward BOTH, so the sum of group
// achievements can exceed total revenue. This is a per-group attainment view,
// not a revenue breakdown. Each deal is still counted only ONCE per group, no
// matter how many of its lines fall in that group.
//
// The previous implementation summed deal_products.line_total per line, which
// is the opposite rule and under-reported every group.

// Invoiced deals that carry no product lines at all cannot match any group, so
// they would silently vanish from this view — and they are not a rounding
// error: 38% of all won+invoiced deals for JASCO PVC have no lines, mostly
// PRE-CRM imports migrated in with a total but no line detail. They are
// surfaced under this key instead, which never matches a configured target and
// so can never inflate anyone's attainment. Its size is the point: it shows how
// much revenue has no product detail recorded.
export const UNASSIGNED_GROUP = 'Unassigned';

async function invoicedDeals({ companyId, ownerIds, start, end }) {
  let q = supabase
    .from('deals')
    .select('id, owner_id, amount, final_amount, deal_products(product:products!product_id(material_group))')
    .eq('company_id', companyId)
    .eq('stage', 'won')
    .eq('is_invoiced', true)
    .gte('invoice_date', start)
    .lte('invoice_date', end);
  if (Array.isArray(ownerIds)) {
    if (!ownerIds.length) return [];
    q = q.in('owner_id', ownerIds);
  }
  const { data, error } = await q;
  if (error) {
    console.error('productGroupAchievement:', error);
    return [];
  }
  return (data || []).map((d) => ({
    id: d.id,
    owner_id: d.owner_id,
    value: parseFloat(d.final_amount ?? d.amount) || 0,
    // Set collapses duplicate lines in the same group, so one deal with three
    // UPIP lines still contributes its value to UPIP exactly once.
    groups: new Set(
      (d.deal_products || [])
        .map((dp) => dp.product?.material_group)
        .filter(Boolean),
    ),
  }));
}

/**
 * Full breakdown: achieved per group, plus the unassigned bucket kept separate
 * so callers can choose whether to show it.
 *
 * @returns {Promise<{ byGroup: Record<string,number>, unassigned: { value:number, count:number } }>}
 */
export async function achievedBreakdown({ companyId, ownerIds = null, start, end }) {
  const empty = { byGroup: {}, unassigned: { value: 0, count: 0 } };
  if (!companyId || !start || !end) return empty;

  const deals = await invoicedDeals({ companyId, ownerIds, start, end });
  const byGroup = {};
  const unassigned = { value: 0, count: 0 };

  for (const deal of deals) {
    if (deal.groups.size === 0) {
      unassigned.value += deal.value;
      unassigned.count += 1;
      continue;
    }
    for (const g of deal.groups) {
      byGroup[g] = (byGroup[g] || 0) + deal.value; // full deal value, once per group
    }
  }
  return { byGroup, unassigned };
}

/**
 * Achieved value per product group. Does NOT include the unassigned bucket —
 * callers matching against configured targets want only real groups.
 */
export async function achievedByProductGroup({ companyId, ownerIds = null, start, end }) {
  const { byGroup } = await achievedBreakdown({ companyId, ownerIds, start, end });
  return byGroup;
}

/**
 * Achieved for one salesman + one group — used by the admin list, where each
 * row is scoped to a single owner.
 */
export async function achievedForGroup({ companyId, ownerId, productGroup, start, end }) {
  if (!companyId || !ownerId || !productGroup) return 0;
  const map = await achievedByProductGroup({ companyId, ownerIds: [ownerId], start, end });
  return map[productGroup] || 0;
}
