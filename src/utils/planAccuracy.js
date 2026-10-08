import { supabase } from 'lib/supabase';
import {
  isAchievedDeal, achievedAmount, fetchReturns, computeReturns,
} from 'utils/planningCalculations';

/**
 * DID THE PLAN HAPPEN? — plan accuracy for completed months.
 *
 * The Planning page has always been about the month ahead. Nothing ever looked
 * back and asked whether the plan filed last month turned into anything, so a
 * plan could be a ritual and nobody would know.
 *
 * THE FUNNEL, per person, for the months selected:
 *
 *   planned      items filed for that month, and their value
 *   converted    those with a deal (opportunities.deal_id) — the link the
 *                convert action writes, which is what "a plan item became a
 *                deal" means in this database
 *   won          that deal reached stage = won
 *   invoiced     and is_invoiced with an invoice_date — the shared Achieved
 *                rule, valued final_amount ?? amount
 *
 *   hit rate     invoiced value ÷ planned value
 *
 * AND THE OTHER DIRECTION — the month's Achieved split by where it came from:
 *
 *   fromPlan     invoiced in the month, linked to SOME plan item
 *   unplanned    invoiced in the month, linked to none
 *
 * These two add to the month's gross Achieved exactly, which is the check
 * /numbers-check makes. They are a different cut from the funnel above and are
 * named differently on purpose: the funnel follows THIS month's plan items
 * wherever they ended up, while this follows THIS month's revenue back to
 * wherever it came from. A deal planned in August and invoiced in September
 * counts in September's "fromPlan" and in August's funnel.
 *
 * Nothing here is a new measure: Achieved is isAchievedDeal/achievedAmount,
 * returns are computeReturns, and "converted" is the column the app already
 * writes.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pad = (n) => String(n).padStart(2, '0');

/** yyyy-MM-01 and the last day, from a yyyy-MM key. Local parts only. */
export function monthRange(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

/**
 * The last `count` COMPLETED months before `now` — newest first.
 *
 * Completed, because an unfinished month has no accuracy to report: its plan
 * items are still open by design and its hit rate would read as failure.
 */
export function lastCompletedMonths(count = 3, now = new Date()) {
  const out = [];
  for (let i = 1; i <= count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return out;
}

const OUTCOME = {
  invoiced: 'invoiced',
  won: 'won (not invoiced)',
  open_deal: 'became a deal, still open',
  lost: 'lost',
  not_converted: 'never became a deal',
  moved: 'moved to a later month',
};

/**
 * @param {string}   companyId
 * @param {string[]} ownerIds   the viewer's scope — already narrowed upstream
 * @param {string}   monthKey   yyyy-MM
 * @param {object[]} users      for the row labels
 */
export async function computePlanAccuracy({
  companyId, ownerIds, monthKey, users = [],
}) {
  const { start, end } = monthRange(monthKey);
  const empty = {
    monthKey, start, end, people: [], totals: null, items: [], failed: false,
  };
  if (!companyId || !ownerIds?.length) return empty;

  const [plannedRes, achievedRes, allLinksRes] = await Promise.all([
    // Every plan item filed for the month, whatever became of it.
    supabase.from('opportunities')
      .select('id, owner_id, customer_name, contact_id, planned_amount, status, expected_month, deal_id, converted_at')
      .eq('company_id', companyId)
      .in('owner_id', ownerIds)
      .gte('expected_month', start)
      .lte('expected_month', end),
    // The month's invoiced revenue, by the shared rule's own columns.
    supabase.from('deals')
      .select('id, owner_id, title, contact_id, stage, amount, final_amount, is_invoiced, invoice_date')
      .eq('company_id', companyId)
      .in('owner_id', ownerIds)
      .eq('stage', 'won')
      .eq('is_invoiced', true)
      .gte('invoice_date', start)
      .lte('invoice_date', end),
    // Which deals came from A plan item — ANY month's, which is what makes the
    // "unplanned" half honest: a deal planned in August is not unplanned
    // revenue in September.
    supabase.from('opportunities')
      .select('deal_id')
      .eq('company_id', companyId)
      .not('deal_id', 'is', null),
  ]);

  if (plannedRes.error || achievedRes.error) {
    console.error('computePlanAccuracy:', plannedRes.error || achievedRes.error);
    return { ...empty, failed: true };
  }

  const planRows = plannedRes.data || [];
  const invoicedThisMonth = (achievedRes.data || [])
    .filter((d) => isAchievedDeal(d, { start, end }));
  const plannedDealIds = new Set(
    (allLinksRes.data || []).map((o) => o.deal_id).filter(Boolean),
  );

  // The deals behind this month's plan items, read once.
  const dealIds = [...new Set(planRows.map((o) => o.deal_id).filter(Boolean))];
  let dealById = new Map();
  if (dealIds.length) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, owner_id, title, stage, amount, final_amount, is_invoiced, invoice_date, closed_at')
      .in('id', dealIds);
    dealById = new Map((deals || []).map((d) => [d.id, d]));
  }

  // Returns for the month, so Achieved can be stated net as well as gross.
  const returnRows = await fetchReturns({
    companyId, ownerIds, start, end,
  });
  const returnsByOwner = new Map();
  (returnRows || []).forEach((r) => {
    const o = r.owner_id;
    returnsByOwner.set(o, (returnsByOwner.get(o) || 0) + Math.abs(num(r.return_amount)));
  });

  const nameOf = (id) => users.find((u) => u.id === id)?.full_name || 'Unknown';

  /** One plan item, with what became of it. */
  const itemRow = (o) => {
    const deal = o.deal_id ? dealById.get(o.deal_id) : null;
    const invoiced = deal ? isAchievedDeal(deal, {}) : false;
    let outcome = OUTCOME.not_converted;
    if (o.status === 'moved_to_future') outcome = OUTCOME.moved;
    else if (deal) {
      if (invoiced) outcome = OUTCOME.invoiced;
      else if (deal.stage === 'won') outcome = OUTCOME.won;
      else if (deal.stage === 'lost') outcome = OUTCOME.lost;
      else outcome = OUTCOME.open_deal;
    }
    return {
      kind: 'opportunity',
      oppId: o.id,
      dealId: o.deal_id || null,
      owner_id: o.owner_id,
      customer: o.customer_name || '—',
      planned: num(o.planned_amount),
      outcome,
      invoiceDate: invoiced ? deal.invoice_date : null,
      // `value` is what the sheet sorts and totals on: the money that actually
      // arrived from this item, which is zero until it is invoiced.
      value: invoiced ? achievedAmount(deal) : 0,
    };
  };

  const items = planRows.map(itemRow);

  const forOwner = (ids) => {
    const mine = planRows.filter((o) => ids.includes(o.owner_id));
    const myItems = items.filter((r) => ids.includes(r.owner_id));
    const converted = mine.filter((o) => o.deal_id && dealById.get(o.deal_id));
    const won = converted.filter((o) => dealById.get(o.deal_id).stage === 'won');
    const invoiced = converted.filter((o) => isAchievedDeal(dealById.get(o.deal_id), {}));

    const plannedValue = mine.reduce((s, o) => s + num(o.planned_amount), 0);
    const invoicedValue = invoiced.reduce(
      (s, o) => s + achievedAmount(dealById.get(o.deal_id)), 0,
    );

    const mineInvoiced = invoicedThisMonth.filter((d) => ids.includes(d.owner_id));
    const fromPlan = mineInvoiced.filter((d) => plannedDealIds.has(d.id));
    const unplanned = mineInvoiced.filter((d) => !plannedDealIds.has(d.id));
    const achievedGross = mineInvoiced.reduce((s, d) => s + achievedAmount(d), 0);
    const returns = ids.reduce((s, id) => s + (returnsByOwner.get(id) || 0), 0);

    return {
      plannedItems: mine.length,
      plannedValue,
      convertedItems: converted.length,
      convertedValue: converted.reduce((s, o) => s + num(o.planned_amount), 0),
      wonItems: won.length,
      // The won deals' own value, not the invoiced one: a deal won and not yet
      // invoiced belongs in this stage at its full amount. These two are equal
      // whenever every won deal is invoiced, which is the common case and is
      // exactly why showing invoicedValue here would have gone unnoticed.
      wonValue: won.reduce((s, o) => s + achievedAmount(dealById.get(o.deal_id)), 0),
      invoicedItems: invoiced.length,
      invoicedValue,
      // Null rather than 0 when nothing was planned: a month with no plan has
      // no hit rate, and 0% would read as a failure to deliver on nothing.
      hitRate: plannedValue > 0 ? (invoicedValue / plannedValue) * 100 : null,
      movedItems: mine.filter((o) => o.status === 'moved_to_future').length,
      // The other cut — this month's revenue by where it came from.
      achievedFromPlan: fromPlan.reduce((s, d) => s + achievedAmount(d), 0),
      achievedUnplanned: unplanned.reduce((s, d) => s + achievedAmount(d), 0),
      achievedGross,
      returns,
      achievedNet: achievedGross - returns,
      unplannedInvoices: unplanned.length,
      items: myItems,
    };
  };

  const people = ownerIds
    .map((id) => ({ id, name: nameOf(id), ...forOwner([id]) }))
    .filter((p) => p.plannedItems > 0 || p.achievedGross > 0)
    .sort((a, b) => b.plannedValue - a.plannedValue);

  return {
    monthKey,
    start,
    end,
    people,
    totals: forOwner(ownerIds),
    items,
    outcomes: OUTCOME,
    failed: false,
  };
}

/** Column definitions for the drill into one person's plan items. */
export const PLAN_ACCURACY_COLUMNS = [
  { key: 'customer', label: 'Customer' },
  { key: 'planned', label: 'Planned', type: 'money' },
  { key: 'outcome', label: 'What became of it' },
  { key: 'value', label: 'Invoiced', type: 'money' },
  { key: 'invoiceDate', label: 'Invoice date', type: 'date' },
];

export { OUTCOME, computeReturns };
