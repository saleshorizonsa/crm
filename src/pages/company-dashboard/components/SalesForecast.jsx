import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../../components/AppIcon";
import { forecastService } from "../../../services/supabaseService";
import {
  buildForecast,
  getOrCalculateWinRates,
  DEFAULT_STAGE_WEIGHTS,
  STAGE_ORDER,
} from "../../../utils/forecastEngine";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useAuth } from "../../../contexts/AuthContext";
import { useDateRange } from "../../../contexts/DateRangeContext";
import { useLanguage } from "../../../i18n";

// ── Helpers ──────────────────────────────────────────────────────────────────

const toYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-3 bg-muted rounded-full w-2/3" />
    <div className="h-2.5 bg-muted rounded-full" />
    <div className="grid grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 bg-muted rounded-lg" />
      ))}
    </div>
    <div className="h-3 bg-muted rounded-full w-1/2 mx-auto" />
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────

const SalesForecast = ({ deals: dealsProp, isLoading: isLoadingProp } = {}) => {
  const { formatCurrency } = useCurrency();
  const { user, company, userProfile } = useAuth();
  const { dateRange } = useDateRange();
  const { t } = useLanguage();

  // ── Scenario card config (inside component to access t) ──────────────────────
  const SCENARIOS = [
    {
      key:        "committed",
      label:      t("dashboard.committed"),
      subtitle:   t("dashboard.committedSubtitle"),
      icon:       "CheckCircle",
      bg:         "bg-emerald-50",
      ring:       "ring-1 ring-emerald-200",
      iconBg:     "bg-emerald-100",
      iconColor:  "text-emerald-600",
      valueColor: "text-emerald-700",
    },
    {
      key:        "weighted",
      label:      t("dashboard.weighted"),
      subtitle:   t("dashboard.weightedSubtitle"),
      icon:       "TrendingUp",
      bg:         "bg-blue-50",
      ring:       "ring-1 ring-blue-200",
      iconBg:     "bg-blue-100",
      iconColor:  "text-blue-600",
      valueColor: "text-blue-700",
    },
    {
      key:        "bestCase",
      label:      t("dashboard.bestCase"),
      subtitle:   t("dashboard.bestCaseSubtitle"),
      icon:       "Star",
      bg:         "bg-amber-50",
      ring:       "ring-1 ring-amber-200",
      iconBg:     "bg-amber-100",
      iconColor:  "text-amber-600",
      valueColor: "text-amber-700",
    },
  ];

  const userId    = user?.id;
  const companyId = company?.id;
  const role      = userProfile?.role;

  const canRecalculate  = ["admin", "director", "manager"].includes(role);
  const canSeeRepRates  = ["admin", "director", "manager", "supervisor"].includes(role);
  const canSeeStages    = role !== "salesman";

  const [rawData,        setRawData]        = useState({ deals: [], target: null });
  const [isLoading,      setIsLoading]      = useState(false);
  const [fetchError,     setFetchError]     = useState(null);
  const [winRateData,    setWinRateData]    = useState({ stageRates: null, repRates: {}, sampleCounts: {}, fromCache: false });
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [showStages,     setShowStages]     = useState(false);

  // Fetch deals and win rates in parallel
  useEffect(() => {
    // Require a user. Require either a concrete date range OR explicit isAllTime.
    if (!userId || (!dateRange.from && !dateRange.isAllTime)) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setFetchError(null);

      const [forecastResult, winRateResult] = await Promise.all([
        forecastService.getForecastData({
          companyId,
          userId,
          role,
          // Pass null dates for isAllTime so getForecastData returns all deals
          periodStart: dateRange.isAllTime ? null : dateRange.from,
          periodEnd:   dateRange.isAllTime ? null : dateRange.to,
        }),
        companyId ? getOrCalculateWinRates(companyId) : Promise.resolve({ stageRates: null, repRates: {}, sampleCounts: {} }),
      ]);

      if (cancelled) return;

      if (forecastResult.error) {
        setFetchError(forecastResult.error);
      } else {
        setRawData({ deals: forecastResult.deals, target: forecastResult.target });
      }
      setWinRateData(winRateResult);
      setIsLoading(false);
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userId, role, dateRange.from, dateRange.to, dateRange.isAllTime]);

  const handleRecalculate = async () => {
    if (!companyId || isRecalculating) return;
    setIsRecalculating(true);
    try {
      const result = await getOrCalculateWinRates(companyId, true);
      setWinRateData(result);
    } finally {
      setIsRecalculating(false);
    }
  };

  const forecast = useMemo(() => {
    const dealsToUse = rawData.deals.length > 0 ? rawData.deals : (dealsProp || []);
    return buildForecast(
      dealsToUse,
      rawData.target?.target_amount ?? 0,
      winRateData.stageRates && Object.keys(winRateData.stageRates).length > 0 ? winRateData.stageRates : null,
      winRateData.repRates && Object.keys(winRateData.repRates).length > 0 ? winRateData.repRates : null,
    );
  }, [rawData, dealsProp, winRateData]);

  const hasTarget    = rawData.target !== null;
  const targetAmount = rawData.target?.target_amount ?? 0;
  const showLoading  = isLoading || (isLoadingProp && rawData.deals.length === 0);

  const attainmentColor =
    forecast.attainment >= 75 ? "bg-emerald-500" :
    forecast.attainment >= 50 ? "bg-amber-500"   :
                                "bg-red-500";

  const attainmentTextColor =
    forecast.attainment >= 75 ? "text-emerald-600" :
    forecast.attainment >= 50 ? "text-amber-600"   :
                                "text-red-600";

  const openCount = rawData.deals.filter((d) => d.stage !== "won").length;
  const wonCount  = rawData.deals.filter((d) => d.stage === "won").length;

  const historicalStageCount = forecast.byStage.filter((s) => s.isHistorical).length;
  const hasHistoricalRates   = historicalStageCount > 0;

  // Sorted rep win rates for display
  const repRatesList = Object.entries(winRateData.repRates || {})
    .map(([userId, info]) => ({ userId, ...info }))
    .sort((a, b) => b.rate - a.rate);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-card-foreground">
            {t("dashboard.salesForecast")}
          </h3>
          {hasTarget && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("dashboard.forecastTarget")}&nbsp;
              <span className="font-medium text-card-foreground">
                {formatCurrency(targetAmount)}
              </span>
            </p>
          )}
        </div>
        {canRecalculate && (
          <button
            onClick={handleRecalculate}
            disabled={isRecalculating}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title={t("dashboard.recalculateRates")}
          >
            <Icon
              name="RefreshCw"
              size={13}
              className={isRecalculating ? "animate-spin" : ""}
            />
            {isRecalculating ? t("dashboard.calculating") : t("dashboard.recalculateRates")}
          </button>
        )}
      </div>

      {/* Loading */}
      {showLoading && <Skeleton />}

      {/* Error */}
      {fetchError && !showLoading && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <Icon name="AlertCircle" size={16} className="flex-shrink-0" />
          <span>{t("dashboard.failedToLoadForecast")}</span>
        </div>
      )}

      {/* Main content */}
      {!showLoading && !fetchError && (dateRange.from || dateRange.isAllTime) && (
        <div className="space-y-4">
          {/* Target attainment bar */}
          {hasTarget ? (
            <div className="p-3 rounded-lg bg-muted/40 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("dashboard.targetAttainment")}
                </span>
                <span className={`text-sm font-bold tabular-nums ${attainmentTextColor}`}>
                  {forecast.attainment}%
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${attainmentColor}`}
                  style={{ width: `${Math.min(forecast.attainment, 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>
                  {t("dashboard.weightedForecast")}&nbsp;
                  <span className="font-medium text-card-foreground tabular-nums">
                    {formatCurrency(forecast.weighted)}
                  </span>
                </span>
                {forecast.gap > 0 ? (
                  <span className="text-red-500 tabular-nums">
                    {formatCurrency(forecast.gap)}&nbsp;{t("dashboard.toGo")}
                  </span>
                ) : (
                  <span className="text-emerald-600 font-medium">
                    {t("dashboard.targetExceeded")} ✓
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              {t("dashboard.noActivePeriodTarget")}
            </p>
          )}

          {/* Scenario cards */}
          <div className="grid grid-cols-3 gap-3">
            {SCENARIOS.map((s) => (
              <div
                key={s.key}
                className={`rounded-lg p-3 ${s.bg} ${s.ring}`}
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center mb-2.5 ${s.iconBg}`}
                >
                  <Icon name={s.icon} size={14} className={s.iconColor} />
                </div>
                <p
                  className={`text-sm font-bold leading-tight tabular-nums ${s.valueColor}`}
                >
                  {formatCurrency(forecast[s.key])}
                </p>
                <p className="text-xs font-semibold text-card-foreground mt-0.5">
                  {s.label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                  {s.subtitle}
                </p>
              </div>
            ))}
          </div>

          {/* Stage win-rate breakdown (non-salesman) */}
          {canSeeStages && forecast.byStage.some((s) => s.count > 0) && (
            <div className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setShowStages((v) => !v)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Icon name="BarChart2" size={13} />
                  {t("dashboard.stageWinRates")}
                  {hasHistoricalRates ? (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                      {historicalStageCount} {t("dashboard.historical")}
                    </span>
                  ) : (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground">
                      {t("dashboard.defaults")}
                    </span>
                  )}
                </span>
                <Icon name={showStages ? "ChevronUp" : "ChevronDown"} size={13} />
              </button>

              {showStages && (
                <div className="divide-y divide-border">
                  {!hasHistoricalRates && (
                    <p className="px-3 py-2 text-[11px] text-amber-600 bg-amber-50 flex items-center gap-1.5">
                      <Icon name="Info" size={12} />
                      {t("dashboard.usingDefaultWeights").replace("{min}", "5")}
                    </p>
                  )}
                  {forecast.byStage
                    .filter((s) => !["won", "lost"].includes(s.stage))
                    .map((s) => (
                      <div
                        key={s.stage}
                        className="flex items-center gap-3 px-3 py-2 text-xs"
                      >
                        <span className="w-28 text-muted-foreground truncate">{s.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-blue-400"
                            style={{ width: `${Math.min(s.weight * 100, 100)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono text-card-foreground">
                          {(s.weight * 100).toFixed(0)}%
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                            s.isHistorical
                              ? "bg-blue-100 text-blue-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.isHistorical ? "hist" : "dflt"}
                        </span>
                        <span className="w-12 text-right text-muted-foreground">
                          {s.count} deal{s.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Rep Win Rates (manager+) */}
          {canSeeRepRates && repRatesList.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
                <Icon name="Users" size={13} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">{t("dashboard.repWinRates")}</span>
              </div>
              <div className="divide-y divide-border">
                {repRatesList.map((rep, idx) => (
                  <div key={rep.userId} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <span className="w-5 text-center text-muted-foreground font-mono">{idx + 1}</span>
                    <span className="flex-1 text-card-foreground truncate">{rep.name}</span>
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${
                          rep.rate >= 0.5 ? "bg-emerald-500" :
                          rep.rate >= 0.3 ? "bg-amber-500" : "bg-red-400"
                        }`}
                        style={{ width: `${Math.min(rep.rate * 100, 100)}%` }}
                      />
                    </div>
                    <span className={`w-10 text-right font-mono font-semibold ${
                      rep.rate >= 0.5 ? "text-emerald-600" :
                      rep.rate >= 0.3 ? "text-amber-600" : "text-red-500"
                    }`}>
                      {(rep.rate * 100).toFixed(0)}%
                    </span>
                    <span className="w-14 text-right text-muted-foreground">
                      {rep.won}/{rep.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline summary */}
          {rawData.deals.length > 0 ? (
            <div className="flex items-center justify-center gap-4 pt-3 border-t border-border text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                {openCount}&nbsp;{openCount === 1 ? t("dashboard.openDealsCount") : t("dashboard.openDealsCountPlural")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                {wonCount}&nbsp;{t("dashboard.wonDealsCount")}
              </span>
              <span>{formatCurrency(forecast.bestCase)}&nbsp;{t("dashboard.pipelineLabel")}</span>
            </div>
          ) : (
            <div className="text-center pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                {t("dashboard.noDealsThisPeriod")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SalesForecast;
