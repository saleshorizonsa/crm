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
 * Five plain-English quick-select date ranges for dashboard buttons.
 */
export function getQuickRanges() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const fmt   = d => format(d, 'yyyy-MM-dd');

  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd   = now;

  const lastMonthStart = startOfMonth(new Date(year, month - 1, 1));
  const lastMonthEnd   = endOfMonth(new Date(year, month - 1, 1));

  const currentQ = Math.floor(month / 3);
  const qStart   = new Date(year, currentQ * 3, 1);
  const qEnd     = endOfMonth(new Date(year, currentQ * 3 + 2, 1));

  const yearStart = new Date(year, 0, 1);

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
      to:     fmt(now < qEnd ? now : qEnd),
      type:   'quarterly',
      period: `Q${currentQ + 1} ${year}`,
    },
    {
      label:  'This Year',
      from:   fmt(yearStart),
      to:     fmt(now),
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
