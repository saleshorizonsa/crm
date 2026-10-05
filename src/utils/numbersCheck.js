import { supabase } from 'lib/supabase';
import {
  fetchAchieved,
  fetchMonthlyTargets,
  targetPerPerson,
  computeAnnualTarget,
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
import { achievedForRows, withTargetRowProgress } from 'utils/targetProgress';
import { achievedForBuckets, monthBuckets, rangeYear } from 'utils/achievedSeries';
import { performanceBars, performanceTotals } from 'utils/performanceBarData';
import { calcCoverageMetrics } from 'utils/coverageConsoleMetrics';
import { calcDivisionMetrics } from 'utils/salesDivisionMetrics';
import { subtreeIdsOf } from 'utils/teamHierarchy';
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
  const tolerance = kind === 'pct' ? PCT_TOLERANCE : MONEY_TOLERANCE;
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
    return {
      ownerIds: null,
      achieverIds: achieverIdsFrom(all),
      contributorIds: contributorIdsFrom(all),
      label: 'Whole company',
      person: null,
    };
  }
  const person = all.find((u) => u.id === scope.userId) || null;
  if (scope.kind === 'team') {
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
    supabase.from('users')
      .select('id, full_name, role, supervisor_id, is_active, is_contributor')
      .eq('company_id', companyId).eq('is_active', true),
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
  const [refAchieved, refTargetRows, refFunnelNow, refFunnelWindow, refRate] = await Promise.all([
    fetchAchieved({ companyId, contributorIds: achieverIds, start, end }),
    fetchMonthlyTargets({ companyId, contributorIds: achieverIds, start, end }),
    // No window — which is how every screen calls it, meaning the CURRENT month
    // plus the undated deals (INCLUDE_UNDATED).
    fetchOpenFunnel({ companyId, scopeIds: achieverIds }),
    // The same function over the SELECTED period, for the screens that window it.
    fetchOpenFunnel({ companyId, scopeIds: achieverIds, start, end }),
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
  const distinctPeople = holderIds.length;
  // The table's own reference. It is Achieved over THE PEOPLE IN THE TABLE, not
  // over the whole scope: somebody who invoiced but holds no target row this
  // month has no row to appear in, so a table total that equalled the company's
  // Achieved would be the thing that was wrong. September 2026 is exactly that
  // case — 3 people hold rows, 6 are achievers — so the figure below is what
  // the table must show, and the gap is reported as its own line rather than
  // left to look like a defect.
  const holdersAchieved = computeAchieved({
    deals: bundle.deals, contributorIds: holderIds, start, end, returns: bundle.returns,
  }).total;
  groups.push({
    screen: 'Target table (all dashboards)',
    fn: 'achievedForRows / withTargetRowProgress',
    rows: [
      row({
        label: `Table Achieved total, over ${distinctPeople} distinct ${distinctPeople === 1 ? 'person' : 'people'}`,
        value: achievedForRows(tableRows, { ...progressCtx, start, end }),
        expected: holdersAchieved,
        note: 'summed over PEOPLE, not over rows — one person holding three rows'
          + ' counts once. Measured against Achieved for those same people.',
      }),
      row({
        label: `Achieved by the ${achieverIds.length - distinctPeople} achiever(s) holding NO target row (info only)`,
        value: reference.achieved - holdersAchieved,
        note: distinctPeople < achieverIds.length
          ? 'this is why the table total above is below the scope Achieved — it is'
            + ' revenue with no target row to sit under, not missing revenue'
          : 'everybody whose revenue counts holds a target row in this period',
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
  const planScopeIds = ownerIds || achieverIds;
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

  // ── Known to differ — not yet unified ────────────────────────────────────
  //
  // These two screens answer a different question on purpose, so a ✗ here is
  // EXPECTED and is labelled as such. Unifying them is a business decision
  // nobody has taken; what matters is that the difference is visible and
  // explained rather than discovered by someone comparing two tabs.
  const knownRows = [];
  // Rows that USED to be in the known-to-differ group and now agree, kept as
  // their own group so the history stays visible: each note says what the
  // figure was before it was unified.
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
    const forecast = buildForecast(fc?.deals || [], fc?.target?.target_amount ?? 0);
    knownRows.push(
      row({
        label: 'Forecast page — Committed (projection view)',
        value: forecast?.committed,
        expected: reference.achieved,
        knownToDiffer: true,
        note: 'won deals at `amount`: no invoice test, no final_amount, no returns'
          + ' subtracted. The DIRECTOR view of that same page already reads'
          + ' computeKpiStripData and agrees with the reference.',
      }),
      row({
        label: 'Forecast page — Target',
        value: fc?.target?.target_amount ?? 0,
        expected: reference.target,
        knownToDiffer: true,
        note: 'one sales_targets row at face value, not the shared per-person rule',
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

    // THE REVENUE FIGURE THE SCREEN SHOWS. This row used to measure
    // reportWonTotal over getReportDeals — which is ReportKPIBar's formula, and
    // ReportKPIBar is NOT MOUNTED ANYWHERE. So the row was faithfully checking a
    // figure no user could see, while the By Value tile that users do see went
    // unchecked. It now reads the same function the tile reads.
    const rptAchieved = await getReportAchieved({
      companyId, userId: rptIdentity.userId, role: rptIdentity.role,
      dateFrom: start, dateTo: end,
    });
    const rptTotals = reportAchievedTotals({ ...rptAchieved, start, end });
    reportRows.push(
      row({
        label: 'Reports → By Value — Revenue (net)',
        value: rptTotals.net,
        expected: reference.achieved,
        note: 'the shared Achieved since 2026-10-05: won AND invoiced, by'
          + ' invoice_date, final_amount ?? amount, over the achievers, net of'
          + ' credit notes raised in the period',
      }),
      row({
        label: 'Reports → By Value — Invoiced (before returns)',
        value: rptTotals.invoiced,
        expected: reference.achievedGross,
      }),
      row({
        label: 'Reports → By Value — Returns',
        value: rptTotals.returns,
        expected: reference.returns,
        note: 'ALL FIVE credit notes in production are unmatched (deal_id IS NULL),'
          + ' so they reduce nobody and this reads 0.00. An unmatched return has no'
          + ' owner to charge; migrations/relink_returns_on_invoice_correction.sql'
          + ' (NOT APPLIED) is what links them.',
      }),
      row({
        label: `Reports → By Salesman — sum of the ${Object.keys(rptTotals.perPerson).length} revenue rows`,
        value: Object.values(rptTotals.perPerson).reduce((s, v) => s + v, 0),
        expected: reference.achieved,
      }),
    );

    // The pipeline figure, kept as a labelled row because it is a different
    // question and always will be.
    const { data: reportDeals } = await reportService.getReportDeals(
      companyId, rptIdentity.userId, rptIdentity.role,
      `${start}T00:00:00`, `${end}T23:59:59`,
    );
    // INFO, not a comparison. This figure has no reference to be measured
    // against: it answers "what did we close this period", where Achieved
    // answers "what did we bill". Giving it `expected: reference.achieved` and
    // calling the result "known to differ" was the wrong shape — a row that can
    // never agree is not a failing check, it is a different measurement, and
    // every other such figure on this page is already an info row.
    reportRows.push(row({
      label: `Reports — value of deals WON in the period (${(reportDeals || []).length} deals, info only)`,
      value: reportWonTotal(reportDeals || []),
      note: 'every won deal at `amount`, dated by CLOSED_AT, invoiced or not —'
        + ' what the stage and velocity tables describe. Deliberately not revenue:'
        + ' a deal closed in September and invoiced in October is September'
        + ' pipeline and October revenue, and both statements are true.',
    }));
  } else {
    knownRows.push(row({
      label: 'Forecast and Reports',
      value: 0,
      note: 'not checked: both scope themselves from the signed-in user, and no viewer was passed',
    }));
  }
  if (reportRows.length) {
    groups.push({
      screen: 'Reports (unified 2026-10-05)',
      fn: 'reportService.getReportAchieved + reportAchievedTotals',
      rows: reportRows,
    });
  }
  groups.push({
    screen: 'Different question by design — labelled on screen',
    fn: 'forecastService.getForecastData + buildForecast / reportService.getReportDeals + reportWonTotal',
    knownToDiffer: true,
    rows: knownRows,
  });

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
