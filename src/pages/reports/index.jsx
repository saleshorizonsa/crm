import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../components/AppIcon";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import DateRangePicker, { resolveDateRange } from "../../components/ui/DateRangePicker";
import { useAuth } from "../../contexts/AuthContext";
import { reportService } from "../../services/supabaseService";
import ReportKPIBar        from "./components/ReportKPIBar";
import RevenueOverTime     from "./components/RevenueOverTime";
import WinLossChart        from "./components/WinLossChart";
import LeadSourcesChart    from "./components/LeadSourcesChart";
import DealVelocityChart   from "./components/DealVelocityChart";
import TeamPerformanceTable from "./components/TeamPerformanceTable";
import TopDealsTable       from "./components/TopDealsTable";

// ── Helpers ──────────────────────────────────────────────────────────────────

const toYMD = (d) => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

const Skeleton = () => (
  <div className="animate-pulse space-y-6">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 h-64 bg-muted rounded-lg" />
      <div className="h-64 bg-muted rounded-lg" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {[...Array(2)].map((_, i) => <div key={i} className="h-64 bg-muted rounded-lg" />)}
    </div>
    <div className="h-64 bg-muted rounded-lg" />
    <div className="h-56 bg-muted rounded-lg" />
  </div>
);

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_SCOPE = {
  salesman:  { label: "My Deals",       color: "bg-blue-100 text-blue-700"   },
  supervisor:{ label: "My Team",        color: "bg-violet-100 text-violet-700"},
  manager:   { label: "Company-Wide",   color: "bg-emerald-100 text-emerald-700"},
  director:  { label: "Company-Wide",   color: "bg-amber-100 text-amber-700" },
  admin:     { label: "All Companies",  color: "bg-red-100 text-red-700"     },
  head:      { label: "Company-Wide",   color: "bg-slate-100 text-slate-700" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

const ReportsPage = () => {
  const { user, userProfile, company } = useAuth();

  const [preset, setPreset]           = useState("this-quarter");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [rawData, setRawData]         = useState({ deals: [], prevDeals: [], contacts: [], teamMembers: [] });
  const [isLoading, setIsLoading]     = useState(false);
  const [fetchError, setFetchError]   = useState(null);

  const period = useMemo(
    () => resolveDateRange(preset, customRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, customRange.from, customRange.to],
  );

  useEffect(() => {
    if (!user?.id || !period.startDate || !period.endDate) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setFetchError(null);
      const result = await reportService.getReportData({
        companyId:   company?.id,
        userId:      user.id,
        role:        userProfile?.role,
        periodStart: toYMD(period.startDate),
        periodEnd:   toYMD(period.endDate),
      });
      if (cancelled) return;
      if (result.error) setFetchError(result.error);
      else setRawData(result);
      setIsLoading(false);
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, user?.id, userProfile?.role, period.startDate?.getTime(), period.endDate?.getTime()]);

  const handleRangeChange = (value, custom) => {
    setPreset(value);
    setCustomRange(custom ?? { from: "", to: "" });
  };

  const role = userProfile?.role ?? "salesman";
  const scopeInfo = ROLE_SCOPE[role] ?? ROLE_SCOPE.salesman;
  const showTeam  = ["supervisor", "manager", "director", "admin", "head"].includes(role);

  const breadcrumbs = [
    { label: "Dashboard", path: "/company-dashboard" },
    { label: "Reports" },
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
              <h1 className="text-2xl font-bold text-foreground">Reports</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Advanced analytics and performance reporting
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${scopeInfo.color}`}>
                <Icon name="Users" size={11} />
                {scopeInfo.label}
              </span>
              <DateRangePicker
                value={preset}
                customRange={customRange}
                onChange={handleRangeChange}
                className="w-52"
                placeholder="Select period"
              />
            </div>
          </div>
        </div>

        {/* No period */}
        {!period.startDate && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon name="Calendar" size={48} className="text-muted-foreground mb-3" />
            <p className="text-lg font-medium text-card-foreground mb-1">Select a period</p>
            <p className="text-sm text-muted-foreground">Choose a date range to generate your report</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && <Skeleton />}

        {/* Error */}
        {fetchError && !isLoading && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <Icon name="AlertCircle" size={20} className="flex-shrink-0" />
            <div>
              <p className="font-medium">Failed to load report data</p>
              <p className="text-sm opacity-80">
                {typeof fetchError === "string" ? fetchError : "Please try refreshing."}
              </p>
            </div>
          </div>
        )}

        {/* Main content */}
        {!isLoading && !fetchError && period.startDate && (
          <div className="space-y-6">
            {/* KPI Summary */}
            <ReportKPIBar deals={rawData.deals} prevDeals={rawData.prevDeals} role={role} />

            {/* Row 1: Revenue over time + Win/Loss */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <RevenueOverTime deals={rawData.deals} />
              </div>
              <div>
                <WinLossChart deals={rawData.deals} />
              </div>
            </div>

            {/* Row 2: Deal Velocity + Lead Sources */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DealVelocityChart deals={rawData.deals} />
              <LeadSourcesChart contacts={rawData.contacts} deals={rawData.deals} />
            </div>

            {/* Row 3: Team Performance (supervisor+ only) */}
            {showTeam && rawData.teamMembers.length > 0 && (
              <TeamPerformanceTable deals={rawData.deals} teamMembers={rawData.teamMembers} />
            )}

            {/* Row 4: Top Deals Table */}
            <TopDealsTable deals={rawData.deals} limit={25} />

            {/* Empty state */}
            {rawData.deals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-card border border-border rounded-lg">
                <Icon name="FileBarChart" size={48} className="text-muted-foreground mb-3" />
                <p className="text-lg font-medium text-card-foreground mb-1">No deals found</p>
                <p className="text-sm text-muted-foreground">
                  Try selecting a different date range or check your pipeline.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ReportsPage;
