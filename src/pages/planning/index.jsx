import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "contexts/AuthContext";
import { supabase } from "lib/supabase";
import Header from "components/ui/Header";
import Icon from "components/AppIcon";
import CustomerMaster from "./components/CustomerMaster";
import OpportunitiesModule from "./components/OpportunitiesModule";
import FutureOrdersModule from "./components/FutureOrdersModule";
import HistoricalDataModule from "./components/HistoricalDataModule";
import SalesReturnsModule from "./components/SalesReturnsModule";
import { computePlanningPageSummary, fetchProductGroups } from "utils/planningPageSummary";
import { fetchTeamHierarchy } from "utils/teamHierarchy";
import { useDateRange } from "contexts/DateRangeContext";
import { periodLabelFromRange, isAnnualRange } from "utils/dashboardDateUtils";
import QuickDateSelector from "components/QuickDateSelector";
import PlanApprovalsModule from "./components/PlanApprovalsModule";
import {
  notifyPlanSubmitted,
  fetchPendingApprovalCount,
  resolveApproverScope,
  isMissingApprovalSchema,
} from "utils/planApproval";

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
    achieved: 0,
    attainmentPct: null,
    remainingTarget: 0,
    winRate3m: 0,
    winRateIsDefault: false,
    requiredPlan: 0,
    plannedOpen: 0,
    openFunnel: 0,
    availableCoverage: 0,
    coveragePct: null,
    plannedGap: 0,
    hasTargetRows: false,
    untaggedPlanned: 0,
    untaggedFunnel: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  // Monotonic request id — see fetchPlanningSummary. useRef so it survives
  // re-renders without causing one.
  const summaryReq = useRef(0);

  // ── Filters, owned here because the cards above the tabs follow them ────────
  // The salesman selector and the product-group selector are rendered inside the
  // Current Sales Plan tab (where the team expects them), but the four summary
  // cards used to ignore the salesman entirely — filterOwner was not even in
  // fetchPlanningSummary's dependency list, so drilling into one person changed
  // the list underneath and left the consolidated numbers above it untouched.
  // One filter for the WHOLE page, not one per tab. Customer Master, Current
  // Sales Plan and Future Orders each used to keep a private salesman filter, so
  // picking a salesman on the tab the page opens on (Customer Master) narrowed
  // that list and left the cards on the full team scope — they only ever
  // followed the Current Sales Plan tab's copy.
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterProductGroup, setFilterProductGroup] = useState(null);
  const [productGroups, setProductGroups] = useState([]);

  // Switching company must not carry a stale owner id across. Runs on mount too,
  // where it is a no-op, so no first-render guard is needed.
  useEffect(() => {
    setFilterOwner("all");
    setFilterProductGroup(null);
  }, [adminCompany?.id]);

  // Name for the filter chip, so the cards visibly say WHO they describe rather
  // than just "one salesman".
  const [filterOwnerName, setFilterOwnerName] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (filterOwner === "all") { setFilterOwnerName(""); return; }
      const { data } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", filterOwner)
        .maybeSingle();
      if (!cancelled) setFilterOwnerName(data?.full_name || "");
    })();
    return () => { cancelled = true; };
  }, [filterOwner]);

  const companyId = adminCompany?.id;
  const isDirectorRole = DIRECTOR_ROLES.includes(role);
  const isSalesman = role === "salesman";

  // ── Shared period (synced with the dashboards via DateRangeContext) ─────────
  const { dateRange, setRange } = useDateRange();
  const nowRef = new Date();
  const defStart = `${nowRef.getFullYear()}-${String(nowRef.getMonth() + 1).padStart(2, "0")}-01`;
  const defEnd = (() => {
    const e = new Date(nowRef.getFullYear(), nowRef.getMonth() + 1, 0);
    return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
  })();
  const rangeStart = dateRange?.from || defStart;
  const rangeEnd = dateRange?.to || defEnd;
  const isAnnualView = isAnnualRange(rangeStart, rangeEnd);
  const periodLabel = periodLabelFromRange(rangeStart, rangeEnd);
  const isSupervisor = role === "supervisor";
  // Manager/supervisor/director review their team's submitted plans.
  const canApprove = TEAM_ROLES.includes(role) || DIRECTOR_ROLES.includes(role);

  // ── Plan submission (deadline: 25th of the month) ───────────────────────────
  // Keyed BY PLAN MONTH rather than a single row, because in the last 7 days of
  // a month two plans can be open at once: this month's (due on the 25th, quite
  // possibly overdue) and next month's, submitted early. Same table, same
  // workflow, a different plan_month.
  const [submissions, setSubmissions] = useState({});   // { "yyyy-MM-01": row }
  const [submitting, setSubmitting] = useState(null);   // the month being submitted
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const now = new Date();
  const currentMonthKey = monthKeyOf(now);
  const nextMonthKey = nextMonthKeyOf(now);
  const earlyOpen = isEarlyWindowOpen(now);

  const fetchPlanSubmission = useCallback(async () => {
    if (!companyId || !user?.id) { setSubmissions({}); return; }
    // Both months in one round trip; outside the window the second key simply
    // matches nothing.
    const { data } = await supabase
      .from("plan_submissions")
      .select("*")
      .eq("company_id", companyId)
      .eq("owner_id", user.id)
      .in("plan_month", [currentMonthKey, nextMonthKey]);
    const byMonth = {};
    (data || []).forEach((r) => { byMonth[String(r.plan_month).slice(0, 10)] = r; });
    setSubmissions(byMonth);
  }, [companyId, user?.id, currentMonthKey, nextMonthKey]);

  useEffect(() => { fetchPlanSubmission(); }, [fetchPlanSubmission]);

  const refreshPendingApprovals = useCallback(async () => {
    if (!companyId || !user?.id || !canApprove) { setPendingApprovals(0); return; }
    const ownerIds = await resolveApproverScope({ companyId, userId: user.id, role });
    setPendingApprovals(await fetchPendingApprovalCount({ companyId, ownerIds }));
  }, [companyId, user?.id, role, canApprove]);

  useEffect(() => { refreshPendingApprovals(); }, [refreshPendingApprovals]);

  // Which month the salesman is currently planning. Only ever "next" while the
  // early window is open; it falls back on its own when the window closes or
  // the month rolls over, so no state can strand someone on a month they can no
  // longer submit.
  const [planTarget, setPlanTarget] = useState("current");
  const activeMonthKey = planTarget === "next" && earlyOpen ? nextMonthKey : currentMonthKey;
  const planSubmission = submissions[activeMonthKey] || null;

  // Everything below is now ABOUT activeMonthKey rather than about "now".
  const deadlineDay = new Date(`${deadlineFor(activeMonthKey)}T00:00:00`);
  const isLate = isLateFor(activeMonthKey, now);
  // Submission completeness stays a question about the PLAN, not about coverage:
  // a big open funnel must not let a month be submitted with nothing planned.
  const activeSummary = planTarget === "next" && earlyOpen ? nextSummary : summaryData;
  const planComplete = activeSummary.plannedOpen >= activeSummary.requiredPlan;
  const canSubmit = planComplete && !planSubmission?.is_submitted;
  const showSubmitBar = (isSalesman || isSupervisor) && !!companyId;

  const handleSubmitPlan = async () => {
    if (!canSubmit || submitting) return;
    // The month being submitted is whichever one is on screen — this month, or
    // next month during the early window. Everything on the row is derived from
    // that month, not from today's date: an October plan sent on 24 September
    // carries October's deadline and is not late.
    const planMonth = activeMonthKey;
    const summaryForMonth = activeSummary;
    setSubmitting(planMonth);
    const stamp = new Date();
    try {
      const base = {
        company_id: companyId,
        owner_id: user?.id,
        plan_month: planMonth,
        submitted_at: stamp.toISOString(),
        total_planned: summaryForMonth.plannedOpen,
        required_plan: summaryForMonth.requiredPlan,
        is_submitted: true,
        is_late: isLateFor(planMonth, stamp),
        deadline_date: deadlineFor(planMonth),
        flagged: false,
        updated_at: stamp.toISOString(),
      };
      // Resubmitting after a rejection puts the plan back in the queue.
      const withApproval = {
        ...base,
        approval_status: "pending",
        rejection_reason: null,
        is_locked: false,
      };
      const upsert = (payload) =>
        supabase
          .from("plan_submissions")
          .upsert(payload, { onConflict: "company_id,owner_id,plan_month" })
          .select("id")
          .maybeSingle();

      let { data: saved, error } = await upsert(withApproval);
      // add_plan_approval_workflow.sql not applied yet — submit still works.
      if (isMissingApprovalSchema(error)) ({ data: saved, error } = await upsert(base));
      if (error) throw error;

      // The notification that never existed: tell the approver a plan has
      // arrived, instead of only telling them when the deadline is missed.
      await notifyPlanSubmitted({
        companyId,
        ownerId: user?.id,
        ownerName: userProfile?.full_name,
        planMonth,
        totalPlanned: summaryForMonth.plannedOpen,
        submissionId: saved?.id,
      });
      await fetchPlanSubmission();
    } catch (err) {
      console.error("Submit plan:", err);
    } finally {
      setSubmitting(null);
    }
  };

  // Next month's own figures, loaded only while the early window is open.
  // Separate from summaryData because that one follows the shared period
  // selector (which the dashboards also read) — scoping next month must not
  // move everyone else's period.
  const emptySummary = {
    target: 0, achieved: 0, remainingTarget: 0,
    attainmentPct: null,
    winRate3m: 0, winRateIsDefault: false, requiredPlan: 0,
    plannedOpen: 0, openFunnel: 0, availableCoverage: 0,
    coveragePct: null, plannedGap: 0, hasTargetRows: false,
    untaggedPlanned: 0, untaggedFunnel: 0,
  };

  const [nextSummary, setNextSummary] = useState(emptySummary);
  const [nextSummaryLoading, setNextSummaryLoading] = useState(false);

  const fetchPlanningSummary = useCallback(async () => {
    // Every filter or period change starts a new request while the previous one
    // may still be in flight, and each of these takes ~1-2s (eight round trips).
    // Nothing used to discard the older one, so whichever RESOLVED LAST wrote the
    // cards — and the unfiltered request is the slower of the two, because it
    // covers every contributor. Land it after a filtered one and the cards snap
    // back to team-wide numbers with a filter visibly applied, until the next
    // refetch (clicking the period again) happens to win the race.
    //
    // A sequence number fixes it regardless of resolve order: only the newest
    // request may write. AbortController is not an option here — these go
    // through the supabase client, not raw fetch.
    const seq = summaryReq.current + 1;
    summaryReq.current = seq;
    const isCurrent = () => seq === summaryReq.current;

    if (!companyId) {
      if (isCurrent()) { setSummaryData(emptySummary); setSummaryLoading(false); }
      return;
    }
    setSummaryLoading(true);
    setSummaryError(null);
    const startedAt = Date.now();
    try {
      // ── ONE definition for EVERY role ──────────────────────────────────
      // This page, the Coverage Console and the dashboards each carried their
      // own copy of these five calculations and had drifted: the same manager's
      // Target read 3,050,494 here and 2,300,494 on his dashboard. They now all
      // call utils/planningCalculations.js, so a fix lands everywhere at once.
      //
      // Owner scope: director → whole company; manager/supervisor → self + full
      // downline; salesman → self. The shared code narrows that to CONTRIBUTORS
      // (salesmen + supervisors) for Target, Planned and carry-in.
      const isDirector = DIRECTOR_ROLES.includes(role);
      const isTeamLead = TEAM_ROLES.includes(role);

      let ownerIds = null;
      if (filterOwner !== "all") {
        // Drilled into one person: these cards describe that person.
        ownerIds = [filterOwner];
      } else if (!isDirector) {
        const scope = isTeamLead
          ? [user?.id, ...(await fetchTeamHierarchy({ companyId, userId: user?.id, role })).map((m) => m.id)].filter(Boolean)
          : [user?.id].filter(Boolean);
        ownerIds = scope.length ? scope : ["00000000-0000-0000-0000-000000000000"];
      }

      // Planning-page-only chain (utils/planningPageSummary.js). The shared
      // computePlanningSummary() is deliberately untouched and still serves the
      // Coverage Console, the dashboards and the KPI strip with the older
      // definition (raw Target ÷ win rate, netted against Future Orders carry-in).
      const sum = await computePlanningPageSummary({
        companyId,
        ownerIds,
        start: rangeStart,
        end: rangeEnd,
        productGroup: filterProductGroup,
      });

      // One line per refresh, so "the cards didn't update" can be answered from
      // the console instead of guessed at: which request, for which filter and
      // period, how long it took, and whether it was applied or discarded.
      // eslint-disable-next-line no-console
      console.debug(
        `[planning summary] #${seq} ${isCurrent() ? "APPLIED" : "DISCARDED (stale)"}`,
        { owner: filterOwner, productGroup: filterProductGroup, from: rangeStart, to: rangeEnd,
          ms: Date.now() - startedAt, target: sum.target, achieved: sum.achieved },
      );

      // A newer filter/period was picked while this was in flight: its result is
      // the one the user is waiting for, so drop this one on the floor.
      if (!isCurrent()) return;

      setSummaryData({
        target: sum.target,
        achieved: sum.achieved,
        attainmentPct: sum.attainmentPct,
        remainingTarget: sum.remainingTarget,
        winRate3m: sum.winRatePct,
        winRateIsDefault: sum.winRateIsDefault,
        requiredPlan: sum.requiredPlan,
        plannedOpen: sum.plannedOpen,
        openFunnel: sum.openFunnel,
        availableCoverage: sum.availableCoverage,
        coveragePct: sum.coveragePct,
        plannedGap: sum.plannedGap,
        hasTargetRows: sum.hasTargetRows,
        untaggedPlanned: sum.untaggedPlanned,
        untaggedFunnel: sum.untaggedFunnel,
      });
    } catch (err) {
      // Swallowing this left the PREVIOUS filter's numbers on screen with the
      // new filter applied — wrong figures that look like real ones. Say so.
      console.error("Planning summary:", err);
      if (isCurrent()) {
        setSummaryData(emptySummary);
        setSummaryError(err?.message || "Could not load the summary.");
      }
    } finally {
      if (isCurrent()) setSummaryLoading(false);
    }
  }, [companyId, role, user?.id, rangeStart, rangeEnd, filterOwner, filterProductGroup]);

  useEffect(() => { fetchPlanningSummary(); }, [fetchPlanningSummary]);

  // Next month's figures, for the early-submission bar. Same chain as the
  // current month, just a different window — and only while the window is open,
  // so outside it this costs nothing and today's flow is untouched.
  const fetchNextMonthSummary = useCallback(async () => {
    if (!earlyOpen || !companyId || !user?.id) { setNextSummary(emptySummary); return; }
    setNextSummaryLoading(true);
    try {
      const bounds = monthBoundsOf(nextMonthKey);
      let ownerIds = null;
      if (!DIRECTOR_ROLES.includes(role)) {
        const isTeamLead = TEAM_ROLES.includes(role);
        const scope = isTeamLead
          ? [user?.id, ...(await fetchTeamHierarchy({ companyId, userId: user?.id, role })).map((m) => m.id)].filter(Boolean)
          : [user?.id].filter(Boolean);
        ownerIds = scope.length ? scope : ["00000000-0000-0000-0000-000000000000"];
      }
      const sum = await computePlanningPageSummary({
        companyId, ownerIds, start: bounds.start, end: bounds.end,
        productGroup: filterProductGroup,
      });
      setNextSummary({ ...emptySummary, ...sum, winRate3m: sum.winRatePct });
    } catch (err) {
      console.error("Next-month summary:", err);
      setNextSummary(emptySummary);
    } finally {
      setNextSummaryLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earlyOpen, companyId, user?.id, role, nextMonthKey, filterProductGroup]);

  useEffect(() => { fetchNextMonthSummary(); }, [fetchNextMonthSummary]);

  // Product-group options, scoped the same way the cards are.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) { setProductGroups([]); return; }
      const isDirector = DIRECTOR_ROLES.includes(role);
      const isTeamLead = TEAM_ROLES.includes(role);
      let ownerIds = null;
      if (!isDirector) {
        ownerIds = isTeamLead
          ? [user?.id, ...(await fetchTeamHierarchy({ companyId, userId: user?.id, role })).map((m) => m.id)].filter(Boolean)
          : [user?.id].filter(Boolean);
      }
      const groups = await fetchProductGroups({ companyId, ownerIds });
      if (!cancelled) setProductGroups(groups);
    })();
    return () => { cancelled = true; };
  }, [companyId, role, user?.id]);

  const tabs = [
    { id: "customer_master", label: "Customer Master", icon: "Users"  },
    { id: "opportunities",   label: "Current Sales Plan", icon: "Target" },
    { id: "future_orders",   label: "Future Orders",   icon: "CalendarClock" },
    ...(canApprove
      ? [{
          id: "approvals",
          label: pendingApprovals > 0
            ? `Plans Awaiting Approval (${pendingApprovals})`
            : "Plans Awaiting Approval",
          icon: "ClipboardCheck",
        }]
      : []),
    ...(canUploadHistory
      ? [{ id: "historical_data", label: "Historical Data", icon: "Upload" }]
      : []),
    // Same gate as Historical Data: both are ERP imports that rewrite what
    // Achieved reports, so they belong to the same people.
    ...(canUploadHistory
      ? [{ id: "sales_returns", label: "Sales Returns", icon: "Undo2" }]
      : []),
  ];

  // Deep link from the dashboard banner: /planning#approvals.
  useEffect(() => {
    if (canApprove && window.location.hash === "#approvals") setActiveTab("approvals");
  }, [canApprove]);

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
              : activeTab === "sales_returns"
                ? "Sales Returns — Import ERP credit notes; each return reduces Achieved in the month it happened"
              : activeTab === "historical_data"
              ? "Historical Data — Import past SAP/ERP sales to power forecasting and year-over-year comparisons"
              : "Customer Master — Import, assign and manage your customer accounts"}
          </p>
        </div>

        {/* Period switcher — shares DateRangeContext with the dashboards, so
            switching here updates the dashboard period and vice-versa. */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <QuickDateSelector
            activeDateRange={{ from: rangeStart, to: rangeEnd }}
            onRangeChange={(r) => setRange({ from: r.from, to: r.to })}
          />
          <p className="text-sm text-muted-foreground">
            Viewing: <strong className="text-foreground">{periodLabel}</strong>
          </p>
        </div>

        {/* Plan submission status + Submit Plan (salesman/supervisor) */}
        {/* Approved plans are locked: the salesman can no longer change the
            month's opportunities until a manager sends the plan back. */}
        {showSubmitBar && planSubmission?.is_locked && (
          <div className="flex items-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl mb-4">
            <span className="text-base">🔒</span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Plan Locked</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {planSubmission.approved_at
                  ? `Approved ${new Date(planSubmission.approved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Contact your manager if changes are needed.`
                  : "Approved. Contact your manager if changes are needed."}
              </p>
            </div>
          </div>
        )}

        {showSubmitBar && planSubmission?.approval_status === "rejected" && (
          <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
            <span className="text-base">❌</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">Plan Sent Back</p>
              <p className="text-xs text-amber-700">
                {planSubmission.rejection_reason
                  ? `"${planSubmission.rejection_reason}" — revise your plan and submit again.`
                  : "Revise your plan and submit again."}
              </p>
            </div>
          </div>
        )}
        {/* During the last 7 days of the month both plans are live. They get a
            switch rather than one bar replacing the other, so neither hides the
            other and it is always obvious which month is on screen. */}
        {showSubmitBar && earlyOpen && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-muted-foreground">Planning for</span>
            {[
              { key: "current", label: monthNameOf(currentMonthKey), month: currentMonthKey },
              { key: "next", label: `${monthNameOf(nextMonthKey)} (early)`, month: nextMonthKey },
            ].map((opt) => {
              const row = submissions[opt.month];
              return (
                <button
                  key={opt.key}
                  onClick={() => setPlanTarget(opt.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    planTarget === opt.key
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {opt.label}
                  {row?.is_locked ? " 🔒" : row?.is_submitted ? " ✅" : ""}
                </button>
              );
            })}
          </div>
        )}

        {showSubmitBar && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-card border border-border rounded-xl mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  planSubmission?.is_submitted
                    ? "bg-green-500"
                    : isLate
                      ? "bg-red-500 animate-pulse"
                      : "bg-amber-500"
                }`}
              />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {planSubmission?.is_submitted
                    ? `✅ ${monthNameOf(activeMonthKey)} Plan Submitted`
                    : isLate
                      ? `🚨 ${monthNameOf(activeMonthKey)} Plan Overdue`
                      : `📋 ${monthNameOf(activeMonthKey)} Plan Due by 25th`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {planSubmission?.is_submitted
                    ? `Submitted ${new Date(planSubmission.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${planSubmission.is_late ? " (Late)" : ""}`
                    : !planComplete
                      ? `Add ${fmtSAR(activeSummary.plannedGap)} SAR more to enable submission`
                      : `Due ${deadlineDay.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`}
                </p>
              </div>
            </div>

            {!planSubmission?.is_submitted && (
              <button
                onClick={handleSubmitPlan}
                disabled={!canSubmit || submitting === activeMonthKey}
                className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl transition-colors ${
                  canSubmit
                    ? isLate
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {submitting === activeMonthKey && (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {canSubmit
                  ? isLate
                    ? "Submit Late"
                    : planTarget === "next" && earlyOpen
                      ? `Submit ${monthNameOf(activeMonthKey)} Plan`
                      : "Submit Plan"
                  : "Plan Incomplete"}
              </button>
            )}
          </div>
        )}

        {/* Active filters — the cards below follow them, but the selectors live
            inside the Current Sales Plan tab, so say so from every tab. */}
        {(filterOwner !== "all" || filterProductGroup) && (
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-xs text-muted-foreground">Cards filtered by:</span>
            {filterOwner !== "all" && (
              <button
                onClick={() => setFilterOwner("all")}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
              >
                <Icon name="User" size={12} />
                {filterOwnerName || "One salesman"}
                <Icon name="X" size={12} />
              </button>
            )}
            {filterProductGroup && (
              <button
                onClick={() => setFilterProductGroup(null)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
              >
                <Icon name="Package" size={12} />
                {productGroups.find((g) => g.value === filterProductGroup)?.label || filterProductGroup}
                <Icon name="X" size={12} />
              </button>
            )}
            {filterProductGroup && (
              <span className="text-xs text-amber-700">
                Target is all-products — no target carries a product group yet
              </span>
            )}
          </div>
        )}

        {/* A failed refresh used to leave the previous filter's numbers on
            screen, which is worse than showing nothing. */}
        {summaryError && (
          <div className="flex items-start gap-2 p-3 mb-3 rounded-xl bg-red-50 border border-red-200">
            <Icon name="AlertCircle" size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700">Could not update the summary</p>
              <p className="text-xs text-red-600 mt-0.5">{summaryError}</p>
            </div>
            <button
              onClick={fetchPlanningSummary}
              className="ml-auto text-xs px-3 py-1.5 border border-red-300 rounded-lg text-red-700 hover:bg-red-100 transition-colors flex-shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Planning summary bar — shown on every tab */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
          {/* Card 1 — TARGET */}
          <div className="bg-card rounded-2xl border border-border p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {isAnnualView ? "Annual Target" : "Target"}
            </p>
            {summaryLoading ? (
              <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-xl font-bold text-foreground tabular-nums">
                {fmtSAR(summaryData.target)}
                <span className="text-sm font-normal text-muted-foreground ml-1">SAR</span>
              </p>
            )}
            {/* Remaining Target is the input to Required Plan, so show the
                subtraction rather than leaving the manager to guess it. */}
            {!summaryLoading && summaryData.target > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs text-green-600">
                  Achieved: <span className="tabular-nums">{fmtSAR(summaryData.achieved)} SAR</span>
                  {summaryData.attainmentPct !== null && (
                    <span className="text-muted-foreground">
                      {" "}({summaryData.attainmentPct.toFixed(0)}% of target)
                    </span>
                  )}
                </p>
                {/* "Gap to target" app-wide for target − achieved; "Remaining"
                    was a third name for the same thing the KPI strip calls
                    Deficit. */}
                <p className="text-xs text-foreground font-medium mt-0.5">
                  Gap to target: <span className="tabular-nums">{fmtSAR(summaryData.remainingTarget)} SAR</span>
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {!summaryLoading && !summaryData.hasTargetRows ? "No target assigned" : periodLabel}
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
              {isAnnualView ? "Annual Required Plan" : "Required Plan"}
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
              {!summaryLoading && summaryData.remainingTarget <= 0
                ? summaryData.hasTargetRows
                  ? "Target already achieved"
                  : "Nothing to plan against"
                : `Remaining Target ÷ ${summaryData.winRate3m.toFixed(0)}% win rate`}
            </p>
          </div>

          {/* Card 4 — PLANNING COVERAGE (new) */}
          {/* Available Planning Coverage = untransferred plan + open funnel for
              the period, both RAW and unweighted. Deliberately not
              computeCoverage(), which weights the same inputs by win rate and
              feeds the Coverage Console. */}
          <div className="bg-card rounded-2xl border border-border p-4 relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                !summaryLoading && summaryData.coveragePct !== null && summaryData.coveragePct < 100
                  ? "bg-orange-500"
                  : "bg-teal-500"
              }`}
            />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Planning Coverage
            </p>
            {summaryLoading ? (
              <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-xl font-bold text-foreground tabular-nums">
                {fmtSAR(summaryData.availableCoverage)}
                <span className="text-sm font-normal text-muted-foreground ml-1">SAR</span>
              </p>
            )}
            {!summaryLoading && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Plan: <span className="tabular-nums">{fmtSAR(summaryData.plannedOpen)}</span>
                  {" + "}
                  Funnel: <span className="tabular-nums">{fmtSAR(summaryData.openFunnel)}</span>
                </p>
              </div>
            )}
            <p
              className={`text-xs mt-1 font-medium ${
                summaryLoading
                  ? "text-muted-foreground"
                  : summaryData.coveragePct === null
                    ? "text-muted-foreground"
                    : summaryData.coveragePct >= 100
                      ? "text-green-600"
                      : "text-orange-600"
              }`}
            >
              {summaryLoading
                ? ""
                : summaryData.coveragePct === null
                  ? summaryData.hasTargetRows
                    ? "Fully covered — nothing required"
                    : "No target to cover"
                  : `${summaryData.coveragePct.toFixed(0)}% of Required Plan`}
            </p>
          </div>

          {/* Card 5 — PLANNED GAP = max(0, Required Plan − Available Coverage) */}
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
              {isAnnualView ? "Annual Planned Gap" : "Planned Gap"}
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
                ? `Covered: ${fmtSAR(summaryData.availableCoverage)} SAR`
                : `${periodLabel} planning gap`}
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
              filterOwner={filterOwner}
              onFilterOwnerChange={setFilterOwner}
            />
          )}

          {activeTab === "opportunities" && (
            <OpportunitiesModule
              adminCompany={adminCompany}
              onOpportunityChange={() => { fetchPlanningSummary(); fetchNextMonthSummary(); }}
              // Scoped to next month while that is what is being planned. The
              // SHARED period selector is deliberately not touched — it is the
              // dashboards' period too, and moving it would drag every other
              // screen into next month.
              periodStart={planTarget === "next" && earlyOpen ? monthBoundsOf(nextMonthKey).start : rangeStart}
              periodEnd={planTarget === "next" && earlyOpen ? monthBoundsOf(nextMonthKey).end : rangeEnd}
              // Which month's lock governs editing here. Without this the module
              // checks the CURRENT month's lock, so an approved September plan
              // would freeze October's planning and an approved October plan
              // would not be protected at all.
              planMonth={activeMonthKey}
              filterOwner={filterOwner}
              onFilterOwnerChange={setFilterOwner}
              filterProductGroup={filterProductGroup}
              onFilterProductGroupChange={setFilterProductGroup}
              productGroups={productGroups}
            />
          )}

          {activeTab === "future_orders" && (
            <FutureOrdersModule
              adminCompany={adminCompany}
              onGoToOpportunities={() => setActiveTab("opportunities")}
              onOrderChange={fetchPlanningSummary}
              filterOwner={filterOwner}
              onFilterOwnerChange={setFilterOwner}
            />
          )}

          {activeTab === "approvals" && canApprove && (
            <PlanApprovalsModule
              adminCompany={adminCompany}
              onChange={() => { refreshPendingApprovals(); fetchPlanningSummary(); }}
            />
          )}

          {activeTab === "historical_data" && canUploadHistory && (
            <HistoricalDataModule adminCompany={adminCompany} />
          )}

          {activeTab === "sales_returns" && canUploadHistory && (
            <SalesReturnsModule adminCompany={adminCompany} />
          )}
        </TabErrorBoundary>
      </main>
    </div>
  );
};

export default PlanningPage;
