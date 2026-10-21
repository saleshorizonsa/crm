import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../components/AppIcon";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import DrillSheet from "../../components/DrillSheet";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";
import { useDateRange } from "../../contexts/DateRangeContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { useLanguage } from "../../i18n";
import { periodLabelFromRange } from "../../utils/dashboardDateUtils";
import {
  loadForecastBundle, forecastFor, divisionGroupsOf, pickableAchievers, fetchDealLines,
} from "../../utils/forecastData";
import { buildForecastView, drillTree, DRILL_COLUMNS, targetLookup } from "../../utils/forecastView";
import {
  dayKey, phasedPeriods, addMonthsKey, monthBoundsOfKey, outlierReason, sinceSnapshot, accuracyOf,
} from "../../utils/forecastTiers";
import {
  fetchSnapshots, takeSnapshot, ensureWeeklySnapshot, previousSnapshot, fetchDealStates,
} from "../../utils/forecastSnapshots";
import { COMPANY_SCOPE_ROLES } from "../../utils/salesDivisionMetrics";
import StageBreakdown from "./components/StageBreakdown";
import ForecastGroupBreakdown from "./components/ForecastGroupBreakdown";
import ForecastAISummary from "../company-dashboard/components/forecast/ForecastAISummary";
import {
  TierCards, PhasedView, VsTargetTable, DealTable, SnapshotPanel, OutlierBanner,
} from "./components/ForecastSections";

// ── THE FORECAST PAGE (session 31, CEO decisions 2026-10-21) ─────────────────
//
// One definition of the three tiers (utils/forecastTiers.js), computed through
// calcDivisionMetrics — the function behind Insights — so this page's Most
// likely and Insights' Expected are the same number for the same scope and
// period. What this page used to show and no longer does:
//   - every open deal in every period (Last Month / Quarter / Year all carried
//     today's whole pipeline);
//   - inactive owners' open deals;
//   - a straight-line "12-week projection" (now: by close month);
//   - an AI summary, prediction card and insights panel that each computed
//     their own committed / weighted figures.

const PERIOD_PRESETS = [
  { id: "this_month",   label: "This Month" },
  { id: "last_month",   label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year",    label: "This Year" },
];
const ymd = (d) => format(d, "yyyy-MM-dd");
function getPeriodDates(period) {
  const now = new Date();
  switch (period) {
    case "last_month":   { const d = subMonths(now, 1); return { from: startOfMonth(d), to: endOfMonth(d) }; }
    case "this_quarter": return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case "this_year":    return { from: startOfYear(now),    to: endOfYear(now) };
    case "this_month":
    default:             return { from: startOfMonth(now),   to: endOfMonth(now) };
  }
}
function matchPeriod(dateRange) {
  if (!dateRange?.from || !dateRange?.to) return "custom";
  for (const p of PERIOD_PRESETS) {
    const { from, to } = getPeriodDates(p.id);
    if (ymd(from) === dateRange.from && ymd(to) === dateRange.to) return p.id;
  }
  return "custom";
}

// Division picker for manager and above (as Insights); person picker for every
// role that sees more than himself.
const DIVISION_PICKER_ROLES = ["manager", "director", "head", "admin"];
const PERSON_PICKER_ROLES = ["supervisor", "manager", "director", "head", "admin"];
const DIRECTOR_VIEW_ROLES = ["manager", "director", "head", "admin"];
const SNAPSHOT_ROLES = COMPANY_SCOPE_ROLES; // director, head, admin

const ForecastPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, userProfile, company } = useAuth();
  const { preferredCurrency } = useCurrency();
  const { dateRange, setRange } = useDateRange();
  const role = userProfile?.role;
  const activePeriod = matchPeriod(dateRange);
  const applyPeriod = (id) => { const { from, to } = getPeriodDates(id); setRange({ from: ymd(from), to: ymd(to) }); };

  const [personId, setPersonId] = useState("all");
  const [divisionId, setDivisionId] = useState("all");
  const [bundle, setBundle] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [linesByDeal, setLinesByDeal] = useState({});
  const [snap, setSnap] = useState({ applied: true, rows: [], message: "" });
  const [dealStates, setDealStates] = useState({});
  const [taking, setTaking] = useState(false);
  const [drill, setDrill] = useState(null);

  const today = dayKey(new Date());
  const period = dateRange?.from && dateRange?.to ? { start: dateRange.from, end: dateRange.to } : null;
  const periodLabel = period ? periodLabelFromRange(period.start, period.end) : "";

  // ── LOAD: one bundle covering the selected period, last month, and the
  //    phased months (this month, +1, +2, the quarter).
  useEffect(() => {
    if (!user?.id || !company?.id || !period) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const { months, quarter } = phasedPeriods(today);
        const lastMonth = monthBoundsOfKey(addMonthsKey(today.slice(0, 7), -1));
        const windowStart = [period.start, lastMonth.start, quarter.start].sort()[0];
        const windowEnd = [period.end, months[2].end, quarter.end].sort().slice(-1)[0];
        const b = await loadForecastBundle({
          companyId: company.id, viewerId: user.id, role, windowStart, windowEnd, now: new Date(),
        });
        if (!cancelled) setBundle(b);
      } catch (e) {
        if (!cancelled) setFetchError(e?.message || "Failed to load the forecast");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, user?.id, role, period?.start, period?.end]);

  // Filters reset when the company changes.
  useEffect(() => { setPersonId("all"); setDivisionId("all"); }, [company?.id]);

  const filters = useMemo(() => ({
    personId: personId !== "all" ? personId : null,
    divisionId: divisionId !== "all" ? divisionId : null,
  }), [personId, divisionId]);

  const view = useMemo(() => {
    if (!bundle || !period) return null;
    return buildForecastView({ bundle, period, filters, today, linesByDeal });
  }, [bundle, period?.start, period?.end, filters, today, linesByDeal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deal lines for the product-group breakdown (the deals counted in the period).
  const countedIds = useMemo(() => (view?.tiers?.dealRows || []).map((r) => r.deal.id).sort().join(","), [view]);
  useEffect(() => {
    if (!countedIds) { setLinesByDeal({}); return; }
    let cancelled = false;
    fetchDealLines(countedIds.split(",")).then(({ linesByDeal: l }) => { if (!cancelled) setLinesByDeal(l || {}); });
    return () => { cancelled = true; };
  }, [countedIds]);

  // ── SNAPSHOTS: read; the weekly one is taken here by a company-scope viewer.
  const loadSnapshots = useCallback(async () => {
    if (!company?.id) return;
    const since = dayKey(new Date(Date.now() - 75 * 86400000));
    const res = await fetchSnapshots({ companyId: company.id, since });
    setSnap((s) => ({ ...s, applied: res.applied, rows: res.rows, message: res.error ? "Snapshots could not be read." : s.message }));
  }, [company?.id]);
  useEffect(() => {
    if (!bundle || !company?.id) return;
    let cancelled = false;
    (async () => {
      if (SNAPSHOT_ROLES.includes(role)) {
        const r = await ensureWeeklySnapshot({ bundle, companyId: company.id, viewer: { id: user.id, role } });
        if (!cancelled && r.taken) setSnap((s) => ({ ...s, message: "This week's snapshot was taken just now." }));
      }
      if (!cancelled) await loadSnapshots();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, company?.id]);

  const takeNow = async () => {
    setTaking(true);
    const r = await takeSnapshot({ bundle, companyId: company.id, takenBy: user.id, manual: true });
    setTaking(false);
    setSnap((s) => ({ ...s, message: r.error ? `Snapshot failed: ${r.error.message}` : `Snapshot taken: ${r.written} rows (a second one on the same day is not stored).` }));
    loadSnapshots();
  };

  // "Since last week" — this month, the page's scope.
  const scopeKey = view ? (view.scope.kind === "person" ? ["person", filters.personId]
    : view.scope.kind === "division" ? ["division", filters.divisionId]
      : ["company", company?.id]) : null;
  const thisMonth = view?.phased?.[0];
  const prevSnap = useMemo(() => (scopeKey && thisMonth
    ? previousSnapshot(snap.rows, { scopeType: scopeKey[0], scopeId: scopeKey[1], periodMonth: thisMonth.start, today })
    : null), [snap.rows, scopeKey?.[0], scopeKey?.[1], thisMonth?.start, today]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!prevSnap || !bundle) { setDealStates({}); return; }
    const known = new Map((bundle.deals || []).map((d) => [d.id, d]));
    const missing = (prevSnap.open_deal_ids || []).map((r) => r.id).filter((id) => !known.has(id));
    const base = Object.fromEntries([...known.entries()]);
    if (!missing.length) { setDealStates(base); return; }
    fetchDealStates(missing).then((m) => setDealStates({ ...base, ...m }));
  }, [prevSnap, bundle]);
  const since = useMemo(() => (prevSnap && thisMonth
    ? sinceSnapshot({ snapshot: prevSnap, tiers: thisMonth.tiers, currentById: dealStates })
    : null), [prevSnap, thisMonth, dealStates]);
  const accuracy = useMemo(() => {
    if (!bundle || !scopeKey) return null;
    const lastKey = addMonthsKey(today.slice(0, 7), -1);
    const lm = monthBoundsOfKey(lastKey);
    const actual = forecastFor(bundle, { ids: view.scope.ids, start: lm.start, end: lm.end, divisionId: view.scope.divisionId, divisionRow: view.scope.divisionRow }).achieved;
    return accuracyOf({
      snapshots: snap.rows.filter((r) => r.scope_type === scopeKey[0] && String(r.scope_id) === String(scopeKey[1])),
      lastMonthKey: lastKey, actualAchieved: actual, today,
    });
  }, [bundle, snap.rows, view, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pickers (built from the bundle, not a second user read).
  const divisionOptions = useMemo(() => (bundle && DIVISION_PICKER_ROLES.includes(role) ? divisionGroupsOf(bundle) : []), [bundle, role]);
  const personOptions = useMemo(() => (bundle && PERSON_PICKER_ROLES.includes(role)
    ? pickableAchievers(bundle, filters.divisionId) : []), [bundle, role, filters.divisionId]);

  const openDeal = (dealId) => { if (dealId) navigate("/sales-pipeline", { state: { openDealId: dealId } }); };
  const flagsFor = useMemo(() => {
    if (!bundle) return () => [];
    const targetOf = targetLookup(bundle, today);
    return (d) => (outlierReason(d, targetOf(d)) ? ["CHECK VALUE"] : []);
  }, [bundle, today]);
  const openDrill = (metrics, tierKey, label, place = []) => {
    const tree = drillTree({ metrics, tierKey, ownerName: view.ownerName, flagsOf: flagsFor });
    setDrill({ ...tree, label, place });
  };

  const breadcrumbs = [
    { label: t("forecastPage.breadcrumbDashboard"), path: "/company-dashboard" },
    { label: t("forecastPage.breadcrumbForecast") },
  ];
  const scopeName = filters.personId
    ? (view?.ownerName(filters.personId) || "")
    : filters.divisionId ? (divisionOptions.find((d) => d.id === filters.divisionId)?.name || "") : "";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-6 space-y-6">
        <div>
          <NavigationBreadcrumbs items={breadcrumbs} />
          <h1 className="text-2xl font-bold text-foreground mt-3">{t("forecastPage.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Commit, Most likely and Best case for the period — the same Most likely Insights calls Expected.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Period:</span>
          {PERIOD_PRESETS.map((p) => (
            <button key={p.id} onClick={() => applyPeriod(p.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${activePeriod === p.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted/60"}`}>
              {p.label}
            </button>
          ))}
          {activePeriod === "custom" && period && (
            <span className="text-xs px-3 py-1.5 rounded-lg font-medium border border-border bg-muted/40 text-muted-foreground">{periodLabel}</span>
          )}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {divisionOptions.length > 1 && (
              <select data-testid="division-picker" value={divisionId} onChange={(e) => { setDivisionId(e.target.value); setPersonId("all"); }}
                className="text-xs px-3 py-1.5 border border-border rounded-lg bg-card">
                <option value="all">All divisions</option>
                {divisionOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            {personOptions.length > 0 && (
              <select data-testid="person-picker" value={personId} onChange={(e) => setPersonId(e.target.value)}
                className="text-xs px-3 py-1.5 border border-border rounded-lg bg-card">
                <option value="all">Everyone</option>
                {personOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
            )}
          </div>
        </div>

        {!period && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon name="Calendar" size={48} className="text-muted-foreground mb-3" />
            <p className="text-lg font-medium mb-1">{t("forecastPage.selectPeriod")}</p>
            <p className="text-sm text-muted-foreground">A forecast needs a period; All Time has none.</p>
          </div>
        )}
        {isLoading && <div className="h-64 bg-muted rounded-lg animate-pulse" />}
        {fetchError && !isLoading && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <Icon name="AlertCircle" size={20} />
            <div><p className="font-medium">{t("forecastPage.loadFailed")}</p><p className="text-sm opacity-80">{fetchError}</p></div>
          </div>
        )}

        {view && !isLoading && !fetchError && (
          <div className="space-y-6" data-testid="forecast-body">
            <OutlierBanner flagged={view.flagged} without={view.without} />

            <TierCards
              tiers={view.tiers}
              target={view.target}
              periodLabel={`${periodLabel}${scopeName ? ` · ${scopeName}` : ""}`}
              onOpen={(k) => openDrill(view.main, k, `${k === "mostLikely" ? "Most likely" : k === "bestCase" ? "Best case" : k === "wni" ? "Won, not invoiced" : k[0].toUpperCase() + k.slice(1)}`, scopeName ? [scopeName] : [])}
            />

            <ForecastAISummary
              figures={{
                target: view.target, achieved: view.tiers.achieved, wni: view.tiers.wni, commit: view.tiers.commit,
                mostLikely: view.tiers.mostLikely, bestCase: view.tiers.bestCase,
                pastDueCount: view.tiers.pastDue.length, pastDueTotal: view.tiers.pastDueTotal,
                outliers: view.flagged, topDeals: view.top.map((r) => ({ title: r.title, amount: r.value, stage: r.stage, expected_close_date: r.due })),
              }}
              target={view.target}
              period={`${periodLabel}${scopeName ? ` · ${scopeName}` : ""}`}
              companyName={company?.name}
              role={role}
              currency={preferredCurrency || "SAR"}
              companyId={`${company?.id}-${scopeKey?.join(":")}`}
            />

            <PhasedView rows={view.phased} onOpen={(r) => openDrill(r.metrics, "mostLikely", `Most likely — ${r.label}`, scopeName ? [scopeName] : [])} />

            {DIRECTOR_VIEW_ROLES.includes(role) && (
              <>
                <VsTargetTable title="Forecast vs target by division" testid="by-division" rows={view.divisionRows}
                  onOpen={(r) => openDrill(r.metrics, "mostLikely", "Most likely", [r.name])} />
                <VsTargetTable title="Forecast vs target by salesperson" testid="by-person" rows={view.personRows}
                  onOpen={(r) => openDrill(r.metrics, "mostLikely", "Most likely", [r.name])} />
              </>
            )}

            <DealTable
              title="Top 10 deals that decide the period" testid="top-deals" rows={view.top} onOpenDeal={openDeal}
              explain="The open deals due in the period with the largest Most likely contribution."
              empty="No open deals due in this period."
              columns={[
                { key: "title", label: "Deal" }, { key: "owner", label: "Owner" }, { key: "stage", label: "Stage" },
                { key: "due", label: "Close date", date: true }, { key: "value", label: "Value", num: true, money: true },
                { key: "mostLikely", label: "Most likely", num: true, money: true }, { key: "flags", label: "Flags" },
              ]}
            />

            <DealTable
              title={`Needs re-dating (${view.redating.length})`} testid="redating" rows={view.redating} onOpenDeal={openDeal}
              explain="Open deals whose expected close date has passed. They are in no tier until they are re-dated, won or lost. Click one to open it."
              empty="No past-due open deals."
              columns={[
                { key: "title", label: "Deal" }, { key: "owner", label: "Owner" }, { key: "stage", label: "Stage" },
                { key: "due", label: "Was due", date: true }, { key: "daysOverdue", label: "Days overdue", num: true },
                { key: "value", label: "Value", num: true, money: true }, { key: "flags", label: "Flags" },
              ]}
            />

            {DIRECTOR_VIEW_ROLES.includes(role) && (
              <DealTable
                title={`Risk list (${view.risks.length})`} testid="risks" rows={view.risks} onOpenDeal={openDeal}
                explain="Open deals that are past due, have no close date, have sat in the same stage for more than 14 days, or carry a value to check."
                empty="Nothing at risk."
                columns={[
                  { key: "title", label: "Deal" }, { key: "owner", label: "Owner" }, { key: "stage", label: "Stage" },
                  { key: "due", label: "Close date", date: true }, { key: "daysInStage", label: "Days in stage", num: true },
                  { key: "value", label: "Value", num: true, money: true }, { key: "flags", label: "Why" },
                ]}
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                {view.groups.length > 0 && <ForecastGroupBreakdown groups={view.groups} />}
              </div>
              <StageBreakdown byStage={view.byStage} />
            </div>

            <SnapshotPanel
              state={snap}
              since={since}
              accuracy={accuracy}
              canTake={SNAPSHOT_ROLES.includes(role)}
              onTake={takeNow}
              taking={taking}
              periodLabel={periodLabel}
            />
          </div>
        )}
      </main>

      {drill && (
        <DrillSheet
          label={drill.label}
          title={drill.title}
          period={periodLabel}
          place={drill.place}
          explain={drill.explain}
          total={drill.total}
          columns={DRILL_COLUMNS}
          rows={drill.rows}
          onOpenRecord={(r) => openDeal(r.dealId)}
          onClose={() => setDrill(null)}
          scopeLabel={periodLabel}
          // eslint-disable-next-line react/no-children-prop
          children={drill.children}
        />
      )}
    </div>
  );
};

export default ForecastPage;
