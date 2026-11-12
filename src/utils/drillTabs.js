/**
 * TABS AND SEARCH INSIDE A DRILL SHEET (session 36, CEO 2026-11-12).
 *
 * Pure, so the rule is testable without a screen. A sheet's tabs are only
 * FILTERS over rows the card already has — nothing here computes a figure —
 * so every tab's count is the number of rows it lists, and a tab's total is
 * the same value function the card uses, summed over those rows.
 *
 *   tabs = {
 *     base: { rows, build, total, columns, unit, explain, searchKeys },
 *     sets: [                       // one row of buttons per set
 *       { id, options: [
 *         { id, label, hint,
 *           rows?,                  // its OWN rows (a different kind of row), or
 *           filter?,                // a filter over the rows so far
 *           build?, total?, columns?, unit?, explain? },   // overrides
 *       ] },
 *     ],
 *   }
 *
 * Sets combine: each later set filters what the earlier ones chose (the
 * Exceptions sheet: severity × group). `build(rows)` returns DrillSheet
 * children (division → salesman → …) and `total(rows)` the figure, so a
 * drill-down inside a tab sees exactly the tab's rows.
 */

/**
 * Text as a search compares it: lower case, diacritics off, and the Arabic
 * letters people type interchangeably made one — so "احمد" finds "أحمد" and
 * "مؤسسة" finds "مؤسسه".
 */
export function normalizeSearch(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')            // Latin accents
    .replace(/[ً-ٰٟـ]/g, '') // Arabic harakat, dagger alef, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** By salesman, customer, invoice or deal name. */
export const DEFAULT_SEARCH_KEYS = ['person', 'customer', 'invoiceNumber', 'title', 'dealTitle'];

export function rowMatches(row, query, keys = DEFAULT_SEARCH_KEYS) {
  const q = normalizeSearch(query);
  if (!q) return true;
  return keys.some((k) => normalizeSearch(row?.[k]).includes(q));
}

const PICK = ['build', 'total', 'columns', 'unit', 'explain', 'searchKeys', 'groupLabels'];

/** Rows and settings after applying `selection` (one option id per set). */
function apply(tabs, selection) {
  let rows = tabs.base?.rows || [];
  let cfg = { ...(tabs.base || {}) };
  const labels = [];
  const hints = [];
  (tabs.sets || []).forEach((set, i) => {
    const opt = set.options.find((o) => o.id === selection[i]) || set.options[0];
    if (!opt) return;
    if (Array.isArray(opt.rows)) rows = opt.rows;
    else if (opt.filter) rows = rows.filter(opt.filter);
    PICK.forEach((k) => { if (opt[k] !== undefined) cfg[k] = opt[k]; });
    if (!opt.isAll) labels.push(opt.label);
    if (opt.hint) hints.push(opt.hint);
  });
  return { rows, cfg, labels, hints };
}

/** The first option of every set: the default tab. */
export const defaultSelection = (tabs) => (tabs?.sets || []).map((s) => s.options[0]?.id);

/**
 * Everything the sheet shows for a selection and a search.
 *
 * @returns {{ sets, rows, allRows, cfg, labels, hints, total, children }}
 *   sets: the buttons, each with `count` (rows after search) and `active`
 */
export function resolveTabs(tabs, selection, query = '') {
  const sel = selection && selection.length ? selection : defaultSelection(tabs);
  const searchOf = (cfg) => (r) => rowMatches(r, query, cfg.searchKeys || DEFAULT_SEARCH_KEYS);
  const current = apply(tabs, sel);
  const rows = current.rows.filter(searchOf(current.cfg));
  const sets = (tabs.sets || []).map((set, i) => ({
    id: set.id,
    options: set.options.map((o) => {
      const trial = [...sel];
      trial[i] = o.id;
      const r = apply(tabs, trial);
      const count = r.rows.filter(searchOf(r.cfg)).length;
      return { id: o.id, label: o.label, hint: o.hint || null, count, active: (sel[i] ?? set.options[0]?.id) === o.id };
    }),
  }));
  const total = current.cfg.total ? current.cfg.total(rows) : rows.length;
  const children = current.cfg.build ? current.cfg.build(rows) : null;
  return {
    sets, rows, allRows: current.rows, cfg: current.cfg, labels: current.labels, hints: current.hints, total, children,
  };
}

/**
 * The rows of an Excel sheet, from the columns the screen shows: numbers as
 * numbers, dates as dates, money headed "(SAR)".
 */
export function excelRows(rows, columns, unit = 'SAR') {
  return (rows || []).map((r) => Object.fromEntries((columns || []).map((c) => {
    const v = r[c.key];
    // Money is always SAR, whatever the sheet counts (people, contacts…).
    const head = c.type === 'money' ? `${c.label} (SAR)` : c.label;
    if (c.type === 'money' || c.type === 'int' || c.type === 'pct') return [head, v === null || v === undefined || v === '' ? null : Number(v)];
    if (c.type === 'date' || c.type === 'month') {
      const d = v ? new Date(String(v).length === 10 ? `${v}T00:00:00` : v) : null;
      return [head, d && !Number.isNaN(d.getTime()) ? d : null];
    }
    if (c.type === 'flags') return [head, (v || []).join(' ')];
    return [head, v === null || v === undefined ? '' : String(v)];
  })));
}

/** "Sales Monitor - Plan submission - Not submitted - November 2026" (no extension). */
export const exportFileName = ({ prefix = 'Sales Monitor', card, tabLabels = [], period = '' }) => (
  [prefix, card, ...(tabLabels.length ? [tabLabels.join(' + ')] : []), period].filter(Boolean).join(' - ')
    .replace(/[\\/:*?"<>|]+/g, '-')
);
