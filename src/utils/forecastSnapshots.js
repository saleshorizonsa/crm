// ── Weekly forecast snapshots — written by the app, from the page's own code ──
//
// migrations/forecast_snapshots.sql (NOT APPLIED until someone runs it). Every
// read here DEGRADES: a missing table comes back as { applied: false } and the
// page shows "needs the migration" instead of an error (the lesson of 1897c1a).
//
// The tiers stored are computeTiers' (via calcDivisionMetrics → forecastFor),
// so a snapshot and the live page cannot use two definitions.

import { supabase } from 'lib/supabase';
import { forecastFor, divisionGroupsOf, pickableAchievers } from 'utils/forecastData';
import {
  dayKey, phasedPeriods, snapshotWeekStart, snapshotDealRecord,
} from 'utils/forecastTiers';
import { COMPANY_SCOPE_ROLES } from 'utils/salesDivisionMetrics';

const TABLE = 'forecast_snapshots';

/** Did this error come from the table not existing yet? */
export function isMissingTable(error) {
  const m = `${error?.code || ''} ${error?.message || ''}`;
  return /42P01|PGRST205|does not exist|Could not find the table/i.test(m);
}

/** Snapshots of a company since a date. */
export async function fetchSnapshots({ companyId, since }) {
  if (!companyId) return { applied: true, rows: [], error: null };
  let q = supabase.from(TABLE).select('*').eq('company_id', companyId);
  if (since) q = q.gte('snapshot_date', since);
  const { data, error } = await q.order('snapshot_date', { ascending: false }).limit(5000);
  if (error) return { applied: !isMissingTable(error), rows: [], error: isMissingTable(error) ? null : error };
  return { applied: true, rows: data || [], error: null };
}

/**
 * The rows a snapshot writes: this month and the next two, for the company,
 * each division and each active achiever. Pure apart from the bundle.
 */
export function buildSnapshotRows({ bundle, companyId, takenBy = null, manual = false, now = new Date() }) {
  const today = dayKey(now);
  const weekStart = snapshotWeekStart(now).toISOString();
  const { months } = phasedPeriods(today);
  const scopes = [
    { scope_type: 'company', scope_id: companyId, ids: bundle.scopeIds },
    ...divisionGroupsOf(bundle).map((g) => ({
      scope_type: 'division', scope_id: g.id, ids: g.userIds, divisionId: g.id, divisionRow: true,
    })),
    ...pickableAchievers(bundle).map((u) => ({ scope_type: 'person', scope_id: u.id, ids: [u.id] })),
  ];
  const rows = [];
  months.forEach((mo) => {
    scopes.forEach((s) => {
      const m = forecastFor(bundle, {
        ids: s.ids, start: mo.start, end: mo.end, divisionId: s.divisionId || null, divisionRow: !!s.divisionRow,
      });
      const t = m?.tiers;
      if (!t) return;
      rows.push({
        company_id: companyId,
        snapshot_date: today,
        week_start: weekStart,
        period_month: mo.start,
        scope_type: s.scope_type,
        scope_id: String(s.scope_id),
        achieved: round2(t.achieved),
        wni: round2(t.wni),
        commit: round2(t.commit),
        most_likely: round2(t.mostLikely),
        best_case: round2(t.bestCase),
        target: round2(m.target),
        open_deal_ids: snapshotDealRecord(t.dealRows),
        taken_by: takenBy,
        manual,
      });
    });
  });
  return rows;
}
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Write a snapshot. A second one on the same day is ignored (one per day). */
export async function takeSnapshot({ bundle, companyId, takenBy, manual = false, now = new Date() }) {
  const rows = buildSnapshotRows({ bundle, companyId, takenBy, manual, now });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from(TABLE)
      .upsert(rows.slice(i, i + 200), {
        onConflict: 'company_id,snapshot_date,period_month,scope_type,scope_id',
        ignoreDuplicates: true,
      });
    if (error) return { applied: !isMissingTable(error), written: 0, error: isMissingTable(error) ? null : error };
  }
  return { applied: true, written: rows.length, error: null };
}

/**
 * The weekly snapshot, taken by the first director / head / admin to open the
 * Forecast page after Sunday 06:00 Riyadh when the week has none yet. Only a
 * company-scope viewer writes, so the rows are always the whole company's.
 */
export async function ensureWeeklySnapshot({ bundle, companyId, viewer, now = new Date() }) {
  if (!COMPANY_SCOPE_ROLES.includes(viewer?.role)) return { taken: false, reason: 'role' };
  const weekStart = snapshotWeekStart(now).toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .select('id')
    .eq('company_id', companyId)
    .gte('week_start', weekStart)
    .limit(1);
  if (error) return { taken: false, applied: !isMissingTable(error), error: isMissingTable(error) ? null : error };
  if (data?.length) return { taken: false, reason: 'exists' };
  const res = await takeSnapshot({ bundle, companyId, takenBy: viewer.id, manual: false, now });
  return { taken: !res.error && res.written > 0, ...res };
}

/** Latest snapshot of one scope and month taken BEFORE today (for "since last week"). */
export function previousSnapshot(rows, { scopeType, scopeId, periodMonth, today }) {
  const candidates = (rows || []).filter((r) => r.scope_type === scopeType
    && String(r.scope_id) === String(scopeId)
    && String(r.period_month).slice(0, 10) === periodMonth
    && String(r.snapshot_date).slice(0, 10) < today);
  // Prefer one at least six days old (last week's); else the most recent.
  const sorted = candidates.sort((a, b) => String(b.snapshot_date).localeCompare(String(a.snapshot_date)));
  const weekOld = sorted.find((r) => {
    const d = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(r.snapshot_date).slice(0, 10)}T00:00:00Z`)) / 86400000;
    return d >= 6;
  });
  return weekOld || sorted[0] || null;
}

/** Current stage of deals by id (for snapshot deals no longer in the open list: won or lost). */
export async function fetchDealStates(ids) {
  const out = {};
  const list = [...new Set(ids || [])];
  for (let i = 0; i < list.length; i += 200) {
    const { data, error } = await supabase
      .from('deals')
      .select('id, title, stage, amount, expected_close_date, owner_id')
      .in('id', list.slice(i, i + 200));
    if (error) { console.error('fetchDealStates:', error); break; }
    (data || []).forEach((d) => { out[d.id] = d; });
  }
  return out;
}
