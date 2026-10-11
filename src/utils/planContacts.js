import { supabase } from 'lib/supabase';
import { customerKey } from 'utils/planningDrill';
import { riyadhDate, activityVisitDate } from 'utils/visits';

/**
 * PLAN CUSTOMERS: CONTACTED OR PENDING — one definition (CEO, 2026-10-11).
 *
 *   plan customers  this month's plan items with status open or converted
 *                   (whether or not the deal is still there), one row per
 *                   owner + customer (customerKey with contact names, as the
 *                   Gap closer calls it). Planned = the sum of its items.
 *   contacted       ANY contact with that customer this month BY THE PLAN
 *                   OWNER: contact_reports of any type (the customer through
 *                   the report's deal), plus activities of type visit, call,
 *                   whatsapp or meeting (the customer through contact_id,
 *                   else the deal's contact). Automatic notes, emails and
 *                   tasks do not count. Riyadh dates.
 *
 * Every read is filtered to the scope ids in the query, as utils/visits.js
 * does — the contact_reports policy is company-wide today, so the query is
 * what keeps a salesman to his own rows.
 */

export const CONTACT_ACTIVITY_TYPES = ['visit', 'call', 'whatsapp', 'meeting'];
const PLAN_STATUSES = ['open', 'converted'];

const chunk = (arr, n = 200) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function byIds(table, cols, ids) {
  const out = new Map();
  for (const part of chunk([...new Set(ids.filter(Boolean))])) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await supabase.from(table).select(cols).in('id', part);
    (data || []).forEach((r) => out.set(r.id, r));
  }
  return out;
}

/**
 * @param {string}   companyId
 * @param {string[]} ownerIds   the page's scope
 * @param {string}   start      yyyy-MM-dd, first of the month (Riyadh)
 * @param {string}   end        yyyy-MM-dd, last of the month
 * @returns {{ rows: object[], failed: boolean }}
 *   rows: { key, ownerId, customer, contactId, planned, items, planStatus,
 *           contacted, lastContact: { date, type, source } | null }
 */
export async function fetchPlanContacts({ companyId, ownerIds, start, end }) {
  if (!companyId || !ownerIds?.length) return { rows: [], failed: false };
  const ids = [...new Set(ownerIds.filter(Boolean))];
  const idList = ids.join(',');

  const [plan, reports, acts] = await Promise.all([
    supabase.from('opportunities')
      .select('id, owner_id, contact_id, customer_name, planned_amount, status, deal_id, expected_month')
      .eq('company_id', companyId)
      .in('owner_id', ids)
      .in('status', PLAN_STATUSES)
      .gte('expected_month', start)
      .lte('expected_month', end),
    supabase.from('contact_reports')
      .select('id, owner_id, deal_id, contact_type, contact_date')
      .eq('company_id', companyId)
      .in('owner_id', ids)
      .gte('contact_date', start)
      .lte('contact_date', end),
    // Dated by completed, else due, else created — filtered to the month in
    // JS below, since the date can come from any of the three.
    supabase.from('activities')
      .select('id, type, owner_id, user_id, contact_id, deal_id, completed_at, due_date, created_at')
      .eq('company_id', companyId)
      .in('type', CONTACT_ACTIVITY_TYPES)
      .or(`owner_id.in.(${idList}),user_id.in.(${idList})`),
  ]);
  if (plan.error || reports.error || acts.error) {
    console.error('fetchPlanContacts:', plan.error || reports.error || acts.error);
    return { rows: [], failed: true };
  }

  const inMonth = (d) => !!d && d >= start && d <= end;
  const actRows = (acts.data || []).filter((a) => inMonth(activityVisitDate(a)));
  const deals = await byIds('deals', 'id, title, contact_id',
    [...(reports.data || []), ...actRows].map((r) => r.deal_id));
  const contacts = await byIds('contacts', 'id, company_name, first_name, last_name', [
    ...(plan.data || []).map((o) => o.contact_id),
    ...actRows.map((a) => a.contact_id),
    ...[...deals.values()].map((d) => d.contact_id),
  ]);
  const contactName = new Map();
  contacts.forEach((c, id) => {
    const nm = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ');
    if (nm) contactName.set(id, nm);
  });

  // ── the plan customers ──
  const groups = new Map();
  (plan.data || []).forEach((o) => {
    const key = `${o.owner_id}|${customerKey(o, contactName)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        ownerId: o.owner_id,
        customer: (o.contact_id && contactName.get(o.contact_id)) || o.customer_name || '—',
        contactId: o.contact_id || null,
        planned: 0,
        items: 0,
        open: 0,
        converted: 0,
        lastContact: null,
      });
    }
    const g = groups.get(key);
    g.planned += Number(o.planned_amount) || 0;
    g.items += 1;
    if (o.status === 'open') g.open += 1; else g.converted += 1;
    if (!g.contactId && o.contact_id) g.contactId = o.contact_id;
  });

  // ── the contacts, keyed the same way ──
  const touch = (ownerId, row, date, type, source) => {
    const key = `${ownerId}|${customerKey(row, contactName)}`;
    const g = groups.get(key);
    if (!g) return;
    if (!g.lastContact || date > g.lastContact.date) g.lastContact = { date, type, source };
  };
  (reports.data || []).forEach((r) => {
    const d = deals.get(r.deal_id);
    if (!d) return;   // no deal, no customer to match
    touch(r.owner_id, { contact_id: d.contact_id, title: d.title }, riyadhDate(r.contact_date), r.contact_type, 'contact report');
  });
  actRows.forEach((a) => {
    const who = ids.includes(a.owner_id) ? a.owner_id : a.user_id;
    const d = a.deal_id ? deals.get(a.deal_id) : null;
    const cid = a.contact_id || d?.contact_id || null;
    if (!cid && !d) return;
    touch(who, { contact_id: cid, title: d?.title }, activityVisitDate(a), a.type, 'activity');
  });

  const rows = [...groups.values()].map((g) => ({
    ...g,
    planStatus: g.open > 0 ? 'open' : 'became a deal',
    contacted: !!g.lastContact,
  })).sort((a, b) => (Number(a.contacted) - Number(b.contacted)) || (b.planned - a.planned));

  return { rows, failed: false };
}

/** Per person: plan customers, contacted, pending. */
export function summarisePlanContacts(rows) {
  const out = new Map();
  (rows || []).forEach((r) => {
    if (!out.has(r.ownerId)) out.set(r.ownerId, { customers: 0, contacted: 0, pending: 0 });
    const p = out.get(r.ownerId);
    p.customers += 1;
    if (r.contacted) p.contacted += 1; else p.pending += 1;
  });
  return out;
}
