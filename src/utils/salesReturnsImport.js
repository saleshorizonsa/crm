import { parseInvoiceNumbers } from './invoiceNumber';

// Parsing and matching for the ERP sales-returns import.
//
// Kept out of the component so the matching rules can be tested directly —
// which invoice a return row lands on, and what happens when it lands on none
// or on several, is the part that must not be got wrong.

// The ERP export's column headers, exactly as it writes them. Matching is
// case-insensitive and whitespace-tolerant, because these come out of Excel.
export const RETURN_COLUMNS = [
  'Date', 'Invoice No', 'Return Delivery', 'Credit Note No', 'Item Code',
  'Item Description', 'UOM', 'Thickness', 'Materials Group',
  'Return Qty in PC/TON', 'Unit Price', 'Qty in TON', 'Net value',
  'Customer Id', 'Customer Name', 'City', 'Salesman ID', 'Salesman Name',
  'Sales Branch',
];

// Only these drive the Achieved calculation. The rest are stored for audit.
export const REQUIRED_COLUMNS = ['Date', 'Invoice No', 'Net value'];

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Map the sheet's header row to column indexes, tolerant of case and spacing. */
export function mapHeaders(headerRow) {
  const idx = {};
  (headerRow || []).forEach((h, i) => {
    const key = norm(h);
    if (key) idx[key] = i;
  });
  const found = {};
  RETURN_COLUMNS.forEach((c) => {
    const i = idx[norm(c)];
    if (i !== undefined) found[c] = i;
  });
  return found;
}

/** Which required columns the sheet is missing. */
export function missingRequired(headerMap) {
  return REQUIRED_COLUMNS.filter((c) => headerMap[c] === undefined);
}

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Excel dates arrive as a Date, a serial number, or text. dd/mm/yyyy is read
 * day-first, matching the ERP's locale — the same reading HistoricalDataModule
 * uses, so the two importers cannot disagree about what 03/04/2026 means.
 */
export function toISODate(v, XLSX = null) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return fmtDate(v);
  if (typeof v === 'number') {
    try {
      const p = XLSX?.SSF?.parse_date_code?.(v);
      if (p?.y) return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
    } catch { /* fall through */ }
    return null;
  }
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const [, a, b, y] = dmy;
    const d = new Date(Number(y), Number(b) - 1, Number(a));
    if (!isNaN(d.getTime())) return fmtDate(d);
  }
  const native = new Date(s);
  if (!isNaN(native.getTime())) return fmtDate(native);
  return null;
}

/**
 * A return amount. The ERP writes credits either positive or parenthesised /
 * negative depending on the report; we store the MAGNITUDE, because the sign
 * convention lives in the Achieved rule (always subtracted), not in the data.
 */
export function toAmount(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return Math.abs(v);
  let s = String(v).trim();
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) s = paren[1];
  s = s.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : Math.abs(n);
}

const cell = (row, headerMap, col) => {
  const i = headerMap[col];
  return i === undefined ? '' : row[i];
};
const text = (row, headerMap, col) => String(cell(row, headerMap, col) ?? '').trim();

/**
 * Turn sheet rows into return records, matched against invoiced deals.
 *
 * Three outcomes per row, and none of them is "silently dropped":
 *   matched    — exactly one invoiced deal carries this invoice number
 *   unmatched  — no deal does; stored for audit, reduces nobody's Achieved
 *   ambiguous  — SEVERAL deals carry the same real invoice number. Not guessed
 *                at: picking one would charge the return to an arbitrary owner
 *                and customer.
 *
 * "1" and "11" — placeholders shared by ten JASCO PVC deals — used to land here
 * as ambiguous, which dressed a data-entry gap up as a decision somebody could
 * make. They are not invoice numbers (see utils/invoiceNumber.js), so they are
 * no longer keys: a return carrying one finds nothing and is `unmatched`, and
 * the deals holding one are unmatchable until their real number is entered.
 * Rows missing a date or a parseable amount are returned as `invalid`.
 *
 * @param {Array[]} rows        data rows (arrays), header row already removed
 * @param {object}  headerMap   from mapHeaders()
 * @param {object[]} deals      invoiced deals: { id, invoice_number, owner_id, contact_id, amount, final_amount, customer }
 * @param {object}  XLSX        the xlsx module, for date serials
 */
export function buildReturnRows({ rows, headerMap, deals, XLSX = null }) {
  // NORMALISED invoice number -> every deal carrying it, so duplicates are
  // visible rather than being collapsed by a last-one-wins map.
  //
  // Both sides go through parseInvoiceNumbers (utils/invoiceNumber.js), which is
  // what makes the match work at all: the CRM holds 8-digit numbers as people
  // type them (93002906) and this file brings the ERP's 10-digit form
  // (0093002906). Compared as raw strings — which is what this did — they are
  // simply different numbers, so a correctly recorded invoice went unmatched.
  // A deal covering several invoices is now reachable by any one of them, and
  // junk like "1" or "gg" is not a key at all: it cannot match, and it cannot
  // be offered as an ambiguous choice between owners either.
  const byInvoice = new Map();
  (deals || []).forEach((d) => {
    parseInvoiceNumbers(d.invoice_number).forEach((key) => {
      if (!byInvoice.has(key)) byInvoice.set(key, []);
      byInvoice.get(key).push(d);
    });
  });

  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  const invalid = [];

  (rows || []).forEach((row, i) => {
    const isBlank = (row || []).every((c) => String(c ?? '').trim() === '');
    if (isBlank) return;

    const invoiceNo = text(row, headerMap, 'Invoice No');
    const returnDate = toISODate(cell(row, headerMap, 'Date'), XLSX);
    const amount = toAmount(cell(row, headerMap, 'Net value'));

    const record = {
      sheetRow: i + 2,                       // 1-based, +1 for the header row
      return_date: returnDate,
      invoice_no: invoiceNo,
      credit_note_no: text(row, headerMap, 'Credit Note No'),
      item_code: text(row, headerMap, 'Item Code'),
      item_description: text(row, headerMap, 'Item Description'),
      materials_group: text(row, headerMap, 'Materials Group'),
      return_qty: toAmount(cell(row, headerMap, 'Return Qty in PC/TON')),
      unit_price: toAmount(cell(row, headerMap, 'Unit Price')),
      return_amount: amount,
      customer_id: text(row, headerMap, 'Customer Id'),
      customer_name: text(row, headerMap, 'Customer Name'),
      salesman_id: text(row, headerMap, 'Salesman ID'),
      sales_branch: text(row, headerMap, 'Sales Branch'),
    };

    if (!returnDate || isNaN(amount)) {
      invalid.push({
        ...record,
        reason: !returnDate ? 'Date could not be read' : 'Net value could not be read',
      });
      return;
    }

    // The return's own invoice, normalised the same way. A blank or unreadable
    // one finds nothing, which is `unmatched` — never a guess.
    const seenDeals = new Set();
    const hits = [];
    parseInvoiceNumbers(invoiceNo).forEach((n) => {
      (byInvoice.get(n) || []).forEach((d) => {
        if (seenDeals.has(d.id)) return;
        seenDeals.add(d.id);
        hits.push(d);
      });
    });
    if (hits.length === 1) {
      matched.push({ ...record, deal: hits[0], deal_id: hits[0].id });
    } else if (hits.length > 1) {
      ambiguous.push({ ...record, candidates: hits });
    } else {
      unmatched.push({ ...record, deal_id: null });
    }
  });

  return { matched, unmatched, ambiguous, invalid };
}

/**
 * Matched rows grouped by deal, because one invoice can be credited over
 * several lines (partial returns, multiple items) and the preview must show
 * one total per invoice rather than implying one row per invoice.
 */
export function groupByDeal(matched) {
  const map = new Map();
  (matched || []).forEach((r) => {
    if (!map.has(r.deal_id)) {
      map.set(r.deal_id, { deal: r.deal, deal_id: r.deal_id, rows: [], total: 0 });
    }
    const g = map.get(r.deal_id);
    g.rows.push(r);
    g.total += r.return_amount;
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/**
 * Drop rows that repeat the natural key WITHIN one file. The database's unique
 * constraint would reject the whole batch otherwise: Postgres refuses an INSERT
 * ... ON CONFLICT that hits the same key twice in a single statement.
 */
export function dedupeWithinFile(records) {
  const seen = new Set();
  const kept = [];
  const dropped = [];
  (records || []).forEach((r) => {
    const key = [r.credit_note_no || '', r.invoice_no || '', r.item_code || ''].join('\u0000');
    if (seen.has(key)) dropped.push(r); else { seen.add(key); kept.push(r); }
  });
  return { kept, dropped };
}

/** The row as it is stored. Only these columns exist on deal_returns. */
export function toDbRow(record, { companyId, userId }) {
  return {
    deal_id: record.deal_id ?? null,
    company_id: companyId,
    return_date: record.return_date,
    credit_note_no: record.credit_note_no || '',
    invoice_no: record.invoice_no || '',
    item_code: record.item_code || '',
    item_description: record.item_description || null,
    materials_group: record.materials_group || null,
    return_qty: isNaN(record.return_qty) ? null : record.return_qty,
    unit_price: isNaN(record.unit_price) ? null : record.unit_price,
    return_amount: record.return_amount,
    customer_id: record.customer_id || null,
    customer_name: record.customer_name || null,
    salesman_id: record.salesman_id || null,
    sales_branch: record.sales_branch || null,
    created_by: userId || null,
  };
}
