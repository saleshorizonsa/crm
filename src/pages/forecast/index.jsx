import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../components/AppIcon";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import { useAuth } from "../../contexts/AuthContext";
import { useDateRange } from "../../contexts/DateRangeContext";
import { forecastService } from "../../services/supabaseService";
import { buildForecast } from "../../utils/forecastEngine";
import { generateInsights, generatePrediction } from "../../utils/forecastInsights";
import ForecastKPIBar     from "./components/ForecastKPIBar";
import AIInsightsPanel    from "./components/AIInsightsPanel";
import AIPredictionCard   from "./components/AIPredictionCard";
import StageBreakdown     from "./components/StageBreakdown";
import ForecastDealTable  from "./components/ForecastDealTable";
import ProjectionChart    from "../company-dashboard/components/forecast/ProjectionChart";

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
  const { user, userProfile, company } = useAuth();

  const { dateRange } = useDateRange();
  const [rawData, setRawData] = useState({ deals: [], target: null });
  const [isLoading, setIsLoading]     = useState(false);
  const [fetchError, setFetchError]   = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    if (!dateRange.isAllTime && !dateRange.from) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setFetchError(null);

      const { deals, target, error } = await forecastService.getForecastData({
        companyId:   company?.id,
        userId:      user.id,
        role:        userProfile?.role,
        periodStart: dateRange.from || null,
        periodEnd:   dateRange.to   || null,
      });

      if (cancelled) return;

      if (error) {
        setFetchError(error);
      } else {
        setRawData({ deals: deals || [], target });
      }
      setIsLoading(false);
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, user?.id, userProfile?.role, dateRange.from, dateRange.to, dateRange.isAllTime]);

  const forecast   = useMemo(() => buildForecast(rawData.deals, rawData.target?.target_amount ?? 0), [rawData]);
  const insights   = useMemo(() => generateInsights(forecast, rawData.deals, rawData.target?.target_amount ?? 0), [forecast, rawData]);
  const prediction = useMemo(() => generatePrediction(forecast, rawData.deals, rawData.target?.target_amount ?? 0), [forecast, rawData]);

  const targetAmount = rawData.target?.target_amount ?? 0;

  const breadcrumbs = [
    { label: "Dashboard", path: "/company-dashboard" },
    { label: "Forecast" },
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
              <h1 className="text-2xl font-bold text-foreground">Sales Forecast</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Advanced pipeline analytics, AI predictions &amp; insights
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Target badge */}
              {targetAmount > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-xs font-medium text-violet-700">
                  <Icon name="Target" size={12} />
                  Target active
                </div>
              )}

            </div>
          </div>
        </div>

        {/* No period */}
        {!dateRange.from && !dateRange.isAllTime && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon name="Calendar" size={48} className="text-muted-foreground mb-3" />
            <p className="text-lg font-medium text-card-foreground mb-1">Select a period</p>
            <p className="text-sm text-muted-foreground">
              Choose a date range above to view your forecast
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
              <p className="font-medium">Failed to load forecast data</p>
              <p className="text-sm opacity-80">
                {typeof fetchError === "string" ? fetchError : "Please try refreshing the page."}
              </p>
            </div>
          </div>
        )}

        {/* Main content */}
        {!isLoading && !fetchError && (dateRange.from || dateRange.isAllTime) && (
          <div className="space-y-6">
            {/* KPI Bar */}
            <ForecastKPIBar forecast={forecast} targetAmount={targetAmount} />

            {/* Row 1: Projection chart + AI Prediction */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ProjectionChart projection={forecast.projection} target={targetAmount} />
              </div>
              <div>
                <AIPredictionCard prediction={prediction} />
              </div>
            </div>

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
