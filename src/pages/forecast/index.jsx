import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../components/AppIcon";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";
import { useDateRange } from "../../contexts/DateRangeContext";
import { forecastService, userService } from "../../services/supabaseService";
import { supabase } from "../../lib/supabase";
import { computeKpiStripData } from "../../utils/kpiStripData";
import { fetchWinRate3m } from "../../utils/winRate3m";
import { isAnnualRange } from "../../utils/dashboardDateUtils";
import { buildForecast, DEFAULT_STAGE_WEIGHTS } from "../../utils/forecastEngine";
import { generateInsights, generatePrediction } from "../../utils/forecastInsights";
import ForecastKPIBar     from "./components/ForecastKPIBar";
import AIInsightsPanel    from "./components/AIInsightsPanel";
import AIPredictionCard   from "./components/AIPredictionCard";
import StageBreakdown     from "./components/StageBreakdown";
import ForecastDealTable  from "./components/ForecastDealTable";
import ForecastGroupBreakdown from "./components/ForecastGroupBreakdown";
import SalesmanContribution   from "./components/SalesmanContribution";
import ProjectionChart    from "../company-dashboard/components/forecast/ProjectionChart";
import ForecastAISummary  from "../company-dashboard/components/forecast/ForecastAISummary";
import { useCurrency }    from "../../contexts/CurrencyContext";
import { useLanguage }   from "../../i18n";

// ── Period presets ──────────────────────────────────────────────────────────

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

// Match the active date range back to a preset id (or "custom") for button highlight
function matchPeriod(dateRange) {
  if (!dateRange?.from || !dateRange?.to) return "custom";
  for (const p of PERIOD_PRESETS) {
    const { from, to } = getPeriodDates(p.id);
    if (ymd(from) === dateRange.from && ymd(to) === dateRange.to) return p.id;
  }
  return "custom";
}

// Roles that oversee multiple salesmen and can drill into one
const MULTI_REP_ROLES = ["director", "manager", "admin", "head"];

// ── Skeleton ──────────────────────────────────────────────────────────────────

const PageSkeleton = () => (
  <div className="animate-pulse space-y-6">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-24 bg-muted rounded-lg" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 h-64 bg-muted rounded-lg" />
      <div className="h-64 bg-muted rounded-lg" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 h-48 bg-muted rounded-lg" />
      <div className="h-48 bg-muted rounded-lg" />
    </div>
    <div className="h-64 bg-muted rounded-lg" />
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────

const ForecastPage = () => {
  const { t } = useLanguage();
  const { user, userProfile, company } = useAuth();
  const { preferredCurrency } = useCurrency();

  const { dateRange, setRange } = useDateRange();
  const [rawData, setRawData] = useState({ deals: [], target: null });
  const [groupBreakdown, setGroupBreakdown] = useState([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [fetchError, setFetchError]   = useState(null);

  const role = userProfile?.role;
  const canFilterSalesman = MULTI_REP_ROLES.includes(role);

  // Salesman filter (only meaningful for multi-rep roles)
  const [selectedSalesman, setSelectedSalesman] = useState("all");
  const [salesmen, setSalesmen] = useState([]);

  // Active period preset (drives button highlight); derived from the shared range
  const activePeriod = matchPeriod(dateRange);

  const applyPeriod = (periodId) => {
    const { from, to } = getPeriodDates(periodId);
    setRange({ from: ymd(from), to: ymd(to) });
  };

  // Load the company's active salesmen for the drill-down dropdown
  useEffect(() => {
    if (!company?.id || !canFilterSalesman) return;
    let cancelled = false;
    (async () => {
      const { data } = await userService.getCompanyUsers(company.id, {
        role: "salesman",
        status: "active",
      });
      if (!cancelled) setSalesmen(data || []);
    })();
    return () => { cancelled = true; };
  }, [company?.id, canFilterSalesman]);

  useEffect(() => {
    if (!user?.id) return;
    if (!dateRange.isAllTime && !dateRange.from) return;

    let cancelled = false;
    const ownerId = selectedSalesman !== "all" ? selectedSalesman : null;

    const load = async () => {
      setIsLoading(true);
      setFetchError(null);

      const [forecastResult, groupResult] = await Promise.all([
        forecastService.getForecastData({
          companyId:   company?.id,
          userId:      user.id,
          role,
          periodStart: dateRange.from || null,
          periodEnd:   dateRange.to   || null,
          ownerId,
        }),
        forecastService.getForecastGroupBreakdown({
          companyId: company?.id,
          userId:    user.id,
          role,
          ownerId,
        }),
      ]);

      if (cancelled) return;

      if (forecastResult.error) {
        setFetchError(forecastResult.error);
      } else {
        setRawData({ deals: forecastResult.deals || [], target: forecastResult.target });
      }
      setGroupBreakdown(groupResult.groups || []);
      setIsLoading(false);
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, user?.id, role, dateRange.from, dateRange.to, dateRange.isAllTime, selectedSalesman]);

  // The REAL win rate driving the AI Prediction card's confidence, which used to
  // be a synthetic committed/target + deal-count score. Resolved with the same
  // 3-step ladder as planning/index.jsx, using the shared fetchWinRate3m():
  //   1. this scope's 3-month rolling rate (the drilled-into salesman, else the
  //      whole company)
  //   2. if the window is empty, this scope's ACTUAL rate over all history —
  //      however few deals
  //   3. only with no deals ever, the whole-company 3-month average
  // Presence is decided by total3m/row count, never by "rate > 0": a rep who
  // created deals and won none has a measured 0% rate, which is real data.
  // Steps 1 and 3 are independent of the selected period — always the last 3
  // completed months — so this refetches only on company or drill-down change.
  const [winRate, setWinRate] = useState({ rate: null, basis: "none" });
  useEffect(() => {
    if (!company?.id) { setWinRate({ rate: null, basis: "none" }); return; }
    let cancelled = false;
    (async () => {
      const companyId = company.id;
      const ownerIds = selectedSalesman !== "all" ? [selectedSalesman] : null;

      const { winRate3m: raw, total3m } = await fetchWinRate3m({ companyId, ownerIds });
      if (cancelled) return;
      if (total3m > 0) { setWinRate({ rate: raw, basis: "own" }); return; }

      // Step 2 — all-time history for this scope.
      let histQuery = supabase.from("deals").select("stage").eq("company_id", companyId);
      if (ownerIds) histQuery = histQuery.in("owner_id", ownerIds);
      const { data: hist } = await histQuery;
      if (cancelled) return;
      if ((hist?.length || 0) > 0) {
        const wonH = hist.filter((d) => d.stage === "won").length;
        setWinRate({ rate: (wonH / hist.length) * 100, basis: "history" });
        return;
      }

      // Step 3 — company average. For the company-wide view this is the same
      // query that already came back empty, so there is nothing left to fall
      // back to and the card reports no history.
      if (!ownerIds) { setWinRate({ rate: null, basis: "none" }); return; }
      const { winRate3m: companyAvg, total3m: companyTotal } =
        await fetchWinRate3m({ companyId, ownerIds: null });
      if (cancelled) return;
      setWinRate(companyTotal > 0
        ? { rate: companyAvg, basis: "company" }
        : { rate: null, basis: "none" });
    })();
    return () => { cancelled = true; };
  }, [company?.id, selectedSalesman]);

  const forecast   = useMemo(() => buildForecast(rawData.deals, rawData.target?.target_amount ?? 0), [rawData]);
  const insights   = useMemo(() => generateInsights(forecast, rawData.deals, rawData.target?.target_amount ?? 0), [forecast, rawData]);
  const prediction = useMemo(
    () => generatePrediction(forecast, rawData.deals, rawData.target?.target_amount ?? 0, winRate),
    [forecast, rawData, winRate],
  );

  const targetAmount = rawData.target?.target_amount ?? 0;

  // Director view: the KPI bar mirrors the Director dashboard for the SELECTED
  // period by reusing the exact same computeKpiStripData function — Committed =
  // invoiced won by invoice_date (final value), Target/Attainment/Gap from the
  // same source. This windows by invoice_date (not closed_at), so deals invoiced
  // in a different year are never counted. Others keep the projection view.
  const isDirectorView = ["director", "head", "admin"].includes(role) && selectedSalesman === "all";
  const [kpiTotals, setKpiTotals] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!company?.id || !isDirectorView || !dateRange?.from || !dateRange?.to) { setKpiTotals(null); return; }
      const range = {
        start: dateRange.from,
        end: dateRange.to,
        isAnnual: isAnnualRange(dateRange.from, dateRange.to),
      };
      const { totals } = await computeKpiStripData({ companyId: company.id, ownerIds: null, range });
      if (!cancelled) setKpiTotals(totals);
    })();
    return () => { cancelled = true; };
  }, [company?.id, isDirectorView, dateRange?.from, dateRange?.to]);

  const kpiTarget = isDirectorView && kpiTotals ? kpiTotals.target : targetAmount;
  const kpiForecast = useMemo(() => {
    if (!isDirectorView || !kpiTotals) return forecast;
    return {
      ...forecast,
      committed: kpiTotals.achieved,                              // invoiced won, invoice_date in period
      attainment: Math.round((kpiTotals.attainmentPct || 0) * 10) / 10,
      gap: kpiTotals.deficit,                                     // max(0, target − achieved)
    };
  }, [isDirectorView, forecast, kpiTotals]);

  // Per-salesman share of the weighted OPEN pipeline. Derived from the deals
  // already loaded (they carry owner info), so no extra fetch is needed and the
  // weighting matches the forecast (DEFAULT_STAGE_WEIGHTS, same as buildForecast
  // is called here without historical rates). Only meaningful in the company-wide
  // "All Salesmen" view — hidden when a single salesman is selected.
  const salesmanContribution = useMemo(() => {
    if (selectedSalesman !== "all") return [];
    const openDeals = (rawData.deals || []).filter(
      (d) => !["won", "lost"].includes(d.stage) && d.owner_id,
    );
    const map = {};
    openDeals.forEach((d) => {
      const id = d.owner_id;
      const weight = DEFAULT_STAGE_WEIGHTS[d.stage] ?? 0.1;
      const value = parseFloat(d.amount) || 0;
      if (!map[id]) {
        map[id] = { id, name: d.owner?.full_name || "Unknown", dealCount: 0, totalValue: 0, weightedValue: 0 };
      }
      map[id].dealCount += 1;
      map[id].totalValue += value;
      map[id].weightedValue += value * weight;
    });
    const totalWeighted = Object.values(map).reduce((s, x) => s + x.weightedValue, 0);
    return Object.values(map)
      .map((s) => ({ ...s, pct: totalWeighted > 0 ? (s.weightedValue / totalWeighted) * 100 : 0 }))
      .sort((a, b) => b.weightedValue - a.weightedValue);
  }, [rawData.deals, selectedSalesman]);

  // Name of the drilled-into salesman ("" when viewing all) — labels the KPI cards
  const selectedSalesmanName =
    selectedSalesman !== "all"
      ? salesmen.find((s) => s.id === selectedSalesman)?.full_name || ""
      : "";

  const breadcrumbs = [
    { label: t("forecastPage.breadcrumbDashboard"), path: "/company-dashboard" },
    { label: t("forecastPage.breadcrumbForecast") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Page header */}
        <div>
          <NavigationBreadcrumbs items={breadcrumbs} />

          <div className="flex flex-wrap items-start justify-between gap-4 mt-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("forecastPage.title")}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("forecastPage.subtitle")}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Target badge */}
              {targetAmount > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-xs font-medium text-violet-700">
                  <Icon name="Target" size={12} />
                  {t("forecastPage.targetActive")}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Filters: period presets + salesman drill-down */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Period:</span>
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPeriod(p.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                activePeriod === p.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {p.label}
            </button>
          ))}
          {activePeriod === "custom" && (
            <span className="text-xs px-3 py-1.5 rounded-lg font-medium border border-border bg-muted/40 text-muted-foreground">
              Custom
            </span>
          )}

          {canFilterSalesman && salesmen.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <Icon name="User" size={13} className="text-muted-foreground" />
              <select
                value={selectedSalesman}
                onChange={(e) => setSelectedSalesman(e.target.value)}
                className="text-xs px-3 py-1.5 border border-border rounded-lg bg-card text-card-foreground focus:outline-none focus:border-primary"
              >
                <option value="all">All Salesmen</option>
                {salesmen.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.email}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* No period */}
        {!dateRange.from && !dateRange.isAllTime && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon name="Calendar" size={48} className="text-muted-foreground mb-3" />
            <p className="text-lg font-medium text-card-foreground mb-1">{t("forecastPage.selectPeriod")}</p>
            <p className="text-sm text-muted-foreground">
              {t("forecastPage.selectPeriodHint")}
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading && <PageSkeleton />}

        {/* Error */}
        {fetchError && !isLoading && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <Icon name="AlertCircle" size={20} className="flex-shrink-0" />
            <div>
              <p className="font-medium">{t("forecastPage.loadFailed")}</p>
              <p className="text-sm opacity-80">
                {typeof fetchError === "string" ? fetchError : t("forecastPage.tryRefreshing")}
              </p>
            </div>
          </div>
        )}

        {/* Main content */}
        {!isLoading && !fetchError && (dateRange.from || dateRange.isAllTime) && rawData.deals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon name="TrendingUp" size={48} className="text-muted-foreground mb-3" />
            <p className="text-lg font-medium text-card-foreground mb-1">{t("forecastPage.noDeals")}</p>
            <p className="text-sm text-muted-foreground">{t("forecastPage.tryDifferentPeriod")}</p>
          </div>
        )}

        {!isLoading && !fetchError && (dateRange.from || dateRange.isAllTime) && rawData.deals.length > 0 && (
          <div className="space-y-6">
            {/* KPI Bar */}
            <ForecastKPIBar
              forecast={kpiForecast}
              targetAmount={kpiTarget}
              salesmanName={selectedSalesmanName}
              deals={rawData.deals}
              periodLabel={PERIOD_PRESETS.find((p) => p.id === activePeriod)?.label || "Custom range"}
            />

            {/* AI Forecast Summary */}
            <ForecastAISummary
              deals={rawData.deals}
              target={targetAmount}
              period={new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              companyName={company?.name}
              role={userProfile?.role}
              currency={preferredCurrency || "SAR"}
              companyId={company?.id}
            />

            {/* Row 1: Projection chart (+ salesman contribution below it) + AI Prediction */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <ProjectionChart projection={forecast.projection} target={targetAmount} />
                {/* Fills the empty left-column space below the chart, above
                    Pipeline Insights (company-wide "All Salesmen" view only). */}
                {salesmanContribution.length > 0 && (
                  <SalesmanContribution contribution={salesmanContribution} />
                )}
              </div>
              <div>
                <AIPredictionCard prediction={prediction} />
              </div>
            </div>

            {/* Product Group breakdown — bar chart + table */}
            {groupBreakdown.length > 0 && (
              <ForecastGroupBreakdown groups={groupBreakdown} />
            )}

            {/* Row 2: AI Insights + Stage Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <AIInsightsPanel insights={insights} />
              </div>
              <div>
                <StageBreakdown byStage={forecast.byStage} />
              </div>
            </div>

            {/* Row 3: Deal table (full width) */}
            <ForecastDealTable deals={rawData.deals} />
          </div>
        )}
      </main>
    </div>
  );
};

export default ForecastPage;
