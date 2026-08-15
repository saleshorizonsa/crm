import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "contexts/AuthContext";
import { supabase } from "lib/supabase";
import Header from "components/ui/Header";
import Icon from "components/AppIcon";
import CustomerMaster from "./components/CustomerMaster";
import OpportunitiesModule from "./components/OpportunitiesModule";
import FutureOrdersModule from "./components/FutureOrdersModule";
import HistoricalDataModule from "./components/HistoricalDataModule";
import { fetchWinRate3m } from "utils/winRate3m";
import { computeKpiStripData, computeDirectorAnnual } from "utils/kpiStripData";
import { fetchTeamHierarchy } from "utils/teamHierarchy";

const DIRECTOR_ROLES = ["director", "admin", "head"];
const TEAM_ROLES = ["manager", "supervisor"];

// Whole-SAR integer formatter for the summary bar (e.g. 1,500,990).
const fmtSAR = (n) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );

// Isolate each tab so a crash in one (e.g. a bad row of data) can't take down
// the whole Planning page — the other tabs stay usable and the failing tab shows
// the actual error message instead of a blank "Something went wrong".
class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Planning tab crashed:", error, info);
  }

  componentDidUpdate(prevProps) {
    // Reset when the user switches tabs so a fixed/other tab renders fresh.
    if (prevProps.tabKey !== this.props.tabKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-card rounded-2xl border border-destructive/30">
          <p className="text-sm font-medium text-destructive mb-2">
            Something went wrong in this tab
          </p>
          <p className="text-xs text-muted-foreground font-mono break-words max-w-lg mx-auto">
            {this.state.error?.message || String(this.state.error)}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 text-xs px-3 py-1.5 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const PlanningPage = () => {
  const { user, company, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("customer_master");
  const [adminCompany, setAdminCompany] = useState(null);

  useEffect(() => {
    if (company && !adminCompany) {
      setAdminCompany(company);
    }
  }, [company]);

  const role = userProfile?.role;
  // Historical sales upload is a director/admin/head-only tool
  const canUploadHistory = ["director", "admin", "head"].includes(role);

  // ── Planning summary bar (visible on every tab) ─────────────────────────────
  const [summaryData, setSummaryData] = useState({
    target: 0,
    winRate3m: 0,
    winRateIsDefault: false,
    requiredPlan: 0,
    totalPlanned: 0,
    plannedGap: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(true);

  const companyId = adminCompany?.id;
  const isDirectorRole = DIRECTOR_ROLES.includes(role);

  const fetchPlanningSummary = useCallback(async () => {
    if (!companyId) {
      setSummaryData({
        target: 0, winRate3m: 0, winRateIsDefault: false,
        requiredPlan: 0, totalPlanned: 0, plannedGap: 0,
      });
      setSummaryLoading(false);
      return;
    }
    setSummaryLoading(true);
    try {
      const isDirector = DIRECTOR_ROLES.includes(role);
      const isTeamLead = TEAM_ROLES.includes(role);

      // ── DIRECTOR ── Card 1 shows the company's ANNUAL target; Cards 2/3/4 mirror
      // the Director dashboard's monthly KPI strip exactly (salesman-scoped 3-month
      // win rate, monthly required plan and this-month planned gap) by reusing the
      // very same functions the dashboard uses — so the two pages can never drift.
      if (isDirector) {
        const [{ totals }, annual] = await Promise.all([
          computeKpiStripData({ companyId, ownerIds: null }),
          computeDirectorAnnual({ companyId }),
        ]);
        setSummaryData({
          target: annual.target,             // Card 1 — annual target
          winRate3m: totals.winRate3m,       // Card 2 — 3-month salesman avg
          winRateIsDefault: totals.winRateIsDefault,
          requiredPlan: totals.required,     // Card 3 — monthly required plan
          totalPlanned: totals.planned,      // this month's planned (salesmen)
          plannedGap: totals.plannedGap,     // Card 4 — monthly planned gap
        });
        return;
      }

      // ── MANAGER / SUPERVISOR / SALESMAN ── monthly figures (unchanged).
      // Owner scope: manager/supervisor → self + full downline; salesman → self.
      const scope = isTeamLead
        ? [user?.id, ...(await fetchTeamHierarchy({ companyId, userId: user?.id, role })).map((m) => m.id)].filter(Boolean)
        : [user?.id].filter(Boolean);
      const scopeIds = scope.length ? scope : ["00000000-0000-0000-0000-000000000000"];

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const monthStartStr = monthStart.toISOString().split("T")[0];
      const monthEndStr = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString().split("T")[0];

      // ── TARGET ── sum of MAX target per person over the current month (targets
      // come as total/by-client/by-product views of ONE goal — max per person,
      // then sum; never add the types).
      const { data: targets } = await supabase
        .from("sales_targets")
        .select("target_amount, assigned_to")
        .eq("company_id", companyId)
        .eq("status", "active")
        .lte("period_start", monthEnd.toISOString())
        .gte("period_end", monthStart.toISOString())
        .in("assigned_to", scopeIds);
      const perPerson = {};
      (targets || []).forEach((r) => {
        const k = r.assigned_to || "x";
        perPerson[k] = Math.max(perPerson[k] || 0, parseFloat(r.target_amount) || 0);
      });
      const totalTarget = Object.values(perPerson).reduce((s, v) => s + v, 0);

      // ── WIN RATE ── 3-step (no fixed default): (1) 90-day rolling window;
      // (2) if none, this scope's ACTUAL rate over all history — however few deals;
      // (3) only if zero deals ever, the whole-company 3-month average.
      const { winRate3m: raw, total3m } = await fetchWinRate3m({ companyId, ownerIds: scope });
      let winRate3m = raw;
      let winRateIsDefault = false;
      if (total3m === 0) {
        const { data: hist } = await supabase
          .from("deals")
          .select("stage")
          .eq("company_id", companyId)
          .in("owner_id", scopeIds);
        if ((hist?.length || 0) > 0) {
          const wonH = hist.filter((d) => d.stage === "won").length;
          winRate3m = (wonH / hist.length) * 100;
        } else {
          const { winRate3m: companyAvg } = await fetchWinRate3m({ companyId, ownerIds: null });
          winRate3m = companyAvg;
          winRateIsDefault = true;
        }
      }

      // ── REQUIRED PLAN ── Target ÷ Win Rate%
      const requiredPlan = winRate3m > 0 ? totalTarget / (winRate3m / 100) : totalTarget * 2;

      // ── TOTAL PLANNED ── open opportunities for the current month
      const { data: opps } = await supabase
        .from("opportunities")
        .select("planned_amount")
        .eq("company_id", companyId)
        .eq("status", "open")
        .gte("expected_month", monthStartStr)
        .lte("expected_month", monthEndStr)
        .in("owner_id", scopeIds);
      const totalPlanned = (opps || []).reduce((s, o) => s + (parseFloat(o.planned_amount) || 0), 0);

      const plannedGap = Math.max(0, requiredPlan - totalPlanned);

      setSummaryData({
        target: totalTarget,
        winRate3m,
        winRateIsDefault,
        requiredPlan,
        totalPlanned,
        plannedGap,
      });
    } catch (err) {
      console.error("Planning summary:", err);
    } finally {
      setSummaryLoading(false);
    }
  }, [companyId, role, user?.id]);

  useEffect(() => { fetchPlanningSummary(); }, [fetchPlanningSummary]);

  const tabs = [
    { id: "customer_master", label: "Customer Master", icon: "Users"  },
    { id: "opportunities",   label: "Current Sales Plan", icon: "Target" },
    { id: "future_orders",   label: "Future Orders",   icon: "CalendarClock" },
    ...(canUploadHistory
      ? [{ id: "historical_data", label: "Historical Data", icon: "Upload" }]
      : []),
  ];

  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 px-4 lg:px-6 py-6 max-w-screen-2xl mx-auto w-full">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Planning</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTab === "opportunities"
              ? "Current Sales Plan — Plan how you'll hit your monthly target, then convert to deals"
              : activeTab === "future_orders"
              ? "Future Orders — Deals moved from the Funnel to a future month; they auto-move to Current Sales Plan when the month arrives"
              : activeTab === "historical_data"
              ? "Historical Data — Import past SAP/ERP sales to power forecasting and year-over-year comparisons"
              : "Customer Master — Import, assign and manage your customer accounts"}
          </p>
        </div>

        {/* Planning summary bar — shown on every tab */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {/* Card 1 — TARGET */}
          <div className="bg-card rounded-2xl border border-border p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {isDirectorRole ? "Annual Target" : "Monthly Target"}
            </p>
            {summaryLoading ? (
              <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-xl font-bold text-foreground tabular-nums">
                {fmtSAR(summaryData.target)}
                <span className="text-sm font-normal text-muted-foreground ml-1">SAR</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {isDirectorRole
                ? `${new Date().getFullYear()}`
                : new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
            </p>
          </div>

          {/* Card 2 — WIN RATE */}
          <div className="bg-card rounded-2xl border border-border p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Win Rate
            </p>
            {summaryLoading ? (
              <div className="h-7 w-16 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-xl font-bold text-purple-600 tabular-nums">
                {summaryData.winRate3m.toFixed(1)}%
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              3-month average{summaryData.winRateIsDefault && " (default)"}
            </p>
          </div>

          {/* Card 3 — REQUIRED PLAN */}
          <div className="bg-card rounded-2xl border border-border p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {isDirectorRole ? "Monthly Required Plan" : "Required Plan"}
            </p>
            {summaryLoading ? (
              <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-xl font-bold text-amber-600 tabular-nums">
                {fmtSAR(summaryData.requiredPlan)}
                <span className="text-sm font-normal text-muted-foreground ml-1">SAR</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {isDirectorRole ? "Monthly quota" : "Target"} ÷ {summaryData.winRate3m.toFixed(0)}% win rate
            </p>
          </div>

          {/* Card 4 — PLANNED GAP */}
          <div
            className={`rounded-2xl border p-4 relative overflow-hidden ${
              !summaryLoading && summaryData.plannedGap <= 0
                ? "bg-green-50 border-green-200"
                : "bg-card border-border"
            }`}
          >
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                !summaryLoading && summaryData.plannedGap <= 0 ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {isDirectorRole ? "Monthly Planned Gap" : "Planned Gap"}
            </p>
            {summaryLoading ? (
              <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            ) : summaryData.plannedGap <= 0 ? (
              <p className="text-xl font-bold text-green-600">On Track ✓</p>
            ) : (
              <p className="text-xl font-bold text-red-600 tabular-nums">
                {fmtSAR(summaryData.plannedGap)}
                <span className="text-sm font-normal text-muted-foreground ml-1">SAR</span>
              </p>
            )}
            <p
              className={`text-xs mt-1 ${
                !summaryLoading && summaryData.plannedGap <= 0 ? "text-green-600" : "text-muted-foreground"
              }`}
            >
              {!summaryLoading && summaryData.plannedGap <= 0
                ? `Planned: ${fmtSAR(summaryData.totalPlanned)} SAR`
                : isDirectorRole
                  ? "This month's planning gap"
                  : "Still need to plan this amount"}
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 mb-6 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon name={tab.icon} size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content — each isolated so one tab's error can't blank the page */}
        <TabErrorBoundary tabKey={activeTab}>
          {activeTab === "customer_master" && (
            <CustomerMaster
              adminCompany={adminCompany}
              onCompanyChange={setAdminCompany}
              onGoToOpportunities={() => setActiveTab("opportunities")}
            />
          )}

          {activeTab === "opportunities" && (
            <OpportunitiesModule
              adminCompany={adminCompany}
              onOpportunityChange={fetchPlanningSummary}
            />
          )}

          {activeTab === "future_orders" && (
            <FutureOrdersModule
              adminCompany={adminCompany}
              onGoToOpportunities={() => setActiveTab("opportunities")}
              onOrderChange={fetchPlanningSummary}
            />
          )}

          {activeTab === "historical_data" && canUploadHistory && (
            <HistoricalDataModule adminCompany={adminCompany} />
          )}
        </TabErrorBoundary>
      </main>
    </div>
  );
};

export default PlanningPage;
