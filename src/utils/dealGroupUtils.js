import { format } from 'date-fns';

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

/**
 * Determine if a deal is NEW or CARRY_FORWARD for the given period.
 * NEW          = deal created within this period
 * CARRY_FORWARD = deal created before this period but active/closing in it
 */
export function getDealOrigin(deal, periodFrom) {
  const originDate = deal.creation_date || deal.created_at;
  if (!originDate || !periodFrom) return 'new';
  const created = new Date(originDate);
  const from    = new Date(periodFrom);
  created.setHours(0, 0, 0, 0);
  from.setHours(0, 0, 0, 0);
  return created >= from ? 'new' : 'carry_forward';
}

/**
 * For Won deals — 'won_new' if created this period, 'won_carry' if carried forward.
 */
export function getWonDealOrigin(deal, periodFrom) {
  return getDealOrigin(deal, periodFrom) === 'new' ? 'won_new' : 'won_carry';
}

/**
 * Human-readable origin label: "New Jun 2026" or "From Apr 2026".
 */
export function getOriginLabel(deal, periodFrom) {
  const originDate = deal.creation_date || deal.created_at;
  if (!originDate) return null;
  const created = new Date(originDate);
  const origin  = getDealOrigin(deal, periodFrom);
  return origin === 'new'
    ? `New ${format(created, 'MMM yyyy')}`
    : `From ${format(created, 'MMM yyyy')}`;
}

/**
 * Classify and summarise a list of deals by origin for analytics.
 */
export function classifyDealsByOrigin(deals, periodFrom) {
  const newDeals   = [];
  const carryDeals = [];
  const wonNew     = [];
  const wonCarry   = [];

  (deals || []).forEach(deal => {
    const origin = getDealOrigin(deal, periodFrom);
    if (deal.stage === 'won') {
      origin === 'new' ? wonNew.push(deal) : wonCarry.push(deal);
    } else if (deal.stage !== 'lost') {
      origin === 'new' ? newDeals.push(deal) : carryDeals.push(deal);
    }
  });

  const sum = arr => arr.reduce((s, d) => s + parseFloat(d.amount || 0), 0);

  return {
    newDeals,
    carryDeals,
    wonNew,
    wonCarry,
    newCount:       newDeals.length,
    carryCount:     carryDeals.length,
    wonNewCount:    wonNew.length,
    wonCarryCount:  wonCarry.length,
    newValue:       sum(newDeals),
    carryValue:     sum(carryDeals),
    wonNewValue:    sum(wonNew),
    wonCarryValue:  sum(wonCarry),
    totalOpenCount: newDeals.length + carryDeals.length,
    totalOpenValue: sum(newDeals) + sum(carryDeals),
  };
}
