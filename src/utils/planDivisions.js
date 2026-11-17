import { useEffect, useState } from 'react';
import { supabase } from 'lib/supabase';
import { isMissingColumn } from 'utils/missingColumn';
import { fetchAdditionalDivisions, divisionIdsForUser } from 'utils/divisionMembership';

/**
 * ONE PLAN PER DIVISION (session 43, CEO 2026-11-17).
 *
 * A person in ONE division files one plan a month, exactly as before: their
 * plan_submissions row has division_id NULL ("all divisions").
 *
 * A person in MORE than one division (primary users.sales_division_id plus
 * user_sales_divisions — today only Mohamed Kamal: PVC Compound + Export)
 * files one plan PER DIVISION per month, each its own row with division_id
 * set, each submitted, approved and rejected on its own.
 *
 * Everything keys off plan_submissions.division_id, which arrives with
 * migrations/plan_submissions_division.sql. Until it is applied there is no
 * such column, `hasColumn` is false everywhere, nobody has division plans,
 * and every screen reads and writes exactly as it did before.
 *
 * OLD ROWS. A row with division_id NULL means "all divisions". For a
 * multi-division person such a row from before the change still stands for
 * the whole month IF IT WAS SUBMITTED (pending or approved) and no division
 * plan exists for that month — nothing is moved or reinterpreted. A NULL row
 * that was never submitted (a draft, or the 25th-deadline flag) or was sent
 * back is not a plan of the whole month, so the division plans apply.
 */

/** The upsert targets: the old unique key, and the one the migration adds. */
export const PLAN_CONFLICT_OLD = 'company_id,owner_id,plan_month';
export const PLAN_CONFLICT_NEW = 'company_id,owner_id,plan_month,division_id';
export const planConflictTarget = (hasColumn) => (hasColumn ? PLAN_CONFLICT_NEW : PLAN_CONFLICT_OLD);

/* ── is the column there? ─────────────────────────────────────────────────── */

let probe = null;
/**
 * Whether plan_submissions.division_id exists. Asked once per page load. A
 * select naming a missing column is refused (42703 / PGRST204): that answer
 * is kept. Any other failure is "not known" → false, and is asked again next
 * time, so a network blip never leaves a session on the wrong key. (If the
 * migration is applied while a page is open, upsertPlanSubmission notices
 * and asks again.)
 */
export function probePlanDivisionColumn() {
  if (!probe) {
    probe = Promise.resolve(supabase.from('plan_submissions').select('id, division_id').limit(1))
      .then(({ error }) => {
        if (!error) return 'yes';
        if (isMissingColumn(error)) return 'no';
        console.warn('plan_submissions.division_id probe:', error.message);
        return 'unknown';
      })
      .catch(() => 'unknown')
      .then((a) => { if (a === 'unknown') probe = null; return a === 'yes'; });
  }
  return probe;
}
/** For tests, and after the schema is known to have changed. */
export const resetPlanDivisionProbe = () => { probe = null; };

/** React: null while asking, then true / false. */
export function usePlanDivisionColumn() {
  const [has, setHas] = useState(null);
  useEffect(() => {
    let alive = true;
    probePlanDivisionColumn().then((ok) => { if (alive) setHas(ok); });
    return () => { alive = false; };
  }, []);
  return has;
}

/* ── who files per division ───────────────────────────────────────────────── */

/**
 * The divisions a person files SEPARATE plans for, primary first — or null
 * when they file one plan (one division, or the column is not there yet).
 */
export function planDivisionsOf(user, additionalByUser = {}, hasColumn = false) {
  if (!hasColumn || !user?.id) return null;
  const ids = divisionIdsForUser(user, additionalByUser);
  return ids.length > 1 ? ids : null;
}

/**
 * For many people at once: { hasColumn, byUser: { userId: [divisionId, …] } },
 * listing ONLY the multi-division people. `users` need id and
 * sales_division_id. Never throws.
 */
export async function fetchPlanDivisions({ companyId, users }) {
  const hasColumn = await probePlanDivisionColumn();
  const byUser = {};
  if (!hasColumn || !companyId || !users?.length) return { hasColumn, byUser };
  const additional = await fetchAdditionalDivisions({ companyId, userIds: users.map((u) => u.id) });
  users.forEach((u) => {
    const ids = planDivisionsOf(u, additional, true);
    if (ids) byUser[u.id] = ids;
  });
  return { hasColumn, byUser };
}

/** { id: name } for these division ids. Never throws. */
export async function fetchDivisionNames(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return {};
  const { data, error } = await supabase.from('sales_divisions').select('id, name').in('id', list);
  if (error) { console.error('fetchDivisionNames:', error); return {}; }
  return Object.fromEntries((data || []).map((d) => [d.id, d.name]));
}

/* ── which row is which plan ──────────────────────────────────────────────── */

/** A NULL-division row that stands for the whole month (see OLD ROWS above). */
const isWholeMonthPlan = (r) => !!r && !r.division_id && r.is_submitted === true;

/**
 * The plans one person holds for one month, each with the row it reads.
 *
 * @param {string[]|null} divisionIds  planDivisionsOf(); null = one plan
 * @param {object[]} rows              that person's plan_submissions rows for the month
 * @returns {Array<{ divisionId: string|null, row: object|null, wholeMonth?: boolean }>}
 */
export function planUnitsFor(divisionIds, rows) {
  const mine = rows || [];
  if (!divisionIds) return [{ divisionId: null, row: mine.find((r) => !r.division_id) || null }];
  const divRows = mine.filter((r) => r.division_id);
  const whole = mine.find(isWholeMonthPlan);
  if (whole && !divRows.length) return [{ divisionId: null, row: whole, wholeMonth: true }];
  return divisionIds.map((d) => ({ divisionId: d, row: divRows.find((r) => r.division_id === d) || null }));
}

/**
 * The ONE row that governs a plan item of `divisionId` for its owner's month
 * — for the lock and the conversion gate. Rows without any division plan
 * among them answer exactly as before (the NULL row). With division plans,
 * the item's division plan; an item with no division then has no plan of its
 * own (null), and the lock fails open / the gate reports "no plan", the
 * existing polarity of each.
 */
export function planRowFor(rows, divisionId = null) {
  const mine = rows || [];
  const divRows = mine.filter((r) => r.division_id);
  if (!divRows.length) return mine.find((r) => !r.division_id) || null;
  const whole = mine.find(isWholeMonthPlan);
  if (!divisionId) return whole || null;
  return divRows.find((r) => r.division_id === divisionId) || null;
}

/** "Mohamed Kamal — PVC Compound"; the bare name for a one-plan person. */
export const planTitle = (name, divisionName) => (divisionName ? `${name} — ${divisionName}` : name);

/**
 * One line for a person's plans: "PVC Compound submitted · Export not
 * submitted". `parts` is [{ division, status }].
 */
export const perDivisionStatusText = (parts) => (parts || []).map((p) => `${p.division} ${p.status}`).join(' · ');

/* ── writing ──────────────────────────────────────────────────────────────── */

/**
 * Upsert one plan_submissions row on whichever key the database has.
 *
 * With the column: division_id is always sent (NULL for a one-plan person)
 * and the target is the new key. Without it: exactly today's payload and
 * target. A probe can be stale (the migration applied while the page was
 * open), so a 42P10 — "no unique index matches the ON CONFLICT target" — or a
 * missing division_id column retries once on the other key.
 *
 * @returns the supabase { data, error } of the last attempt
 */
export async function upsertPlanSubmission(payload, { hasColumn, divisionId = null, select = 'id' } = {}) {
  const run = (withDivision) => {
    const body = { ...payload };
    if (withDivision) body.division_id = divisionId || null;
    else delete body.division_id;
    let q = supabase.from('plan_submissions').upsert(body, { onConflict: planConflictTarget(withDivision) });
    if (select) q = q.select(select).maybeSingle();
    return q;
  };
  let res = await run(!!hasColumn);
  const err = res?.error;
  const wrongKey = err && (err.code === '42P10' || /no unique or exclusion constraint/i.test(err.message || ''));
  if (wrongKey || (hasColumn && isMissingColumn(err))) {
    // A division plan can never be written on the old key: without the
    // column it would overwrite the person's other division's row.
    if (!hasColumn || !divisionId) {
      resetPlanDivisionProbe();
      res = await run(!hasColumn);
    }
  }
  return res;
}
