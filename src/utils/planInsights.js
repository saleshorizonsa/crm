import { supabase } from 'lib/supabase';
import { isAchievedDeal, achievedAmount } from 'utils/planningCalculations';
import { customerKey, isConvertedWithDeal, isConvertedDealMissing } from 'utils/planningDrill';
import { computePlanAccuracy, lastCompletedMonths, monthRange } from 'utils/planAccuracy';

/**
 * THREE LOOKS BACK AT THE PLAN — slipping deals, plan realism, unplanned buyers.
 *
 * Plan accuracy says what became of ONE month's plan. These answer the
 * questions a manager asks next: which customers keep getting pushed, whose
 * plans are realistic, and who is buying without anyone having planned them.
 *
 * NOTHING HERE IS A NEW DEFINITION. Achieved is isAchievedDeal/achievedAmount;
 * "from a plan" and "unplanned" are computePlanAccuracy's own split (the
 * invoices themselves, not a re-derivation); converted is isConvertedWithDeal;
 * a customer is customerKey with contact names, as the Gap closer calls it.
 *
 * SCOPE is whatever the page hands in. The forward-looking lists (slipping,
 * unplanned buyers) are for ACTIVE owners only — nobody can act on a departed
 * salesman's customer under his name. The history (realism) counts departed
 * people in the team row, because their invoices are real revenue, but never
 * names them.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pad = (n) => String(n).padStart(2, '0');
const ym = (d) => String(d || '').slice(0, 7);

/** "Oct", "Nov" — from yyyy-MM or yyyy-MM-dd. */
export function shortMonth(d) {
  const [y, m] = ym(d).split('-').map(Number);
  if (!y || !m) return '—';
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
}
const longMonth = (d) => {
  const [y, m] = ym(d).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

/**
 * "Oct ×4 → Nov" — the months a customer was pushed to, in the order the
 * pushes happened. A run of pushes into the same month is one step with a
 * count, so five pushes do not read as five different months.
 */
export function monthTrail(rows) {
  const steps = [];
  rows.forEach((r) => {
    const m = ym(r.expected_month);
    const last = steps[steps.length - 1];
    if (last && last.m === m) last.n += 1;
    else steps.push({ m, n: 1 });
  });
  return steps.map((s) => `${shortMonth(s.m)}${s.n > 1 ? ` ×${s.n}` : ''}`).join(' → ');
}

/** contact id -> company name, for customerKey. One read, ids only. */
async function contactNamesFor(ids) {
  const out = new Map();
  const list = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < list.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await supabase.from('contacts')
      .select('id, company_name').in('id', list.slice(i, i + 200));
    (data || []).forEach((c) => { if (c.company_name) out.set(c.id, c.company_name); });
  }
  return out;
}

/* ── 1. SLIPPING DEALS ──────────────────────────────────────────────────────── */

export const PUSH_STATUSES = ['moved', 'pending'];
export const SLIP_MIN_PUSHES = 2;

/**
 * Plan items pushed to a later month again and again.
 *
 * A PUSH is one future_orders row with status moved or pending, for the same
 * owner and customer (customerKey). Every path that defers work writes one:
 * the deal's "move to future", the expired-lead sweep, and the Future Orders
 * tab's claim (which flips pending to moved but keeps the row). So the count
 * of rows is the count of times the work was put off.
 *
 * WHERE IT IS NOW follows the LATEST push: still pending for some month, or
 * moved back into a plan — and if so, what became of that plan item.
 *
 * @param {string[]} ownerIds  ACTIVE owners in scope
 */
export async function computeSlippingDeals({ companyId, ownerIds, users = [] }) {
  const empty = { rows: [], all: [], pushes: 0, listedPushes: 0, value: 0, failed: false };
  if (!companyId || !ownerIds?.length) return empty;

  const { data: fo, error } = await supabase.from('future_orders')
    .select('id, owner_id, contact_id, customer_name, planned_amount, expected_month, status, created_at, moved_at, opportunity_id')
    .eq('company_id', companyId)
    .in('owner_id', ownerIds)
    .in('status', PUSH_STATUSES);
  if (error) {
    console.error('computeSlippingDeals:', error);
    return { ...empty, failed: true };
  }
  const pushes = fo || [];

  // The owners' plan items too: "back in plan" needs the item a moved push
  // created, and the drill shows every item for the customer.
  const { data: opps } = await supabase.from('opportunities')
    .select('id, owner_id, contact_id, customer_name, planned_amount, expected_month, status, deal_id, created_at')
    .eq('company_id', companyId)
    .in('owner_id', ownerIds);
  const plan = opps || [];

  const contactName = await contactNamesFor([...pushes, ...plan].map((r) => r.contact_id));
  const keyOf = (r) => `${r.owner_id}|${customerKey(r, contactName)}`;

  const groups = new Map();
  pushes.forEach((r) => {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });

  // The deals behind the plan items the latest pushes point at.
  const oppById = new Map(plan.map((o) => [o.id, o]));
  const dealIds = [...new Set(plan.map((o) => o.deal_id).filter(Boolean))];
  const dealById = new Map();
  for (let i = 0; i < dealIds.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await supabase.from('deals')
      .select('id, stage, amount, final_amount, is_invoiced, invoice_date')
      .in('id', dealIds.slice(i, i + 200));
    (data || []).forEach((d) => dealById.set(d.id, d));
  }

  /** Where the work is now, from the latest push. */
  const whereNow = (last) => {
    if (last.status === 'pending') {
      return { code: 'pending', label: `pending for ${longMonth(last.expected_month)}` };
    }
    const o = last.opportunity_id ? oppById.get(last.opportunity_id) : null;
    if (!o) return { code: 'moved_unlinked', label: 'moved to a plan, item no longer there' };
    if (o.status === 'open') return { code: 'in_plan', label: `back in plan for ${longMonth(o.expected_month)}` };
    if (o.status === 'moved_to_future') return { code: 'pushed_again', label: 'pushed again' };
    if (isConvertedDealMissing(o)) return { code: 'deal_missing', label: 'became a deal, deal no longer exists' };
    if (isConvertedWithDeal(o)) {
      const d = dealById.get(o.deal_id);
      if (d && isAchievedDeal(d, {})) return { code: 'invoiced', label: 'invoiced' };
      if (d?.stage === 'won') return { code: 'won', label: 'won' };
      if (d?.stage === 'lost') return { code: 'lost', label: 'became a deal, lost' };
      return { code: 'deal', label: 'became a deal' };
    }
    return { code: 'other', label: o.status || '—' };
  };

  const nameOf = (id) => users.find((u) => u.id === id)?.full_name || 'Unknown';

  const all = [...groups.entries()].map(([k, list]) => {
    const rowsInOrder = [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const last = rowsInOrder[rowsInOrder.length - 1];
    const ck = k.slice(k.indexOf('|') + 1);
    const ownerId = last.owner_id;
    const value = num(last.planned_amount);
    return {
      key: k,
      ownerId,
      person: nameOf(ownerId),
      customer: (last.contact_id && contactName.get(last.contact_id)) || last.customer_name || '—',
      contactId: last.contact_id || null,
      value,
      times: rowsInOrder.length,
      months: monthTrail(rowsInOrder),
      now: whereNow(last),
      score: value * rowsInOrder.length,
      pushes: rowsInOrder,
      // Every plan item this owner has for the customer, for the drill.
      items: plan.filter((o) => o.owner_id === ownerId && customerKey(o, contactName) === ck),
    };
  });

  const rows = all.filter((g) => g.times >= SLIP_MIN_PUSHES)
    .sort((a, b) => (b.score - a.score) || (b.times - a.times));

  return {
    rows,
    all,
    pushes: pushes.length,
    listedPushes: rows.reduce((s, r) => s + r.times, 0),
    value: rows.reduce((s, r) => s + r.value, 0),
    failed: false,
  };
}

/* ── 2 + 3. the completed months, read once ────────────────────────────────── */

/**
 * computePlanAccuracy for each of the last `count` completed months, newest
 * first. Realism and Unplanned buyers both read this, so they are the same
 * invoices Plan accuracy shows above them.
 *
 * @param {string[]} ownerIds EVERYONE in scope, departed included — the team
 *   row must equal the scope's Achieved.
 */
export async function fetchCompletedMonths({ companyId, ownerIds, users = [], count = 3, now = new Date(), months = null }) {
  const keys = months || lastCompletedMonths(count, now);
  const res = await Promise.all(keys.map((monthKey) => computePlanAccuracy({
    companyId, ownerIds, monthKey, users,
  })));
  return keys.map((k, i) => res[i]);
}

/**
 * Departed people's ids, for a COMPANY-wide history. The page's company scope
 * is active people only; their revenue and plans still belong in the company's
 * totals (CEO, 2026-10-07: company includes everyone), unnamed. Only departed
 * people are added — not active people outside the selling scope, whose figures
 * would otherwise land in the unnamed remainder under the wrong description.
 */
export async function fetchDepartedIds(companyId) {
  if (!companyId) return [];
  const { data, error } = await supabase.from('users')
    .select('id').eq('company_id', companyId).eq('is_active', false);
  if (error) { console.error('fetchDepartedIds:', error); return []; }
  return (data || []).map((u) => u.id);
}

/* ── 2. PLAN REALISM ────────────────────────────────────────────────────────── */

/** Realism needs this many months of plan before it is judged with a colour. */
export const REALISM_MIN_MONTHS = 3;

/**
 * Planned vs invoiced, per person and month.
 *
 *   planned      every plan item filed for the month, any status
 *                (computePlanAccuracy.plannedValue)
 *   invoiced     the month's Achieved, gross (achievedGross)
 *   fromPlan     of which from a plan item — ANY month's plan, the shared cut
 *   unplanned    of which from none
 *   ownPlan      invoiced from THIS month's own plan items (the funnel's
 *                invoicedValue) — shown beside fromPlan, because a deal planned
 *                in August and invoiced in September is "from a plan" in
 *                September without being from September's plan
 *   realism      invoiced ÷ planned; null when nothing was planned
 *
 * People: active and named. The team row is the scope's totals, departed
 * people included; what they contributed is reported as one unnamed figure.
 */
export function computePlanRealism({ monthsData, activeIds = [] }) {
  const active = new Set(activeIds);
  const ordered = [...monthsData].reverse();          // oldest first, for the trend
  const cell = (p) => ({
    planned: num(p?.plannedValue),
    invoiced: num(p?.achievedGross),
    fromPlan: num(p?.achievedFromPlan),
    unplanned: num(p?.achievedUnplanned),
    ownPlan: num(p?.invoicedValue),
    realism: num(p?.plannedValue) > 0 ? (num(p?.achievedGross) / num(p.plannedValue)) * 100 : null,
  });

  const byPerson = new Map();
  ordered.forEach((m) => {
    (m.people || []).filter((p) => active.has(p.id)).forEach((p) => {
      if (!byPerson.has(p.id)) byPerson.set(p.id, { id: p.id, name: p.name, months: {} });
      byPerson.get(p.id).months[m.monthKey] = cell(p);
    });
  });

  const summarise = (cells) => {
    const withPlan = cells.filter((c) => c && c.planned > 0);
    const planned = cells.reduce((s, c) => s + (c ? c.planned : 0), 0);
    const invoiced = cells.reduce((s, c) => s + (c ? c.invoiced : 0), 0);
    return {
      planned,
      invoiced,
      realism: planned > 0 ? (invoiced / planned) * 100 : null,
      monthsWithPlan: withPlan.length,
      judged: withPlan.length >= REALISM_MIN_MONTHS,
    };
  };

  const monthKeys = ordered.map((m) => m.monthKey);
  const people = [...byPerson.values()].map((p) => ({
    ...p,
    overall: summarise(monthKeys.map((k) => p.months[k])),
  })).sort((a, b) => b.overall.planned - a.overall.planned);

  const team = { months: {}, departed: {} };
  ordered.forEach((m) => {
    team.months[m.monthKey] = cell(m.totals);
    // Whatever the named rows do not account for is departed people's.
    const named = (m.people || []).filter((p) => active.has(p.id));
    const sum = (f) => named.reduce((s, p) => s + num(p[f]), 0);
    team.departed[m.monthKey] = {
      planned: num(m.totals?.plannedValue) - sum('plannedValue'),
      invoiced: num(m.totals?.achievedGross) - sum('achievedGross'),
    };
  });
  team.overall = summarise(monthKeys.map((k) => team.months[k]));

  return {
    monthKeys,
    people,
    team,
    failed: monthsData.some((m) => m.failed),
  };
}

/** "Realism 11% = invoiced 185,946 on a plan of 1,757,537" */
export function realismSentence(c) {
  if (!c || !(c.planned > 0)) return c && c.invoiced > 0 ? `No plan; invoiced ${Math.round(c.invoiced).toLocaleString('en-US')}` : 'No plan';
  return `Realism ${Math.round(c.realism)}% = invoiced ${Math.round(c.invoiced).toLocaleString('en-US')} on a plan of ${Math.round(c.planned).toLocaleString('en-US')}`;
}

/* ── 3. UNPLANNED BUYERS ────────────────────────────────────────────────────── */

/**
 * Customers who bought without being in any plan.
 *
 * The invoices are computePlanAccuracy's own `unplannedDeals` — invoiced in
 * the month by the shared rule, linked to no plan item of any month — so the
 * invoiced column here sums to Plan accuracy's "Unplanned" for the same
 * people and months.
 *
 * Grouped by owner and customerKey. "In this month's plan" asks the whole
 * company (opportunities RLS is company-wide): a plan item for the customer in
 * the current month by anyone, open or already converted. A customer someone
 * has planned is not a customer to suggest again, and an item moved to a later
 * month is not in this month's plan.
 *
 * @param {object[]} monthsData  fetchCompletedMonths
 * @param {string[]} activeIds   forward-looking: active owners only
 * @param {{start,end}} thisMonth the current month's bounds
 */
export async function computeUnplannedBuyers({ companyId, monthsData, activeIds = [], users = [], thisMonth }) {
  const active = new Set(activeIds);
  const deals = monthsData.flatMap((m) => (m.unplannedDeals || [])
    .filter((d) => active.has(d.owner_id))
    .map((d) => ({ ...d, monthKey: m.monthKey })));

  let planned = [];
  if (companyId && thisMonth?.start) {
    const { data } = await supabase.from('opportunities')
      .select('owner_id, contact_id, customer_name, status')
      .eq('company_id', companyId)
      .neq('status', 'moved_to_future')
      .gte('expected_month', thisMonth.start)
      .lte('expected_month', thisMonth.end);
    planned = data || [];
  }

  const contactName = await contactNamesFor([...deals, ...planned].map((r) => r.contact_id));
  const inPlan = new Set(planned.map((o) => customerKey(o, contactName)));
  const nameOf = (id) => users.find((u) => u.id === id)?.full_name || 'Unknown';

  const groups = new Map();
  deals.forEach((d) => {
    const ck = customerKey(d, contactName);
    const k = `${d.owner_id}|${ck}`;
    if (!groups.has(k)) {
      groups.set(k, {
        key: k,
        customerKey: ck,
        ownerId: d.owner_id,
        owner: nameOf(d.owner_id),
        customer: (d.contact_id && contactName.get(d.contact_id)) || d.title || '—',
        contactId: d.contact_id || null,
        invoiced: 0,
        monthsSet: new Set(),
        invoices: [],
      });
    }
    const g = groups.get(k);
    g.invoiced += achievedAmount(d);
    g.monthsSet.add(d.monthKey);
    g.invoices.push(d);
  });

  const rows = [...groups.values()].map((g) => ({
    key: g.key,
    customerKey: g.customerKey,
    ownerId: g.ownerId,
    owner: g.owner,
    customer: g.customer,
    contactId: g.contactId,
    invoiced: g.invoiced,
    monthsBought: g.monthsSet.size,
    inThisMonthsPlan: inPlan.has(g.customerKey),
    // Fallback for the prefill when the Gap closer's history has no entry:
    // the same "total ÷ months bought", over the months on screen.
    usualOrder: g.monthsSet.size ? g.invoiced / g.monthsSet.size : 0,
    invoices: g.invoices,
  })).sort((a, b) => (Number(a.inThisMonthsPlan) - Number(b.inThisMonthsPlan))
    || (b.monthsBought - a.monthsBought)
    || (b.invoiced - a.invoiced));

  return {
    rows,
    months: monthsData.length,
    total: rows.reduce((s, r) => s + r.invoiced, 0),
    notInPlan: rows.filter((r) => !r.inThisMonthsPlan).length,
  };
}

/** The current month's bounds, for "in this month's plan". */
export function currentMonthBounds(now = new Date()) {
  return monthRange(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
}
