import { supabase } from 'lib/supabase';
import { isAchievedDeal, achievedAmount } from 'utils/planningCalculations';
import { customerKey, rankGapClosers } from 'utils/planningDrill';

/**
 * WHICH CUSTOMERS WOULD CLOSE THE PLANNED GAP.
 *
 * The Planning page says "you are 300,000 short of the plan you need" and then
 * leaves the reader to work out who to call. This answers that: customers who
 * have actually bought in the last six months, are not already in somebody's
 * plan this month, and have no open deal due this month — ordered by what they
 * usually order, with the point marked where enough of them have been listed
 * to cover the gap.
 *
 * READ-ONLY. Nothing is added to any plan; the one action it offers is to open
 * the existing plan-item form with the fields filled in, and the person
 * confirms. A suggestion that writes itself is not a suggestion.
 *
 * SCOPE. `ownerIds` is the viewer's own scope, passed in — himself for a
 * salesman, his team for a supervisor — and every read here is filtered by it,
 * so this cannot surface a customer the viewer may not see. The one exception
 * is deliberate and narrow: whether a customer is ALREADY PLANNED is asked of
 * the whole company through a SECURITY DEFINER function that returns contact
 * ids and nothing else (see migrations/insights_rls.sql). Two salesmen
 * planning the same customer is exactly what this must prevent, and it cannot
 * be seen from inside one salesman's scope.
 */

const HISTORY_MONTHS = 6;

const monthKey = (d) => String(d).slice(0, 7);

/** yyyy-MM-dd, `n` whole months before the given yyyy-MM-dd. Local parts only. */
function monthsBefore(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const at = new Date(y, (m - 1) - n, d || 1);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/**
 * Contact ids already planned this month, company-wide.
 *
 * Through the SECURITY DEFINER function, with the same degrade the Customer
 * Master uses: a missing function must leave the marker empty rather than take
 * the feature down (the lesson of 1897c1a). When it degrades, the direct query
 * answers for whatever opportunities RLS lets this viewer read — narrower, so
 * the exclusion is weaker, never wider.
 */
export async function fetchPlannedContactIds({ companyId, monthStart, monthEnd }) {
  if (!companyId || !monthStart) return { ids: new Set(), degraded: false };
  try {
    const { data, error } = await supabase.rpc('planned_contacts_this_month', {
      p_company: companyId,
      p_month: monthStart,
    });
    if (!error && Array.isArray(data)) {
      return {
        ids: new Set(data
          .map((r) => (typeof r === 'string' ? r : r?.planned_contacts_this_month ?? r?.contact_id))
          .filter(Boolean)),
        degraded: false,
      };
    }
  } catch (e) {
    console.warn('gapCloser: planned_contacts_this_month unavailable:', e?.message);
  }

  const { data } = await supabase
    .from('opportunities')
    .select('contact_id')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .gte('expected_month', monthStart)
    .lte('expected_month', monthEnd);
  return {
    ids: new Set((data || []).map((o) => o.contact_id).filter(Boolean)),
    degraded: true,
  };
}

/**
 * WHO ELSE PLANNED EACH CUSTOMER THIS MONTH — for the DUPLICATE flag.
 *
 * Company-wide on purpose: two people planning one customer is the waste the
 * flag exists to show, and it cannot be seen from inside one person's scope.
 * It returns a map of customer → owner ids, and the UI decides what may be
 * said: a supervisor and above see the other person's name, a salesman is told
 * only that it is "another salesman" (planItemFlags does that, not this).
 *
 * The read is whatever `opportunities` RLS serves. Today that is company-wide,
 * which is what makes the flag work for everyone; if those policies are ever
 * narrowed to a team, this map narrows with them and the flag simply stops
 * firing across scopes. It will not start showing a name it should not.
 */
export async function fetchPlannedByCustomer({ companyId, monthStart, monthEnd, contactName }) {
  const out = new Map();
  if (!companyId || !monthStart) return out;
  const { data, error } = await supabase
    .from('opportunities')
    .select('owner_id, contact_id, customer_name')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .gte('expected_month', monthStart)
    .lte('expected_month', monthEnd);
  if (error) {
    console.warn('gapCloser: plan items for the duplicate check unavailable:', error.message);
    return out;
  }
  (data || []).forEach((o) => {
    const key = customerKey(o, contactName);
    if (!out.has(key)) out.set(key, []);
    const list = out.get(key);
    if (o.owner_id && !list.includes(o.owner_id)) list.push(o.owner_id);
  });
  return out;
}

/**
 * The gap closer, for one scope and one month.
 *
 * @param {string}   companyId
 * @param {string[]} ownerIds    the viewer's scope
 * @param {string}   monthStart  yyyy-MM-dd
 * @param {string}   monthEnd    yyyy-MM-dd
 * @param {number}   gap         the Planned gap the cards show
 * @param {object[]} users       for the "last salesman" column
 */
export async function computeGapCloser({
  companyId, ownerIds, monthStart, monthEnd, gap, users = [],
}) {
  const empty = {
    rows: [], gap: gap || 0, closesAt: 0, total: 0, degraded: false,
    verdict: 'No gap: the plan and the funnel already cover what is required.',
    history: new Map(),
  };
  if (!companyId || !ownerIds?.length) return empty;

  const since = monthsBefore(monthStart, HISTORY_MONTHS);

  const [dealsRes, plannedRes, openRes, contactsRes] = await Promise.all([
    // INVOICED history, by the shared rule — the same columns Achieved is read
    // from, so "has bought" here means exactly what Achieved means everywhere.
    supabase.from('deals')
      .select('id, title, contact_id, owner_id, stage, amount, final_amount, is_invoiced, invoice_date')
      .eq('company_id', companyId)
      .in('owner_id', ownerIds)
      .eq('stage', 'won')
      .eq('is_invoiced', true)
      .gte('invoice_date', since)
      .lt('invoice_date', monthStart),
    fetchPlannedContactIds({ companyId, monthStart, monthEnd }),
    // An open deal already due this month is coverage the funnel card counts;
    // suggesting that customer again would be double-planning.
    supabase.from('deals')
      .select('contact_id, title, expected_close_date')
      .eq('company_id', companyId)
      .in('owner_id', ownerIds)
      .not('stage', 'in', '("won","lost")')
      .gte('expected_close_date', monthStart)
      .lte('expected_close_date', monthEnd),
    supabase.from('contacts')
      .select('id, company_name, first_name, last_name, owner_id')
      .in('owner_id', ownerIds),
  ]);

  if (dealsRes.error) {
    console.error('gapCloser deals:', dealsRes.error);
    return { ...empty, failed: true, verdict: 'Suggestions could not be read.' };
  }

  const contactName = new Map();
  (contactsRes.data || []).forEach((c) => {
    const nm = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ');
    if (nm) contactName.set(c.id, nm);
  });

  // ── the history, per customer ─────────────────────────────────────────────
  // Only invoiced-and-won rows count, and the value is final_amount ?? amount:
  // the shared definition, not a second one.
  const hist = new Map();
  // Keyed by customerKey WITH the contact names, so an invoice that carries a
  // contact and a plan item that carries only a typed name land on the same
  // customer. Without the names the two never meet; see customerKey.
  (dealsRes.data || []).forEach((d) => {
    // Won, invoiced, dated — the shared rule — and strictly BEFORE the month
    // being planned: history is what they bought already, not what they are
    // buying now.
    if (!isAchievedDeal(d, { start: since })) return;
    if (String(d.invoice_date).slice(0, 10) >= monthStart) return;
    const key = customerKey(d, contactName);
    if (!hist.has(key)) {
      hist.set(key, {
        key,
        contactId: d.contact_id || null,
        customer: (d.contact_id && contactName.get(d.contact_id)) || d.title || '—',
        total: 0,
        monthsSet: new Set(),
        lastInvoice: null,
        lastOwner: null,
      });
    }
    const h = hist.get(key);
    h.total += achievedAmount(d);
    h.monthsSet.add(monthKey(d.invoice_date));
    if (!h.lastInvoice || d.invoice_date > h.lastInvoice) {
      h.lastInvoice = d.invoice_date;
      h.lastOwner = d.owner_id;
    }
  });

  const history = new Map();
  hist.forEach((h, key) => {
    history.set(key, {
      months: h.monthsSet.size,
      usualOrder: h.monthsSet.size ? h.total / h.monthsSet.size : 0,
      lastInvoice: h.lastInvoice,
    });
  });

  // ── the exclusions ────────────────────────────────────────────────────────
  const plannedIds = plannedRes.ids || new Set();
  // The same key function, so "already has a deal due this month" is matched
  // against the same notion of a customer the history is keyed by.
  const dueThisMonth = new Set();
  (openRes.data || []).forEach((d) => { dueThisMonth.add(customerKey(d, contactName)); });

  const nameOfUser = (id) => (users || []).find((u) => u.id === id)?.full_name || '—';

  const candidates = [...hist.values()]
    .filter((h) => {
      if (h.contactId && plannedIds.has(h.contactId)) return false;
      if (dueThisMonth.has(h.key)) return false;
      return h.monthsSet.size > 0;
    })
    .map((h) => ({
      key: h.key,
      contactId: h.contactId,
      customer: h.customer,
      lastInvoice: h.lastInvoice,
      months: h.monthsSet.size,
      total: h.total,
      lastSalesman: nameOfUser(h.lastOwner),
    }));

  const ranked = rankGapClosers(candidates, gap || 0);
  return {
    ...ranked,
    degraded: plannedRes.degraded,
    excludedAlreadyPlanned: [...hist.values()]
      .filter((h) => h.contactId && plannedIds.has(h.contactId)).length,
    excludedDueThisMonth: [...hist.values()].filter((h) => dueThisMonth.has(h.key)).length,
    history,
    contactName,
  };
}

export { HISTORY_MONTHS };
