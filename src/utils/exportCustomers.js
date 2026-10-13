import { useEffect, useState } from 'react';
import { supabase } from 'lib/supabase';

/**
 * EXPORT CUSTOMERS (CEO, 2026-10-13): an export customer's deals, plan items
 * and future orders are always Export, whatever the products or the owner.
 *
 * The database enforces it (migrations/export_customers.sql — the division
 * triggers override what any form sends). This file is what the FORMS show:
 * the division locked to "Export (set by customer)", and an Export tag.
 *
 * DEGRADES while the migration is NOT APPLIED (the lesson of 1897c1a):
 * contacts.is_export does not exist yet, so every read here is its own small
 * request, and a failure means "no export customers known" — never a broken
 * form or list. Nothing else selects the column.
 */
export const MANAGE_EXPORT_ROLES = ['manager', 'director', 'head', 'admin'];
export const EXPORT_LABEL = 'Export (set by customer)';

/** Which of these contacts are export. { ids: Set, available: boolean } */
export async function fetchExportFlags(contactIds) {
  const ids = [...new Set((contactIds || []).filter(Boolean))];
  if (!ids.length) return { ids: new Set(), available: true };
  const out = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.from('contacts')
      .select('id').in('id', ids.slice(i, i + 200)).eq('is_export', true);
    if (error) return { ids: new Set(), available: false };
    (data || []).forEach((c) => out.add(c.id));
  }
  return { ids: out, available: true };
}

/** The company's Export division, by name (as the migration matches it). */
export async function fetchExportDivision(companyId) {
  if (!companyId) return null;
  const { data } = await supabase.from('sales_divisions')
    .select('id, name').eq('company_id', companyId);
  return (data || []).find((d) => String(d.name).trim().toLowerCase() === 'export') || null;
}

/**
 * For a form: is the chosen customer export, and which division is Export?
 * { isExport, division: {id, name} | null, loading }
 */
export function useExportCustomer({ contactId, companyId }) {
  const [state, setState] = useState({ isExport: false, division: null, loading: false });
  useEffect(() => {
    let alive = true;
    if (!contactId || !companyId) { setState({ isExport: false, division: null, loading: false }); return undefined; }
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const [{ ids }, division] = await Promise.all([
        fetchExportFlags([contactId]),
        fetchExportDivision(companyId),
      ]);
      if (!alive) return;
      const isExport = ids.has(contactId) && !!division;
      setState({ isExport, division: isExport ? division : null, loading: false });
    })();
    return () => { alive = false; };
  }, [contactId, companyId]);
  return state;
}

/** For a list: the export contact ids among these rows' customers. */
export function useExportIds(contactIds) {
  const key = [...new Set((contactIds || []).filter(Boolean))].sort().join(',');
  const [ids, setIds] = useState(new Set());
  useEffect(() => {
    let alive = true;
    if (!key) { setIds(new Set()); return undefined; }
    fetchExportFlags(key.split(',')).then((r) => { if (alive) setIds(r.ids); });
    return () => { alive = false; };
  }, [key]);
  return ids;
}

// ── one card, one customer: batched ───────────────────────────────────────
// A board of deal cards each asking about its own customer would be one
// request per card. Cards rendered together share ONE request instead: ids
// asked for in the same tick are collected and looked up at once, and the
// answers are kept for the session (a customer's export flag rarely changes,
// and the database enforces it regardless of what a card shows).
const known = new Map();          // contactId -> boolean
let queue = new Set();
let waiters = [];
let timer = null;
function lookup(contactId) {
  if (known.has(contactId)) return Promise.resolve(known.get(contactId));
  queue.add(contactId);
  return new Promise((resolve) => {
    waiters.push({ contactId, resolve });
    if (!timer) {
      timer = setTimeout(async () => {
        const ids = [...queue];
        const ws = waiters;
        queue = new Set(); waiters = []; timer = null;
        const { ids: exportIds, available } = await fetchExportFlags(ids);
        // Not yet available (migration not applied): answer false, remember nothing.
        if (available) ids.forEach((id) => known.set(id, exportIds.has(id)));
        ws.forEach((w) => w.resolve(available ? known.get(w.contactId) : false));
      }, 0);
    }
  });
}

/** Is this one customer export? (batched across everything rendered together) */
export function useIsExportContact(contactId) {
  const [isExport, setIsExport] = useState(() => (contactId ? known.get(contactId) === true : false));
  useEffect(() => {
    let alive = true;
    if (!contactId) { setIsExport(false); return undefined; }
    lookup(contactId).then((v) => { if (alive) setIsExport(v === true); });
    return () => { alive = false; };
  }, [contactId]);
  return isExport;
}

/** After a manager changes a flag, cards show the new answer. */
export function forgetExportFlag(contactId) { known.delete(contactId); }

/** Read one customer's flag. { value, available } */
export async function readContactExport(contactId) {
  if (!contactId) return { value: false, available: true };
  const { data, error } = await supabase.from('contacts')
    .select('is_export').eq('id', contactId).maybeSingle();
  if (error) return { value: false, available: false };
  return { value: !!data?.is_export, available: true };
}

/** Set it (manager and above; the database refuses anyone else). */
export async function writeContactExport(contactId, value) {
  const { error } = await supabase.from('contacts').update({ is_export: !!value }).eq('id', contactId);
  return { error };
}
