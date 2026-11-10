import {
  calcDivisionMetrics,
  groupByDivision,
  divisionRowOwners,
  COMPANY_SCOPE_ROLES,
  UNASSIGNED,
} from 'utils/salesDivisionMetrics';
import {
  isAchievedDeal,
  achievedAmount,
  targetRowValue,
  wonNotInvoicedExceptions,
  returnAmount,
} from 'utils/planningCalculations';
import {
  contributorIdsFrom,
  achieverIdsFrom,
} from 'utils/achieverScope';
import { rowInDivision, dealInDivision, primaryDivisionByUser } from 'utils/divisionMembership';
import { isConvertedWithDeal, isConvertedDealMissing, customerKey } from 'utils/planningDrill';
import { deadlineFor } from 'utils/planMonths';
import { riyadhDate, riyadhToday } from 'utils/visits';
import { parseInvoiceNumbers } from 'utils/invoiceNumber';
import {
  THRESHOLDS, RULE_SEVERITY, RULE_GROUP, SEVERITY_ORDER,
} from 'utils/salesMonitorThresholds';

/**
 * SALES MONITOR (session 34; CEO / Director Nader, 2026-11-10).
 *
 * One page to monitor sales and take decisions: target → plan → visits →
 * result, plus an exception feed. Every card opens a DrillSheet:
 * card → division → salesman → customer → the record.
 *
 * NOTHING HERE RE-DEFINES A SHARED FIGURE.
 *   Target, Achieved (net of returns), Won not invoiced, Planned (open),
 *   Required plan and the month's funnel are calcDivisionMetrics' — the
 *   Insights function, called with Insights' rows (utils/salesMonitorData.js),
 *   so the company totals here ARE the Insights totals.
 *   Achieved is isAchievedDeal / achievedAmount; converted is
 *   isConvertedWithDeal; the plan deadline is deadlineFor; a customer is
 *   customerKey; a Riyadh date is riyadhDate; an invoice number is
 *   parseInvoiceNumbers; won-not-invoiced staleness is
 *   wonNotInvoicedExceptions.
 *
 * WHAT IS NEW, defined once, here:
 *   PLANNED (card 2)   open + converted-with-deal plan value — the submission
 *                      gate's definition (fetchSubmissionPlanned), active
 *                      owners only (forward-looking).
 *   PLAN STATUS        per person, from plan_submissions (classifyPlanStatus).
 *   FROM PLAN          the month's invoiced deals (exactly the rows Achieved
 *                      summed) whose plan item belongs to THIS month's plan;
 *                      outside plan = the rest. from + outside − returns =
 *                      Achieved. (Planning's Plan accuracy "from plan" asks a
 *                      different question — linked to ANY month's plan — and
 *                      is untouched.)
 *   PLAN OUTCOMES      Achieved / Bounced / Failed / Pending (planOutcome).
 *   VISITS             visits, calls and WhatsApps (contact reports and
 *                      activities), each with its customer and an in-plan tag.
 *   EXCEPTIONS         the rules in buildExceptions, thresholds in
 *                      utils/salesMonitorThresholds.js.
 */

/** Who may open the page. Salesmen do not (CEO, 2026-11-10). */
export const SALES_MONITOR_ROLES = ['director', 'head', 'admin', 'manager', 'supervisor'];
/** Who gets the division picker (the whole company is in their scope). */
export const MONITOR_PICKER_ROLES = COMPANY_SCOPE_ROLES;

/** What counts as a contact with a customer on this page. */
export const CONTACT_KINDS = ['visit', 'call', 'whatsapp'];
export const ACTIVITY_CONTACT_KINDS = CONTACT_KINDS;
export const CONTACT_KIND_LABEL = { visit: 'Visit', call: 'Call', whatsapp: 'WhatsApp' };

/**
 * An activity's outcome on the contact-report scale. Contact reports already
 * say positive / neutral / negative; activities have four outcomes of their
 * own, and "needs follow-up" is neither good nor bad news.
 */
export const ACTIVITY_RESPONSE = {
  positive: 'positive', neutral: 'neutral', followup: 'neutral', not_interested: 'negative',
};

export const OUTCOME = {
  achieved: 'Achieved', bounced: 'Bounced', failed: 'Failed', pending: 'Pending',
};
export const OUTCOME_ORDER = [OUTCOME.achieved, OUTCOME.bounced, OUTCOME.failed, OUTCOME.pending];
/** One line per label, for the tooltips (CEO wording, 2026-11-10). */
export const OUTCOME_HELP = {
  [OUTCOME.achieved]: 'Invoiced in the plan month',
  [OUTCOME.bounced]: 'Moved to or closed in a later month',
  [OUTCOME.failed]: 'Lost, or never converted by month end',
  [OUTCOME.pending]: 'Month not over, not yet resolved',
};
/** The labels a month shows: Pending only while the month is not over. */
export const outcomeLabelsFor = (closed) => OUTCOME_ORDER.filter((l) => !closed || l !== OUTCOME.pending);

export const PLAN_STATUS = {
  onTime: 'submitted on time',
  late: 'submitted late',
  missing: 'not submitted',
  approved: 'approved',
  rejected: 'rejected',
  pending: 'awaiting approval',
};

export const DEPARTED_ID = '__departed__';
const DEPARTED_NAME = 'People no longer active';
/** Selling managers with no target this month: one row, so Achieved still adds up. */
export const NO_TARGET_ID = '__no_target__';
const NO_TARGET_NAME = 'Selling without a target this month';
export const NO_CUSTOMER = 'customer not recorded';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sumBy = (rows, f) => (rows || []).reduce((s, r) => s + num(f(r)), 0);
const pct = (a, b) => (num(b) > 0 ? (num(a) / num(b)) * 100 : null);
const dayLabel = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : '—';
};
const monthLabel = (d) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(d || ''));
  return m ? MONTHS[Number(m[2]) - 1] : '—';
};
const parts = (s) => String(s).slice(0, 10).split('-').map(Number);
export function addDays(ymd, n) {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
const weekday = (ymd) => { const [y, m, d] = parts(ymd); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const RIYADH_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false,
});
const riyadhTime = (v) => {
  if (!v || /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : RIYADH_TIME.format(d);
};
export const riyadhHour = (now) => Number(RIYADH_TIME.format(now).slice(0, 2));
const wonDateOf = (d) => d?.closed_at || d?.stage_changed_at || null;

/* ── plan status ─────────────────────────────────────────────────────────── */

/**
 * One person's plan status for the month, from their plan_submissions row.
 *
 *   submitted   is_submitted, on time unless is_late
 *   missing     no row, or a row the deadline checker wrote (is_submitted false)
 *   approval    approved / rejected / awaiting approval — the approval queue's
 *               own column; a resubmission after a rejection resets it to
 *               pending, so "rejected" means rejected and not resubmitted.
 */
export function classifyPlanStatus(sub) {
  if (!sub || !sub.is_submitted) {
    return { submitted: false, timing: PLAN_STATUS.missing, approval: null, label: PLAN_STATUS.missing };
  }
  const timing = sub.is_late ? PLAN_STATUS.late : PLAN_STATUS.onTime;
  const approval = sub.approval_status === 'approved'
    ? PLAN_STATUS.approved
    : sub.approval_status === 'rejected' ? PLAN_STATUS.rejected : PLAN_STATUS.pending;
  return { submitted: true, timing, approval, label: `${timing} · ${approval}` };
}

/* ── plan outcomes ───────────────────────────────────────────────────────── */

/**
 * WHAT BECAME OF ONE PLAN ITEM — the CEO-approved labels.
 *
 *   Achieved  its deal was invoiced with invoice_date in the plan month (an
 *             invoice dated BEFORE the month also counts, and says so).
 *   Bounced   moved to a later month (status moved_to_future, or logged as a
 *             bounce in the month and now dated later), or its deal was won /
 *             invoiced only after the month ended, or is still open after it.
 *             `detail` says where it went: "→ Dec", "invoiced 1 Nov".
 *   Failed    its deal was lost, or the month ended with the item never
 *             converted (including a conversion whose deal no longer exists).
 *   Pending   the month is not over and none of the above has happened yet.
 *
 * Decided in that order: the deal first (it is the strongest evidence), then
 * the move, then the item's own status.
 *
 * @param {object}  o          an opportunities row
 * @param {object}  ctx
 * @param {object}  ctx.deal   the deal it became, or null
 * @param {boolean} ctx.closed true once the plan month has ended (Riyadh)
 * @param {string}  ctx.monthStart / ctx.monthEnd  yyyy-MM-dd
 * @param {string}  [ctx.destination]  yyyy-MM-dd of the month the work moved to
 */
export function planOutcome(o, {
  deal = null, closed = false, monthStart, monthEnd, destination = null,
}) {
  if (deal) {
    if (isAchievedDeal(deal, { start: monthStart, end: monthEnd })) {
      return { label: OUTCOME.achieved, detail: `invoiced ${dayLabel(deal.invoice_date)}`, invoicedInMonth: true };
    }
    if (isAchievedDeal(deal, {})) {
      const day = String(deal.invoice_date).slice(0, 10);
      if (day > monthEnd) return { label: OUTCOME.bounced, detail: `invoiced ${dayLabel(day)}` };
      return { label: OUTCOME.achieved, detail: `invoiced ${dayLabel(day)}, before the plan month`, invoicedInMonth: false };
    }
    if (deal.stage === 'won') {
      const won = dayLabel(riyadhDate(wonDateOf(deal)));
      return closed
        ? { label: OUTCOME.bounced, detail: `won ${won}, not invoiced yet` }
        : { label: OUTCOME.pending, detail: `won ${won}, awaiting invoice` };
    }
    if (deal.stage === 'lost') {
      const why = deal.lost_reason || deal.lost_reason_code || null;
      return { label: OUTCOME.failed, detail: why ? `lost: ${why}` : 'lost' };
    }
    return closed
      ? { label: OUTCOME.bounced, detail: `deal still open${deal.expected_close_date ? `, due ${dayLabel(deal.expected_close_date)}` : ''}` }
      : { label: OUTCOME.pending, detail: `deal open (${deal.stage})` };
  }
  if (o.movedOutOfMonth || o.status === 'moved_to_future') {
    const to = destination || (o.movedOutOfMonth ? o.expected_month : null);
    return { label: OUTCOME.bounced, detail: to ? `→ ${monthLabel(to)}` : '→ a later month' };
  }
  if (isConvertedDealMissing(o)) {
    return closed
      ? { label: OUTCOME.failed, detail: 'converted, deal no longer exists' }
      : { label: OUTCOME.pending, detail: 'converted, deal no longer exists' };
  }
  return closed
    ? { label: OUTCOME.failed, detail: 'never converted' }
    : { label: OUTCOME.pending, detail: 'open, not yet converted' };
}

/* ── the model ───────────────────────────────────────────────────────────── */

/**
 * Every figure on the page, from the rows loadSalesMonitor returned.
 *
 * @param {object} raw            loadSalesMonitor()'s result
 * @param {object} opts
 * @param {string} [opts.divisionId]  the division picker; null = everything in scope
 * @param {string} [opts.visitDay]    yyyy-MM-dd; default today, or the month's last day
 */
export function computeSalesMonitor(raw, { divisionId = null, visitDay = null } = {}) {
  const now = raw.now || new Date();
  const today = riyadhToday(now);
  const { monthStart, monthEnd } = raw;
  const closed = monthEnd < today;
  const isCurrent = monthStart <= today && today <= monthEnd;
  const cutoff = closed ? monthEnd : (isCurrent ? today : monthStart);
  const day = visitDay && visitDay >= monthStart && visitDay <= monthEnd
    ? visitDay
    : (isCurrent ? today : monthEnd);

  const users = raw.users || [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const nameOf = (id) => (id === DEPARTED_ID ? DEPARTED_NAME : id === NO_TARGET_ID ? NO_TARGET_NAME : userById.get(id)?.full_name || 'Unknown');
  const isActive = (id) => userById.get(id)?.is_active !== false;
  const contactName = new Map((raw.contacts || []).map((c) => [
    c.id, c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
  ]).filter(([, nm]) => nm));
  const allDeals = raw.allDeals || raw.deals || [];
  const dealById = new Map([...allDeals, ...(raw.lookupDeals || [])].map((d) => [d.id, d]));
  const divisions = raw.divisions || [];
  const divName = (id) => (id === UNASSIGNED || !id ? 'Unassigned' : divisions.find((d) => d.id === id)?.name || 'Unassigned');
  const primaryByUser = primaryDivisionByUser(users);
  const knownDivision = (id) => (id && divisions.some((d) => d.id === id) ? id : UNASSIGNED);

  // ── groups, exactly as Insights forms them ──
  const allGroups = groupByDivision({
    users, divisions, scopeIds: raw.scopeIds || [],
    additionalByUser: raw.additionalByUser || {},
    rowOwners: divisionRowOwners({
      users, deals: raw.deals, returns: raw.returns, opps: raw.opps,
      futureOrders: raw.futureOrders, targets: raw.targets,
    }),
  });
  const touched = allGroups.filter((g) => (g.userIds || []).length > 0);
  const groups = touched.length ? touched : allGroups;
  const picked = divisionId ? groups.find((g) => g.id === divisionId) || null : null;
  const viewIds = picked ? picked.userIds : (raw.scopeIds || []);
  const viewSet = new Set(viewIds);
  const dataFor = (ids, extra = {}) => calcDivisionMetrics(ids, { ...raw, divisionId: picked ? picked.id : null, ...extra });

  // THE PAGE TOTAL: Insights' company figure, or its division figure.
  const metrics = picked
    ? calcDivisionMetrics(picked.userIds, { ...raw, divisionId: picked.id, divisionRow: true })
    : calcDivisionMetrics(viewIds, { ...raw, divisionId: null });

  const planInView = rowInDivision(picked?.id || null, { primaryByUser });
  const dealInView = dealInDivision(picked?.id || null);

  // ── people ──
  const viewUsers = users.filter((u) => viewSet.has(u.id));
  const activeAchievers = achieverIdsFrom(viewUsers);              // active only
  const allAchievers = achieverIdsFrom(viewUsers, { includeInactive: true });
  const contributorRoles = new Set(contributorIdsFrom(viewUsers)); // active salesmen + supervisors
  const departedAchievers = allAchievers.filter((id) => !isActive(id));
  // WHO IS A SALESMAN ON THIS PAGE (follow-up, 2026-11-10): every active
  // salesman and supervisor, plus anyone else whose target counts (a manager
  // flagged as selling, e.g. Mohamed Kamal) WHEN HE CARRIES A TARGET FOR THE
  // MONTH. Their plan items count in Planned, the outcomes and from-plan,
  // their plan status comes from plan_submissions, and they get a row.
  // The target is Insights' own per-person figure for the month.
  const targetPer = metrics.drill.targetPerPerson || {};
  const carriesTarget = (id) => num(targetPer[id]) > 0;
  const planPeople = activeAchievers.filter((id) => contributorRoles.has(id) || carriesTarget(id));
  const contributors = new Set(planPeople);                         // the plan-holders
  // A selling manager with NO target this month stays off the plan side. His
  // invoices still count in Achieved (Insights' rule), so they get one
  // combined row rather than vanishing from the scoreboard's sum.
  const noTargetSellers = activeAchievers.filter((id) => !contributors.has(id));
  const personIds = planPeople
    .slice()
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  // ── plan items of the month ──
  // Over the plan-holders, departed included — the people the scoreboard
  // lists by name — so the outcome rows add up to the card. A manager with no
  // target (selling or not) belongs to nobody on the board and is left out.
  const achieverSet = new Set([...planPeople, ...departedAchievers]);
  const planItems = (raw.planItems || [])
    .filter((o) => viewSet.has(o.owner_id) && achieverSet.has(o.owner_id))
    .filter(planInView);
  // Open plan of active people left out above — the whole of the difference
  // between this page's open Planned and Insights' (which counts every
  // active achiever's open items).
  const openLeftOut = sumBy((raw.planItems || []).filter((o) => !o.movedOutOfMonth
    && noTargetSellers.includes(o.owner_id) && (o.status || 'open') === 'open').filter(planInView), (o) => o.planned_amount);
  const inMonthItems = planItems.filter((o) => !o.movedOutOfMonth);
  const keyOf = (ownerId, row) => `${ownerId}|${customerKey(row, contactName)}`;
  const customerOf = (row) => (row?.contact_id && contactName.get(row.contact_id)) || row?.customer_name || row?.title || '—';
  const futurePushes = raw.futurePushes || [];
  const destinationOf = (o) => {
    const linked = futurePushes.filter((f) => f.opportunity_id === o.id);
    const pool = linked.length ? linked : futurePushes.filter((f) => f.owner_id === o.owner_id
      && keyOf(f.owner_id, f) === keyOf(o.owner_id, o));
    if (!pool.length) return null;
    return pool.map((f) => f.expected_month).sort()[0];
  };

  const itemRows = planItems.map((o) => {
    const deal = o.deal_id ? dealById.get(o.deal_id) || null : null;
    const out = planOutcome(o, {
      deal, closed, monthStart, monthEnd, destination: o.status === 'moved_to_future' || o.movedOutOfMonth ? destinationOf(o) : null,
    });
    const invoiced = out.label === OUTCOME.achieved && deal ? achievedAmount(deal) : 0;
    return {
      oppId: o.id,
      dealId: deal?.id || null,
      ownerId: o.owner_id,
      person: nameOf(o.owner_id),
      divisionId: knownDivision(o.division_id),
      customer: customerOf(o),
      customerKey: keyOf(o.owner_id, o),
      planned: num(o.planned_amount),
      status: o.status || 'open',
      outcome: out.label,
      detail: out.detail,
      invoiced,
      invoicedInMonth: !!out.invoicedInMonth,
      bounces: num(o.bounce_count),
      expectedMonth: o.expected_month,
      movedOutOfMonth: !!o.movedOutOfMonth,
      deal,
      item: o,
    };
  });
  const outcomeOfItem = new Map(itemRows.map((r) => [r.oppId, r]));

  // CARD 2 rows ("Plan now"): open + converted-with-deal, in the month, over
  // the ACTIVE plan-holders. Insights' Planned counts open items of every
  // active achiever; the two differ by converted-with-deal items and by
  // `openLeftOut` (selling managers with no target this month).
  const forwardSet = new Set(planPeople);
  const plannedRows = itemRows.filter((r) => !r.movedOutOfMonth && forwardSet.has(r.ownerId)
    && (r.status === 'open' || isConvertedWithDeal(r.item)));

  // Plan customers (open or converted this month), for the in-plan tag.
  const planCustomers = new Map();
  itemRows.filter((r) => !r.movedOutOfMonth && (r.status === 'open' || r.status === 'converted'))
    .forEach((r) => {
      if (!planCustomers.has(r.customerKey)) {
        planCustomers.set(r.customerKey, {
          key: r.customerKey, ownerId: r.ownerId, customer: r.customer, planned: 0, items: [], firstPlanned: null,
        });
      }
      const g = planCustomers.get(r.customerKey);
      g.planned += r.planned;
      g.items.push(r);
      const created = riyadhDate(r.item.created_at) || monthStart;
      if (!g.firstPlanned || created < g.firstPlanned) g.firstPlanned = created;
    });

  // ── contacts: visits, calls, WhatsApps ──
  const contactRows = [
    ...(raw.contactReports || []).map((r) => {
      const deal = r.deal_id ? dealById.get(r.deal_id) || null : null;
      const customerId = r.contact_id || deal?.contact_id || null;
      return {
        id: `cr:${r.id}`, source: 'contact report', kind: r.contact_type, ownerId: r.owner_id,
        date: riyadhDate(r.contact_date),
        time: riyadhDate(r.created_at) === riyadhDate(r.contact_date) ? riyadhTime(r.created_at) : null,
        customerId, dealId: deal?.id || r.deal_id || null, dealTitle: deal?.title || null,
        response: r.customer_response || null,
        nextAction: r.next_action || null,
        notes: r.notes || null,
        viaReportContact: !!r.contact_id,
      };
    }),
    ...(raw.activities || []).map((a) => {
      const deal = a.deal_id ? dealById.get(a.deal_id) || null : null;
      const ownerId = viewSet.has(a.owner_id) || (raw.scopeIds || []).includes(a.owner_id) ? a.owner_id : a.user_id;
      const when = a.completed_at || a.due_date || a.created_at;
      return {
        id: `ac:${a.id}`, source: 'activity', kind: a.type, ownerId,
        date: riyadhDate(when), time: riyadhTime(when),
        customerId: a.contact_id || deal?.contact_id || null,
        dealId: deal?.id || a.deal_id || null, dealTitle: deal?.title || null,
        response: ACTIVITY_RESPONSE[a.outcome] || null,
        nextAction: a.next_action || null,
        notes: a.description || null,
        viaReportContact: false,
      };
    }),
  ].filter((c) => c.date && viewSet.has(c.ownerId) && c.date <= monthEnd)
    .map((c) => {
      const known = !!(c.customerId || c.dealTitle);
      const customer = (c.customerId && contactName.get(c.customerId)) || c.dealTitle || NO_CUSTOMER;
      const key = known ? keyOf(c.ownerId, { contact_id: c.customerId, title: c.dealTitle }) : null;
      const plan = key ? planCustomers.get(key) || null : null;
      return {
        ...c,
        person: nameOf(c.ownerId),
        customer,
        customerKnown: known,
        customerKey: key,
        inPlan: !!plan,
        planValue: plan ? plan.planned : 0,
        planOutcome: plan ? [...new Set(plan.items.map((i) => i.outcome))].join(' / ') : null,
        kindLabel: CONTACT_KIND_LABEL[c.kind] || c.kind,
      };
    })
    .sort((a, b) => (b.date.localeCompare(a.date)) || String(b.time || '').localeCompare(String(a.time || '')));

  const inMonth = (c) => c.date >= monthStart && c.date <= cutoff;
  const mtdContacts = contactRows.filter(inMonth);
  const dayContacts = contactRows.filter((c) => c.date === day);
  const visitPeople = personIds.filter((id) => contributors.has(id));
  const lastContactOf = new Map();
  contactRows.forEach((c) => {
    if (!lastContactOf.has(c.ownerId) || c.date > lastContactOf.get(c.ownerId)) lastContactOf.set(c.ownerId, c.date);
  });
  const responses = (rows) => ({
    positive: rows.filter((c) => c.response === 'positive').length,
    neutral: rows.filter((c) => c.response === 'neutral').length,
    negative: rows.filter((c) => c.response === 'negative').length,
    none: rows.filter((c) => !c.response).length,
  });
  const visitSummary = (rows) => ({
    count: rows.length,
    inPlan: rows.filter((c) => c.inPlan).length,
    inPlanPct: pct(rows.filter((c) => c.inPlan).length, rows.length),
    responses: responses(rows),
    noCustomer: rows.filter((c) => !c.customerKnown).length,
  });

  // Planned customers contacted (MTD) vs not.
  const planCustomerRows = [...planCustomers.values()]
    .filter((g) => isActive(g.ownerId))
    .map((g) => {
      const touches = contactRows.filter((c) => c.customerKey === g.key && c.date <= cutoff);
      const inMonthTouches = touches.filter(inMonth);
      const last = touches.length ? touches.map((c) => c.date).sort().pop() : null;
      return {
        ...g,
        person: nameOf(g.ownerId),
        visited: inMonthTouches.length > 0,
        contactsMtd: inMonthTouches.length,
        lastContact: last,
        outcome: [...new Set(g.items.map((i) => i.outcome))].join(' / '),
      };
    });

  // MTD grid: contacts per person per day, 1st → cutoff.
  const gridDays = [];
  for (let d = monthStart; d <= cutoff && gridDays.length < 31; d = addDays(d, 1)) gridDays.push(d);
  const grid = visitPeople.map((id) => ({
    id,
    name: nameOf(id),
    days: gridDays.map((d) => mtdContacts.filter((c) => c.ownerId === id && c.date === d).length),
    total: mtdContacts.filter((c) => c.ownerId === id).length,
  }));

  // ── per person ──
  const subs = raw.submissions;
  const subByOwner = new Map((subs || []).map((s) => [s.owner_id, s]));
  const fromPlanDealIds = new Set(inMonthItems.map((o) => o.deal_id).filter(Boolean));
  const splitInvoiced = (rows) => {
    const from = rows.filter((d) => fromPlanDealIds.has(d.id));
    const outside = rows.filter((d) => !fromPlanDealIds.has(d.id));
    return {
      fromRows: from, outsideRows: outside,
      fromPlan: sumBy(from, achievedAmount), outsidePlan: sumBy(outside, achievedAmount),
    };
  };
  const outcomeCounts = (rows) => {
    const out = {};
    OUTCOME_ORDER.forEach((l) => {
      const mine = rows.filter((r) => r.outcome === l);
      out[l] = { count: mine.length, value: sumBy(mine, (r) => r.planned), invoiced: sumBy(mine, (r) => r.invoiced) };
    });
    const plannedValue = sumBy(rows, (r) => r.planned);
    out.total = { count: rows.length, value: plannedValue };
    out.achievedFromPlanPct = pct(out[OUTCOME.achieved].invoiced, plannedValue);
    return out;
  };

  const personFigures = (id, m) => {
    const isDeparted = id === DEPARTED_ID || id === NO_TARGET_ID;
    const owners = id === DEPARTED_ID ? new Set(departedAchievers)
      : id === NO_TARGET_ID ? new Set(noTargetSellers) : new Set([id]);
    const myPlanned = plannedRows.filter((r) => owners.has(r.ownerId));
    const myItems = itemRows.filter((r) => owners.has(r.ownerId));
    const plannedTotal = sumBy(myPlanned, (r) => r.planned);
    const split = splitInvoiced(m.drill.invoicedRows || []);
    const sub = isDeparted ? null : subByOwner.get(id) || null;
    const planStatus = !isDeparted && contributors.has(id) && subs ? classifyPlanStatus(sub) : null;
    const requiredOf = isDeparted || !contributors.has(id) || !subs
      ? { value: null, source: null }
      : sub?.is_submitted
        ? { value: num(sub.required_plan), source: 'submitted' }
        : { value: num(m.requiredRaw), source: 'estimated' };
    const wni = (m.drill.wonNotInvoicedRows || []);
    const myContacts = mtdContacts.filter((c) => owners.has(c.ownerId));
    const openPlan = num(m.planned);
    const funnel = num(m.monthFunnel);
    const gap = Math.max(0, num(m.target) - num(m.achieved));
    return {
      id,
      name: nameOf(id),
      role: isDeparted ? null : userById.get(id)?.role,
      divisionId: isDeparted ? null : knownDivision(primaryByUser[id]),
      division: isDeparted ? '—' : divName(knownDivision(primaryByUser[id])),
      target: m.target,
      achieved: m.achieved,
      achievedPct: pct(m.achieved, m.target),
      // REQUIRED, per person, from ONE source each (never mixed):
      //   submitted  the plan's own required_plan, frozen when it was filed
      //   estimated  no submitted plan: today's gap to target ÷ the person's
      //              conversion rate — Planning's rule (computeRequiredRaw over
      //              calcDivisionMetrics' deficit and pickConversion rate)
      requiredPlan: requiredOf.value,
      requiredSource: requiredOf.source,
      planned: plannedTotal,
      // "Submitted": what the plan said when it was filed (its own total_planned);
      // null when nothing was submitted. "Plan now" is `planned` above.
      submittedPlanned: sub?.is_submitted ? num(sub.total_planned) : null,
      plannedOpen: openPlan,
      plannedPctOfTarget: pct(plannedTotal, m.target),
      plannedPctOfRequired: pct(plannedTotal, requiredOf.value),
      planStatus,
      submission: sub,
      fromPlan: split.fromPlan,
      outsidePlan: split.outsidePlan,
      returns: m.returnsTotal,
      outcomes: outcomeCounts(myItems),
      wonNotInvoiced: sumBy(wni, achievedAmount),
      wonNotInvoicedCount: wni.length,
      visitsMtd: myContacts.length,
      visitsMtdInPlanPct: pct(myContacts.filter((c) => c.inPlan).length, myContacts.length),
      lastVisit: isDeparted ? null : lastContactOf.get(id) || null,
      // (open deals due in the month + open plan) ÷ what is still missing.
      coverageRatio: gap > 0 ? (funnel + openPlan) / gap : null,
      coverageMet: gap <= 0 && num(m.target) > 0,
      metrics: m,
    };
  };

  const people = personIds.map((id) => personFigures(id, dataFor([id])));
  // The departed, as ONE unnamed-by-default row, so the rows still add to the
  // company total (their Target and Achieved are history and count).
  if (departedAchievers.length) {
    const dm = dataFor(departedAchievers);
    const hasAny = num(dm.target) || num(dm.achieved) || itemRows.some((r) => departedAchievers.includes(r.ownerId));
    if (hasAny) people.push(personFigures(DEPARTED_ID, dm));
  }
  if (noTargetSellers.length) {
    const nm = dataFor(noTargetSellers);
    const wniNt = sumBy(nm.drill.wonNotInvoicedRows || [], achievedAmount);
    if (num(nm.achieved) || num(nm.target) || wniNt) people.push(personFigures(NO_TARGET_ID, nm));
  }

  // ── the cards ──
  const split = splitInvoiced(metrics.drill.invoicedRows || []);
  const plannedTotal = sumBy(plannedRows, (r) => r.planned);
  const planHolders = personIds.filter((id) => contributors.has(id));
  const statusOf = (id) => classifyPlanStatus(subByOwner.get(id));
  const planStatusRows = subs ? planHolders.map((id) => {
    const s = subByOwner.get(id) || null;
    const st = statusOf(id);
    return {
      personId: id,
      person: nameOf(id),
      divisionId: knownDivision(primaryByUser[id]),
      status: st.label,
      timing: st.timing,
      approval: st.approval || '—',
      submittedAt: s?.submitted_at || null,
      deadline: s?.deadline_date || deadlineFor(monthStart),
      totalPlanned: s?.is_submitted ? num(s.total_planned) : null,
      requiredAtSubmit: s?.is_submitted ? num(s.required_plan) : null,
      rejection: s?.rejection_reason || null,
    };
  }) : [];
  const countStatus = (f) => planStatusRows.filter(f).length;

  const exceptions = buildExceptions({
    raw, now, today, monthStart, monthEnd, closed, isCurrent, cutoff,
    viewSet, isActive, nameOf, contributors: visitPeople, people, itemRows, planCustomerRows,
    contactRows, mtdContacts, subByOwner, subsLoaded: !!subs, planHolders, dealInView,
    divName, knownDivision, primaryByUser,
  });
  const excByOwner = new Map();
  exceptions.forEach((e) => { if (e.ownerId) excByOwner.set(e.ownerId, (excByOwner.get(e.ownerId) || 0) + 1); });
  people.forEach((p) => {
    const group = p.id === DEPARTED_ID ? departedAchievers : p.id === NO_TARGET_ID ? noTargetSellers : [p.id];
    p.exceptions = group.reduce((s, id) => s + (excByOwner.get(id) || 0), 0);
  });

  const holderRows = people.filter((p) => p.requiredSource);
  const lineFor = (source) => {
    const rows = holderRows.filter((p) => p.requiredSource === source);
    const required = sumBy(rows, (p) => p.requiredPlan);
    const planNow = sumBy(rows, (p) => p.planned);
    return { count: rows.length, people: rows.map((p) => p.name), required, planNow, pct: pct(planNow, required) };
  };
  const requiredLines = subs ? { submitted: lineFor('submitted'), estimated: lineFor('estimated') } : null;

  const cards = {
    target: { total: metrics.target, span: metrics.targetSpan },
    planned: {
      total: plannedTotal,
      open: sumBy(plannedRows.filter((r) => r.status === 'open'), (r) => r.planned),
      converted: sumBy(plannedRows.filter((r) => r.status !== 'open'), (r) => r.planned),
      pctOfTarget: pct(plannedTotal, metrics.target),
      // Required, in two lines that are never added into one figure:
      required: requiredLines,
      // Insights' company "Required pipeline", for reconciliation only: the
      // company gap today ÷ the company conversion rate, in one step over
      // everyone whose target counts (departed included). It is not the sum
      // of anybody's plan, and the card no longer divides by it.
      companyRequired: {
        value: metrics.requiredRaw, target: metrics.target, achieved: metrics.achieved,
        gap: metrics.deficit, winRatePct: metrics.winRatePct, winRateSource: metrics.winRateSource,
      },
      // "Submitted": the plan-holders' filed total_planned, summed over those
      // who submitted. It does not follow the division picker below the
      // person: a submission is one person's whole month.
      submitted: subs ? sumBy(planHolders.map((id) => subByOwner.get(id)).filter((x) => x?.is_submitted), (x) => x.total_planned) : null,
      submittedPeople: subs ? planHolders.filter((id) => subByOwner.get(id)?.is_submitted).length : 0,
      planHolders: planHolders.length,
      // Open plan of selling managers with no target this month: counted by
      // Insights' Planned, not here.
      openLeftOut,
    },
    planStatus: {
      loaded: !!subs,
      people: planStatusRows.length,
      onTime: countStatus((r) => r.timing === PLAN_STATUS.onTime),
      late: countStatus((r) => r.timing === PLAN_STATUS.late),
      missing: countStatus((r) => r.timing === PLAN_STATUS.missing),
      approved: countStatus((r) => r.approval === PLAN_STATUS.approved),
      rejected: countStatus((r) => r.approval === PLAN_STATUS.rejected),
      pending: countStatus((r) => r.approval === PLAN_STATUS.pending),
    },
    achieved: {
      total: metrics.achieved,
      gross: metrics.achievedGross,
      returns: metrics.returnsTotal,
      pctOfTarget: pct(metrics.achieved, metrics.target),
      isCurrent,
      elapsedPct: isCurrent ? num(metrics.elapsed) * 100 : null,
      pacingOk: isCurrent ? metrics.pacingOk : null,
    },
    fromPlan: {
      fromPlan: split.fromPlan,
      outsidePlan: split.outsidePlan,
      returns: metrics.returnsTotal,
      achieved: metrics.achieved,
      fromPlanPct: pct(split.fromPlan, metrics.achievedGross),
    },
    outcomes: outcomeCounts(itemRows),
    visits: {
      day,
      today: visitSummary(dayContacts),
      mtd: visitSummary(mtdContacts),
      noVisit: visitPeople.filter((id) => !dayContacts.some((c) => c.ownerId === id)),
      plannedCustomers: planCustomerRows.length,
      plannedVisited: planCustomerRows.filter((g) => g.visited).length,
    },
    exceptions: {
      total: exceptions.length,
      high: exceptions.filter((e) => e.severity === 'high').length,
      medium: exceptions.filter((e) => e.severity === 'medium').length,
      low: exceptions.filter((e) => e.severity === 'low').length,
    },
    wonNotInvoiced: {
      total: sumBy(metrics.drill.wonNotInvoicedRows || [], achievedAmount),
      count: (metrics.drill.wonNotInvoicedRows || []).length,
    },
  };

  // A deal's customer: its contact by id first (the reads above already hold
  // every contact a deal points at), then the embedded contact, then its title.
  const customerOfDeal = (d) => (d?.contact_id && contactName.get(d.contact_id))
    || (d?.contacts && (d.contacts.company_name || [d.contacts.first_name, d.contacts.last_name].filter(Boolean).join(' ')))
    || d?.title || '—';

  const ctx = {
    customerOfDeal, raw, metrics, groups, picked, nameOf, divName, knownDivision, primaryByUser,
    itemRows, plannedRows, planStatusRows, split, contactRows, dayContacts, mtdContacts,
    exceptions, people, planCustomerRows,
  };

  return {
    monthStart, monthEnd, today, closed, isCurrent, cutoff, day,
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    division: picked ? { id: picked.id, name: picked.name } : null,
    metrics,
    cards,
    people,
    itemRows,
    plannedRows,
    planStatusRows,
    contactRows,
    dayContacts,
    mtdContacts,
    planCustomerRows,
    grid: { days: gridDays, rows: grid },
    noVisitPeople: cards.visits.noVisit.map((id) => ({ id, name: nameOf(id), lastVisit: lastContactOf.get(id) || null })),
    exceptions,
    outcomeOfItem,
    customerOfDeal,
    departedIds: departedAchievers,
    noTargetIds: noTargetSellers,
    contactIdColumn: raw.contactIdColumn !== false,
    notes: raw.notes || [],
    drills: buildDrills(ctx),
  };
}

/* ── exceptions ──────────────────────────────────────────────────────────── */

/**
 * The exception feed. Every item: { id, rule, group, severity, title, detail,
 * ownerId, owner, date, record }, where `record` says what clicking opens:
 * { kind: 'deal', dealId } | { kind: 'plan', oppId } | { kind: 'person', personId }.
 * Newest first within severity high → medium → low.
 */
export function buildExceptions(c) {
  const T = THRESHOLDS;
  const out = [];
  const add = (rule, key, e) => out.push({
    id: `${rule}:${key}`,
    rule,
    group: RULE_GROUP[rule],
    severity: RULE_SEVERITY[rule],
    owner: e.ownerId ? c.nameOf(e.ownerId) : '—',
    ...e,
  });
  const deals = (c.raw.allDeals || c.raw.deals || []).filter((d) => c.viewSet.has(d.owner_id)).filter(c.dealInView);
  const dealLabel = (d) => d?.title || 'Deal';

  // ── Plan ──
  if (c.subsLoaded) {
    const deadline = deadlineFor(c.monthStart);
    c.planHolders.forEach((id) => {
      const s = c.subByOwner.get(id) || null;
      const st = classifyPlanStatus(s);
      const due = s?.deadline_date || deadline;
      if (!st.submitted && c.today > due) {
        add('plan_not_submitted', id, {
          title: 'Plan not submitted by the deadline', detail: `deadline ${dayLabel(due)}`,
          ownerId: id, date: due, record: { kind: 'person', personId: id },
        });
      }
      if (st.submitted && num(s.required_plan) > 0 && num(s.total_planned) < num(s.required_plan)) {
        add('plan_below_required', id, {
          title: 'Plan below required',
          detail: `planned ${Math.round(num(s.total_planned)).toLocaleString('en-US')} of ${Math.round(num(s.required_plan)).toLocaleString('en-US')} required`,
          ownerId: id, date: riyadhDate(s.submitted_at) || due, record: { kind: 'person', personId: id },
        });
      }
      if (st.submitted && st.approval === PLAN_STATUS.pending && s.submitted_at) {
        const waited = daysBetween(riyadhDate(s.submitted_at), c.today);
        if (waited > T.approvalPendingDays) {
          add('plan_awaiting_approval', id, {
            title: `Plan awaiting approval ${waited} days`, detail: `submitted ${dayLabel(riyadhDate(s.submitted_at))}`,
            ownerId: id, date: riyadhDate(s.submitted_at), record: { kind: 'person', personId: id },
          });
        }
      }
      if (st.approval === PLAN_STATUS.rejected) {
        add('plan_rejected', id, {
          title: 'Plan rejected, not resubmitted', detail: s.rejection_reason || 'no reason recorded',
          ownerId: id, date: riyadhDate(s.updated_at) || riyadhDate(s.submitted_at) || due,
          record: { kind: 'person', personId: id },
        });
      }
    });
  }

  // ── Visits ──
  if (c.isCurrent) {
    const weekFrom = addDays(c.today, -(T.noVisitWeekDays - 1));
    const workday = !T.daysOff.includes(weekday(c.today));
    const afterHour = riyadhHour(c.now) >= T.noVisitTodayAfterHour;
    c.contributors.forEach((id) => {
      const mine = c.contactRows.filter((r) => r.ownerId === id);
      const week = mine.some((r) => r.date >= weekFrom && r.date <= c.today);
      if (!week) {
        add('no_visit_week', id, {
          title: `No visit, call or WhatsApp in ${T.noVisitWeekDays} days`,
          detail: (() => { const last = mine.map((r) => r.date).sort().pop(); return last ? `last ${dayLabel(last)}` : 'none logged'; })(),
          ownerId: id, date: c.today, record: { kind: 'person', personId: id },
        });
      } else if (workday && afterHour && !mine.some((r) => r.date === c.today)) {
        add('no_visit_today', id, {
          title: 'No visit logged today', detail: `after ${T.noVisitTodayAfterHour}:00 Riyadh`,
          ownerId: id, date: c.today, record: { kind: 'person', personId: id },
        });
      }
    });
    c.planCustomerRows
      .filter((g) => g.items.some((i) => i.outcome === OUTCOME.pending))
      .forEach((g) => {
        const since = g.lastContact || g.firstPlanned || c.monthStart;
        const silent = daysBetween(since, c.today);
        if (silent >= T.plannedCustomerSilentDays) {
          add('planned_customer_silent', g.key, {
            title: `Planned customer not contacted in ${silent} days`,
            detail: `${g.customer}${g.lastContact ? `, last ${dayLabel(g.lastContact)}` : ', never contacted'}`,
            ownerId: g.ownerId, date: since, record: { kind: 'plan', oppId: g.items[0]?.oppId || null },
          });
        }
      });
  }
  c.mtdContacts
    .filter((r) => r.response === 'negative' && !String(r.nextAction || '').trim())
    .forEach((r) => add('negative_no_next_action', r.id, {
      title: 'Negative response, no next action', detail: `${r.customer} · ${dayLabel(r.date)}`,
      ownerId: r.ownerId, date: r.date, record: r.dealId ? { kind: 'deal', dealId: r.dealId } : { kind: 'person', personId: r.ownerId },
    }));

  // ── Deals ──
  const open = deals.filter((d) => !['won', 'lost'].includes(d.stage));
  open.filter((d) => d.expected_close_date && String(d.expected_close_date).slice(0, 10) < c.today)
    .forEach((d) => add('deal_past_close', d.id, {
      title: 'Open deal past its close date',
      detail: `${dealLabel(d)} · due ${dayLabel(d.expected_close_date)} · ${Math.round(num(d.amount)).toLocaleString('en-US')}`,
      ownerId: d.owner_id, date: String(d.expected_close_date).slice(0, 10), record: { kind: 'deal', dealId: d.id },
    }));
  wonNotInvoicedExceptions({ deals, ownerIds: [...c.viewSet], now: c.now, thresholdDays: T.wonNotInvoicedDays })
    .forEach((e) => {
      const d = deals.find((x) => x.id === e.dealId);
      add('won_not_invoiced', e.dealId, {
        title: `Won ${e.daysSinceWon} days, not invoiced`,
        detail: `${dealLabel(d)} · ${Math.round(num(e.amount)).toLocaleString('en-US')}`,
        ownerId: e.ownerId, date: riyadhDate(e.createdAt), record: { kind: 'deal', dealId: e.dealId },
      });
    });
  const targetOf = new Map(c.people.map((p) => [p.id, num(p.target)]));
  open.forEach((d) => {
    const amt = num(d.amount);
    const t = targetOf.get(d.owner_id) || 0;
    const big = amt > T.largeDealAmount;
    const share = t > 0 && amt > T.largeDealShareOfTarget * t;
    if (big || share) {
      add('large_deal', d.id, {
        title: 'Very large deal',
        detail: `${dealLabel(d)} · ${Math.round(amt).toLocaleString('en-US')}${share ? ` · ${Math.round((amt / t) * 100)}% of monthly target` : ''}`,
        ownerId: d.owner_id, date: riyadhDate(d.created_at), record: { kind: 'deal', dealId: d.id },
      });
    }
  });
  c.itemRows.filter((r) => r.bounces >= T.bouncedTimes)
    .forEach((r) => add('plan_bounced_twice', r.oppId, {
      title: `Plan item bounced ${r.bounces} times`, detail: `${r.customer} · ${r.detail}`,
      ownerId: r.ownerId, date: riyadhDate(r.item.last_bounced_at) || c.monthStart, record: { kind: 'plan', oppId: r.oppId },
    }));
  c.itemRows.filter((r) => r.deal && r.deal.stage === 'lost')
    .forEach((r) => add('planned_deal_lost', r.oppId, {
      title: 'Deal lost after being planned this month', detail: `${r.customer} · ${r.detail}`,
      ownerId: r.ownerId, date: riyadhDate(r.deal.closed_at || r.deal.stage_changed_at) || c.monthStart,
      record: { kind: 'deal', dealId: r.dealId },
    }));

  // ── Data ──
  const byNumber = new Map();
  deals.filter((d) => d.invoice_number).forEach((d) => {
    parseInvoiceNumbers(d.invoice_number).forEach((n) => {
      if (!byNumber.has(n)) byNumber.set(n, []);
      byNumber.get(n).push(d);
    });
  });
  byNumber.forEach((list, n) => {
    const distinct = [...new Map(list.map((d) => [d.id, d])).values()];
    if (distinct.length < 2) return;
    const newest = distinct.slice().sort((a, b) => String(b.invoice_date || b.created_at).localeCompare(String(a.invoice_date || a.created_at)))[0];
    add('duplicate_invoice', n, {
      title: `Invoice number ${n.replace(/^0+/, '')} on ${distinct.length} deals`,
      detail: distinct.map((d) => `${dealLabel(d)} (${c.nameOf(d.owner_id)})`).join(' · '),
      ownerId: newest.owner_id, date: String(newest.invoice_date || riyadhDate(newest.created_at) || ''),
      record: { kind: 'deal', dealId: newest.id },
    });
  });
  deals.filter((d) => !d.division_id && (!['won', 'lost'].includes(d.stage)
    || isAchievedDeal(d, { start: c.monthStart, end: c.monthEnd })))
    .forEach((d) => add('deal_no_division', d.id, {
      title: 'Deal without a division', detail: dealLabel(d),
      ownerId: d.owner_id, date: riyadhDate(d.created_at), record: { kind: 'deal', dealId: d.id },
    }));
  const departed = [...c.viewSet].filter((id) => !c.isActive(id));
  departed.forEach((id) => {
    const od = open.filter((d) => d.owner_id === id);
    const op = (c.raw.departedOpenPlan || []).filter((o) => o.owner_id === id);
    if (!od.length && !op.length) return;
    add('departed_open_work', id, {
      title: 'Open work owned by a departed salesman',
      detail: `${od.length} open deal${od.length === 1 ? '' : 's'} (${Math.round(sumBy(od, (d) => d.amount)).toLocaleString('en-US')}), ${op.length} open plan item${op.length === 1 ? '' : 's'} (${Math.round(sumBy(op, (o) => o.planned_amount)).toLocaleString('en-US')})`,
      ownerId: id, date: c.today, record: { kind: 'person', personId: id },
    });
  });
  // A required plan that cannot be right: more than N times the month's target.
  if (c.subsLoaded) {
    const targetOfPerson = new Map(c.people.map((p) => [p.id, num(p.target)]));
    c.planHolders.forEach((id) => {
      const s = c.subByOwner.get(id);
      const req = num(s?.required_plan);
      const tgt = targetOfPerson.get(id) || 0;
      if (req > 0 && req > T.requiredPlanTargetMultiple * tgt) {
        add('required_plan_wrong', id, {
          title: 'Required plan looks wrong',
          detail: `required ${Math.round(req).toLocaleString('en-US')} against a target of ${Math.round(tgt).toLocaleString('en-US')}${tgt > 0 ? ` (${(req / tgt).toFixed(1)}×)` : ''}`,
          ownerId: id, date: riyadhDate(s.submitted_at) || riyadhDate(s.updated_at) || c.monthStart,
          record: { kind: 'person', personId: id },
        });
      }
    });
  }
  c.mtdContacts.filter((r) => !r.customerKnown && r.source === 'contact report')
    .forEach((r) => add('report_no_customer', r.id, {
      title: 'Contact report without a customer', detail: `${r.kindLabel} · ${dayLabel(r.date)}`,
      ownerId: r.ownerId, date: r.date, record: { kind: 'person', personId: r.ownerId },
    }));

  return out.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    || String(b.date || '').localeCompare(String(a.date || '')));
}

/* ── drill trees ─────────────────────────────────────────────────────────── */

/**
 * card → division → salesman → customer → rows, for DrillSheet.
 *
 * Every node's total is the sum of the rows under it, and the rows are the
 * ones the card summed — so the sheet cannot disagree with the card. Levels
 * with nothing to choose between are kept (a division of one still opens), so
 * the path is the same on every card.
 *
 * @param {object[]} rows
 * @param {object}   o
 * @param {function} o.value        row → number
 * @param {function} o.divisionOf   row → division id
 * @param {function} o.personOf     row → user id
 * @param {function} [o.customerOf] row → customer label; omitted = no customer level
 */
export function drillTree(rows, {
  value, divisionOf, personOf, customerOf = null, nameOf, divName,
}) {
  const total = (rs) => rs.reduce((s, r) => s + num(value(r)), 0);
  const by = (rs, f) => {
    const m = new Map();
    rs.forEach((r) => { const k = f(r) || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()];
  };
  const leaf = (rs) => rs.map((r) => ({ ...r, _value: value(r) }));
  return by(rows, divisionOf)
    .map(([did, drs]) => ({
      id: `d:${did}`,
      name: divName(did),
      total: total(drs),
      children: by(drs, personOf).map(([pid, prs]) => ({
        id: `p:${pid}`,
        name: nameOf(pid),
        total: total(prs),
        ...(customerOf
          ? {
            children: by(prs, customerOf).map(([cust, crs]) => ({
              id: `c:${cust}`, name: cust, total: total(crs), rows: leaf(crs),
            })).sort((a, b) => b.total - a.total),
          }
          : { rows: leaf(prs) }),
      })).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

export const DRILL_COLUMNS = {
  target: [
    { key: 'person', label: 'Salesman' },
    { key: 'targetType', label: 'Type' },
    { key: 'period', label: 'Month', type: 'month' },
    { key: 'value', label: 'Target', type: 'money' },
  ],
  planned: [
    { key: 'customer', label: 'Customer' },
    { key: 'status', label: 'Status' },
    { key: 'expectedMonth', label: 'Month', type: 'month' },
    { key: 'outcome', label: 'Outcome' },
    { key: 'planned', label: 'Planned', type: 'money' },
  ],
  planStatus: [
    { key: 'person', label: 'Salesman' },
    { key: 'status', label: 'Status' },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'submittedAt', label: 'Submitted', type: 'date' },
    { key: 'totalPlanned', label: 'Planned at submit', type: 'money' },
    { key: 'requiredAtSubmit', label: 'Required at submit', type: 'money' },
  ],
  achieved: [
    { key: 'customer', label: 'Customer' },
    { key: 'title', label: 'Deal' },
    { key: 'invoiceDate', label: 'Invoice date', type: 'date' },
    { key: 'plan', label: 'Plan' },
    { key: 'value', label: 'Amount', type: 'money' },
  ],
  outcomes: [
    { key: 'customer', label: 'Customer' },
    { key: 'outcome', label: 'Outcome' },
    { key: 'detail', label: 'What happened' },
    { key: 'planned', label: 'Planned', type: 'money' },
    { key: 'invoiced', label: 'Invoiced', type: 'money' },
  ],
  visits: [
    { key: 'customer', label: 'Customer' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'kindLabel', label: 'Type' },
    { key: 'response', label: 'Response' },
    { key: 'planTag', label: 'Plan' },
    { key: 'nextAction', label: 'Next action' },
  ],
  exceptions: [
    { key: 'title', label: 'Exception' },
    { key: 'severity', label: 'Severity' },
    { key: 'detail', label: 'Detail' },
    { key: 'date', label: 'Date', type: 'date' },
  ],
};

function buildDrills(ctx) {
  const {
    customerOfDeal, metrics, nameOf, divName, knownDivision, primaryByUser, itemRows, plannedRows,
    planStatusRows, split, mtdContacts, exceptions,
  } = ctx;
  const base = { nameOf, divName };
  const personDivision = (id) => knownDivision(primaryByUser[id]);

  const targetRows = (metrics.drill.targetRows || []).map((t) => ({
    person: nameOf(t.assigned_to),
    personId: t.assigned_to,
    divisionId: knownDivision(t.effective_division_id),
    targetType: String(t.target_type || '').replace(/_/g, ' '),
    period: t.period_start,
    value: targetRowValue(t),
  }));

  const invoiced = [
    ...split.fromRows.map((d) => ({ d, plan: 'from this month\'s plan', sign: 1 })),
    ...split.outsideRows.map((d) => ({ d, plan: 'outside the plan', sign: 1 })),
  ].map(({ d, plan, sign }) => ({
    dealId: d.id, personId: d.owner_id, divisionId: knownDivision(d.division_id),
    customer: customerOfDeal(d), title: d.title || '—', invoiceDate: d.invoice_date,
    plan, value: sign * achievedAmount(d),
  }));
  const returnRows = (metrics.drill.returnRows || []).map((r) => ({
    dealId: r.deal_id, personId: r.owner_id, divisionId: knownDivision(r.division_id),
    customer: 'Sales return', title: 'credit note', invoiceDate: r.return_date,
    plan: 'return', value: -returnAmount(r),
  }));

  const outcomeRows = itemRows.map((r) => ({
    oppId: r.oppId, dealId: r.dealId, personId: r.ownerId, divisionId: r.divisionId,
    customer: r.customer, outcome: r.outcome, detail: r.detail, planned: r.planned, invoiced: r.invoiced,
    status: r.status, expectedMonth: r.expectedMonth,
  }));

  const visitRows = mtdContacts.map((c) => ({
    dealId: c.dealId, personId: c.ownerId, divisionId: personDivision(c.ownerId),
    customer: c.customer, date: c.date, kindLabel: c.kindLabel, response: c.response || '—',
    planTag: c.inPlan ? `In plan · ${Math.round(c.planValue).toLocaleString('en-US')} · ${c.planOutcome}` : '—',
    nextAction: c.nextAction || '—', one: 1,
  }));

  return {
    target: {
      label: 'Target',
      explain: 'The month\'s target: every active monthly target row of the people who count, each in its own division — the Insights figure.',
      total: metrics.target,
      columns: DRILL_COLUMNS.target,
      groupLabels: ['By division', 'By salesman'],
      children: drillTree(targetRows, { ...base, value: (r) => r.value, divisionOf: (r) => r.divisionId, personOf: (r) => r.personId }),
    },
    planned: {
      label: 'Plan now',
      explain: 'Plan now: the month\'s plan items today that are still open or became a live deal, for everyone who carries a target. (Submitted, on the card, is the total on each plan when it was filed.)',
      total: sumBy(plannedRows, (r) => r.planned),
      columns: DRILL_COLUMNS.planned,
      groupLabels: ['By division', 'By salesman', 'By customer'],
      children: drillTree(plannedRows.map((r) => ({
        oppId: r.oppId, dealId: r.dealId, personId: r.ownerId, divisionId: r.divisionId, customer: r.customer,
        status: r.status === 'open' ? 'open' : 'became a deal', expectedMonth: r.expectedMonth, outcome: r.outcome, planned: r.planned,
      })), { ...base, value: (r) => r.planned, divisionOf: (r) => r.divisionId, personOf: (r) => r.personId, customerOf: (r) => r.customer }),
    },
    planStatus: {
      label: 'Plan submission',
      unit: 'people',
      explain: 'Who planned and who did not: each salesman and supervisor\'s plan for the month, from plan submissions.',
      total: planStatusRows.length,
      columns: DRILL_COLUMNS.planStatus,
      groupLabels: ['By division', 'By salesman'],
      children: drillTree(planStatusRows, { ...base, value: () => 1, divisionOf: (r) => r.divisionId, personOf: (r) => r.personId }),
    },
    achieved: {
      label: 'Achieved',
      explain: 'Invoiced in the month (won and invoiced, by invoice date, final amount), net of sales returns — the Insights figure.',
      total: metrics.achieved,
      columns: DRILL_COLUMNS.achieved,
      groupLabels: ['By division', 'By salesman', 'By customer'],
      children: drillTree([...invoiced, ...returnRows], { ...base, value: (r) => r.value, divisionOf: (r) => r.divisionId, personOf: (r) => r.personId, customerOf: (r) => r.customer }),
    },
    fromPlan: {
      label: 'From plan vs outside plan',
      explain: 'The month\'s invoices split by whether their plan item is in this month\'s plan. From plan + outside plan − returns = Achieved.',
      total: metrics.achieved,
      columns: DRILL_COLUMNS.achieved,
      groupLabels: ['By division', 'By salesman', 'By customer'],
      children: drillTree([...invoiced, ...returnRows], { ...base, value: (r) => r.value, divisionOf: (r) => r.divisionId, personOf: (r) => r.personId, customerOf: (r) => r.plan }),
    },
    outcomes: {
      label: 'Plan outcomes',
      explain: 'Every plan item of the month and what became of it: Achieved, Bounced, Failed or Pending. Values are planned amounts.',
      total: sumBy(outcomeRows, (r) => r.planned),
      columns: DRILL_COLUMNS.outcomes,
      groupLabels: ['By division', 'By salesman', 'By outcome'],
      children: drillTree(outcomeRows, { ...base, value: (r) => r.planned, divisionOf: (r) => r.divisionId, personOf: (r) => r.personId, customerOf: (r) => r.outcome }),
    },
    visits: {
      label: 'Visits, calls and WhatsApps',
      unit: 'contacts',
      explain: 'Every visit, call and WhatsApp this month to date, with its customer and whether that customer is in the month\'s plan.',
      total: visitRows.length,
      columns: DRILL_COLUMNS.visits,
      groupLabels: ['By division', 'By salesman', 'By customer'],
      children: drillTree(visitRows, { ...base, value: () => 1, divisionOf: (r) => r.divisionId, personOf: (r) => r.personId, customerOf: (r) => r.customer }),
    },
    exceptions: {
      label: 'Exceptions',
      unit: 'exceptions',
      explain: 'Everything that needs a decision, by rule. Thresholds are in one place (utils/salesMonitorThresholds.js).',
      total: exceptions.length,
      columns: DRILL_COLUMNS.exceptions,
      groupLabels: ['By division', 'By salesman'],
      children: drillTree(exceptions.map((e) => ({
        ...e, personId: e.ownerId, divisionId: personDivision(e.ownerId),
        dealId: e.record?.dealId || null, oppId: e.record?.oppId || null,
      })), { ...base, value: () => 1, divisionOf: (r) => r.divisionId, personOf: (r) => r.personId }),
    },
  };
}

/**
 * One salesman's own sheet, for a scoreboard row: plan items, invoices,
 * contacts and exceptions, each its own branch with its own columns.
 */
export function personDrill(model, personId) {
  const p = model.people.find((x) => x.id === personId);
  if (!p) return null;
  const mine = (id) => (personId === DEPARTED_ID ? model.departedIds.includes(id)
    : personId === NO_TARGET_ID ? model.noTargetIds.includes(id) : id === personId);
  const items = model.itemRows.filter((r) => mine(r.ownerId));
  const contacts = model.mtdContacts.filter((c) => mine(c.ownerId));
  const exc = model.exceptions.filter((e) => mine(e.ownerId));
  const inv = (p.metrics.drill.invoicedRows || []);
  const fromIds = new Set(model.itemRows.filter((r) => !r.movedOutOfMonth).map((r) => r.dealId).filter(Boolean));
  return {
    label: p.name,
    explain: `${p.name}: target ${Math.round(num(p.target)).toLocaleString('en-US')}, achieved ${Math.round(num(p.achieved)).toLocaleString('en-US')}.`,
    total: p.achieved,
    children: [
      {
        id: 'items', name: `Plan items (${items.length})`, total: sumBy(items, (r) => r.planned), columns: DRILL_COLUMNS.outcomes,
        rows: items.map((r) => ({ oppId: r.oppId, dealId: r.dealId, customer: r.customer, outcome: r.outcome, detail: r.detail, planned: r.planned, invoiced: r.invoiced })),
      },
      {
        id: 'invoices', name: `Invoices (${inv.length})`, total: sumBy(inv, achievedAmount), columns: DRILL_COLUMNS.achieved,
        rows: inv.map((d) => ({ dealId: d.id, customer: model.customerOfDeal(d), title: d.title || '—', invoiceDate: d.invoice_date, plan: fromIds.has(d.id) ? 'from this month\'s plan' : 'outside the plan', value: achievedAmount(d) })),
      },
      {
        id: 'contacts', name: `Visits, calls, WhatsApps (${contacts.length})`, total: contacts.length, columns: DRILL_COLUMNS.visits,
        rows: contacts.map((c) => ({ dealId: c.dealId, customer: c.customer, date: c.date, kindLabel: c.kindLabel, response: c.response || '—', planTag: c.inPlan ? `In plan · ${c.planOutcome}` : '—', nextAction: c.nextAction || '—' })),
      },
      {
        id: 'exceptions', name: `Exceptions (${exc.length})`, total: exc.length, columns: DRILL_COLUMNS.exceptions,
        rows: exc.map((e) => ({ ...e, dealId: e.record?.dealId || null, oppId: e.record?.oppId || null })),
      },
    ],
  };
}
