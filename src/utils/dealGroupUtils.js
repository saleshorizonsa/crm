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

/** yyyy-MM-dd for a Date or date-ish string, local time (no UTC shift). */
const ymd = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/** Is this date inside [from, to]? `to` omitted = open-ended. Day precision. */
const inPeriod = (date, from, to) => {
  const day = ymd(date);
  if (!day || !from) return false;
  return day >= ymd(from) && (!to || day <= ymd(to));
};

/** First day of the month a date falls in, as yyyy-MM-01. */
const monthStart = (d) => (ymd(d) ? `${ymd(d).slice(0, 7)}-01` : null);

/**
 * Classify and summarise a list of deals by origin for analytics.
 *
 * `deals` is the list the screen already holds — nothing is fetched here.
 *
 * @param {object}   [ctx]
 * @param {string}   [ctx.periodTo]          end of the viewed period (yyyy-MM-dd)
 * @param {object[]} [ctx.linkedOpportunities] opportunities with a deal_id:
 *   { deal_id, expected_month }. Marks which new deals came from a plan entry.
 * @param {object[]} [ctx.closeDateChanges]  rows from deal_close_date_changes:
 *   { deal_id, old_date, new_date }. Feeds "Transferred to Future".
 */
export function classifyDealsByOrigin(deals, periodFrom, ctx = {}) {
  const { periodTo = null, linkedOpportunities = [], closeDateChanges = [] } = ctx;

  const newDeals   = [];
  const carryDeals = [];
  const wonNew     = [];
  const wonCarry   = [];
  // Closed IN this period, whatever their origin — a deal carried forward from
  // months ago that closes now belongs here, which is exactly what wonNew /
  // wonCarry (about when a deal ENTERED the funnel) cannot tell you.
  const wonThisPeriod  = [];
  const lostThisPeriod = [];

  (deals || []).forEach(deal => {
    const origin = getDealOrigin(deal, periodFrom);
    if (deal.stage === 'won') {
      origin === 'new' ? wonNew.push(deal) : wonCarry.push(deal);
      if (inPeriod(deal.stage_changed_at, periodFrom, periodTo)) wonThisPeriod.push(deal);
    } else if (deal.stage === 'lost') {
      if (inPeriod(deal.stage_changed_at, periodFrom, periodTo)) lostThisPeriod.push(deal);
    } else {
      origin === 'new' ? newDeals.push(deal) : carryDeals.push(deal);
    }
  });

  // ── New This Period, split by where the deal came from ────────────────────
  // Transferred = a real conversion happened (the deal id is an
  // opportunities.deal_id) AND that plan entry was planned for the period being
  // viewed. A conversion from a plan entry expected in some other month counts
  // as a direct lead here, by decision — it was not this period's plan.
  //
  // Direct is derived by SUBTRACTION from the same array, never counted
  // separately, so transferred + direct === newDeals can never drift apart.
  const plannedForPeriod = new Set(
    (linkedOpportunities || [])
      .filter((o) => o?.deal_id && o?.expected_month)
      .filter((o) => {
        const m = monthStart(o.expected_month);
        return m && m >= monthStart(periodFrom) && (!periodTo || m <= ymd(periodTo));
      })
      .map((o) => o.deal_id),
  );
  const newFromPlan = newDeals.filter((d) => plannedForPeriod.has(d.id));
  const fromPlanIds = new Set(newFromPlan.map((d) => d.id));
  const newDirect   = newDeals.filter((d) => !fromPlanIds.has(d.id));

  // ── Transferred to Future ─────────────────────────────────────────────────
  // Pushed OUT of this period: a logged close-date change whose old date fell in
  // this period and whose new date lands in a later month, on a deal that is
  // still open. Explicitly NOT lost — the deal is alive, just not this period's.
  // Only tracked from the day deal_close_date_changes started recording.
  const openById = new Map(
    (deals || []).filter((d) => d.stage !== 'won' && d.stage !== 'lost').map((d) => [d.id, d]),
  );
  const pushedIds = new Set(
    (closeDateChanges || [])
      .filter((c) => c?.deal_id && c?.old_date && c?.new_date)
      .filter((c) => inPeriod(c.old_date, periodFrom, periodTo))
      .filter((c) => monthStart(c.new_date) > monthStart(c.old_date))
      .filter((c) => openById.has(c.deal_id))
      .map((c) => c.deal_id),
  );
  const transferredToFuture = [...pushedIds].map((id) => openById.get(id));

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

    // New This Period, split (the two always add back to newCount/newValue)
    newFromPlan,
    newDirect,
    newFromPlanCount: newFromPlan.length,
    newDirectCount:   newDirect.length,
    newFromPlanValue: sum(newFromPlan),
    newDirectValue:   sum(newDirect),

    // Closed in this period, any origin
    wonThisPeriod,
    lostThisPeriod,
    wonThisPeriodCount:  wonThisPeriod.length,
    lostThisPeriodCount: lostThisPeriod.length,
    wonThisPeriodValue:  sum(wonThisPeriod),
    lostThisPeriodValue: sum(lostThisPeriod),

    // Pushed out of this period, still open
    transferredToFuture,
    transferredToFutureCount: transferredToFuture.length,
    transferredToFutureValue: sum(transferredToFuture),
    // What is left of this period's open pipeline once the pushed-out deals go.
    remainingOpenCount: newDeals.length + carryDeals.length - transferredToFuture.length,
    remainingOpenValue: sum(newDeals) + sum(carryDeals) - sum(transferredToFuture),
  };
}
