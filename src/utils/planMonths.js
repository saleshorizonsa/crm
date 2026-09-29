// Which month a plan is for, and when next month's plan may be submitted early.
//
// All of it is pure and takes `now` as an argument, so the month-boundary
// behaviour can be tested without waiting for a real month to end — the reason
// this is a module rather than a few inline date expressions in the page.
//
// plan_submissions is keyed by (company_id, owner_id, plan_month), and
// plan_month is always the FIRST of the month as yyyy-MM-01. Nothing here adds
// a schema concept: next month's plan is simply another row with a different
// plan_month.

const pad = (n) => String(n).padStart(2, '0');

/** yyyy-MM-01 for the month `d` falls in. */
export function monthKeyOf(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

/** yyyy-MM-01 for the month after the one `d` falls in (rolls the year). */
export function nextMonthKeyOf(d = new Date()) {
  return monthKeyOf(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

/** Days in the month `d` falls in. */
export function daysInMonthOf(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * EARLY WINDOW = the last 7 days of the current month, computed as
 * "last day − 6" rather than a fixed date. A 31-day month opens on the 25th,
 * a 30-day month on the 24th, February on the 22nd (or 23rd in a leap year).
 * Always exactly 7 days, always ending on the last day of the month.
 *
 * It deliberately overlaps the current month's own 25th deadline near
 * month-end. The two are independent submissions with different plan_month
 * values and both can be open at once; the UI shows them side by side rather
 * than letting one hide the other.
 */
export function earlyWindowOpensOn(d = new Date()) {
  return daysInMonthOf(d) - 6;
}

/** True while next month's plan may be submitted early. */
export function isEarlyWindowOpen(d = new Date()) {
  return d.getDate() >= earlyWindowOpensOn(d);
}

/** The Date the window opens, for display. */
export function earlyWindowOpensAt(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), earlyWindowOpensOn(d));
}

/** First and last day of a plan month, as yyyy-MM-dd. */
export function monthBoundsOf(planMonth) {
  const [y, m] = String(planMonth).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

/** The 25th of the plan month — the submission deadline, unchanged. */
export function deadlineFor(planMonth) {
  const [y, m] = String(planMonth).split('-').map(Number);
  return `${y}-${pad(m)}-25`;
}

/**
 * Late only once the plan month's own 25th has passed. A next-month plan
 * submitted during the early window is therefore never late — its deadline
 * is still weeks away, which is the point of submitting early.
 */
export function isLateFor(planMonth, now = new Date()) {
  const d = deadlineFor(planMonth);
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return today > d;
}

/** "October 2026" — for labelling a submission by the month it is for. */
export function monthLabelOf(planMonth, opts = { month: 'long', year: 'numeric' }) {
  return new Date(`${planMonth}T00:00:00`).toLocaleString('en-US', opts);
}

/** "October" — the short form, for tabs and chips. */
export function monthNameOf(planMonth) {
  return monthLabelOf(planMonth, { month: 'long' });
}

/**
 * The two months a person may be planning right now: always the current one,
 * plus next month while the window is open. Ordered current-first, which is
 * the order they are shown in.
 */
export function plannableMonths(now = new Date()) {
  const months = [{ key: monthKeyOf(now), which: 'current' }];
  if (isEarlyWindowOpen(now)) months.push({ key: nextMonthKeyOf(now), which: 'next' });
  return months;
}
