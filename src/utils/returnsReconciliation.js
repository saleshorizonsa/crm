// Rolls imported credit-note lines up into one entry per INVOICE.
//
// deal_returns stores one row per credit-note/item combination, which is the
// right storage shape but the wrong reading shape: a flat list shows the same
// invoice several times and gives no sense of how much of it has come back in
// total. An invoice returned in two instalments is one story, not two rows.
//
// Kept out of the component so the grouping and the over-return rule can be
// tested against real rows directly.

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
// The importer stores magnitudes (the sign convention lives in the Achieved
// rule), but never rely on that here — a credit written negative must not
// subtract from its own invoice's return total.
const amountOf = (row) => Math.abs(num(row?.return_amount));

const NO_INVOICE = '(no invoice number)';

/** The deal's invoiced value, or null when there is no matched deal. */
export function dealInvoicedAmount(deal) {
  if (!deal) return null;
  const v = deal.final_amount ?? deal.amount;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Over-returned: the invoice has had at least as much credited back as it was
 * invoiced for. Only decidable for MATCHED returns — an unmatched credit note
 * has no original invoice value anywhere in the CRM, which is the very reason
 * it is unmatched, so it is never flagged.
 */
export function isOverReturned({ matched, total, dealInvoiced }) {
  if (!matched) return false;
  if (!(dealInvoiced > 0)) return false;
  return total >= dealInvoiced;
}

/**
 * @param {object[]} rows deal_returns rows, each optionally carrying `deals`
 * @returns {object[]} one entry per invoice, biggest return total first
 */
export function groupReturnsByInvoice(rows) {
  const byInvoice = new Map();

  (rows || []).forEach((r) => {
    const key = String(r?.invoice_no ?? '').trim() || NO_INVOICE;
    if (!byInvoice.has(key)) {
      byInvoice.set(key, {
        invoiceNo: key,
        hasInvoiceNo: key !== NO_INVOICE,
        customerName: '',
        matched: false,
        dealId: null,
        dealTitle: null,
        ownerName: null,
        dealInvoiceNumber: null,
        dealInvoiced: null,
        total: 0,
        lineCount: 0,
        creditNoteMap: new Map(),
        dates: [],
      });
    }
    const g = byInvoice.get(key);

    // A single matched row is enough to identify the invoice's deal: rows are
    // matched by invoice number, so every matched row under one invoice points
    // at the same deal.
    if (r?.deal_id && !g.matched) {
      g.matched = true;
      g.dealId = r.deal_id;
      g.dealTitle = r.deals?.title ?? null;
      g.ownerName = r.deals?.owner?.full_name ?? null;
      g.dealInvoiceNumber = r.deals?.invoice_number ?? null;
      g.dealInvoiced = dealInvoicedAmount(r.deals);
    }
    if (!g.customerName && r?.customer_name) g.customerName = r.customer_name;
    if (r?.return_date) g.dates.push(String(r.return_date).slice(0, 10));

    const amount = amountOf(r);
    g.total += amount;
    g.lineCount += 1;

    const cnKey = String(r?.credit_note_no ?? '').trim() || '(no credit note)';
    if (!g.creditNoteMap.has(cnKey)) {
      g.creditNoteMap.set(cnKey, { creditNoteNo: cnKey, date: null, total: 0, lines: [] });
    }
    const cn = g.creditNoteMap.get(cnKey);
    cn.total += amount;
    // Earliest date on the credit note is the credit note's date.
    const d = r?.return_date ? String(r.return_date).slice(0, 10) : null;
    if (d && (!cn.date || d < cn.date)) cn.date = d;
    cn.lines.push({
      id: r?.id,
      itemCode: String(r?.item_code ?? '').trim(),
      itemDescription: r?.item_description ?? null,
      qty: r?.return_qty == null ? null : num(r.return_qty),
      unitPrice: r?.unit_price == null ? null : num(r.unit_price),
      amount,
    });
  });

  return [...byInvoice.values()].map((g) => {
    // Oldest credit note first, so a second instalment reads as an addition to
    // the first rather than as a separate event.
    const creditNotes = [...g.creditNoteMap.values()].sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      return String(a.creditNoteNo) < String(b.creditNoteNo) ? -1 : 1;
    });
    let running = 0;
    creditNotes.forEach((cn) => {
      cn.lines.sort((x, y) => y.amount - x.amount);
      running += cn.total;
      cn.cumulative = running;   // total returned against this invoice so far
    });
    const dates = g.dates.slice().sort();
    const { creditNoteMap, dates: _drop, ...rest } = g;
    return {
      ...rest,
      creditNotes,
      creditNoteCount: creditNotes.length,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
      overReturned: isOverReturned({ matched: g.matched, total: g.total, dealInvoiced: g.dealInvoiced }),
      remainingAfterReturns: g.dealInvoiced != null ? g.dealInvoiced - g.total : null,
    };
  }).sort((a, b) => b.total - a.total);
}

/** Headline figures for the whole set, matched and unmatched split out. */
export function summariseReturns(groups) {
  const list = groups || [];
  const sum = (f) => list.filter(f).reduce((s, g) => s + g.total, 0);
  return {
    invoices: list.length,
    matchedInvoices: list.filter((g) => g.matched).length,
    unmatchedInvoices: list.filter((g) => !g.matched).length,
    total: sum(() => true),
    matchedTotal: sum((g) => g.matched),
    unmatchedTotal: sum((g) => !g.matched),
    overReturnedCount: list.filter((g) => g.overReturned).length,
    lineCount: list.reduce((s, g) => s + g.lineCount, 0),
    creditNoteCount: list.reduce((s, g) => s + g.creditNoteCount, 0),
  };
}
