import { useEffect, useState } from 'react';
import { supabase } from 'lib/supabase';
import { isMissingColumn } from 'utils/missingColumn';

/**
 * VISIT PURPOSE AND COLLECTION (session 40, CEO 2026-11-16).
 *
 * Every visit, call and WhatsApp says what it was for, and a collection says
 * how much was collected. The columns arrive with
 * migrations/visit_purpose_collection.sql; until it is applied:
 *   - the forms hide the field and save exactly as before (usePurposeColumns);
 *   - readers treat every contact as Sales with nothing collected.
 * An old row (NULL) is Sales.
 */
export const PURPOSES = [
  { id: 'sales', label: 'Sales' },
  { id: 'collection', label: 'Collection' },
  { id: 'service', label: 'Service / complaint' },
  { id: 'delivery', label: 'Delivery follow-up' },
];
export const PURPOSE_IDS = PURPOSES.map((p) => p.id);
export const DEFAULT_PURPOSE = 'sales';
export const PURPOSE_LABEL = Object.fromEntries(PURPOSES.map((p) => [p.id, p.label]));
/** Short words for a split line: "120 sales · 12 collection · 4 service". */
export const PURPOSE_SHORT = { sales: 'sales', collection: 'collection', service: 'service', delivery: 'delivery' };

/** A row's purpose: its own, else Sales (NULL = a contact from before the field). */
export const purposeOf = (row) => (PURPOSE_IDS.includes(row?.visit_purpose) ? row.visit_purpose : DEFAULT_PURPOSE);
/** A row's amount collected, a number ≥ 0 (0 when none). */
export const collectedOf = (row) => {
  const n = Number(row?.collected_amount);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Whether BOTH tables carry the columns. Asked once per page load: a select
 * naming a missing column is refused by PostgREST with 42703 / PGRST204.
 * Any other failure (network) is treated as "not known yet" → hidden, so a
 * form never sends a column that may not exist.
 */
let probe = null;
export function probePurposeColumns() {
  if (!probe) {
    probe = Promise.all([
      supabase.from('contact_reports').select('id, visit_purpose, collected_amount').limit(1),
      supabase.from('activities').select('id, visit_purpose, collected_amount').limit(1),
    ]).then(([a, b]) => !a.error && !b.error)
      .catch(() => false)
      .then((ok) => {
        // A failed probe is asked again next time rather than cached as "no".
        if (!ok) probe = null;
        return ok;
      });
  }
  return probe;
}
/** For tests and for a page that knows the schema changed. */
export const resetPurposeProbe = () => { probe = null; };

/** React: null while asking, then true / false. */
export function usePurposeColumns() {
  const [has, setHas] = useState(null);
  useEffect(() => {
    let alive = true;
    probePurposeColumns().then((ok) => { if (alive) setHas(ok); });
    return () => { alive = false; };
  }, []);
  return has;
}

/**
 * The two fields for an insert, or nothing when the columns are not there.
 * amount: the typed text; blank → NULL; only kept for a collection.
 */
export function purposeFields(hasColumns, purpose, amount) {
  if (!hasColumns) return {};
  const p = PURPOSE_IDS.includes(purpose) ? purpose : DEFAULT_PURPOSE;
  const n = Number(String(amount ?? '').replace(/,/g, ''));
  return {
    visit_purpose: p,
    collected_amount: p === 'collection' && String(amount ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null,
  };
}

/** A typed amount is acceptable: blank, or a number ≥ 0. */
export function amountError(purpose, amount) {
  if (purpose !== 'collection') return null;
  const t = String(amount ?? '').trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? null : 'Enter the amount in SAR (a number, 0 or more)';
}

export { isMissingColumn };

/**
 * "136 contacts: 120 sales · 12 collection · 4 service" — every purpose with
 * at least one contact, in the PURPOSES order; the parts add up to the total.
 */
export function purposeSplitText(byPurpose, total) {
  const parts = PURPOSES.filter((p) => (byPurpose?.[p.id] || 0) > 0).map((p) => `${byPurpose[p.id]} ${PURPOSE_SHORT[p.id]}`);
  return `${total} contact${total === 1 ? '' : 's'}${parts.length ? `: ${parts.join(' · ')}` : ''}`;
}
