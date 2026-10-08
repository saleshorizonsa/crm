import { achievedAmount } from 'utils/planningCalculations';

/**
 * WHAT IS BEHIND EACH PLANNING CARD, and what is wrong with a plan item.
 *
 * Pure. It GROUPS the rows computePlanningPageSummary already carries in its
 * `drill` payload and never recomputes a figure: every card total comes from
 * the summary, so the panel that opens cannot disagree with the card it opened
 * from. The same discipline as utils/coverageDrill.js, for the same reason.
 *
 * Scope is already applied upstream — the summary reads only the viewer's own
 * people — so nothing here can widen it. A salesman's payload contains one
 * person, which is why the panel can never name another.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** An open plan item is NOT CONVERTED once this few days are left. */
export const NOT_CONVERTED_DAYS = 7;
/**
 * The window the gap closer looks back over, stated here so the row can say
 * "4 of 6" without the number being written twice. utils/gapCloser.js reads
 * the same constant.
 */
export const HISTORY_WINDOW_MONTHS = 6;
/** A planned amount this many times the customer's usual order is ABOVE USUAL. */
export const ABOVE_USUAL_MULTIPLE = 2;

/* ── what "converted" means ────────────────────────────────────────────────── */

/**
 * ONE DEFINITION OF CONVERTED: the status says so AND the deal is still there.
 *
 * `opportunities.deal_id` is ON DELETE SET NULL, so deleting or merging away a
 * deal leaves the plan item marked `converted` with no deal behind it. On
 * production today that is 4 items worth 679,147 for October and 11 worth
 * 3,504,947 for September — and the board was counting them as converted while
 * Plan accuracy, which follows the deal link, was not. Alseyed's October read
 * 1,310,047 on the board and 968,400 in the funnel: the same word, two numbers.
 *
 * The board, the coverage panel and Plan accuracy now all ask these two
 * questions, so there is one answer. An item that fails the second is not
 * quietly dropped - it is DEAL MISSING, and it is shown.
 */
export const isConvertedWithDeal = (o) => o?.status === 'converted' && !!o?.deal_id;
export const isConvertedDealMissing = (o) => o?.status === 'converted' && !o?.deal_id;

/* ── flags ─────────────────────────────────────────────────────────────────── */

/**
 * THE FIVE THINGS WRONG WITH A PLAN ITEM.
 *
 *   NOT CONVERTED  open, and the month is nearly over — nobody turned it into
 *                  a deal, so it will not convert into anything.
 *   DEAL MISSING   marked converted, and the deal it was converted into is no
 *                  longer there. The item counts as neither plan nor pipeline,
 *                  so without this flag its value simply vanishes from the
 *                  page — see isConvertedWithDeal.
 *   DUPLICATE      somebody else planned the same customer this month. Two
 *                  people calling one customer is the waste this flag exists
 *                  to show. For a SALESMAN the flag says "another salesman"
 *                  and never a name: he may not see who.
 *   NO HISTORY     that customer has never been invoiced. Not wrong in itself
 *                  — but a plan made of them is a plan of hope.
 *   ABOVE USUAL    planned at more than twice what that customer usually buys
 *                  in a month they buy.
 *
 * @param {object} item     an opportunities row
 * @param {object} ctx
 * @param {Date}   ctx.now
 * @param {string} ctx.monthEnd        yyyy-MM-dd
 * @param {Map}    ctx.plannedByOthers contact_id/customer key → owner_id[]
 * @param {Map}    ctx.history         customer key → { months, usualOrder, lastInvoice }
 * @param {string} ctx.viewerRole
 * @param {string} ctx.viewerId
 */
export function planItemFlags(item, ctx = {}) {
  const {
    now = new Date(), monthEnd = null, plannedByOthers = new Map(),
    history = new Map(), viewerRole = null, contactName = null,
  } = ctx;
  const flags = [];

  const status = item?.status || 'open';
  if (status === 'open' && monthEnd) {
    const left = Math.ceil((new Date(`${monthEnd}T23:59:59`) - now) / 86400000);
    if (left >= 0 && left <= NOT_CONVERTED_DAYS) flags.push('NOT CONVERTED');
  }
  if (isConvertedDealMissing(item)) flags.push('DEAL MISSING');

  const key = customerKey(item, contactName);
  const others = (plannedByOthers.get(key) || []).filter((id) => id !== item.owner_id);
  if (others.length) {
    // A salesman is told THAT it is doubled, never BY WHOM: the name would be
    // somebody outside his scope, and this page shows him nobody else.
    flags.push(viewerRole === 'salesman' ? 'DUPLICATE (another salesman)' : 'DUPLICATE');
  }

  const h = history.get(key);
  if (h && h.months === 0) flags.push('NO HISTORY');
  if (!h) flags.push('NO HISTORY');
  if (h && h.usualOrder > 0 && num(item.planned_amount) > ABOVE_USUAL_MULTIPLE * h.usualOrder) {
    flags.push('ABOVE USUAL');
  }

  return flags;
}

/**
 * HOW A CUSTOMER IS IDENTIFIED across plan items and invoices.
 *
 * By NAME first, resolved through the contact when there is one. Keying on
 * contact_id looks more correct and is worse here: a deal usually carries a
 * contact, a plan item usually carries only a typed customer_name, so the two
 * never meet. The first run of this flagged NO HISTORY on 22 of 22 of a
 * supervisor's plan items — every one of them — and listed "Al Lugmani" twice
 * in the gap closer, once under its contact id and once under its title, with
 * the history split between them.
 *
 * Names are normalised (trimmed, collapsed whitespace, upper-cased), which is
 * the same match the division attribution uses for Kamal's customer lists. It
 * is not perfect — two spellings of one customer stay two customers — but it
 * joins the records that genuinely share a name, which contact_id cannot.
 */
export function customerKey(row, contactName = null) {
  const viaContact = row?.contact_id ? contactName?.get?.(row.contact_id) : null;
  const raw = viaContact || row?.customer_name || row?.title || '';
  const name = String(raw).trim().replace(/\s+/g, ' ').toUpperCase();
  if (name) return `n:${name}`;
  return row?.contact_id ? `c:${row.contact_id}` : 'n:—';
}

/* ── the cards ─────────────────────────────────────────────────────────────── */

export const PLAN_DRILL_COLUMNS = {
  invoiced: [
    { key: 'customer', label: 'Customer' },
    { key: 'invoiceNo', label: 'Invoice no' },
    { key: 'invoiceDate', label: 'Invoice date', type: 'date' },
    { key: 'value', label: 'Value', type: 'money' },
  ],
  planItems: [
    { key: 'customer', label: 'Customer' },
    { key: 'value', label: 'Planned', type: 'money' },
    { key: 'status', label: 'Status' },
    { key: 'expectedMonth', label: 'Expected month', type: 'month' },
    { key: 'flags', label: 'Flags', type: 'flags' },
  ],
  funnel: [
    { key: 'customer', label: 'Customer' },
    { key: 'stage', label: 'Stage' },
    { key: 'value', label: 'Amount', type: 'money' },
    { key: 'expectedClose', label: 'Expected close', type: 'date' },
    { key: 'flags', label: 'Flags', type: 'flags' },
  ],
  gap: [
    { key: 'customer', label: 'Customer' },
    { key: 'value', label: 'Usual order', type: 'money' },
    // Beside the usual order, not three columns away: it is what says whether
    // that average means anything.
    { key: 'reliability', label: 'Bought in' },
    { key: 'lastInvoice', label: 'Last invoice', type: 'date' },
    { key: 'runningTotal', label: 'Running total', type: 'money' },
    { key: 'flags', label: '', type: 'flags' },
    { key: 'lastSalesman', label: 'Last salesman' },
  ],
};

const nameOf = (users, id) => (users || []).find((u) => u.id === id)?.full_name || 'Unknown';

const dealCustomer = (d, contactName) => {
  const byContact = d?.contact_id ? contactName?.get?.(d.contact_id) : null;
  return byContact || d?.title || '—';
};

/** Group rows by owner into the sheet's child shape, biggest first. */
function byPerson(rows, users, valueOf, rowShape) {
  const per = new Map();
  (rows || []).forEach((r) => {
    const id = r.owner_id || 'unknown';
    if (!per.has(id)) per.set(id, []);
    per.get(id).push(rowShape(r));
  });
  return [...per.entries()]
    .map(([id, list]) => ({
      id,
      name: nameOf(users, id),
      total: list.reduce((s, r) => s + num(r.value), 0),
      rows: list.sort((a, b) => num(b.value) - num(a.value)),
    }))
    .filter((p) => p.rows.length)
    .sort((a, b) => b.total - a.total);
}

/**
 * The four openable cards, as trees for components/DrillSheet.jsx.
 *
 * Each card's `total` is the SUMMARY's figure, never a re-addition of the rows
 * — that is what makes "panel total = card" a real assertion rather than a
 * tautology.
 *
 * @param {object} summary   computePlanningPageSummary's result
 * @param {object} p
 * @param {object[]} p.users
 * @param {Map} p.contactName  contact_id → company name
 * @param {object} p.flagCtx   the context planItemFlags needs
 */
export function buildPlanningDrill(summary, {
  users = [], contactName = new Map(), flagCtx = {}, gapCloser = null,
} = {}) {
  const d = summary?.drill || {};
  const cards = {};

  // ── Target / Achieved → the invoices behind Achieved ──────────────────────
  // Credit notes are their own lines, negative, exactly as the coverage rail
  // shows them: a return is not a smaller invoice, it is a separate document.
  const invoiceRows = (r) => ({
    kind: 'deal',
    dealId: r.id,
    customer: dealCustomer(r, contactName),
    invoiceNo: r.invoice_number || '—',
    invoiceDate: r.invoice_date || null,
    value: achievedAmount(r),
  });
  const returnsAsRows = (d.returnRows || []).map((r) => ({
    kind: 'return',
    dealId: r.deal_id,
    owner_id: r.owner_id,
    customer: 'Credit note',
    invoiceNo: '—',
    invoiceDate: r.return_date || null,
    value: -Math.abs(num(r.return_amount)),
  }));
  cards.achieved = {
    label: 'Achieved',
    total: num(summary?.achieved),
    columns: PLAN_DRILL_COLUMNS.invoiced,
    groupLabels: ['Person'],
    children: byPerson(
      [...(d.invoicedRows || []), ...returnsAsRows],
      users,
      null,
      (r) => (r.kind === 'return' ? r : invoiceRows(r)),
    ),
  };

  // ── Planning coverage → open plan items AND funnel deals ──────────────────
  const planRow = (o) => ({
    kind: 'opportunity',
    oppId: o.id,
    owner_id: o.owner_id,
    customer: o.customer_name || '—',
    value: num(o.planned_amount),
    status: o.status || 'open',
    expectedMonth: o.expected_month || null,
    flags: planItemFlags(o, flagCtx),
  });
  const funnelRow = (dl) => ({
    kind: 'deal',
    dealId: dl.id,
    owner_id: dl.owner_id,
    customer: dealCustomer(dl, contactName),
    stage: String(dl.stage || '').replace(/_/g, ' '),
    value: num(dl.amount),
    expectedClose: dl.expected_close_date || null,
    flags: dl.expected_close_date ? [] : ['UNDATED'],
  });

  // The two halves are different rows under one total, so each carries its own
  // columns and the sheet picks up whichever branch the reader opened.
  const planGroup = {
    id: 'plan',
    name: 'Open plan items',
    total: num(summary?.plannedOpen),
    columns: PLAN_DRILL_COLUMNS.planItems,
    children: byPerson(d.planRows || [], users, null, planRow),
  };
  const funnelGroup = {
    id: 'funnel',
    name: 'Funnel deals',
    total: num(summary?.openFunnel),
    columns: PLAN_DRILL_COLUMNS.funnel,
    children: byPerson(d.funnelRows || [], users, null, funnelRow),
  };
  /**
   * CONVERTED PLAN ITEMS — a third group, in the panel and in no total.
   *
   * They are deals now: counted in the funnel group beside them, and in
   * Achieved once invoiced. Adding them to coverage would count the same work
   * twice. But leaving them out of the PANEL made a salesman who converted his
   * whole plan indistinguishable from one who never planned — Mohamed
   * Hussein's October read 0 planned while 29 of his items, worth 299,155, had
   * become deals.
   *
   * `informational` marks it: the sheet labels it, and /numbers-check skips it
   * when adding the rows up against the card.
   *
   * ONLY ITEMS WITH A DEAL BEHIND THEM, by isConvertedWithDeal — the same
   * question Plan accuracy asks. The ones whose deal has gone get a group of
   * their own rather than being folded in or dropped, because their value is
   * in no other figure on the page and would otherwise just disappear.
   */
  const convertedRows = (d.planRowsWorked || []).filter(isConvertedWithDeal);
  const orphanRows = (d.planRowsWorked || []).filter(isConvertedDealMissing);
  const convertedGroup = convertedRows.length ? {
    id: 'converted',
    name: 'Converted to deals (not in the total)',
    informational: true,
    total: convertedRows.reduce((s, o) => s + num(o.planned_amount), 0),
    columns: PLAN_DRILL_COLUMNS.planItems,
    children: byPerson(convertedRows, users, null, planRow),
  } : null;
  const orphanGroup = orphanRows.length ? {
    id: 'deal-missing',
    name: 'Converted, deal no longer exists (not in the total)',
    informational: true,
    total: orphanRows.reduce((s, o) => s + num(o.planned_amount), 0),
    columns: PLAN_DRILL_COLUMNS.planItems,
    children: byPerson(orphanRows, users, null, planRow),
  } : null;

  cards.coverage = {
    label: 'Planning coverage',
    total: num(summary?.plannedOpen) + num(summary?.openFunnel),
    columns: PLAN_DRILL_COLUMNS.planItems,
    groupLabels: ['What covers it', 'Person'],
    children: [planGroup, funnelGroup, convertedGroup, orphanGroup].filter(Boolean),
    note: [
      convertedGroup
        ? `Open plan ${Math.round(num(summary?.plannedOpen)).toLocaleString('en-US')} + funnel ${Math.round(num(summary?.openFunnel)).toLocaleString('en-US')}. ${convertedRows.length} plan items worth ${Math.round(convertedGroup.total).toLocaleString('en-US')} have already converted to deals — listed below for information, counted in the funnel, not added here.`
        : null,
      orphanGroup
        ? `${orphanRows.length} more worth ${Math.round(orphanGroup.total).toLocaleString('en-US')} are marked converted but the deal is no longer there, so they are in no figure on this page at all — they are listed so they can be put right.`
        : null,
    ].filter(Boolean).join(' ') || null,
  };

  // ── Required plan → the arithmetic, in words ──────────────────────────────
  const rate = num(summary?.winRatePct);
  cards.required = {
    label: 'Required plan',
    total: num(summary?.requiredPlan),
    columns: [
      { key: 'customer', label: 'Step' },
      { key: 'value', label: 'Value', type: 'money' },
    ],
    rows: [
      { customer: 'Target for the period', value: num(summary?.target) },
      { customer: 'Achieved so far', value: num(summary?.achieved) },
      { customer: 'Still missing (target − achieved)', value: num(summary?.remainingTarget) },
      { customer: `÷ conversion ${rate.toFixed(1)}%`, value: null },
      { customer: 'Required plan', value: num(summary?.requiredPlan) },
    ],
    note: `${Math.round(num(summary?.remainingTarget)).toLocaleString('en-US')} still missing ÷ ${rate.toFixed(1)}% conversion = ${Math.round(num(summary?.requiredPlan)).toLocaleString('en-US')} of plan needed. At that rate, every riyal planned is expected to bring in ${(rate / 100).toFixed(2)}.`,
  };

  // ── Planned gap → the gap, and who could close it ─────────────────────────
  cards.gap = {
    label: 'Planned gap',
    total: num(summary?.plannedGap),
    columns: PLAN_DRILL_COLUMNS.gap,
    rows: gapCloser?.rows || [],
    note: gapCloser
      ? gapCloser.verdict
      : `Required plan ${Math.round(num(summary?.requiredPlan)).toLocaleString('en-US')} less what covers it ${Math.round(num(summary?.plannedOpen) + num(summary?.openFunnel)).toLocaleString('en-US')}.`,
  };

  return cards;
}

/* ── the gap closer's arithmetic (pure half) ───────────────────────────────── */

/**
 * Turn invoice history into candidates and say how many would close the gap.
 *
 * USUAL ORDER is the average invoiced value per month they actually bought —
 * not per month in the window. A customer who bought twice in six months at
 * 50,000 each has a usual order of 50,000, not 16,667: when they buy, that is
 * what they buy, and that is what planning one of them is worth.
 *
 * ORDERED BY HOW REGULAR THEY ARE, then by size. Sorting by size alone put
 * JAECO at 225,992 and Rukn Al-Dahia at 161,535 at the top of Alseyed's list
 * and declared that those two would close his gap — when each had bought in
 * ONE of the last six months. A single invoice is not an order pattern, and a
 * suggestion built on one is a guess wearing the clothes of an average. A
 * customer who bought in four of six months at 60,000 is a better call than
 * one who bought once at 200,000, so months come first.
 *
 * One-off customers (bought in exactly one month) are kept, marked, and sink
 * to the bottom: they may still be the right call, and the reader can see what
 * they are choosing.
 *
 * @param {object[]} candidates  { key, customer, lastInvoice, months, total, lastSalesman }
 * @param {number}   gap
 */
export function rankGapClosers(candidates, gap) {
  const rows = (candidates || [])
    .map((c) => ({
      ...c,
      value: c.months > 0 ? num(c.total) / c.months : 0,
      oneOff: c.months === 1,
      // "4 of 6" — said on the row, so the usual order is never read as more
      // reliable than it is.
      reliability: `${c.months} of ${HISTORY_WINDOW_MONTHS}`,
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => (b.months - a.months) || (b.value - a.value));

  // The running total follows the order on screen, so the marker lands on the
  // customer that actually closes the gap once the list is read top to bottom.
  let running = 0;
  let closesAt = -1;
  rows.forEach((r, i) => {
    running += r.value;
    r.runningTotal = running;
    if (closesAt === -1 && gap > 0 && running >= gap) closesAt = i;
  });

  const n = closesAt === -1 ? 0 : closesAt + 1;
  rows.forEach((r, i) => {
    r.closesGap = n > 0 && i < n;
    // ONE-OFF is said out loud. It is not a reason to exclude the customer —
    // one big order may be exactly the right call — but the reader should know
    // that the "usual order" beside it is a single invoice.
    r.flags = r.oneOff ? ['one-off'] : [];
  });

  return {
    rows,
    gap,
    closesAt: n,
    total: running,
    verdict: gap <= 0
      ? 'No gap: the plan and the funnel already cover what is required.'
      : n > 0
        ? `These ${n} ${n === 1 ? 'customer' : 'customers'} would close the gap of ${Math.round(gap).toLocaleString('en-US')}${
          rows.slice(0, n).every((r) => r.oneOff)
            ? ' — but each bought in only one of the last six months, so those usual orders are single invoices'
            : ''
        }.`
        : `All ${rows.length} candidates together come to ${Math.round(running).toLocaleString('en-US')}, short of the ${Math.round(gap).toLocaleString('en-US')} gap.`,
  };
}

export { ymd };
