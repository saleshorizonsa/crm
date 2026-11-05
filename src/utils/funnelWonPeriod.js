/**
 * Which period a WON deal belongs to on the Funnel board (sales-pipeline).
 *
 * CEO decision, 2026-11-05: with a period selected, a won deal is shown when
 * EITHER its won date (closed_at) OR its invoice date falls in the period.
 * Insights counts Achieved by invoice_date, so a deal won 28 Oct and invoiced
 * 1 Nov is November's Achieved — and the board used to file it under October
 * only, which made November's invoices look as if they had no deal.
 *
 * The invoice half is isAchievedDeal() from planningCalculations.js — the very
 * rule Insights uses — so the two screens cannot drift apart. Lost and open
 * deals, and All Time, are not touched by anything here.
 *
 * Dates are Riyadh calendar days, compared as 'yyyy-MM-dd' strings:
 *   closed_at    timestamptz → its day in Asia/Riyadh (never toISOString(),
 *                which files 00:00–03:00 Riyadh under the previous day)
 *   invoice_date DATE        → already a calendar day, sliced, never parsed
 */
import { isAchievedDeal } from './planningCalculations';

const RIYADH_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** yyyy-MM-dd in Riyadh. A bare date is already a calendar date and is kept. */
export function riyadhDay(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : RIYADH_DAY.format(d);
}

/** The day a won deal was won. created_at is the board's existing fallback. */
export function wonDayOf(deal) {
  return riyadhDay(deal?.closed_at || deal?.created_at);
}

/** The day a won deal was invoiced, by the Achieved rule; null if it isn't. */
export function invoiceDayOf(deal) {
  return isAchievedDeal(deal) ? String(deal.invoice_date).slice(0, 10) : null;
}

/**
 * Where one won deal stands against a period { start, end } (yyyy-MM-dd,
 * inclusive). `shown` is the board's rule; the other two say why.
 */
export function wonPeriodMatch(deal, { start, end }) {
  const won = wonDayOf(deal);
  const wonHere = Boolean(won) && won >= start && won <= end;
  const invoicedHere = isAchievedDeal(deal, { start, end });
  return { wonHere, invoicedHere, shown: wonHere || invoicedHere };
}

const amountOf = (d) => Number(d?.amount) || 0;

/**
 * The Won column's header split. Every shown deal falls in exactly one bucket,
 * so the two always add back to the total:
 *   invoiced    — invoiced in the period (whenever it was won)
 *   notInvoiced — won in the period and NOT invoiced in it: still uninvoiced,
 *                 or invoiced after the period ended
 * Amounts are deal.amount, the figure the column already totals.
 */
export function splitWonColumn(deals, period) {
  const out = {
    total: { count: 0, value: 0 },
    invoiced: { count: 0, value: 0 },
    notInvoiced: { count: 0, value: 0 },
  };
  for (const d of deals || []) {
    if (d?.stage !== 'won') continue;
    const m = wonPeriodMatch(d, period);
    if (!m.shown) continue;
    const bucket = m.invoicedHere ? out.invoiced : out.notInvoiced;
    bucket.count += 1;
    bucket.value += amountOf(d);
    out.total.count += 1;
    out.total.value += amountOf(d);
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (ymd, withYear) => {
  const [y, m, d] = ymd.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${withYear ? ` ${y}` : ''}`;
};

/**
 * "Won 28 Oct · Invoiced 1 Nov" for an invoiced won deal whose two dates are
 * in different months; null otherwise (the card keeps what it shows today).
 * The year is added only when the two years differ.
 */
export function wonInvoicedLabel(deal) {
  if (deal?.stage !== 'won') return null;
  const won = wonDayOf(deal);
  const inv = invoiceDayOf(deal);
  if (!won || !inv || won.slice(0, 7) === inv.slice(0, 7)) return null;
  const withYear = won.slice(0, 4) !== inv.slice(0, 4);
  return `Won ${shortDay(won, withYear)} · Invoiced ${shortDay(inv, withYear)}`;
}
