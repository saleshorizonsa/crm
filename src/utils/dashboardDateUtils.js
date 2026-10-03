import { format, startOfMonth, endOfMonth } from 'date-fns';

/**
 * Build an ISO date range from the dashboard's integer-based filter state.
 * month: 0-11 (JS month index) or null = "All Months"
 * quarter: 0-3 (Q1=0, Q4=3)  or null = "All Quarters"
 * year:  integer (e.g. 2026)  or null = "All Years" (defaults to current year)
 */
export function buildDateRange(month, quarter, year) {
  const y = year != null ? parseInt(year) : new Date().getFullYear();

  if (month != null) {
    const lastDay = new Date(y, month + 1, 0).getDate();
    const m = month + 1; // 1-indexed for the date string
    return {
      from: `${y}-${String(m).padStart(2, '0')}-01`,
      to:   `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  if (quarter != null) {
    const startM = quarter * 3 + 1; // 1-indexed
    const endM = startM + 2;
    const lastDay = new Date(y, endM, 0).getDate();
    return {
      from: `${y}-${String(startM).padStart(2, '0')}-01`,
      to:   `${y}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  return {
    from: `${y}-01-01`,
    to:   `${y}-12-31`,
  };
}

/**
 * Infer integer-based filter state from an ISO date range.
 * Returns { selectedMonth (0-11 or null), selectedQuarter (0-3 or null), selectedYear (int or null) }.
 */
export function syncDropdownsFromRange(from, to) {
  const fromDate = new Date(from);
  const toDate   = new Date(to);
  const diffDays = Math.round((toDate - fromDate) / 86_400_000);
  const year  = fromDate.getFullYear();
  const month = fromDate.getMonth(); // 0-indexed

  if (diffDays <= 31) {
    return {
      selectedMonth:   month,
      selectedQuarter: Math.floor(month / 3),
      selectedYear:    year,
    };
  }
  if (diffDays <= 92) {
    return {
      selectedMonth:   null,
      selectedQuarter: Math.floor(month / 3),
      selectedYear:    year,
    };
  }
  if (diffDays <= 366) {
    return {
      selectedMonth:   null,
      selectedQuarter: null,
      selectedYear:    year,
    };
  }
  return {
    selectedMonth:   null,
    selectedQuarter: null,
    selectedYear:    null,
  };
}

/**
 * Format an ISO date range as "1 May 2026 – 31 May 2026".
 */
export function formatViewingLabel(from, to) {
  try {
    const f = format(new Date(from + 'T00:00:00'), 'd MMM yyyy');
    const t = format(new Date(to   + 'T00:00:00'), 'd MMM yyyy');
    return `${f} – ${t}`;
  } catch {
    return '';
  }
}

/**
 * A concise period label for a range: "August 2026" / "Q3 2026" / "2026",
 * falling back to the raw date span for arbitrary custom ranges.
 */
export function periodLabelFromRange(from, to) {
  if (!from || !to) return '';
  const { selectedMonth, selectedQuarter, selectedYear } = syncDropdownsFromRange(from, to);
  if (selectedMonth != null && selectedYear != null) {
    return format(new Date(selectedYear, selectedMonth, 1), 'MMMM yyyy');
  }
  if (selectedQuarter != null && selectedYear != null) {
    return `Q${selectedQuarter + 1} ${selectedYear}`;
  }
  if (selectedYear != null) return `${selectedYear}`;
  return formatViewingLabel(from, to);
}

// True for the "This Year" view. It deliberately keys off the START of the
// range only: the quick-select "This Year" runs 1 Jan .. TODAY, so requiring
// the end to land in December made this return false all year and left the
// annual-target branch in kpiStripData unreachable from the UI.
export function isAnnualRange(from, to) {
  if (!from || !to) return false;
  const n = new Date();
  const yearStart = `${n.getFullYear()}-01-01`;
  // Local date, not toISOString(): getQuickRanges builds `to` from the local
  // clock, so comparing against a UTC "today" would read false for part of
  // each day in any timezone behind UTC and silently disable the annual view.
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  // `to >= today` keeps "This Year" (Jan 1 .. today) true while excluding a
  // custom part-year range such as Jan 1 .. Mar 31.
  return from === yearStart && to >= today;
}

/**
 * Five plain-English quick-select date ranges for dashboard buttons.
 */
/**
 * Is this range exactly the CURRENT month, still in progress?
 *
 * Three things are only meaningful for that range and are hidden otherwise:
 * the pacing verdict (it divides by the day of the month), the Future carry-in
 * line (it means "what is visible for next month", forward-looking), and the
 * Coverage Console's combined row status (half of which is pacing). For a past,
 * future or multi-month range no verdict is more honest than a misleading one.
 */
export function isCurrentMonthRange(from, to) {
  if (!from || !to) return false;
  const n = new Date();
  const start = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
  const end = new Date(n.getFullYear(), n.getMonth() + 1, 0);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return from === start && to === endStr;
}

/**
 * "All Time" (2025-01-01 .. today) as getQuickRanges builds it.
 *
 * Targets are only ever recorded per month, and the earliest rows in this
 * database are 2026, so an all-time TARGET is the same 2026 sum while Achieved
 * spans everything — a ratio between two different spans. Target-derived
 * figures are suppressed for this range rather than shown as a false
 * comparison; Achieved and the funnel are still real and still shown.
 */
export function isAllTimeRange(from, to) {
  if (!from || !to) return false;
  const n = new Date();
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  return from === '2025-01-01' && to >= today;
}

export function getQuickRanges() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const fmt   = d => format(d, 'yyyy-MM-dd');

  // WHOLE calendar periods, not "up to today".
  //
  // These three used to end at `now`, which made this component disagree with
  // every other date control in the app: DateRangePicker and the Forecast page's
  // own buttons both emit endOfMonth / endOfQuarter / endOfYear. The same label
  // therefore meant two different windows depending on which control you used,
  // and a dashboard renders BOTH — the picker above it and this row inside it.
  //
  // Capping only moved the END into the past, so it only ever suppressed
  // FORWARD-looking data: open deals and opportunities dated later in the period.
  // For JASCO PVC "This Month" hid 5 open deals worth 2,233,178 dated after the
  // 3rd, about three quarters of the month's funnel. Nothing keyed on created_at
  // or closed_at can be affected, because those cannot be in the future.
  //
  // It also made the period-shape helpers below disagree with their own buttons:
  // isCurrentMonthRange() wants the whole month, so clicking "This Month" used to
  // switch the pacing verdict OFF. Now it matches, and the verdict stays.
  //
  // "Last Month" was already whole. "All Time" still ends today, which is what
  // all-time means — there is no future end to extend to.
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd   = endOfMonth(now);

  const lastMonthStart = startOfMonth(new Date(year, month - 1, 1));
  const lastMonthEnd   = endOfMonth(new Date(year, month - 1, 1));

  const currentQ = Math.floor(month / 3);
  const qStart   = new Date(year, currentQ * 3, 1);
  const qEnd     = endOfMonth(new Date(year, currentQ * 3 + 2, 1));

  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year, 11, 31);

  return [
    {
      label:  'This Month',
      from:   fmt(thisMonthStart),
      to:     fmt(thisMonthEnd),
      type:   'monthly',
      period: format(now, 'MMMM yyyy'),
    },
    {
      label:  'Last Month',
      from:   fmt(lastMonthStart),
      to:     fmt(lastMonthEnd),
      type:   'monthly',
      period: format(lastMonthStart, 'MMMM yyyy'),
    },
    {
      label:  'This Quarter',
      from:   fmt(qStart),
      to:     fmt(qEnd),
      type:   'quarterly',
      period: `Q${currentQ + 1} ${year}`,
    },
    {
      label:  'This Year',
      from:   fmt(yearStart),
      to:     fmt(yearEnd),
      type:   'yearly',
      period: String(year),
    },
    {
      label:  'All Time',
      from:   '2025-01-01',
      to:     fmt(now),
      type:   'alltime',
      period: 'All Time',
    },
  ];
}

export function getPreviousPeriod(dateFrom, dateTo) {
  const from   = new Date(dateFrom);
  const to     = new Date(dateTo);
  const diffMs = to.getTime() - from.getTime();
  const prevTo   = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - diffMs);
  return {
    from: format(prevFrom, 'yyyy-MM-dd'),
    to:   format(prevTo,   'yyyy-MM-dd'),
  };
}

export function calcChange(current, previous) {
  if (previous === null || previous === undefined || previous === 0) {
    return current > 0 ? '+100%' : null;
  }
  const pct     = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return null;
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

export function isPositiveChange(changeStr) {
  if (!changeStr) return null;
  if (changeStr.startsWith('+')) return true;
  if (changeStr.startsWith('-')) return false;
  return null;
}

export function getComparisonLabel(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return 'vs previous period';
  const days = Math.round(
    (new Date(dateTo) - new Date(dateFrom)) / 86400000
  );
  if (days <= 31)  return 'vs last month';
  if (days <= 92)  return 'vs last quarter';
  if (days <= 366) return 'vs last year';
  return 'vs previous period';
}
