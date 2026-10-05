// IMPORTED HISTORY — the one way to tell a loaded-in invoice from a deal
// somebody actually worked.
//
// JASCO PVC's CRM started mid-year, so the months before it were loaded in as
// deals that were already won and already invoiced. They can only ever be
// "won": there is no version of one of those rows that was lost, and none of
// them ever sat in a pipeline. Counting them in a win or conversion rate
// therefore inflates every rate on every screen — company 74.2% instead of
// 62.7%, Amer 89.2% instead of 81.7% — and an inflated rate UNDERSTATES
// Required Plan, because Required Plan is target ÷ rate. The better a month's
// imported history looks, the less pipeline the system asks for.
//
// CEO decision, 2026-10-05 (D1): imported history never counts in a win or
// conversion rate. It still counts in Achieved — the money is real.
//
// THE MARKER. Until now the only marker was invoice_number LIKE 'PRE-CRM-%',
// which the new "Correct invoice no." action can overwrite the moment somebody
// types the real ERP number onto one of those deals. deals.is_imported is the
// durable one (migrations/add_deals_is_imported.sql). Both are honoured, so
// this works before and after that migration is applied.

/** The placeholder the history load wrote into invoice_number. */
const IMPORTED_INVOICE_PATTERN = /^\s*pre[-_\s]?crm/i;

/** Columns a caller must select for isImportedDeal to be able to answer. */
export const IMPORTED_DEAL_FIELDS = 'invoice_number, is_imported';

/**
 * Is this row loaded-in history rather than a deal somebody worked?
 *
 * @param {object} deal needs is_imported and/or invoice_number
 */
export function isImportedDeal(deal) {
  if (!deal) return false;
  if (deal.is_imported === true) return true;
  return IMPORTED_INVOICE_PATTERN.test(String(deal.invoice_number ?? ''));
}

/** The same list with imported history dropped. */
export function excludeImported(deals) {
  return (deals || []).filter((d) => !isImportedDeal(d));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An order logged AFTER the fact: created and won inside a day.
 *
 * Not imported history — these are real orders — but they never passed through
 * a pipeline either, so including them in a conversion rate measures data entry
 * rather than selling. CEO decision, 2026-10-05 (D2): they are excluded from
 * the INFORMATION-ONLY pipeline conversion figure, from both halves of the
 * ratio, and from nothing else.
 */
export function isSameDayOrder(deal) {
  if (!deal || deal.stage !== 'won') return false;
  const created = deal.created_at ? Date.parse(deal.created_at) : NaN;
  const closed = deal.closed_at ? Date.parse(deal.closed_at) : NaN;
  if (Number.isNaN(created) || Number.isNaN(closed)) return false;
  return closed - created < DAY_MS;
}

/** True for the Postgres error you get asking for a column that is not there. */
export function isMissingColumnError(error) {
  if (!error) return false;
  return error.code === '42703'
    || /does not exist|could not find.*column|unknown column/i.test(error.message || '');
}

/**
 * Run a `deals` query that WANTS is_imported, and fall back to the same query
 * without it while the column does not exist.
 *
 * Selecting a column that is not there is not a soft failure in PostgREST — the
 * whole request 400s — so adding `is_imported` to a select before the migration
 * is applied would break every rate on every screen at once. This asks for it,
 * and on exactly that error asks again without it; the invoice_number half of
 * isImportedDeal carries the rule until the column lands.
 *
 * @param {(select: string) => PromiseLike<{data: any, error: any}>} run
 * @param {string} baseSelect the columns other than is_imported
 */
export async function queryDealsWithImportFlag(run, baseSelect) {
  const withFlag = await run(`${baseSelect}, is_imported`);
  if (!withFlag.error) return withFlag;
  if (!isMissingColumnError(withFlag.error)) return withFlag;
  return run(baseSelect);
}
