// ONE definition of what an ERP invoice number is, for both sides of the only
// question it has to answer: does this credit note belong to this deal?
//
// deals.invoice_number is free text, and it shows. Of 119 invoiced JASCO PVC
// deals since 1 August 2026, 42 carry something that is not a number anyone can
// match — "1", "11", "gg", "J5412", "INVOICE: 93002807", "93002819/93002820",
// and 21 'PRE-CRM-…' placeholders from the history import. deal_returns can
// only find a deal BY invoice number, so every one of those 3,026,094 SAR of
// deals is permanently unmatchable.
//
// THE SHAPE: JASCO's ERP numbers are 8 digits as people type them in the CRM
// (93002906) and 10 digits with leading zeros in the returns file (0093002802).
// They are the same invoice. Everything here normalises to the 10-digit form,
// so the two spellings compare equal — which is the whole point of having one
// module rather than a trim() on each side.

/** Labels people type in front of the number. Stripped before parsing. */
const LABEL_PATTERN = /\b(invoice|inv|bill|fatura|فاتورة)\b\s*(no\.?|number|#)?\s*[:.#-]*/gi;

/** What separates several invoices in one field: / , ; & or any whitespace. */
const SEPARATOR_PATTERN = /[/,;&+|\\]+|\s+/;

const MIN_DIGITS = 8;
const MAX_DIGITS = 10;
export const INVOICE_DIGITS = MAX_DIGITS;

/** The placeholder the history import wrote for pre-CRM invoices. */
const PLACEHOLDER_PATTERN = /^\s*pre[-_\s]?crm\b/i;

/**
 * True for a 'PRE-CRM-…' placeholder. Those rows are real history — the deal
 * was invoiced before the CRM existed — so they are left alone wherever they
 * are already stored, and simply never offered as a matchable number.
 */
export function isPlaceholderInvoice(text) {
  return PLACEHOLDER_PATTERN.test(String(text ?? ''));
}

/**
 * Every ERP invoice number in a free-text field, normalised to 10 digits.
 *
 * One deal can legitimately cover several invoices, so this returns a LIST.
 * Anything that is not 8–10 digits once the labels and punctuation are gone is
 * rejected rather than guessed at: "1" and "11" are placeholders two dozen
 * deals share, and treating them as invoice numbers is how a credit note ends
 * up charged to an arbitrary owner.
 *
 * @param {string} text
 * @returns {string[]} zero or more 10-digit numbers, in the order given, deduped
 */
export function parseInvoiceNumbers(text) {
  const raw = String(text ?? '');
  if (!raw.trim()) return [];
  if (isPlaceholderInvoice(raw)) return [];

  const withoutLabels = raw.replace(LABEL_PATTERN, ' ');
  const out = [];
  const seen = new Set();

  withoutLabels.split(SEPARATOR_PATTERN).forEach((token) => {
    if (!token) return;
    const digits = token.replace(/\D/g, '');
    if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return;
    // All-zero and other degenerate runs are not invoice numbers.
    if (!/[1-9]/.test(digits)) return;
    const padded = digits.padStart(MAX_DIGITS, '0');
    if (seen.has(padded)) return;
    seen.add(padded);
    out.push(padded);
  });

  return out;
}

/** True when `text` contains at least one usable invoice number. */
export function hasValidInvoiceNumber(text) {
  return parseInvoiceNumbers(text).length > 0;
}

/**
 * How a parsed list is stored in deals.invoice_number, which stays a text
 * column in this task: the normalised numbers, comma-separated. Reading it back
 * through parseInvoiceNumbers returns the same list, so the column round-trips.
 */
export function formatInvoiceNumbers(list) {
  return (list || []).join(', ');
}

/**
 * Do a deal's invoice numbers include this one? Both sides go through the same
 * parser, so 93002906 on the deal matches 0093002906 in the returns file.
 */
export function invoiceMatches(dealInvoiceText, returnInvoiceText) {
  const theirs = parseInvoiceNumbers(returnInvoiceText);
  if (!theirs.length) return false;
  const ours = new Set(parseInvoiceNumbers(dealInvoiceText));
  return theirs.some((n) => ours.has(n));
}

/** Why a stored value is not usable — for the data-quality report and the UI. */
export function invoiceIssue(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return 'missing';
  if (isPlaceholderInvoice(raw)) return 'placeholder';
  const parsed = parseInvoiceNumbers(raw);
  if (!parsed.length) return 'junk';
  if (parsed.length > 1) return 'multiple';
  // One number, but the field carries more than that number.
  if (raw.replace(/\D/g, '') !== raw) return 'extra text';
  return null;
}
