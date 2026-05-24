/**
 * Returns the primary material group for a deal.
 * When a deal has products from multiple groups, the group
 * with the highest total line value wins.
 * Deals with no products fall into "No Products".
 */
export function getPrimaryMaterialGroup(deal) {
  if (!deal.deal_products?.length) {
    return 'No Products';
  }

  const groupValues = {};
  deal.deal_products.forEach(dp => {
    const group = dp.product?.material_group || 'Uncategorized';
    const value = parseFloat(dp.line_total || 0);
    groupValues[group] = (groupValues[group] || 0) + value;
  });

  return Object.entries(groupValues)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Uncategorized';
}

/**
 * Returns a sorted, deduplicated list of all material groups
 * present in the given deals array.  "No Products" is always last.
 */
export function getMaterialGroups(deals) {
  const groups = new Set();
  deals.forEach(deal => groups.add(getPrimaryMaterialGroup(deal)));
  return [...groups].sort((a, b) => {
    if (a === 'No Products') return 1;
    if (b === 'No Products') return -1;
    return a.localeCompare(b);
  });
}

/**
 * Groups an array of deals by their primary material group.
 * Returns { [groupName]: deal[] }.
 */
export function groupDealsByMaterialGroup(deals) {
  const grouped = {};
  deals.forEach(deal => {
    const group = getPrimaryMaterialGroup(deal);
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(deal);
  });
  return grouped;
}

/**
 * Builds a short product summary string for a deal card.
 * Example: "UPVC PIPE × 500 pc, Steel Rebar × 2 ton, +1 more"
 */
export function getDealProductSummary(deal, maxItems = 2) {
  if (!deal.deal_products?.length) return null;
  const items = deal.deal_products
    .slice(0, maxItems)
    .map(dp => {
      const name = dp.product?.material || 'Product';
      const qty  = dp.quantity || dp.uom_value || 1;
      const uom  = dp.uom_type || dp.product?.base_unit_of_measure || '';
      return `${name} × ${qty}${uom ? ' ' + uom : ''}`;
    });
  const remaining = deal.deal_products.length - maxItems;
  if (remaining > 0) items.push(`+${remaining} more`);
  return items.join(', ');
}
