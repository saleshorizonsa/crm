import { format } from 'date-fns';

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
