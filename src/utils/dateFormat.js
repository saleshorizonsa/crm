/**
 * Local-calendar formatting (avoids UTC shift from Date#toISOString()).
 * YYYY-MM-DD is valid for Postgres `date` and common API date fields.
 */
export function formatLocalDateYMD(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM for UI filters/options from a local Date. */
export function formatLocalYearMonth(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}


/**
 * YYYY-MM from stored period_start (YYYY-MM-DD or ISO). Prefers the string prefix so
 * date-only values are not interpreted as UTC midnight (which skews local month).
 */
export function yearMonthFromDateString(value) {
  const s = String(value ?? "");
  const match = s.match(/^(\d{4}-\d{2})/);
  if (match) return match[1];
  return formatLocalYearMonth(new Date(value));
}
