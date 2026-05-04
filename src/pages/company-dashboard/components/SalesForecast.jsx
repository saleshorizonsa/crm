import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../../components/AppIcon";
import { forecastService } from "../../../services/supabaseService";
import { buildForecast } from "../../../utils/forecastEngine";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useAuth } from "../../../contexts/AuthContext";
import { useDateRange } from "../../../contexts/DateRangeContext";

// ── Helpers ──────────────────────────────────────────────────────────────────

const toYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// ── Scenario card config ──────────────────────────────────────────────────────

const SCENARIOS = [
  {
    key:        "committed",
    label:      "Committed",
    subtitle:   "Won deals only",
    icon:       "CheckCircle",
    bg:         "bg-emerald-50",
    ring:       "ring-1 ring-emerald-200",
    iconBg:     "bg-emerald-100",
    iconColor:  "text-emerald-600",
    valueColor: "text-emerald-700",
  },
  {
    key:        "weighted",
    label:      "Weighted",
    subtitle:   "Probability adjusted",
    icon:       "TrendingUp",
    bg:         "bg-blue-50",
    ring:       "ring-1 ring-blue-200",
    iconBg:     "bg-blue-100",
    iconColor:  "text-blue-600",
    valueColor: "text-blue-700",
  },
  {
    key:        "bestCase",
    label:      "Best Case",
    subtitle:   "All open deals close",
    icon:       "Star",
    bg:         "bg-amber-50",
    ring:       "ring-1 ring-amber-200",
    iconBg:     "bg-amber-100",
    iconColor:  "text-amber-600",
    valueColor: "text-amber-700",
  },
];

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

// Accepts optional `deals` / `isLoading` props for legacy callers that
// pass deal data directly. When the user context is available the component
// always self-fetches from Supabase and uses that data preferentially.
const SalesForecast = ({ deals: dealsProp, isLoading: isLoadingProp } = {}) => {
  const { formatCurrency } = useCurrency();
  const { user, company, userProfile } = useAuth();
  const { dateRange } = useDateRange();

  const userId    = user?.id;
  const companyId = company?.id;
  const role      = userProfile?.role;

  const [rawData, setRawData]         = useState({ deals: [], target: null });
  const [isLoading, setIsLoading]     = useState(false);
  const [fetchError, setFetchError]   = useState(null);

  // Fetch whenever identity or global date range changes
  useEffect(() => {
    if (!userId || !dateRange.from || !dateRange.to) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setFetchError(null);

      const { deals, target, error } = await forecastService.getForecastData({
        companyId,
        userId,
        role,
        periodStart: dateRange.from,
        periodEnd:   dateRange.to,
      });

      if (cancelled) return;

      if (error) {
        setFetchError(error);
      } else {
        setRawData({ deals, target });
      }
      setIsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userId, role, dateRange.from, dateRange.to]);

  // Prefer live-fetched deals; fall back to any deals passed as a prop.
  const forecast = useMemo(() => {
    const dealsToUse = rawData.deals.length > 0 ? rawData.deals : (dealsProp || []);
    return buildForecast(dealsToUse, rawData.target?.target_amount ?? 0);
  }, [rawData, dealsProp]);

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-card-foreground">
          Sales Forecast
        </h3>
        {hasTarget && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Target&nbsp;
            <span className="font-medium text-card-foreground">
              {formatCurrency(targetAmount)}
            </span>
          </p>
        )}
      </div>

      {/* Loading */}
      {showLoading && <Skeleton />}

      {/* Error */}
      {fetchError && !showLoading && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <Icon name="AlertCircle" size={16} className="flex-shrink-0" />
          <span>Failed to load forecast data. Try refreshing.</span>
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
                  Target Attainment
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
                  Weighted&nbsp;
                  <span className="font-medium text-card-foreground tabular-nums">
                    {formatCurrency(forecast.weighted)}
                  </span>
                </span>
                {forecast.gap > 0 ? (
                  <span className="text-red-500 tabular-nums">
                    {formatCurrency(forecast.gap)}&nbsp;to go
                  </span>
                ) : (
                  <span className="text-emerald-600 font-medium">
                    Target exceeded ✓
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No active target for this period
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

          {/* Pipeline summary */}
          {rawData.deals.length > 0 ? (
            <div className="flex items-center justify-center gap-4 pt-3 border-t border-border text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                {openCount}&nbsp;open&nbsp;{openCount === 1 ? "deal" : "deals"}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                {wonCount}&nbsp;won
              </span>
              <span>{formatCurrency(forecast.bestCase)}&nbsp;pipeline</span>
            </div>
          ) : (
            <div className="text-center pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                No deals found for this period
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SalesForecast;
