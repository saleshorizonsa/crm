import { useEffect, useState } from 'react';
import { supabase } from 'lib/supabase';
import { translations } from 'i18n/translations';

/**
 * CUSTOMER STRATEGY (session 48, CEO 2026-11-18). One per customer:
 *   growth · maintenance · collection · collect_close · other (needs a note) · not set
 *
 * Stored on contacts (strategy, strategy_note, strategy_set_by, strategy_set_at)
 * by migrations/customer_strategy.sql, which also keeps customer_strategy_history
 * (trigger-written) and refuses a change from anyone below manager.
 *
 * SWITCH: the app shows NOTHING of this until customer_strategy_enabled()
 * exists (probeStrategy). Before the migration every page is exactly as
 * today, and no request ever names the new columns — every read here is its
 * own small request, never added to an existing select.
 */
export const STRATEGIES = ['growth', 'maintenance', 'collection', 'collect_close', 'other'];
export const NOT_SET = 'not_set';
export const STRATEGY_KEYS = [...STRATEGIES, NOT_SET];
/** Roles that may set or change a strategy (the guard trigger's list). */
export const SET_STRATEGY_ROLES = ['manager', 'supervisor', 'director', 'head', 'admin'];
export const canSetStrategy = (role) => SET_STRATEGY_ROLES.includes(role);

const EN = translations.en.strategy;
/** English label (for exports and code with no `t`). */
export const STRATEGY_LABELS = Object.freeze(Object.fromEntries(STRATEGY_KEYS.map((k) => [k, EN[k === NOT_SET ? 'notSet' : k]])));
/** The label in the active language when `t` is given. */
export const strategyLabel = (key, t) => {
  const k = key || NOT_SET;
  const tk = `strategy.${k === NOT_SET ? 'notSet' : k}`;
  return typeof t === 'function' ? t(tk) : (STRATEGY_LABELS[k] || STRATEGY_LABELS[NOT_SET]);
};
/** A row's strategy key, NOT_SET when none. */
export const strategyKey = (s) => (s && STRATEGIES.includes(s) ? s : NOT_SET);

/** The customer's company: its own, else its owner's (371 JASCO PVC customers have none of their own). */
export const customerCompanyId = (contact) => contact?.company_id || contact?.owner?.company_id || null;

// ── the switch ───────────────────────────────────────────────────────────────
let probe = null;
let enabledNow = false;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());
export function probeStrategy() {
  if (!probe) {
    probe = Promise.resolve(supabase.rpc('customer_strategy_enabled'))
      .then(({ data, error }) => {
        if (!error) return data === true ? 'yes' : 'no';
        if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '')) return 'no';
        return 'unknown';
      })
      .catch(() => 'unknown')
      .then((a) => {
        if (a === 'unknown') probe = null;
        const on = a === 'yes';
        if (on !== enabledNow) { enabledNow = on; emit(); }
        return on;
      });
  }
  return probe;
}
/** For tests, and after the schema is known to have changed. */
export const resetStrategyProbe = () => { probe = null; enabledNow = false; known.clear(); emit(); };

/** Is the feature on? false until the probe says yes. */
export function useStrategyEnabled() {
  const [on, setOn] = useState(enabledNow);
  useEffect(() => {
    let alive = true;
    const f = () => { if (alive) setOn(enabledNow); };
    listeners.add(f);
    probeStrategy().then((v) => { if (alive) setOn(v); });
    return () => { alive = false; listeners.delete(f); };
  }, []);
  return on;
}

// ── strategies, batched and kept for the session ─────────────────────────────
const COLS = 'id, strategy, strategy_note, strategy_set_by, strategy_set_at';
const known = new Map(); // contactId -> { strategy, note, setBy, setAt }
const toInfo = (r) => ({ strategy: r.strategy || null, note: r.strategy_note || null, setBy: r.strategy_set_by || null, setAt: r.strategy_set_at || null });

/** Read the strategy of these customers (only when the feature is on). */
export async function fetchStrategies(contactIds) {
  const ids = [...new Set((contactIds || []).filter(Boolean))];
  if (!ids.length || !(await probeStrategy())) return new Map();
  const out = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.from('contacts').select(COLS).in('id', ids.slice(i, i + 200));
    if (error) return out;
    (data || []).forEach((r) => { const v = toInfo(r); known.set(r.id, v); out.set(r.id, v); });
  }
  // Rows not returned (not visible to this user): unknown, shown as not set.
  ids.forEach((id) => { if (!out.has(id)) out.set(id, null); });
  return out;
}

let queue = new Set();
let waiters = [];
let timer = null;
function lookup(id) {
  if (known.has(id)) return Promise.resolve(known.get(id));
  queue.add(id);
  return new Promise((resolve) => {
    waiters.push({ id, resolve });
    if (!timer) {
      timer = setTimeout(async () => {
        const ids = [...queue]; const ws = waiters;
        queue = new Set(); waiters = []; timer = null;
        const got = await fetchStrategies(ids);
        ws.forEach((w) => w.resolve(got.get(w.id) || null));
      }, 0);
    }
  });
}

/** One customer's strategy info (batched across everything rendered together). */
export function useCustomerStrategy(contactId) {
  const enabled = useStrategyEnabled();
  const [, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    const f = () => { if (alive) bump((n) => n + 1); };
    listeners.add(f);
    if (enabled && contactId && !known.has(contactId)) lookup(contactId).then(f);
    return () => { alive = false; listeners.delete(f); };
  }, [enabled, contactId]);
  if (!enabled || !contactId) return { enabled, info: null, strategy: null };
  const info = known.get(contactId) || null;
  return { enabled, info, strategy: info?.strategy || null };
}

/** Many customers at once: { enabled, map: Map(contactId -> info|null), version }. */
export function useCustomerStrategies(contactIds) {
  const enabled = useStrategyEnabled();
  const key = [...new Set((contactIds || []).filter(Boolean))].sort().join(',');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    const f = () => { if (alive) setVersion((n) => n + 1); };
    listeners.add(f);
    if (enabled && key) {
      const missing = key.split(',').filter((id) => !known.has(id));
      if (missing.length) fetchStrategies(missing).then(f);
    }
    return () => { alive = false; listeners.delete(f); };
  }, [enabled, key]);
  const map = new Map();
  if (enabled && key) key.split(',').forEach((id) => map.set(id, known.get(id) || null));
  return { enabled, map, version };
}
/** The strategy key of a contact id from a map (NOT_SET when none). */
export const strategyOfId = (map, id) => strategyKey(map?.get(id)?.strategy);
/**
 * For a native <select> option (which cannot hold a coloured dot): " · Growth"
 * after the customer's name when a strategy is set, else "".
 */
export const strategySuffix = (map, id, t) => {
  const k = map?.get(id)?.strategy;
  return k ? ` · ${strategyLabel(k, t)}` : '';
};

// ── changing it ──────────────────────────────────────────────────────────────
/**
 * Set (or clear, strategy = null) the strategy of these customers. The
 * database decides who may (role) and on which rows (the contacts UPDATE
 * policies); a row the policies do not let this user update comes back
 * unchanged without an error, so the answer lists it under `notChanged`.
 * -> { changed: [ids], notChanged: [ids], error: string|null }
 */
export async function setCustomerStrategy(contactIds, strategy, note = null) {
  const ids = [...new Set((contactIds || []).filter(Boolean))];
  if (!ids.length) return { changed: [], notChanged: [], error: null };
  if (strategy && !STRATEGIES.includes(strategy)) return { changed: [], notChanged: ids, error: 'Unknown strategy' };
  const cleanNote = String(note || '').trim() || null;
  if (strategy === 'other' && !cleanNote) return { changed: [], notChanged: ids, error: 'NOTE_REQUIRED' };
  const changed = [];
  for (let i = 0; i < ids.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.from('contacts')
      .update({ strategy: strategy || null, strategy_note: strategy ? cleanNote : null })
      .in('id', ids.slice(i, i + 200))
      .select(COLS);
    if (error) {
      return { changed, notChanged: ids.filter((x) => !changed.includes(x)), error: error.message || String(error) };
    }
    (data || []).forEach((r) => { known.set(r.id, toInfo(r)); changed.push(r.id); });
  }
  emit();
  return { changed, notChanged: ids.filter((x) => !changed.includes(x)), error: null };
}

// ── history ──────────────────────────────────────────────────────────────────
const HCOLS = 'id, contact_id, company_id, old_strategy, new_strategy, note, changed_by, changed_at';
async function withNames(rows) {
  const userIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean))];
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
  const [users, contacts] = await Promise.all([
    userIds.length ? supabase.from('users').select('id, full_name, email').in('id', userIds) : { data: [] },
    contactIds.length ? supabase.from('contacts').select('id, company_name, first_name, last_name, owner_id').in('id', contactIds) : { data: [] },
  ]);
  const u = new Map((users.data || []).map((x) => [x.id, x.full_name || x.email]));
  const c = new Map((contacts.data || []).map((x) => [x.id, x]));
  return rows.map((r) => {
    const ct = c.get(r.contact_id);
    return {
      ...r,
      changedByName: r.changed_by ? (u.get(r.changed_by) || '—') : 'System',
      customer: ct ? (ct.company_name || [ct.first_name, ct.last_name].filter(Boolean).join(' ') || '—') : '—',
      ownerId: ct?.owner_id || null,
    };
  });
}
/** One customer's changes, newest first. */
export async function fetchStrategyHistory(contactId) {
  if (!contactId || !(await probeStrategy())) return [];
  const { data, error } = await supabase.from('customer_strategy_history').select(HCOLS)
    .eq('contact_id', contactId).order('changed_at', { ascending: false });
  if (error) return [];
  return withNames(data || []);
}
/**
 * Recent changes the user may see (RLS: the customers he can see), newest
 * first. The page filters (company / salesman / strategy) and then shows the
 * latest 50, so a filter is applied to the most recent `window` rows, not to
 * the first 50 only.
 */
export async function fetchStrategyChanges({ companyId = null, window = 500 } = {}) {
  if (!(await probeStrategy())) return [];
  let q = supabase.from('customer_strategy_history').select(HCOLS).order('changed_at', { ascending: false }).limit(window);
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) return [];
  return withNames(data || []);
}
