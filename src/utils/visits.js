import { supabase } from 'lib/supabase';

/**
 * WHAT A VISIT IS — one definition for every screen that counts them.
 *
 *   contact_reports  contact_type = 'visit', dated by contact_date (a date)
 *   activities       type = 'visit', dated by completed_at, else due_date,
 *                    else created_at
 *
 * Every date is a RIYADH calendar date: a visit logged at 01:30 on the 1st is
 * the 1st, not the last day of the month before, which is what a UTC slice of
 * the timestamp would say.
 *
 * SCOPE IS FILTERED IN THE QUERY. `ownerIds` is the page's own scope —
 * himself for a salesman, himself and his team for a supervisor, the company
 * for a manager and above — and both reads ask only for those ids. That is
 * what keeps a salesman's request to his own rows: the activities policy
 * enforces the hierarchy, but the contact_reports policy today is
 * company-wide (11 Oct 2026; to be tightened in the database session), so the
 * query is the only thing narrowing it. Do not drop the owner filter.
 *
 * READ-ONLY. Logging a visit goes through the existing modals
 * (ContactReportModal, LogActivityModal); see components/LogVisit.jsx.
 */

const RIYADH = 'Asia/Riyadh';
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: RIYADH, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** yyyy-MM-dd in Riyadh. A bare date is already a calendar date and is kept. */
export function riyadhDate(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : fmt.format(d);
}

/** Today in Riyadh, yyyy-MM-dd. */
export const riyadhToday = (now = new Date()) => fmt.format(now);

/** yyyy-MM of a yyyy-MM-dd. */
const ym = (d) => String(d || '').slice(0, 7);

/** The month before a yyyy-MM. */
export function prevMonth(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The date an activity counts on: completed, else due, else created. */
export const activityVisitDate = (a) => riyadhDate(a?.completed_at || a?.due_date || a?.created_at);

/**
 * Every visit by the people in scope, up to `until` (yyyy-MM-dd, inclusive).
 * No lower bound: "last visit" is over all time, and visits are few.
 *
 * @returns {{ rows: object[], failed: boolean }}
 *   rows: { id, personId, date, customer, outcome, notes, source }
 */
export async function fetchVisits({ companyId, ownerIds, until = null }) {
  if (!companyId || !ownerIds?.length) return { rows: [], failed: false };
  const ids = [...new Set(ownerIds.filter(Boolean))];
  const idList = ids.join(',');

  let crq = supabase.from('contact_reports')
    .select('id, owner_id, deal_id, contact_date, customer_response, next_action, notes')
    .eq('company_id', companyId)
    .eq('contact_type', 'visit')
    .in('owner_id', ids);
  if (until) crq = crq.lte('contact_date', until);

  const acq = supabase.from('activities')
    .select('id, owner_id, user_id, contact_id, deal_id, title, description, outcome, next_action, completed_at, due_date, created_at')
    .eq('company_id', companyId)
    .eq('type', 'visit')
    .or(`owner_id.in.(${idList}),user_id.in.(${idList})`);

  const [cr, ac] = await Promise.all([crq, acq]);
  if (cr.error || ac.error) {
    console.error('fetchVisits:', cr.error || ac.error);
    return { rows: [], failed: true };
  }

  // Customer names: through the deal for a contact report (it has no
  // contact_id), through the contact for an activity.
  const reports = cr.data || [];
  const acts = (ac.data || []).filter((a) => !until || (activityVisitDate(a) || '') <= until);
  const dealIds = [...new Set([...reports, ...acts].map((r) => r.deal_id).filter(Boolean))];
  const deals = new Map();
  if (dealIds.length) {
    const { data } = await supabase.from('deals').select('id, title, contact_id').in('id', dealIds);
    (data || []).forEach((d) => deals.set(d.id, d));
  }
  const contactIds = [...new Set([
    ...acts.map((a) => a.contact_id),
    ...[...deals.values()].map((d) => d.contact_id),
  ].filter(Boolean))];
  const contacts = new Map();
  if (contactIds.length) {
    const { data } = await supabase.from('contacts')
      .select('id, company_name, first_name, last_name').in('id', contactIds);
    (data || []).forEach((c) => contacts.set(c.id, c.company_name
      || [c.first_name, c.last_name].filter(Boolean).join(' ')));
  }
  const viaDeal = (dealId) => {
    const d = dealId ? deals.get(dealId) : null;
    return d ? (contacts.get(d.contact_id) || d.title || null) : null;
  };

  const rows = [
    ...reports.map((r) => ({
      id: `cr:${r.id}`,
      personId: r.owner_id,
      date: riyadhDate(r.contact_date),
      customer: viaDeal(r.deal_id) || '—',
      outcome: r.customer_response || null,
      notes: [r.next_action && `Next: ${r.next_action}`, r.notes].filter(Boolean).join(' · ') || null,
      source: 'contact report',
    })),
    ...acts.map((a) => ({
      id: `ac:${a.id}`,
      personId: ids.includes(a.owner_id) ? a.owner_id : a.user_id,
      date: activityVisitDate(a),
      customer: contacts.get(a.contact_id) || viaDeal(a.deal_id) || a.title || '—',
      outcome: a.outcome || null,
      notes: [a.description, a.next_action && `Next: ${a.next_action}`].filter(Boolean).join(' · ') || null,
      source: 'activity',
    })),
  ].filter((r) => r.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  return { rows, failed: false };
}

/**
 * Per person: visits in `monthKey`, in the month before it, and the latest
 * visit date ever. People with no visits get zeros and lastVisit null — which
 * the screen reads as "none logged", never as missing data.
 */
export function summariseVisits(rows, personIds, monthKey) {
  const last = prevMonth(monthKey);
  const out = new Map();
  (personIds || []).forEach((id) => out.set(id, { thisMonth: 0, lastMonth: 0, lastVisit: null, rows: [] }));
  (rows || []).forEach((r) => {
    if (!out.has(r.personId)) return;
    const p = out.get(r.personId);
    if (ym(r.date) === monthKey) p.thisMonth += 1;
    if (ym(r.date) === last) p.lastMonth += 1;
    if (!p.lastVisit || r.date > p.lastVisit) p.lastVisit = r.date;
    p.rows.push(r);
  });
  return out;
}
