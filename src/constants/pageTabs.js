// Canonical tab ids for the pages whose internal tabs are reachable from the
// top navigation as `/<page>#<tab id>`.
//
// The ids live here rather than only inside each page because three places now
// have to agree on them: the page's own tab bar, the page's hash handler, and
// the Header's nested flyout. A hash that matches nothing silently leaves the
// default tab selected, which looks like a dead link, so both pages validate
// against these lists instead of trusting the string in the URL.

export const PLANNING_TAB_IDS = [
  'customer_master',
  'opportunities',
  'future_orders',
  'approvals',
  'historical_data',
];

export const REPORTS_TAB_IDS = [
  'value',
  'product',
  'client',
  'location',
  'salesman',
  'origin',
  'margin',
  'activity',
];

/**
 * Read a tab id out of a location hash, returning null unless it is one this
 * page actually has. Accepts "#id" or "id"; ignores case and stray whitespace.
 */
export function tabIdFromHash(hash, allowedIds) {
  if (!hash) return null;
  // Trim BEFORE stripping the '#', or a padded hash keeps its marker and
  // matches nothing.
  const id = String(hash).trim().replace(/^#/, '').trim().toLowerCase();
  return allowedIds.includes(id) ? id : null;
}
