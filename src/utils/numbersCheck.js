import { supabase } from 'lib/supabase';
import {
  fetchAchieved,
  fetchMonthlyTargets,
  targetPerPerson,
  computeAnnualTarget,
  computeAnnualAllocation,
  computeAchieved,
  computeCoverage,
  achieverIdsFrom,
  contributorIdsFrom,
  wonNotInvoicedList,
  summarizeWonNotInvoiced,
} from 'utils/planningCalculations';
import { fetchOpenFunnel } from 'utils/openFunnel';
import { fetchWinRate3m } from 'utils/winRate3m';
import { computeKpiStripData } from 'utils/kpiStripData';
import { computePlanningPageSummary, openPlanTotal } from 'utils/planningPageSummary';
import {
  getMonthlyTarget,
  getScopeMonthlyTotals,
  forecastService,
} from 'services/supabaseService';
import {
  achievedForRows,
  withTargetRowProgress,
  distinctPeopleScope,
} from 'utils/targetProgress';
import { achievedForBuckets, monthBuckets, rangeYear } from 'utils/achievedSeries';
import { performanceBars, performanceTotals } from 'utils/performanceBarData';
import { calcCoverageMetrics } from 'utils/coverageConsoleMetrics';
import {
  calcDivisionMetrics, groupByDivision, scopeUserIds,
} from 'utils/salesDivisionMetrics';
import { fetchAdditionalDivisions } from 'utils/divisionMembership';
import { subtreeIdsOf } from 'utils/teamHierarchy';
import { activeIdsFrom } from 'utils/achieverScope';
// wonNotInvoicedList and summarizeWonNotInvoiced are already imported above,
// from the same module.
import { buildCoverageDrill, RAIL_SEGMENTS } from 'utils/coverageDrill';
import { wholePeriodOf, isCurrentMonthRange } from 'utils/dashboardDateUtils';
import { buildForecast } from 'utils/forecastEngine';
import {
  reportService,
  reportWonTotal,
  getReportAchieved,
  reportAchievedTotals,
} from 'services/reportService';

// THE NUMBERS CHECK — every figure the app shows for one scope, beside ONE
// reference figure.
//
// Why it exists: the same month's revenue used to read one number on the KPI
// strip, another on the Director card, another on Planning and another on the
// Coverage Console, and the only way to find out was to open four pages and
// squint. Several sessions of work have put each of those figures on a shared
// rule; this page is how anyone can CHECK that, in one click, rather than
// trusting a changelog.
//
// TWO RULES THIS FILE OBEYS, and they are the whole point:
//
//  1. The reference is computed ONCE, straight from the shared rules.
//  2. Every other row calls THE SAME FUNCTION THE SCREEN CALLS, with the
//     arguments that screen would pass. No row re-implements a figure — a second
//     implementation that agrees proves nothing about the screen, and one that
//     disagrees cannot be told apart from a real bug.
//
// Where a screen computed a figure inline inside its component, that
// computation was lifted into a pure exported function and the screen now calls
// it too: utils/coverageConsoleMetrics.js (calcCoverageMetrics),
// utils/performanceBarData.js (performanceBars/performanceTotals), openPlanTotal
// in utils/planningPageSummary.js and reportWonTotal in
// services/reportService.js. Nothing about the arithmetic changed.
//
// TWO WINDOWS, BOTH LEGITIMATE. A figure is only comparable to a reference over
// the same window, and the app deliberately uses two:
//   • the SELECTED period — Achieved, Target, Planning's funnel, the Coverage
//     Console's and Insights' funnel;
//   • the CURRENT calendar month — the KPI strip's Funnel card and
//     Won-not-invoiced, which are live operational figures and do not move when
//     somebody looks at a past month.
// So the reference carries BOTH funnels, each from fetchOpenFunnel, and every
// row is compared against the one its screen uses. Collapsing them into one
// would have failed every past-month check for no reason at all.
//
// READ-ONLY. Nothing in this file writes, and nothing calls an RPC.

/**
 * Who may open the page.
 *
 * Lives here rather than in the page so the route guard (Routes.jsx) and the nav
 * entry (Header.jsx) read the same list: a hidden link is not a permission, and
 * two copies of a role list are how one of them ends up stale.
 */
export const NUMBERS_CHECK_ROLES = ['admin', 'director'];

/** Money rows agree to 1 SAR; percentage rows to 0.1 of a point. */
export const MONEY_TOLERANCE = 1;
export const PCT_TOLERANCE = 0.1;

const sum = (obj) => Object.values(obj || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * The month AFTER `end`'s month, as yyyy-MM-dd — the Coverage Console's
 * carry-in window.
 *
 * Built from the STRING's year and month, then formatted from local date parts.
 * Never toISOString(): users are in Asia/Riyadh (UTC+3), where that turns the
 * 1st of a month into the last day of the previous one.
 */
function nextMonthBounds(end) {
  const y = Number(String(end).slice(0, 4));
  const m = Number(String(end).slice(5, 7)) - 1; // 0-based
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: ymd(new Date(y, m + 1, 1)), end: ymd(new Date(y, m + 2, 0)) };
}

/**
 * One comparison.
 *
 * `expected: null` marks a figure with nothing to compare against — the
 * reference rows themselves, and counts shown only for context. Those report as
 * "info" and are never counted as a pass or a failure.
 */
function row({ label, value, expected = null, kind = 'money', note = null, knownToDiffer = false }) {
  // kind 'count' compares EXACTLY. A row count has no rounding to forgive, and
  // the money tolerance of 1 would report "0 expected, 1 found" as agreement —
  // which is exactly the size of defect the division-attribution rows look for.
  const tolerance = kind === 'pct' ? PCT_TOLERANCE : (kind === 'count' ? 0 : MONEY_TOLERANCE);
  const has = expected !== null && expected !== undefined && Number.isFinite(Number(value));
  const diff = has ? n(value) - n(expected) : null;
  let status = 'info';
  if (has) status = Math.abs(diff) <= tolerance ? 'ok' : 'bad';
  return {
    label, value: n(value), expected: has ? n(expected) : null, diff,
    kind, status, note, knownToDiffer,
  };
}

/**
 * Who counts, for a scope choice.
 *
 *   company → every achiever in the company (the screens pass ownerIds = null)
 *   team    → one manager/supervisor and his active subtree
 *   person  → one person
 *
 * THREE id sets come back, because the app deliberately measures different
 * things over different people and conflating them is exactly how figures drift:
 *   ownerIds       the raw scope a screen is handed (null = whole company)
 *   achieverIds    whose revenue and monthly target count — contributors plus
 *                  anyone individually flagged users.is_contributor
 *   contributorIds contributor roles only. Kept because Planned and Carry-In
 *                  are still measured over it — a flagged manager carries no
 *                  monthly plan. CONVERSION no longer uses it: it moved to the
 *                  achiever scope on 2026-10-05 (decision D4), so Achieved,
 *                  Target and Conversion are now one scope.
 */
export function resolveScope({ users, scope }) {
  const all = users || [];
  if (!scope || scope.kind === 'company' || !scope.userId) {
    // COMPANY: everyone, active or not, for the HISTORICAL figures.
    //
    // contributorIds stays ACTIVE-ONLY even here, because it is what the
    // Planned and Carry-In rows are measured over and those are
    // forward-looking (CEO decision 2026-10-07). achieverIds carries the
    // company rule for Target and Achieved. The two halves of the decision,
    // one line apart.
    return {
      ownerIds: null,
      achieverIds: achieverIdsFrom(all, { includeInactive: true }),
      contributorIds: contributorIdsFrom(all),
      label: 'Whole company',
      person: null,
    };
  }
  const person = all.find((u) => u.id === scope.userId) || null;
  if (scope.kind === 'team') {
    // TEAM stays ACTIVE-ONLY (the rule's other half), and subtreeIdsOf's
    // default already enforces it — it is stated here because the bundle's user
    // rows are no longer pre-filtered, so the active-only behaviour of these
    // two branches now depends on these functions rather than on the query.
    const below = subtreeIdsOf({ users: all, rootId: scope.userId });
    const ids = [scope.userId, ...below];
    const members = ids.map((id) => all.find((u) => u.id === id)).filter(Boolean);
    return {
      ownerIds: ids,
      achieverIds: achieverIdsFrom(members),
      contributorIds: contributorIdsFrom(members),
      label: `${person?.full_name || 'team'} + team (${below.length} below)`,
      person,
    };
  }
  const members = person ? [person] : [];
  return {
    ownerIds: [scope.userId],
    achieverIds: achieverIdsFrom(members),
    contributorIds: contributorIdsFrom(members),
    label: person?.full_name || scope.userId,
    person,
  };
}

/**
 * ONE read of everything the screens would fetch, so a check does not issue four
 * copies of the same query.
 *
 * The shape is deliberately the Coverage Console's `data` bundle, because
 * calcCoverageMetrics and calcDivisionMetrics both take exactly that — and each
 * query here is the SAME query that screen issues: same columns, same filters,
 * same window. A bundle that quietly differed would make those two screens' rows
 * measure something the screens never show, which is worse than not checking
 * them at all.
 */
async function loadBundle({ companyId, start, end, year }) {
  const now = new Date();
  const w3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
  const w3End = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
  const next = nextMonthBounds(end);

  const results = await Promise.all([
    // The Coverage Console's deal read, column for column.
    supabase.from('deals')
      .select('id, title, stage, amount, final_amount, is_invoiced, invoice_date, expected_close_date, owner_id, division_id, forecast_amount, forecast_probability, contact_id, stage_changed_at, closed_at, created_at, invoice_number')
      .eq('company_id', companyId).not('stage', 'eq', 'lost'),
    // EVERY user, not just the active ones (CEO decision 2026-10-07): the
    // bundle feeds the company-level Coverage Console and Insights figures,
    // which are company totals and now include people who have left. Screens
    // that list PEOPLE still filter is_active themselves — widening the bundle
    // changes which figures are summed, not who is offered in a picker.
    supabase.from('users')
      .select('id, full_name, role, supervisor_id, is_active, is_contributor, sales_division_id')
      .eq('company_id', companyId),
    // Monthly target rows overlapping the SELECTED period. status = 'active'
    // matters: draft and superseded rows count nowhere else.
    supabase.from('sales_targets')
      .select('assigned_to, target_amount, period_type, target_type, period_start, period_end, product_group, client_targets(target_amount)')
      .eq('company_id', companyId).eq('status', 'active').eq('period_type', 'monthly')
      .lte('period_start', end).gte('period_end', start),
    // The 3 completed months, for every conversion rate computed in memory.
    // invoice_number travels with the rows because isImportedDeal needs it —
    // without it every loaded-in invoice looks worked and the rate inflates.
    supabase.from('deals')
      .select('id, stage, owner_id, division_id, created_at, closed_at, invoice_number')
      .eq('company_id', companyId).gte('created_at', w3Start).lte('created_at', w3End),
    // EVERY status, so the Current Sales Plan row can be checked against the
    // open-only rule instead of against a pre-filtered set that would make
    // openPlanTotal agree with itself by construction.
    supabase.from('opportunities')
      .select('id, owner_id, planned_amount, status, expected_month')
      .eq('company_id', companyId).gte('expected_month', start).lte('expected_month', end),
    // Carry-in: NEXT month's committed orders, pending only — the console's rule.
    supabase.from('future_orders')
      .select('id, owner_id, planned_amount, expected_month, status')
      .eq('company_id', companyId).eq('status', 'pending')
      .gte('expected_month', next.start).lte('expected_month', next.end),
    // Every credit note of the year. Wider than the console's windowed read
    // because the Performance Summary nets twelve separate months; computeAchieved
    // windows them by return_date itself, so the wider set changes no figure.
    supabase.from('deal_returns')
      .select('id, deal_id, return_date, return_amount, deals!inner(owner_id, division_id)')
      .eq('company_id', companyId)
      .gte('return_date', `${year}-01-01`).lte('return_date', `${year}-12-31`),
    // The whole year's monthly rows, for the Performance Summary's twelve bars.
    supabase.from('sales_targets')
      .select('assigned_to, target_amount, period_type, target_type, period_start, period_end, status, product_group, client_targets(target_amount)')
      .eq('company_id', companyId).eq('status', 'active').eq('period_type', 'monthly')
      .gte('period_start', `${year}-01-01`).lte('period_start', `${year}-12-31`),
  ]);

  const [deals, users, targets, deals3m, oppsAll, futureOrders, returns, yearTargets] = results;
  const firstError = results.find((r) => r.error);
  const oppRows = oppsAll.data || [];

  return {
    deals: deals.data || [],
    users: users.data || [],
    targets: targets.data || [],
    deals3m: deals3m.data || [],
    // The console fetches OPEN opportunities only; oppsAll keeps the rest for
    // the Current Sales Plan row.
    opps: oppRows.filter((o) => (o.status || 'open') === 'open'),
    oppsAll: oppRows,
    futureOrders: futureOrders.data || [],
    // fetchReturns flattens owner_id and the DEAL's division onto the row; the
    // console's bundle expects the same shape.
    returns: (returns.data || []).map((r) => ({
      ...r, owner_id: r.deals?.owner_id ?? null, division_id: r.deals?.division_id ?? null,
    })),
    yearTargets: yearTargets.data || [],
    monthStart: start,
    monthEnd: end,
    now,
    error: firstError?.error || null,
  };
}

/**
 * THE INVARIANT THIS SECTION EXISTS FOR: the divisions sum to the company.
 *
 * Deals were always attributed by deals.division_id, but target rows, plan
 * items and future orders were attributed per PERSON — so a person in two
 * divisions had their whole target and whole plan counted in BOTH. Mohamed
 * Kamal is in Export and PVC Compound, and the October panel read 5.75M of
 * target against a company target of 3.70M, visibly wrong to anyone who added
 * the column up but checked by nothing. These rows add it up.
 *
 * Deliberately re-reads targets, plan items and future orders WITH division_id
 * rather than reusing loadBundle's rows: those three columns arrive with
 * migrations/division_attribution.sql, and selecting a column PostgREST does
 * not know about fails the whole request. Keeping them in their own reads means
 * that, until the migration is applied, this section says so in one row instead
 * of taking the rest of the page down with it.
 */
async function buildDivisionGroups({
  companyId, consoleData, reference, planning, start, end, users,
}) {
  const next = nextMonthBounds(end);
  const [divRes, additionalByUser, tRes, oRes, fRes] = await Promise.all([
    supabase.from('sales_divisions')
      .select('id, name, sort_order').eq('company_id', companyId).order('sort_order'),
    fetchAdditionalDivisions({ companyId, userIds: (users || []).map((u) => u.id) }),
    supabase.from('sales_targets')
      .select('assigned_to, target_amount, period_type, target_type, period_start, period_end, product_group, division_id, client_targets(target_amount)')
      .eq('company_id', companyId).eq('status', 'active').eq('period_type', 'monthly')
      .lte('period_start', end).gte('period_end', start),
    supabase.from('opportunities')
      .select('id, owner_id, planned_amount, status, expected_month, division_id')
      .eq('company_id', companyId).eq('status', 'open')
      .gte('expected_month', start).lte('expected_month', end),
    supabase.from('future_orders')
      .select('id, owner_id, planned_amount, expected_month, status, division_id')
      .eq('company_id', companyId).eq('status', 'pending')
      .gte('expected_month', next.start).lte('expected_month', next.end),
  ]);

  const blocked = [tRes, oRes, fRes].find((r) => r?.error);
  if (blocked) {
    return [{
      screen: 'Divisions sum = company',
      fn: 'calcDivisionMetrics',
      rows: [row({
        label: 'Not checkable yet',
        value: 0,
        note: 'migrations/division_attribution.sql has not been applied, so one of'
          + ' sales_targets / opportunities / future_orders has no division_id'
          + ` column yet: "${blocked.error.message}". Until it is, a plan item or`
          + ' future order has no division of its own and the panel falls back to'
          + " its owner's primary — correct for everyone in one division, and"
          + ' double-counting for anyone in two.',
      })],
    }];
  }

  const divisions = divRes.data || [];
  // The same bundle the panel builds, with the division-aware rows swapped in.
  const divData = {
    ...consoleData,
    targets: tRes.data || [],
    opps: oRes.data || [],
    futureOrders: fRes.data || [],
  };
  // role 'director' with no viewer id is the panel's own company-level scope:
  // everyone, which is what summing to the company requires.
  const scopeIds = scopeUserIds({ users, viewerId: null, role: 'director' });
  const perDivision = groupByDivision({
    users, divisions, scopeIds, additionalByUser,
  }).map((g) => ({
    g, m: calcDivisionMetrics(g.userIds, { ...divData, divisionId: g.id }) || {},
  }));

  const total = (pick) => perDivision.reduce((s, { m }) => s + n(pick(m)), 0);
  const sumRows = [
    row({
      label: `Divisions sum = company — Target (${perDivision.length} divisions)`,
      value: total((m) => m.target),
      expected: reference.target,
      note: 'the row this session exists for. Before the fix the panel summed to'
        + ' 5.75M against a company target of 3.70M, because a target row was'
        + " counted in every division its holder belonged to.",
    }),
    row({
      label: 'Divisions sum = company — Achieved',
      value: total((m) => m.achieved),
      expected: reference.achieved,
      note: 'deals are attributed STRICTLY by deals.division_id, with no owner'
        + ' fallback — so a deal whose division is null belongs to no division'
        + ' and this row reads short until the backfill is applied. A ✗ here'
        + ' names new NULL-division deals: only DealModal sets the column, and'
        + ' the BEFORE INSERT trigger in the migration is what closes the hole.',
    }),
    row({
      label: 'Divisions sum = company — Planned (open plan)',
      value: total((m) => m.planned),
      expected: planning.plannedOpen,
    }),
    row({
      label: 'Divisions sum = company — Funnel dated into this period',
      value: total((m) => m.monthFunnel),
      expected: reference.funnelWindow,
    }),
  ];

  // ── per division: the panel's planned gap against Planning's ─────────────
  //
  // Only where the division has exactly ONE supervisor, because that is the
  // only case where a Planning screen covers the same people: Planning scopes
  // by HIERARCHY (a supervisor and his subtree) and the panel scopes by
  // DIVISION, and the two coincide only when the division is that subtree.
  // Where they do not, the row would be comparing two different populations
  // and a ✗ would mean nothing.
  const gapRows = [];
  for (const { g, m } of perDivision) {
    const members = g.userIds.map((id) => users.find((u) => u.id === id)).filter(Boolean);
    const sups = members.filter((u) => u.role === 'supervisor' && u.is_active !== false);
    if (sups.length !== 1) {
      gapRows.push(row({
        label: `${g.name} — planned gap (no single supervisor, info only)`,
        value: n(m.plannedGap),
        note: `${sups.length} supervisors in this division, so there is no one`
          + ' Planning screen covering the same people to compare against.',
      }));
      continue;
    }
    const sup = sups[0];
    const sc = resolveScope({ users, scope: { kind: 'team', userId: sup.id } });
    // eslint-disable-next-line no-await-in-loop
    const sp = await computePlanningPageSummary({
      companyId, ownerIds: sc.ownerIds, start, end,
    });
    // The division scope includes everyone (it has to sum to a company total
    // that does), and a supervisor's subtree is active-only — the two halves of
    // the CEO's rule of 2026-10-07. So the two figures are the same arithmetic
    // over genuinely different populations whenever a division has ever had a
    // member who left.
    //
    // It is an EQUALITY only while the populations coincide, and an INFO row
    // with both figures when they do not. Asserting equality across two
    // deliberately different scopes is how a check starts crying wolf, and a
    // check nobody believes catches nothing. What is lost is real and worth
    // stating: this row caught the NULL-division deal in September (39,423
    // against 0), and for a division with a departed member it would now report
    // rather than fail.
    const divAchievers = achieverIdsFrom(members, { includeInactive: true });
    const samePeople = divAchievers.length === sc.achieverIds.length
      && divAchievers.every((id) => sc.achieverIds.includes(id));
    gapRows.push(row({
      label: samePeople
        ? `${g.name} — planned gap vs Planning for ${sup.full_name || sup.id}`
        : `${g.name} — planned gap ${Math.round(n(m.plannedGap)).toLocaleString('en-US')}`
          + ` vs Planning ${Math.round(n(sp.plannedGap)).toLocaleString('en-US')} (info only)`,
      value: n(m.plannedGap),
      expected: samePeople ? n(sp.plannedGap) : null,
      note: samePeople
        ? 'the division and this supervisor\'s subtree are the same people, so'
          + ' the two screens must agree'
        : `DIFFERENT POPULATIONS BY RULE: ${divAchievers.length} in the division`
          + ` (everyone, active or not — a division total has to sum to a company`
          + ` total) against ${sc.achieverIds.length} in ${sup.full_name || 'the'}`
          + " subtree (active only — a team figure). Not comparable, so it is"
          + ' reported rather than asserted.',
    }));
  }

  return [
    { screen: 'Divisions sum = company', fn: 'calcDivisionMetrics', rows: sumRows },
    { screen: 'Division planned gap vs Planning', fn: 'computePlanningPageSummary', rows: gapRows },
  ];
}

/**
 * EVERY ROW IS ATTRIBUTED, OR ITS OWNER HAS NOWHERE TO PUT IT.
 *
 * The division figures only sum to the company while every row carries a
 * division. A row whose division_id is NULL falls back to its owner's PRIMARY
 * division on the way into Insights — so a NULL row with an owner who HAS a
 * primary is counted at company level and in no division, and the two stop
 * agreeing.
 *
 * That is not hypothetical. SAUDI CARBOTAE CO. LTD (18,315) was created with
 * its division by the BEFORE INSERT trigger at 16:08 on 2026-10-07 and edited
 * to NULL two minutes later, because DealModal sent
 * `division_id: formData.division_id || null` on the edit path. October's
 * divisions-sum row then failed by exactly 18,315 — which is how it was found.
 * The app now omits the key instead of nulling it, and
 * migrations/division_on_update.sql adds the BEFORE UPDATE guard; this group is
 * what notices if either one is ever undone.
 *
 * Rows whose owner has NO primary division (Osman, Mueataz — both departed)
 * are REPORTED, not asserted: there is nothing to attribute them to, and the
 * company-level fallback is NULL for them too, so they cost no division
 * anything. Asserting zero there would fail forever for a condition nobody
 * can fix.
 */
async function buildDivisionAttributionRows({ companyId, bundle }) {
  const users = bundle.users || [];
  const primaryOf = new Map(users.map((u) => [u.id, u.sales_division_id || null]));
  const nameOf = new Map(users.map((u) => [u.id, u.full_name || u.id]));

  const TABLES = [
    { table: 'deals', ownerKey: 'owner_id', labelKey: 'title' },
    { table: 'opportunities', ownerKey: 'owner_id', labelKey: 'customer_name' },
    { table: 'future_orders', ownerKey: 'owner_id', labelKey: 'customer_name' },
    { table: 'sales_targets', ownerKey: 'assigned_to', labelKey: 'target_type' },
  ];

  const rows = [];
  let orphans = 0;

  for (const t of TABLES) {
    // division_id arrives with migrations/division_attribution.sql. Selecting a
    // column PostgREST does not know about fails the whole request, so a
    // missing column degrades to one info row instead of taking the page down
    // (lesson from 1897c1a).
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(t.table)
      .select(`id, ${t.ownerKey}, ${t.labelKey}`)
      .eq('company_id', companyId)
      .is('division_id', null);

    if (error) {
      rows.push(row({
        label: `${t.table} — rows with no division: not readable`,
        value: 0,
        expected: null,
        note: `${t.table}.division_id could not be read (${error.message}).`
          + ' If migrations/division_attribution.sql is not applied here, that'
          + ' is expected and this row is the degraded answer.',
      }));
      // eslint-disable-next-line no-continue
      continue;
    }

    const nulls = data || [];
    const repairable = nulls.filter((r) => primaryOf.get(r[t.ownerKey]));
    orphans += nulls.length - repairable.length;

    const who = [...new Set(repairable.map((r) => nameOf.get(r[t.ownerKey])))];
    const what = repairable.slice(0, 3).map((r) => r[t.labelKey] || r.id).join(', ');

    rows.push(row({
      label: `${t.table} — rows with no division whose owner HAS a primary`,
      value: repairable.length,
      expected: 0,
      kind: 'count',
      note: repairable.length
        ? `${what}${repairable.length > 3 ? ' …' : ''} — ${who.join(', ')}.`
          + ' Each is counted at company level and in no division.'
          + ' migrations/division_on_update.sql repairs these and stops them recurring.'
        : 'every row carries a division, or its owner has none to give it',
    }));
  }

  if (rows.length) {
    rows.push(row({
      label: 'rows left unattributed because the owner has no primary division',
      value: orphans,
      expected: null,
      kind: 'count',
      note: 'reported, not asserted: there is nothing to attribute them to, and'
        + ' the company-level fallback is NULL for these owners too, so no'
        + ' division is short because of them',
    }));
  }
  return rows;
}
/**
 * THE COVERAGE RAIL'S DRILL-DOWN ADDS UP.
 *
 * The rail says "funnel 1.4M" and the panel that opens behind it has to say
 * the same 1.4M, then break it into people who also add to 1.4M. Two
 * assertions per segment, per scope:
 *
 *   panel L1 total = rail value       the header matches the bar
 *   sum of person totals = L1 total   the breakdown matches the header
 *
 * buildCoverageDrill GROUPS the row sets the metrics carry rather than
 * recomputing them, so both should hold by construction. That is exactly why
 * they are asserted: "by construction" is a claim, and the construction is
 * two files apart from the figures it claims to preserve.
 *
 * SHORTFALL IS DIFFERENT, and the second assertion is deliberately not made
 * for it. A scope's gap is its own target less its own coverage; the sum of
 * personal gaps is a different quantity, because one person's overshoot does
 * not fill another's hole. Where they differ the row REPORTS both instead of
 * failing, and the panel tells the reader the same thing.
 */
async function buildRailDrillRows({ companyId, bundle, consoleData, start, end }) {
  const users = bundle.users || [];
  const subjects = [
    { id: null, name: 'company', role: 'director' },
    ...users
      .filter((u) => u.is_active !== false
        && ['manager', 'supervisor', 'salesman'].includes(u.role))
      .map((u) => ({ id: u.id, name: u.full_name || u.id, role: u.role })),
  ];

  const rows = [];
  for (const subj of subjects) {
    const scope = scopeUserIds({ users, viewerId: subj.id, role: subj.role });
    if (!scope.length) continue;

    const metrics = calcDivisionMetrics(scope, { ...consoleData, divisionId: null }) || {};
    if (!metrics.drill) {
      rows.push(row({
        label: `Coverage rail drill-down — ${subj.name}: metrics carry no rows`,
        value: 0,
        expected: 1,
        note: 'calcDivisionMetrics returned no drill payload, so the panel would'
          + ' have nothing to show behind the rail',
      }));
      continue;
    }

    const built = buildCoverageDrill({ metrics, users, monthEnd: end });

    // The rail's own figures, read off the metrics the rail is given.
    const coverage = n(metrics.coverage);
    const railValue = {
      invoiced: n(metrics.achieved),
      funnel: n(metrics.weightedFunnel),
      planning: n(metrics.weightedPlanning),
      shortfall: Math.max(0, n(metrics.target) - coverage),
      // Independently: the shared rule over the same scope, so this one is a
      // real second opinion rather than the same number twice.
      wonNotInvoiced: summarizeWonNotInvoiced(wonNotInvoicedList({
        deals: consoleData.deals || [],
        ownerIds: metrics.drill.forwardIds || [],
        now: consoleData.now,
      })).total,
    };

    RAIL_SEGMENTS.forEach((seg) => {
      const got = built.segments[seg.key] || { total: 0, peopleTotal: 0, people: [] };
      rows.push(row({
        label: `Coverage rail — ${subj.name} — ${seg.label}: panel L1 total = rail value`,
        value: got.total,
        expected: railValue[seg.key],
        note: seg.inCoverage ? null : 'drawn on the rail but NOT counted in coverage'
          + ' or Expected % of target (decision 2026-10-07)',
      }));

      if (seg.key === 'shortfall') {
        const same = Math.abs(got.peopleTotal - got.total) <= 1;
        rows.push(row({
          label: `Coverage rail — ${subj.name} — Shortfall: personal gaps add to`,
          value: got.peopleTotal,
          expected: same ? got.total : null,
          note: same
            ? 'equal here: nobody in this scope is over their target'
            : `the scope is short ${Math.round(got.total).toLocaleString('en-US')} while personal gaps add to ${Math.round(got.peopleTotal).toLocaleString('en-US')} — someone is over, and an overshoot does not fill another person\'s gap. Reported, not asserted.`,
        }));
        return;
      }

      rows.push(row({
        label: `Coverage rail — ${subj.name} — ${seg.label}: sum of person totals = L1 total`,
        value: got.peopleTotal,
        expected: got.total,
        note: `${got.people.length} ${got.people.length === 1 ? 'person' : 'people'}`,
      }));
    });
  }
  return rows;
}
/**
 * FORWARD-LOOKING FIGURES EXCLUDE INACTIVE OWNERS — at every scope.
 *
 * CEO decision 2026-10-07. Planned, the open funnel and carry-in count active
 * owners only: a departed person's open plan will not convert, and counting it
 * overstates coverage and understates the pipeline still needed. Target and
 * Achieved go the OTHER way at company scope — they are history and include
 * whoever was there.
 *
 * Two halves of one decision pulling opposite ways through the same bundle is
 * exactly what gets half-applied, and it was: this group is what caught the
 * Coverage Console and the Current Sales Plan tab still counting 19,500 of a
 * departed salesman's plan after Planning had stopped.
 */
function buildForwardScopeRows({ bundle, planning, reference }) {
  const users = bundle.users || [];
  const active = users.filter((u) => u.is_active !== false);
  const inactive = users.filter((u) => u.is_active === false);

  // Who may carry a plan: contributor roles plus a flagged manager. Written
  // out here rather than taken from resolveScope, which is under test.
  const canPlan = (u) => ['salesman', 'supervisor'].includes(u.role) || u.is_contributor === true;
  const activePlanners = new Set(active.filter(canPlan).map((u) => u.id));
  const departedPlanners = inactive.filter(canPlan);
  const departedIds = new Set(departedPlanners.map((u) => u.id));

  const open = bundle.opps || [];
  const sumFor = (ids) => open
    .filter((o) => ids.has(o.owner_id))
    .reduce((t, o) => t + (parseFloat(o.planned_amount) || 0), 0);

  const expectedPlanned = sumFor(activePlanners);
  const excluded = sumFor(departedIds);
  const names = departedPlanners
    .filter((u) => open.some((o) => o.owner_id === u.id))
    .map((u) => u.full_name || u.id);
  const strayFunnel = (reference.funnelWindowRows || [])
    .filter((d) => !activePlanners.has(d.owner_id)
      && !active.some((u) => u.id === d.owner_id));

  return [
    row({
      label: 'Planned / Funnel exclude inactive owners — Planned',
      value: planning.plannedOpen,
      expected: expectedPlanned,
      note: excluded > 0
        ? `${Math.round(excluded).toLocaleString('en-US')} of open plan belongs to ${names.join(', ') || 'departed owners'} and is deliberately NOT counted.`
          + ' Target and Achieved still include them: history, not forecast.'
        : 'no departed owner holds an open plan item in this window, so the'
          + ' rule changes nothing today; the row still guards it',
    }),
    row({
      label: 'Planned / Funnel exclude inactive owners — open plan left out',
      value: excluded,
      note: names.length ? `held by ${names.join(', ')}` : 'nothing to leave out in this window',
    }),
    row({
      label: 'Planned / Funnel exclude inactive owners — funnel owners all active',
      value: strayFunnel.length,
      expected: 0,
      note: 'a count of open deals in the reference funnel whose owner is not'
        + ' an active user. Non-zero means a departed owner\'s pipeline is'
        + ' still being counted toward coverage.',
    }),
  ];
}
/**
 * ANNUAL ALLOCATION — the helper against a recomputation that shares no code
 * with it.
 *
 * CEO decision 2026-10-07: a manager's monthly rows, his team's and his own,
 * must add up to the yearly target the director gave him. computeAnnualAllocation
 * reports how far through that he is, and the target-assignment banner reads it,
 * so a wrong figure here tells a manager the wrong amount to hand out.
 *
 * NOTE these rows measure the EVERYONE scope (departed people's rows included,
 * decision 2026-10-07). The "Annual view — Not yet assigned" row in the
 * Planning group above measures the same subtraction over the viewer's ACTIVE
 * achievers and reads 12,559,543 higher for 2026. Both are correct against
 * their own scope and both pass; the divergence is recorded in
 * planningPageSummary.js and awaits a separate decision.
 *
 * THE INDEPENDENT SIDE walks the hierarchy from its own user read, sums the
 * bundle's own monthly rows, and takes the max of the yearly rows itself. It
 * reads users SEPARATELY from the bundle because the bundle's user rows are the
 * ACTIVE ones and this figure includes everyone (CEO decision 2026-10-07) —
 * reusing them would have quietly checked the active-only sum and passed. It shares targetPerPerson with the helper deliberately — that IS the
 * rule under test everywhere else in this file, and re-implementing a row's
 * value here would check this page against itself rather than the app. What it
 * does not share is the SCOPE resolution and the subtraction, which is what
 * this helper newly added.
 *
 * One row per person holding a yearly row: self-configuring, so it covers
 * Mohamed Kamal today and whoever else is given one later without an edit here.
 */
async function buildAnnualAllocationRows({ companyId, bundle, year, planning = null }) {
  const { data: yearly, error } = await supabase
    .from('sales_targets')
    .select('assigned_to, target_amount, target_type, period_start, period_end')
    .eq('company_id', companyId)
    .eq('period_type', 'yearly')
    .eq('status', 'active')
    .eq('target_type', 'total_value')
    .gte('period_start', `${year}-01-01`)
    .lte('period_end', `${year}-12-31`);
  if (error) {
    return [row({
      label: 'Annual allocation remaining — could not read the yearly rows',
      value: 0,
      note: error.message,
    })];
  }

  // The bundle's users are the ACTIVE ones; the scope walk needs all of them.
  const { data: everyone, error: everyoneErr } = await supabase
    .from('users')
    .select('id, full_name, supervisor_id, is_active')
    .eq('company_id', companyId);
  if (everyoneErr) {
    return [row({
      label: 'Annual allocation remaining — could not read the users',
      value: 0,
      note: everyoneErr.message,
    })];
  }
  const allUsers = everyone || [];
  const users = bundle.users || [];
  // A yearly row held by someone inactive is skipped: an allocation nobody is
  // carrying has no manager to report it to. (The ROWS of departed people are
  // counted; a departed person's own yearly allocation is not reported as his.)
  const holders = [...new Set((yearly || []).map((t) => t.assigned_to))]
    .filter((id) => users.some((u) => u.id === id));
  if (!holders.length) {
    return [row({
      label: `Annual allocation remaining — nobody holds a ${year} yearly row`,
      value: 0,
      note: 'nothing to check: the rule applies to a manager who has been given'
        + ' a yearly target, and no active user has one for this year',
    })];
  }

  const out = [];
  for (const id of holders) {
    const person = users.find((u) => u.id === id);
    const name = person?.full_name || id;

    // eslint-disable-next-line no-await-in-loop
    const alloc = await computeAnnualAllocation({ companyId, managerId: id, year });

    // ── independent ────────────────────────────────────────────────────────
    // includeInactive, and over allUsers rather than the bundle's active-only
    // rows: an allocation given to someone who has left was still given, and
    // the month it sat in cannot be assigned again. Mueataz Mohammed Ahmed's
    // 510,000 hangs off Shaikh Osman Shoukat, himself inactive, so the walk has
    // to pass THROUGH the departed as well as include them.
    const scope = [id, ...subtreeIdsOf({ users: allUsers, rootId: id, includeInactive: true })];
    const mine = (bundle.yearTargets || []).filter((t) => scope.includes(t.assigned_to));
    const expAssigned = Object.values(targetPerPerson(mine)).reduce((s, v) => s + v, 0);
    // Max per person, not sum: a revised annual target replaces the old one.
    const expAnnual = (yearly || [])
      .filter((t) => t.assigned_to === id)
      .reduce((mx, t) => Math.max(mx, parseFloat(t.target_amount) || 0), 0);
    const expRemaining = expAnnual - expAssigned;

    out.push(row({
      label: `Annual allocation remaining — ${name} ${year}`,
      value: alloc.remaining,
      expected: expRemaining,
      note: `allocation ${Math.round(expAnnual).toLocaleString('en-US')}`
        + ` less ${Math.round(expAssigned).toLocaleString('en-US')} of monthly rows`
        + ` across ${scope.length} people, active or not (him and everyone who`
        + ' has reported under him) — CEO decision 2026-10-07',
    }));
    out.push(row({
      label: `Annual allocation assigned — ${name} ${year}`,
      value: alloc.assigned,
      expected: expAssigned,
    }));
    out.push(row({
      label: `Annual allocation — ${name} ${year}: byMonth sums to assigned`,
      value: (alloc.byMonth || []).reduce((s, v) => s + v, 0),
      expected: alloc.assigned,
      note: 'the 12-month strip on the target-assignment banner is the same'
        + ' figure broken up, so it has to add back to it',
    }));
    // ── THE CROSS-SCREEN ROW ───────────────────────────────────────────────
    // Planning's "Not yet assigned" against the BANNER's "remaining", compared
    // to EACH OTHER rather than each to its own reference.
    //
    // WHY THIS ROW EXISTS. For a few hours on 2026-10-07 those two figures read
    // 27,852,189 and 15,292,646 — the same subtraction over two different
    // populations — and every row on this page passed, because each was checked
    // against a reference built on its own scope. A per-screen reference cannot
    // catch two screens disagreeing with each other; only a row that puts them
    // side by side can. Same shape as the division sum that stayed correct
    // while the split was wrong.
    //
    // Only on an ANNUAL range, where Planning computes the figure at all, and
    // only for the holder whose scope Planning's covers — at company scope that
    // is whoever holds the yearly row.
    if (planning && planning.annualTarget !== null && planning.annualTarget !== undefined) {
      out.push(row({
        label: `Annual allocation — ${name} ${year}: Planning "Not yet assigned" = the banner's "remaining"`,
        value: n(planning.unassignedAnnual),
        expected: Math.max(0, alloc.remaining),
        note: 'the two screens compared to EACH OTHER, not to a reference each.'
          + ' Planning scopes by viewer and the banner by the yearly-row holder,'
          + ' so they agree only while both obey the company rule (everyone,'
          + ' active or not). Clamped at zero on both sides, which is how'
          + ' Planning has always shown it.',
      }));
      out.push(row({
        label: `Annual allocation — ${name} ${year}: Planning "assigned" = the banner's`,
        value: n(planning.annualAssigned),
        expected: alloc.assigned,
      }));
    }

    out.push(row({
      label: `Annual allocation — ${name} ${year}: months left to assign`,
      value: alloc.monthsLeft,
      note: alloc.monthsLeft > 0
        ? `months with no rows yet, from this month on`
          + ` → ${Math.round(alloc.perMonthNeeded || 0).toLocaleString('en-US')} per month`
        : 'every remaining month of the year already carries rows',
    }));
  }
  return out;
}

/**
 * INSIGHTS AS A PERSON = PLANNING AS THE SAME PERSON.
 *
 * Insights opened to supervisors and salesmen on 2026-10-07. A supervisor now
 * has two screens showing him the same five figures over the same people, and
 * a salesman has two showing him his own — so the only question that matters
 * is whether they agree. These rows ask it directly, screen against screen,
 * rather than each against a reference of its own (the lesson of the annual
 * allocation, where both sides passed while disagreeing by 12.5M).
 *
 * The Insights side runs the REAL calcDivisionMetrics over the REAL scope that
 * scopeUserIds hands the page for that person's role. The Planning side runs
 * the real computePlanningPageSummary over the same ids. If the page's scope
 * rule and Planning's disagree for a role, these rows say so.
 *
 * Everyone with a contributor role is covered, so a new supervisor or salesman
 * is checked the day they are created without editing this file.
 */
async function buildInsightsVsPlanningRows({
  companyId, bundle, consoleData, start, end,
}) {
  const users = bundle.users || [];
  const subjects = users.filter(
    (u) => u.is_active !== false && ['supervisor', 'salesman'].includes(u.role),
  );
  if (!subjects.length) return [];

  const rows = [];
  for (const person of subjects) {
    const name = person.full_name || person.id;
    // The page's own scope for this person, from the one shared rule.
    const scope = scopeUserIds({ users, viewerId: person.id, role: person.role });
    if (!scope.length) continue;

    // INSIGHTS: the figures the page computes for its whole scope, which is
    // what its totals row shows. divisionId is null — the person's page is
    // scoped by WHO, not by division, and the division breakdown underneath
    // sums to this.
    const ins = calcDivisionMetrics(scope, { ...consoleData, divisionId: null }) || {};

    // PLANNING: the same people, the same period, the other screen.
    // eslint-disable-next-line no-await-in-loop
    const plan = await computePlanningPageSummary({
      companyId, ownerIds: scope, start, end,
    });

    const label = (what) => `Insights as ${name} = Planning as ${name} — ${what}`;
    rows.push(row({ label: label('target'), value: ins.target, expected: plan.target }));
    rows.push(row({ label: label('achieved'), value: ins.achieved, expected: plan.achieved }));
    rows.push(row({
      label: label('planned'), value: ins.planned, expected: plan.plannedOpen,
    }));
    rows.push(row({
      label: label('funnel'), value: ins.monthFunnel, expected: plan.openFunnel,
      note: 'Planning windows the funnel to the selected period on its "In Funnel"'
        + ' line, which is the same partition Insights shows',
    }));
    rows.push(row({
      label: label('planned gap'), value: ins.plannedGap, expected: plan.plannedGap,
      note: `over ${scope.length} ${person.role === 'salesman' ? 'person (himself)' : 'people (him and his team)'}`,
    }));
  }
  return rows;
}

/**
 * Run the check.
 *
 * @param {object} p
 * @param {string} p.companyId
 * @param {string} p.start  yyyy-MM-dd
 * @param {string} p.end    yyyy-MM-dd
 * @param {object} p.scope  { kind: 'company'|'team'|'person', userId? }
 * @param {object} p.viewer { id, role } — the signed-in admin/director, for the
 *                          two screens that scope themselves from the VIEWER
 *                          rather than from an id they are passed (Reports and
 *                          Forecast both do)
 * @returns {{ reference, groups, meta }}
 */
export async function runNumbersCheck({ companyId, start, end, scope, viewer = null }) {
  if (!companyId || !start || !end) throw new Error('company, start and end are required');

  const whole = wholePeriodOf(start, end);
  const isAnnual = whole?.kind === 'year';
  const isWholeMonth = whole?.kind === 'month';
  const year = rangeYear(start);

  const bundle = await loadBundle({ companyId, start, end, year });
  const { users } = bundle;
  const {
    ownerIds, achieverIds, contributorIds, label: scopeLabel, person,
  } = resolveScope({ users, scope });

  // ── THE REFERENCE, computed once from the shared rules ───────────────────
  // FORWARD-LOOKING FIGURES ARE ACTIVE-ONLY at every scope, so the reference
  // funnel is measured over the ACTIVE achievers even at company scope, where
  // achieverIds itself includes the departed for Target and Achieved. Getting
  // this the wrong way round would make the reference disagree with every
  // screen and blame the screens.
  const forwardIds = activeIdsFrom(achieverIds, users);
  const [refAchieved, refTargetRows, refFunnelNow, refFunnelWindow, refRate] = await Promise.all([
    fetchAchieved({ companyId, contributorIds: achieverIds, start, end }),
    fetchMonthlyTargets({ companyId, contributorIds: achieverIds, start, end }),
    // No window — which is how every screen calls it, meaning the CURRENT month
    // plus the undated deals (INCLUDE_UNDATED).
    fetchOpenFunnel({ companyId, scopeIds: forwardIds }),
    // The same function over the SELECTED period, for the screens that window it.
    fetchOpenFunnel({ companyId, scopeIds: forwardIds, start, end }),
    // The ACHIEVER scope (decision D4): the same people as Achieved and Target.
    // fetchWinRate3m narrows to it internally now, so passing ownerIds would give
    // the same answer — the achievers are passed explicitly so this row states
    // the scope it is asserting rather than relying on the helper to pick it.
    fetchWinRate3m({ companyId, scopeIds: achieverIds }),
  ]);

  const refTarget = sum(targetPerPerson(refTargetRows));
  const refAnnualTarget = isAnnual
    ? await computeAnnualTarget({
      companyId, ownerIds: achieverIds, monthlyTotal: 0, year: whole.year,
    })
    : null;
  // Won-not-invoiced is a STATUS, not a monthly figure, so it is deliberately
  // not windowed — exactly as the KPI strip treats it.
  const wni = summarizeWonNotInvoiced(
    wonNotInvoicedList({ deals: bundle.deals, ownerIds: achieverIds }),
  );

  const reference = {
    achieved: refAchieved.total,
    achievedGross: refAchieved.grossTotal,
    returns: refAchieved.returnsTotal,
    dealCount: refAchieved.count,
    target: refTarget,
    gap: Math.max(0, refTarget - refAchieved.total),
    funnelNow: refFunnelNow.total,
    funnelNowUndated: refFunnelNow.undated?.total || 0,
    funnelWindow: refFunnelWindow.total,
    // The ROWS, not just the total, so the forward-scope check can look at who
    // owns them instead of trusting a sum.
    funnelWindowRows: refFunnelWindow.rows || [],
    funnelWindowUndated: refFunnelWindow.undated?.total || 0,
    conversion3m: refRate.winRate3m,
    conversionWon3m: refRate.won3m,
    conversionTotal3m: refRate.total3m,
    pipelineConversion3m: refRate.pipelineConversion3m,
    importedExcluded: refRate.importedExcluded,
    wniTotal: wni.total,
    wniCount: wni.count,
    annualTarget: refAnnualTarget,
    unassignedAnnual: refAnnualTarget === null
      ? null
      : Math.max(0, refAnnualTarget - refTarget),
  };

  const groups = [];

  // ── KPI strip ────────────────────────────────────────────────────────────
  const { totals: strip } = await computeKpiStripData({
    companyId, ownerIds, range: { start, end, isAnnual },
  });
  groups.push({
    screen: 'KPI strip (every dashboard)',
    fn: 'computeKpiStripData',
    rows: [
      row({
        label: 'Target',
        value: strip.target,
        expected: isAnnual ? reference.annualTarget : reference.target,
        note: isAnnual
          ? 'the annual view prefers the YEARLY allocation over the monthly sum (decision D3)'
          : null,
      }),
      row({ label: 'Achieved (invoiced, net of returns)', value: strip.achieved, expected: reference.achieved }),
      row({
        label: 'Gap to target',
        value: strip.deficit,
        expected: isAnnual
          ? Math.max(0, n(reference.annualTarget) - reference.achieved)
          : reference.gap,
      }),
      row({ label: 'Conversion (3m)', value: strip.winRate3m, expected: reference.conversion3m, kind: 'pct',
        note: 'measured over the ACHIEVERS since 2026-10-05 — the same people as'
          + ' Achieved and Target (decision D4)' }),
      row({ label: 'Pipeline conversion (info only)', value: strip.pipelineConversion3m, expected: reference.pipelineConversion3m, kind: 'pct' }),
      row({
        label: 'Funnel card',
        value: strip.funnelValue,
        expected: reference.funnelNow,
        note: 'a live figure: the CURRENT month plus undated, whatever period is selected',
      }),
      row({
        label: 'Funnel dated into the selected period',
        value: strip.monthFunnel,
        expected: reference.funnelWindow,
      }),
      row({ label: 'Won, not yet invoiced', value: strip.wonNotInvoiced?.total, expected: reference.wniTotal }),
      row({
        label: 'Planned (open plan)',
        value: strip.planned,
        note: 'like the Funnel card, a live figure: the strip reads the CURRENT'
          + " month's open plan whatever period is selected. Planning's Plan row"
          + ' below reads the SELECTED period, so the two differ by design'
          + ' whenever a past month is on screen.',
      }),
    ],
  });

  // ── Monthly target cards and tiles ───────────────────────────────────────
  const monthlyRows = [];
  if (person && scope?.kind === 'person') {
    const card = await getMonthlyTarget({
      userId: scope.userId, companyId, dateFrom: start, dateTo: end,
    });
    monthlyRows.push(
      row({
        label: 'Monthly Target card (own) — Target',
        value: card?.amount ?? 0,
        expected: reference.target,
        note: card ? null : 'no card is drawn: this person holds no target row and invoiced nothing',
      }),
      row({ label: 'Monthly Target card (own) — Achieved', value: card?.achieved ?? 0, expected: reference.achieved }),
      row({ label: 'Monthly Target card (own) — Won, not invoiced', value: card?.wonNotInvoiced?.total ?? 0, expected: reference.wniTotal }),
    );
  }
  const scopeTotals = await getScopeMonthlyTotals({ companyId, ownerIds, start, end });
  const tileName = (!scope || scope.kind === 'company' || !scope.userId)
    ? 'Director Company Monthly tile'
    : 'Manager Team Monthly tile';
  monthlyRows.push(
    row({ label: `${tileName} — Target`, value: scopeTotals.target, expected: reference.target }),
    row({ label: `${tileName} — Achieved`, value: scopeTotals.achieved, expected: reference.achieved }),
  );
  // The manager's own card plus the tile for everyone BELOW him must add up to
  // the strip for the whole team — the double-counting test the brief asks for.
  if (scope?.kind === 'team') {
    const below = subtreeIdsOf({ users, rootId: scope.userId });
    const [own, teamOnly] = await Promise.all([
      getScopeMonthlyTotals({ companyId, ownerIds: [scope.userId], start, end }),
      below.length
        ? getScopeMonthlyTotals({ companyId, ownerIds: below, start, end })
        : Promise.resolve({ target: 0, achieved: 0 }),
    ]);
    monthlyRows.push(
      row({
        label: 'Own card + team-below tile = strip (Achieved)',
        value: own.achieved + teamOnly.achieved,
        expected: reference.achieved,
        note: 'the two tiles must add up without counting the manager twice',
      }),
      row({
        label: 'Own card + team-below tile = strip (Target)',
        value: own.target + teamOnly.target,
        expected: reference.target,
      }),
    );
  }
  groups.push({
    screen: 'Monthly target cards and tiles',
    fn: 'getMonthlyTarget / getScopeMonthlyTotals',
    rows: monthlyRows,
  });

  // ── Target table ─────────────────────────────────────────────────────────
  // The rows a dashboard's target table lists for this scope: active monthly
  // rows overlapping the window, held by somebody whose revenue counts.
  const tableRows = (bundle.targets || []).filter((t) => achieverIds.includes(t.assigned_to));
  const progressCtx = { deals: bundle.deals, returns: bundle.returns, users };
  const withProgress = withTargetRowProgress(tableRows, progressCtx);
  const holderIds = [...new Set(tableRows.map((t) => t.assigned_to))];
  // WHO THE ROWS COVER is not the same as who HOLDS them, and this row was
  // wrong about that until 2026-10-06.
  //
  // targetRowScope treats a row assigned TO a manager BY someone else as a
  // TEAM ALLOCATION: its progress is the whole subtree's revenue, because that
  // is what the allocation is for. So one row held by one manager can cover
  // every achiever beneath him. This check compared the table total against
  // Achieved for the ROW HOLDERS alone, which agreed only for as long as no
  // manager had a monthly row — and the moment Mohamed Kamal was given an
  // October target it reported a 38,528 discrepancy against an app that was
  // behaving exactly as designed.
  //
  // The reference is now Achieved over the people the rows COVER, resolved by
  // the same shared helper the table uses (distinctPeopleScope). What that
  // still tests, and it is the thing worth testing: that the total is taken
  // over PEOPLE and not over rows, and that it is windowed and netted like
  // every other Achieved. What it no longer pretends to test is the scope
  // rule itself, which has nothing independent to be checked against.
  const coveredIds = distinctPeopleScope(tableRows, { users });
  const distinctPeople = coveredIds.length;
  const coveredAchieved = computeAchieved({
    deals: bundle.deals, contributorIds: coveredIds, start, end, returns: bundle.returns,
  }).total;
  groups.push({
    screen: 'Target table (all dashboards)',
    fn: 'achievedForRows / withTargetRowProgress',
    rows: [
      row({
        label: `Table Achieved total — ${tableRows.length} row(s) held by ${holderIds.length},`
          + ` covering ${distinctPeople} ${distinctPeople === 1 ? 'person' : 'people'}`,
        value: achievedForRows(tableRows, { ...progressCtx, start, end }),
        expected: coveredAchieved,
        note: 'summed over PEOPLE, not over rows — one person holding three rows'
          + ' counts once. "Covering" exceeds "held by" when a manager holds a'
          + ' team allocation, because that row\'s progress is his subtree\'s'
          + ' revenue, not his own.',
      }),
      row({
        label: `Achieved by the ${Math.max(0, achieverIds.length - distinctPeople)} achiever(s) NO row covers (info only)`,
        value: reference.achieved - coveredAchieved,
        note: distinctPeople < achieverIds.length
          ? 'this is why the table total above is below the scope Achieved — it is'
            + ' revenue that no target row covers, not missing revenue'
          : 'every achiever in this scope is covered by some row in the table',
      }),
      row({
        label: 'Sum of row targets (targetPerPerson)',
        value: sum(targetPerPerson(tableRows)),
        expected: reference.target,
      }),
      row({
        label: `Sum of the ${withProgress.length} rows' progress (info only)`,
        value: withProgress.reduce((s, r) => s + n(r.calculated_progress), 0),
        note: "each row shows its holder's Achieved for the ROW's own period, so this"
          + ' over-totals whenever one person holds several rows. That is why the total'
          + ' above is taken over people — this is not a second opinion about Achieved.',
      }),
    ],
  });

  // ── Director dashboard ───────────────────────────────────────────────────
  const companyCard = computeAchieved({
    deals: bundle.deals, contributorIds: achieverIds, start, end, returns: bundle.returns,
  });
  const bars = performanceBars({
    allDeals: bundle.deals, contributorIds: achieverIds, returns: bundle.returns,
    targetsData: bundle.yearTargets, timePeriod: 'month', year,
  });
  const barTotals = performanceTotals(bars.rows);
  const monthIndex = Number(String(start).slice(5, 7)) - 1;
  const trend = achievedForBuckets({
    deals: bundle.deals, contributorIds: achieverIds,
    buckets: monthBuckets(year), returns: bundle.returns,
  });
  const yearAchieved = trend.reduce((s, b) => s + n(b.revenue), 0);
  groups.push({
    screen: `Director dashboard (${year})`,
    fn: 'computeAchieved / performanceBars / achievedForBuckets',
    rows: [
      row({ label: 'Company card — Achieved', value: companyCard.total, expected: reference.achieved }),
      row({
        label: 'Company card — performance %',
        value: reference.target > 0 ? (companyCard.total / reference.target) * 100 : 0,
        expected: reference.target > 0 ? (reference.achieved / reference.target) * 100 : 0,
        kind: 'pct',
        note: reference.target > 0 ? null : 'no target rows in this period — the card shows "No target set"',
      }),
      row({
        label: 'Leaderboard total (sum of its per-person rows)',
        value: sum(companyCard.perPerson),
        expected: reference.achieved,
      }),
      row({
        label: `Monthly trend bucket — ${trend[monthIndex]?.label || '—'}`,
        value: trend[monthIndex]?.revenue,
        expected: isWholeMonth ? reference.achieved : null,
        note: isWholeMonth ? null : 'compared only when the selected period is one whole month',
      }),
      row({
        label: `Performance Summary — Total Revenue (the 12 bars of ${year})`,
        value: barTotals.totalRevenue,
        expected: yearAchieved,
        note: 'against the same twelve months through achievedForBuckets, so the card'
          + ' and the trend chart are checked against each other even when the'
          + ' selected period is a single month',
      }),
      row({
        label: "Performance Summary — Total Revenue vs the year's Achieved",
        value: barTotals.totalRevenue,
        expected: isAnnual ? reference.achieved : null,
        note: isAnnual ? null : 'compared to the reference only in the annual view',
      }),
      row({
        label: `Performance Summary — Total Target (the 12 bars of ${year})`,
        value: barTotals.totalTarget,
        expected: isAnnual ? reference.target : null,
        note: isAnnual
          ? 'the sum of the MONTHLY rows assigned, not the yearly allocation'
          : 'whole-year sum; compared to the reference only in the annual view',
      }),
    ],
  });

  // ── Planning ─────────────────────────────────────────────────────────────
  const planning = await computePlanningPageSummary({ companyId, ownerIds, start, end });
  const planningRows = [
    row({ label: 'Target', value: planning.target, expected: reference.target }),
    row({ label: 'Achieved', value: planning.achieved, expected: reference.achieved }),
    row({
      label: 'Conversion (3m)',
      value: planning.winRatePct,
      expected: reference.conversion3m,
      kind: 'pct',
      note: planning.winRateIsDefault
        ? 'BORROWED: this scope closed nothing in the 3-month window, so Planning walks'
          + ' its documented fallback chain while the reference reports the measured'
          + ' figure. A difference in policy, deliberate, not a difference in the rule.'
        : null,
    }),
    row({ label: 'In Funnel (this period)', value: planning.openFunnel, expected: reference.funnelWindow }),
    row({ label: 'Plan (open opportunities)', value: planning.plannedOpen }),
    row({
      label: 'Required Plan',
      value: planning.requiredPlan,
      note: 'remaining target ÷ conversion — no reference figure of its own; it is right'
        + ' exactly when the two rows it divides are',
    }),
  ];
  if (isAnnual) {
    planningRows.push(
      row({ label: 'Annual view — Annual allocation', value: planning.annualTarget, expected: reference.annualTarget }),
      row({ label: 'Annual view — Monthly targets assigned', value: planning.target, expected: reference.target }),
      row({ label: 'Annual view — Not yet assigned', value: planning.unassignedAnnual, expected: reference.unassignedAnnual }),
      row({ label: 'Annual view — Achieved', value: planning.achieved, expected: reference.achieved }),
    );
  }
  groups.push({ screen: 'Planning summary', fn: 'computePlanningPageSummary', rows: planningRows });

  // ── Current Sales Plan tab ───────────────────────────────────────────────
  // The plan is FORWARD-LOOKING, so this tab counts active owners only (CEO
  // decision 2026-10-07) — the same scope Planning's own Planned uses.
  const planScopeIds = ownerIds || forwardIds;
  const tabRows = (bundle.oppsAll || []).filter((o) => planScopeIds.includes(o.owner_id));
  const tabOpen = openPlanTotal(tabRows);
  groups.push({
    screen: 'Current Sales Plan tab',
    fn: 'openPlanTotal',
    rows: [
      row({ label: 'Total Planned (open rows only)', value: tabOpen.total, expected: planning.plannedOpen }),
      row({
        label: `Rows set aside: ${tabRows.length - tabOpen.count} of ${tabRows.length} (info only)`,
        value: tabRows.length - tabOpen.count,
        note: 'converted rows — already in the funnel as the deal they became — and'
          + ' moved-to-future rows, which belong to a later month',
      }),
    ],
  });

  // ── Coverage Console and Insights ────────────────────────────────────────
  //
  // Both take the bundle above, which is the bundle their own pages build. The
  // window flags come from the shared helpers, not from a guess about the dates.
  const consoleData = {
    ...bundle,
    isCurrentMonth: isCurrentMonthRange(start, end),
    isAllTime: false,
  };
  const cc = calcCoverageMetrics(achieverIds, consoleData) || {};
  const ins = calcDivisionMetrics(achieverIds, consoleData) || {};
  // The reference coverage: the shared rule over the reference's OWN inputs —
  // Achieved, this period's funnel, the open plan and the reference conversion.
  // A ✗ here is explained by whichever of those four rows is itself ✗, which is
  // why they all appear above it.
  const refCoverage = computeCoverage({
    invoiced: reference.achieved,
    openDeals: refFunnelWindow.rows,
    planned: planning.plannedOpen,
    winRatePct: reference.conversion3m,
  });
  groups.push({
    screen: 'Coverage Console',
    fn: 'calcCoverageMetrics',
    rows: [
      row({ label: 'Achieved', value: cc.invoiced, expected: reference.achieved }),
      row({ label: 'Achieved, gross of returns', value: cc.invoicedGross, expected: reference.achievedGross }),
      row({ label: 'Target', value: cc.target, expected: reference.target }),
      row({ label: 'Funnel dated into this period', value: cc.monthFunnel, expected: reference.funnelWindow }),
      row({
        label: 'Conversion (3m)',
        value: n(cc.winRate) * 100,
        expected: reference.conversion3m,
        kind: 'pct',
        note: 'this screen computes every node of the tree from one read'
          + ' (winRateFromDeals) — the same window, formula, scope and'
          + ' imported-history exclusion as fetchWinRate3m',
      }),
      row({ label: 'Planned (open plan)', value: cc.planning, expected: planning.plannedOpen }),
      row({ label: 'Coverage (computeCoverage)', value: cc.coverage, expected: refCoverage.coverage }),
    ],
  });
  groups.push({
    screen: 'Insights (divisions, company level)',
    fn: 'calcDivisionMetrics',
    rows: [
      row({ label: 'Achieved', value: ins.achieved, expected: reference.achieved }),
      row({ label: 'Achieved, gross of returns', value: ins.achievedGross, expected: reference.achievedGross }),
      row({ label: 'Target', value: ins.target, expected: reference.target }),
      row({ label: 'Funnel dated into this period', value: ins.monthFunnel, expected: reference.funnelWindow }),
      row({ label: 'Conversion (3m)', value: ins.winRatePct, expected: reference.conversion3m, kind: 'pct' }),
      row({ label: 'Planned (open plan)', value: ins.planned, expected: planning.plannedOpen }),
      row({
        label: 'Coverage (computeCoverage)',
        value: ins.coverage,
        expected: refCoverage.coverage,
        note: 'this page found this row disagreeing on 2026-10-05 —'
          + ' calcDivisionMetrics weighted EVERY open deal while the Coverage'
          + ' Console and the KPI strip weighted only the funnel dated INTO the'
          + ' period, reading 2,812,660 against 1,548,955 for JASCO PVC in'
          + ' September on the same people. Fixed the same day: all three now'
          + ' weight funnelSplit.rows.',
      }),
      row({
        label: 'Whole open pipeline, any date (info only)',
        value: ins.pipeline,
        note: 'every open deal regardless of date. This feeds the coverage RAIL,'
          + ' which is about the whole book; it is deliberately NOT what the'
          + ' Coverage row above weights.',
      }),
    ],
  });

  // ── Divisions sum to the company ─────────────────────────────────────────
  const divisionGroups = await buildDivisionGroups({
    companyId, consoleData, reference, planning, start, end, users,
  });
  divisionGroups.forEach((grp) => { if (grp.rows.length) groups.push(grp); });

  // ── Division attribution survives an UPDATE (2026-10-07) ────────────────
  const attribRows = await buildDivisionAttributionRows({ companyId, bundle });
  if (attribRows.length) {
    groups.push({
      screen: 'Division attribution',
      fn: 'division_on_update.sql',
      rows: attribRows,
    });
  }

  // ── The coverage rail's drill-down (2026-10-07) ──────────────────────────
  const railRows = await buildRailDrillRows({
    companyId, bundle, consoleData, start, end,
  });
  if (railRows.length) {
    groups.push({
      screen: 'Coverage rail drill-down',
      fn: 'buildCoverageDrill',
      rows: railRows,
    });
  }

  // ── Forward-looking scope (CEO decision 2026-10-07) ──────────────────────
  groups.push({
    screen: 'Forward-looking figures exclude inactive owners',
    fn: 'activeIdsFrom',
    rows: buildForwardScopeRows({ bundle, planning, reference }),
  });

  // ── Insights for supervisors and salesmen (CEO decision 2026-10-07) ──────
  const insightsRows = await buildInsightsVsPlanningRows({
    companyId, bundle, consoleData, start, end,
  });
  if (insightsRows.length) {
    groups.push({
      screen: 'Insights vs Planning, per person',
      fn: 'calcDivisionMetrics vs computePlanningPageSummary',
      rows: insightsRows,
    });
  }

  // ── Annual allocation (CEO decision 2026-10-07) ──────────────────────────
  const annualAllocRows = await buildAnnualAllocationRows({
    companyId, bundle, year, planning,
  });
  if (annualAllocRows.length) {
    groups.push({
      screen: 'Annual allocation (target assignment banner)',
      fn: 'computeAnnualAllocation',
      rows: annualAllocRows,
    });
  }

  // ── Known to differ — not yet unified ────────────────────────────────────
  //
  // These two screens answer a different question on purpose, so a ✗ here is
  // EXPECTED and is labelled as such. Unifying them is a business decision
  // nobody has taken; what matters is that the difference is visible and
  // explained rather than discovered by someone comparing two tabs.
  const knownRows = [];
  // Rows that USED to be in the known-to-differ group and now agree. Kept in
  // groups of their own so the history is visible: each note says what the
  // figure was before it was unified, which is the only way a reader can tell a
  // row that has always agreed from one that was fixed.
  const forecastRows = [];
  const reportRows = [];
  const viewerId = viewer?.id || null;
  const viewerRole = viewer?.role || 'admin';
  if (viewerId) {
    // Forecast: the page's own service, then the same engine call it makes.
    const fcOwnerId = scope?.kind === 'person' ? scope.userId : null;
    const fcIdentity = scope?.kind === 'team'
      ? { userId: scope.userId, role: person?.role || viewerRole }
      : { userId: viewerId, role: viewerRole };
    const fc = await forecastService.getForecastData({
      companyId,
      userId: fcIdentity.userId,
      role: fcIdentity.role,
      periodStart: start,
      periodEnd: end,
      ownerId: fcOwnerId,
    });
    // The page passes the shared Achieved and won-not-invoiced in as the 5th
      // argument; so does this row, with the service's own figures.
    const forecast = buildForecast(
      fc?.deals || [], fc?.target?.target_amount ?? 0, null, null,
      { achieved: fc?.achieved, wonNotInvoiced: fc?.wonNotInvoiced?.total || 0 },
    );
    forecastRows.push(
      row({
        label: 'Forecast page — Committed',
        value: forecast?.committed,
        expected: reference.achieved,
        note: 'the shared Achieved since 2026-10-05. It was won deals at `amount`'
          + ' with no invoice test, no final_amount and no returns — 802,823 for'
          + ' a month whose Achieved was 0.',
      }),
      row({
        label: 'Forecast page — Target',
        value: fc?.target?.target_amount ?? 0,
        expected: reference.target,
        note: 'the shared per-person rule since 2026-10-05, monthly rows only'
          + ' (the annual allocation on an annual view). It was a MAX over the'
          + ' rows of every assignee, of any period_type — 43,861,779 for'
          + ' October, because a manager yearly roll-up was summed into a month.',
      }),
      row({
        label: 'Forecast page — Won, not yet invoiced',
        value: forecast?.wonNotInvoiced,
        expected: reference.wniTotal,
        note: 'carried as its own term: counted in Weighted and Best Case,'
          + ' never inside Committed',
      }),
    );

    // Reports: the page's own fetches, then the figures its screens show.
    // A person-scope check narrows the fetch to the one person by asking for a
    // salesman scope, which is exactly what getTeamUserIds does for a salesman.
    const rptIdentity = (!scope || scope.kind === 'company' || !scope.userId)
      ? { userId: viewerId, role: viewerRole }
      : {
        userId: scope.userId,
        role: scope.kind === 'person' ? 'salesman' : (person?.role || viewerRole),
      };

    // THE REVENUE FIGURES USERS ACTUALLY SEE.
    //
    // Every label below is the wording ON THE SCREEN, so a reader can hold the
    // two side by side and match them one to one. That is the whole point of
    // this page, and it is what the old Reports row failed at: it measured
    // reportWonTotal over getReportDeals — ReportKPIBar's formula — and
    // ReportKPIBar IS NOT MOUNTED ANYWHERE, so the check faithfully verified a
    // figure no user could reach while the By Value tile they do see went
    // unchecked. Do not add a row for ReportKPIBar unless somebody mounts it.
    const rptAchieved = await getReportAchieved({
      companyId, userId: rptIdentity.userId, role: rptIdentity.role,
      dateFrom: start, dateTo: end,
    });
    const rptTotals = reportAchievedTotals({ ...rptAchieved, start, end });
    const tileLabel = rptTotals.returns > 0
      ? 'Revenue (net of returns)'
      : 'Revenue (invoiced)';
    reportRows.push(
      row({
        // The tile wording is conditional on there being any returns, so this
        // follows it rather than hard-coding one of the two.
        label: `Reports → By Value, "${tileLabel}" tile`,
        value: rptTotals.net,
        expected: reference.achieved,
        note: 'the shared Achieved since 2026-10-05: won AND invoiced, by'
          + ' invoice_date, final_amount ?? amount, over the achievers, net of'
          + ' credit notes raised in the period. THIS is the figure on the screen.',
      }),
      row({
        label: 'Reports → By Value, "Invoiced (before returns)" line',
        value: rptTotals.invoiced,
        expected: reference.achievedGross,
      }),
      row({
        label: 'Reports → By Value, "Returns" line',
        value: rptTotals.returns,
        expected: reference.returns,
        note: 'ALL FIVE credit notes in production are unmatched (deal_id IS NULL),'
          + ' so they reduce nobody and this reads 0.00 — which is why the tile'
          + ' above says "Revenue (invoiced)" and the breakdown lines are hidden.'
          + ' An unmatched return has no owner to charge;'
          + ' migrations/relink_returns_on_invoice_correction.sql (NOT APPLIED)'
          + ' is what links them.',
      }),
      row({
        label: `Reports → By Salesman, "Revenue" column over `
          + `${Object.keys(rptTotals.perPerson).length} `
          + `${Object.keys(rptTotals.perPerson).length === 1 ? 'person' : 'people'}`,
        value: Object.values(rptTotals.perPerson).reduce((s, v) => s + v, 0),
        expected: reference.achieved,
        note: 'the Total row under that column, summed from the same per-person'
          + ' split the column itself renders',
      }),
    );

    // The PIPELINE figure the stage, velocity and win/loss tables are built on.
    //
    // INFO, not a comparison. It has no reference to be measured against: it
    // answers "what did we close this period", where Achieved answers "what did
    // we bill". Giving it `expected: reference.achieved` and labelling the
    // result "known to differ" was the wrong shape — a row that can never agree
    // is not a failing check, it is a different measurement.
    //
    // It is NOT a ReportKPIBar row. That component is unmounted; this is the row
    // set the eight deal-based tabs render, summed by the one formula that
    // describes them, so the number is here for context when someone asks why
    // the revenue tile and the stage tables do not add up.
    const { data: reportDeals } = await reportService.getReportDeals(
      companyId, rptIdentity.userId, rptIdentity.role,
      `${start}T00:00:00`, `${end}T23:59:59`,
    );
    reportRows.push(row({
      label: `Reports — value of deals WON in the period (${(reportDeals || []).length} deals, context only)`,
      value: reportWonTotal(reportDeals || []),
      note: 'every won deal at `amount`, dated by CLOSED_AT, invoiced or not —'
        + ' what the stage and velocity tables describe, and what the By Value'
        + ' tile deliberately is NOT. A deal closed in September and invoiced in'
        + ' October is September pipeline and October revenue, and both'
        + ' statements are true. No screen shows this total on its own.',
    }));
  } else {
    knownRows.push(row({
      label: 'Forecast and Reports',
      value: 0,
      note: 'not checked: both scope themselves from the signed-in user, and no viewer was passed',
    }));
  }
  if (forecastRows.length) {
    groups.push({
      screen: 'Forecast page (unified 2026-10-05)',
      fn: 'forecastService.getForecastData + buildForecast',
      rows: forecastRows,
    });
  }
  if (reportRows.length) {
    groups.push({
      screen: 'Reports (unified 2026-10-05)',
      fn: 'reportService.getReportAchieved + reportAchievedTotals',
      rows: reportRows,
    });
  }
  // The known-to-differ group is now EMPTY in the ordinary case, which is the
  // point of this session: every figure either agrees with the reference or is
  // an info row with no reference to agree with. The group is still pushed when
  // something lands in it — the "no viewer was passed" case above — because an
  // empty list must mean "nothing differs", never "nothing was looked at".
  if (knownRows.length) {
    groups.push({
      screen: 'Known to differ — not yet unified',
      fn: 'forecastService.getForecastData / reportService.getReportDeals',
      knownToDiffer: true,
      rows: knownRows,
    });
  }

  const allRows = groups.flatMap((g) => g.rows);
  return {
    reference,
    groups,
    meta: {
      companyId, start, end, isAnnual, isWholeMonth, year,
      periodKind: whole?.kind || 'custom',
      scopeLabel,
      scopeKind: scope?.kind || 'company',
      ownerIdCount: ownerIds ? ownerIds.length : null,
      achieverCount: achieverIds.length,
      contributorCount: contributorIds.length,
      dealsRead: bundle.deals.length,
      loadError: bundle.error ? (bundle.error.message || String(bundle.error)) : null,
      checked: allRows.filter((r) => r.expected !== null).length,
      ok: allRows.filter((r) => r.status === 'ok').length,
      bad: allRows.filter((r) => r.status === 'bad' && !r.knownToDiffer).length,
      badKnown: allRows.filter((r) => r.status === 'bad' && r.knownToDiffer).length,
      ranAt: new Date().toISOString(),
    },
  };
}

/** The whole result as plain text, for pasting into a chat. */
export function formatCheckAsText(result) {
  if (!result) return '';
  const { reference, groups, meta } = result;
  const money = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
    .format(Math.round(n(v)));
  const pct = (v) => `${n(v).toFixed(1)}%`;
  const fmt = (r) => (r.kind === 'pct' ? pct(r.value) : money(r.value));
  const fmtExp = (r) => (r.kind === 'pct' ? pct(r.expected) : money(r.expected));

  const lines = [
    `NUMBERS CHECK  ${meta.start} .. ${meta.end}  (${meta.periodKind})  —  ${meta.scopeLabel}`,
    `${meta.ok}/${meta.checked} unified rows agree`
    + (meta.bad ? `  ·  ${meta.bad} DISAGREE` : '')
    + (meta.badKnown ? `  ·  ${meta.badKnown} known to differ (expected)` : ''),
    '',
    'REFERENCE — the shared rules, computed once',
    `  Achieved             ${money(reference.achieved)}`
    + `   (gross ${money(reference.achievedGross)} − returns ${money(reference.returns)},`
    + ` ${reference.dealCount} invoices)`,
    `  Target               ${money(reference.target)}`,
    `  Gap to target        ${money(reference.gap)}`,
    `  Funnel, this month   ${money(reference.funnelNow)}   (undated ${money(reference.funnelNowUndated)})`,
    `  Funnel, this period  ${money(reference.funnelWindow)}   (undated ${money(reference.funnelWindowUndated)})`,
    `  Conversion (3m)      ${pct(reference.conversion3m)}`
    + `   (${reference.conversionWon3m}/${reference.conversionTotal3m} created,`
    + ` ${reference.importedExcluded} imported excluded)`,
    `  Pipeline conv. (3m)  ${pct(reference.pipelineConversion3m)}   information only`,
    `  Won, not invoiced    ${money(reference.wniTotal)}   (${reference.wniCount} deals)`,
  ];
  if (reference.annualTarget !== null && reference.annualTarget !== undefined) {
    lines.push(
      `  Annual allocation    ${money(reference.annualTarget)}`,
      `  Monthly assigned     ${money(reference.target)}`,
      `  Not yet assigned     ${money(reference.unassignedAnnual)}`,
    );
  }
  lines.push('');

  groups.forEach((g) => {
    lines.push(`${g.screen}   [${g.fn}]`);
    g.rows.forEach((r) => {
      let mark = '--';
      if (r.status === 'ok') mark = 'OK';
      else if (r.status === 'bad') mark = r.knownToDiffer ? 'X*' : 'XX';
      let line = `  ${mark}  ${r.label.padEnd(54).slice(0, 54)} ${fmt(r).padStart(14)}`;
      if (r.expected !== null) {
        line += `   ref ${fmtExp(r).padStart(14)}`;
        if (r.status === 'bad') {
          line += `   diff ${r.kind === 'pct' ? `${n(r.diff).toFixed(1)}pp` : money(r.diff)}`;
        }
      }
      lines.push(line);
      if (r.note) lines.push(`         note: ${r.note}`);
    });
    lines.push('');
  });

  lines.push(
    `Scope: ${meta.achieverCount} achievers, ${meta.contributorCount} contributors`
    + `${meta.ownerIdCount === null ? '' : `, ${meta.ownerIdCount} people in scope`}`
    + `  ·  ${meta.dealsRead} deals read  ·  run ${meta.ranAt}`,
  );
  if (meta.loadError) lines.push(`LOAD ERROR: ${meta.loadError}`);
  lines.push(
    'OK = agrees to 1 SAR / 0.1pp.   XX = disagrees.   X* = known to differ, not yet unified.',
    '-- = nothing to compare it against: a reference figure, or a count shown for context.',
  );
  return lines.join('\n');
}
