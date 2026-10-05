import { computeAchieved, achievedAmount } from './planningCalculations';

// Achieved as a SERIES — the one way every revenue chart on every dashboard
// buckets money into months, quarters or years.
//
// Seven places built their own: `stage === 'won'` bucketed by
// `new Date(closed_at || created_at)`, valued at `amount`, for every owner,
// against a hard-coded `new Date().getFullYear()`. So a bar chart disagreed
// with the KPI strip directly above it, deals that were won but never invoiced
// appeared as revenue, credit notes were ignored, a deal invoiced in October
// but closed in September landed in September, and selecting 2025 still drew
// 2026's months.
//
// Nothing here defines Achieved: computeAchieved (utils/planningCalculations.js)
// does, once, per bucket, with the bucket's own window — which is also what
// keeps returns in the right month, since a credit note reduces the month it
// was raised in, not the month of the invoice it cancels.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

/** Last day of a month, without going near toISOString(). */
const lastDay = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

/** The twelve months of `year`, as yyyy-MM-dd windows. */
export function monthBuckets(year) {
  return MONTHS.map((label, month) => ({
    key: label,
    label,
    month,
    year,
    start: `${year}-${pad(month + 1)}-01`,
    end: `${year}-${pad(month + 1)}-${pad(lastDay(year, month))}`,
  }));
}

/** The four quarters of `year`. */
export function quarterBuckets(year) {
  return [0, 1, 2, 3].map((q) => {
    const first = q * 3;
    const last = first + 2;
    return {
      key: `Q${q + 1}`,
      label: `Q${q + 1}`,
      quarter: q,
      year,
      months: [first, first + 1, last],
      start: `${year}-${pad(first + 1)}-01`,
      end: `${year}-${pad(last + 1)}-${pad(lastDay(year, last))}`,
    };
  });
}

/** One bucket per year in `years`. */
export function yearBuckets(years) {
  return (years || []).map((year) => ({
    key: String(year),
    label: String(year),
    year,
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  }));
}

/**
 * Buckets for a dashboard's month/quarter/year toggle, for ONE year — the year
 * the user is actually looking at, never `new Date()`.
 *
 * @param {'month'|'quarter'|'year'} period
 * @param {number} year
 * @param {number} [yearsBack] how many years the 'year' view spans, ending at `year`
 */
export function bucketsFor(period, year, yearsBack = 3) {
  if (period === 'month') return monthBuckets(year);
  if (period === 'quarter') return quarterBuckets(year);
  return yearBuckets(
    Array.from({ length: Math.max(1, yearsBack) }, (_, i) => year - (yearsBack - 1) + i),
  );
}

/**
 * Achieved per bucket, by the shared rule, net of returns dated in that bucket.
 *
 * @param {object[]} p.deals          deal rows already in hand
 * @param {string[]} p.contributorIds whose deals count (achieverIdsFrom)
 * @param {object[]} p.buckets        from monthBuckets / quarterBuckets / yearBuckets
 * @param {object[]} [p.returns]      credit notes already in hand, any window
 * @param {function} [p.amountOf]     value of one deal; defaults to achievedAmount
 * @returns {object[]} each bucket plus { revenue, deals } (deals = invoice count)
 */
export function achievedForBuckets({
  deals = [], contributorIds = [], buckets = [], returns = [], amountOf = achievedAmount,
}) {
  return buckets.map((bucket) => {
    const { total, count } = computeAchieved({
      deals,
      contributorIds,
      start: bucket.start,
      end: bucket.end,
      amountOf,
      returns,
    });
    return { ...bucket, name: bucket.label, period: bucket.label, revenue: total, deals: count };
  });
}

/** The widest window a set of buckets covers, for ONE returns read. */
export function bucketsWindow(buckets) {
  const days = (buckets || []).flatMap((b) => [b.start, b.end]).filter(Boolean).sort();
  return days.length ? { start: days[0], end: days[days.length - 1] } : null;
}

/**
 * The year a selected range belongs to: its START year.
 *
 * Sliced from the string rather than parsed, so a range that begins
 * 2026-01-01 does not become 2025 in any timezone behind UTC.
 */
export function rangeYear(from, fallback = new Date().getFullYear()) {
  const y = Number(String(from || '').slice(0, 4));
  return Number.isFinite(y) && y > 1970 ? y : fallback;
}

/** First year any data exists for. Targets and deals both start in 2025. */
export const FIRST_DATA_YEAR = 2025;

/**
 * The year dropdown, generated: 2025 .. next year.
 *
 * It was a hard-coded `[2025, 2026]` in four dashboards, so on 1 January 2027
 * every one of them would have offered no way to look at the year people were
 * working in. Next year is included because targets are set before it starts.
 */
export function yearOptions(now = new Date()) {
  const last = now.getFullYear() + 1;
  const years = [];
  for (let y = FIRST_DATA_YEAR; y <= last; y += 1) {
    years.push({ value: y, label: String(y), year: y });
  }
  return years;
}
