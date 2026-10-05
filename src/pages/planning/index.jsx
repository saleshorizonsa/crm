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
import { computePlanningPageSummary, fetchProductGroups, fetchPlannedOpen } from "utils/planningPageSummary";
import { fetchMonthlyTargets, targetPerPerson } from "utils/planningCalculations";
import { fetchTeamHierarchy } from "utils/teamHierarchy";
import { useDateRange } from "contexts/DateRangeContext";
import { periodLabelFromRange, isAnnualRange } from "utils/dashboardDateUtils";
import QuickDateSelector from "components/QuickDateSelector";
import PlanApprovalsModule from "./components/PlanApprovalsModule";
import {
  monthKeyOf, nextMonthKeyOf, prevMonthKeyOf,
  isEarlyWindowOpen, earlyWindowOpensAt,
  isGraceWindowOpen, graceClosesAfter, GRACE_DAYS,
  monthBoundsOf, deadlineFor, isLateFor, monthNameOf, monthLabelOf,
} from "utils/planMonths";
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
  // This holds the SHARED PERIOD's figures. What the tiles actually render is
  // `summaryData` further down, which switches to next month's figures while the
  // early-plan switch is on next month — see the comment there.
  const [currentSummary, setCurrentSummary] = useState({
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
  const [currentSummaryLoading, setCurrentSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  // Why a submit failure gets its OWN state rather than reusing summaryError:
  // that one belongs to the summary fetch and is rewritten by every refetch, so a
  // submit failure parked there would be wiped by the next period or filter
  // change — the user would see the message vanish without having fixed anything.
  const [submitError, setSubmitError] = useState(null);
  // True when the message in submitError is the GATE refusing, not a failure.
  // Same banner, but it must not end by telling someone to call their
  // administrator about a rule that is working correctly.
  const [submitRefused, setSubmitRefused] = useState(false);
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
  // A manager carries a target of his own and files a plan for it like anyone
  // else; reviewing the team's plans is a separate job he also has.
  const isManager = role === "manager";
  // Manager/supervisor/director review their team's submitted plans.
  const canApprove = TEAM_ROLES.includes(role) || DIRECTOR_ROLES.includes(role);

  // Whose plan is on screen. A team lead or director can point the owner filter
  // at anyone in their scope and read that person's Current Sales Plan — the
  // opportunity list and the summary cards already follow this filter, so the
  // plan's SUBMISSION state has to follow it too or the bar would describe the
  // viewer's own plan while the page below it describes someone else's.
  const canViewOthers = TEAM_ROLES.includes(role) || isDirectorRole;
  const viewedOwnerId = (canViewOthers && filterOwner !== "all") ? filterOwner : user?.id;
  // Only the plan's own owner may submit it. Everyone else is read-only.
  const isViewingOther = !!viewedOwnerId && viewedOwnerId !== user?.id;

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
  // The first 3 days of a month keep the month that just ended submittable. It
  // is still late — this only restores the action, never the deadline.
  const prevMonthKey = prevMonthKeyOf(now);
  const graceOpen = isGraceWindowOpen(now);

  const fetchPlanSubmission = useCallback(async () => {
    if (!companyId || !viewedOwnerId) { setSubmissions({}); return; }
    // Both months in one round trip; outside the window the second key simply
    // matches nothing.
    const { data } = await supabase
      .from("plan_submissions")
      .select("*")
      .eq("company_id", companyId)
      .eq("owner_id", viewedOwnerId)
      // Three months, because up to three can be live at once: last month during
      // its grace window, this month, and next month during the early window.
      // Keys that are not applicable simply match nothing.
      .in("plan_month", [prevMonthKey, currentMonthKey, nextMonthKey]);
    const byMonth = {};
    (data || []).forEach((r) => { byMonth[String(r.plan_month).slice(0, 10)] = r; });
    setSubmissions(byMonth);
  }, [companyId, viewedOwnerId, prevMonthKey, currentMonthKey, nextMonthKey]);

  useEffect(() => { fetchPlanSubmission(); }, [fetchPlanSubmission]);

  const refreshPendingApprovals = useCallback(async () => {
    if (!companyId || !user?.id || !canApprove) { setPendingApprovals(0); return; }
    const ownerIds = await resolveApproverScope({ companyId, userId: user.id, role });
    setPendingApprovals(await fetchPendingApprovalCount({ companyId, ownerIds }));
  }, [companyId, user?.id, role, canApprove]);

  useEffect(() => { refreshPendingApprovals(); }, [refreshPendingApprovals]);

  // Next month's own figures, loaded only while the early window is open.
  // Separate from summaryData because that one follows the shared period
  // selector (which the dashboards also read) — scoping next month must not
  // move everyone else's period.
  //
  // These are declared HERE, above activeSummary, and must stay above it:
  // activeSummary reads nextSummary during render, so a declaration below it is
  // a temporal-dead-zone crash that only fires once planTarget flips to "next"
  // (the && short-circuit hides it until then).
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
  // A failed fetch falls back to the empty summary, which is indistinguishable
  // from "nothing planned" unless the failure is recorded separately. Without
  // this, a broken load looked exactly like a complete plan of zero.
  const [nextSummaryError, setNextSummaryError] = useState(null);

  // The month that just ended, for the grace window. Its own figures, for the
  // same reason next month has its own: the shared period selector has already
  // moved on to the new month, and the plan being filed is about the old one, so
  // writing the current period's totals onto it would record the wrong numbers.
  // Declared above activeSummary for the same dead-zone reason as nextSummary.
  const [prevSummary, setPrevSummary] = useState(emptySummary);
  const [prevSummaryLoading, setPrevSummaryLoading] = useState(false);
  const [prevSummaryError, setPrevSummaryError] = useState(null);

  // Which month the salesman is currently planning. Only ever "next" while the
  // early window is open, or "prev" during the first days of a month; both fall
  // back on their own when the window closes or the month rolls over, so no
  // state can strand someone on a month they can no longer submit.
  const [planTarget, setPlanTarget] = useState("current");
  const planningNextMonth = planTarget === "next" && earlyOpen;
  const planningPrevMonth = planTarget === "prev" && graceOpen;
  const activeMonthKey = planningNextMonth ? nextMonthKey
    : planningPrevMonth ? prevMonthKey
      : currentMonthKey;
  const planSubmission = submissions[activeMonthKey] || null;

  // What the five summary tiles read. While the early-plan switch is on next
  // month, the list below showed next month's plans but the tiles still showed
  // the shared period's — so someone planning October read September's target
  // and coverage above it. The tiles now follow the month on screen.
  //
  // The shared period SELECTOR is deliberately untouched: the dashboards read
  // the same selector, and moving it would drag every other screen into next
  // month. Only this page's choice of data source depends on planTarget.
  const summaryData = planningNextMonth ? nextSummary
    : planningPrevMonth ? prevSummary
      : currentSummary;
  const summaryLoading = planningNextMonth ? nextSummaryLoading
    : planningPrevMonth ? prevSummaryLoading
      : currentSummaryLoading;
  const tilePeriodLabel = planningNextMonth ? monthLabelOf(nextMonthKey)
    : planningPrevMonth ? monthLabelOf(prevMonthKey)
      : periodLabel;

  // Everything below is now ABOUT activeMonthKey rather than about "now".
  const deadlineDay = new Date(`${deadlineFor(activeMonthKey)}T00:00:00`);
  const isLate = isLateFor(activeMonthKey, now);
  // `activeSummary` used to be aliased here for the submit bar's "how much is
  // missing" line. Nothing in the bar reads the summary any more — submission
  // completeness is a question about the PLAN, not about coverage, and the
  // summary is the coverage view (see submitBarNote). The tiles read
  // summaryData directly.

  // ── The submitter's OWN plan, which is what the submit bar is about ────────
  //
  // Deliberately NOT taken from the summary above. That one follows the owner
  // filter and the shared period, so the gate moved with whatever was on screen:
  // with "All Salesmen" selected a supervisor was judged against his whole team's
  // target, and filtered to his own name against his own — the same button,
  // enabled or disabled depending on a dropdown. It is now always his own target
  // for the month being planned, whatever the page is showing.
  //
  // `loaded` matters as much as the numbers: an unloaded fetch is 0 and 0, and
  // 0 >= 0 reads as "complete", which is how a plan was once filed at 0.00
  // against a real pipeline. `failed` is kept apart from a true zero for the same
  // reason.
  const [ownPlan, setOwnPlan] = useState({ target: 0, plannedOpen: 0, loaded: false, failed: false });

  // Bumped by refreshPlanData() whenever this user's plan rows change — see
  // there for the full list of writers. The read below depends on it, so the
  // gate is re-measured after every add, edit, delete, convert and move.
  //
  // Without it the fetch ran once per month key and never again: on 5 October
  // Amer opened October at 410,951 against a 406,000 target, deleted and reduced
  // rows down to 389,451, and the button stayed enabled all the way through
  // because planComplete was still answering a question about the figures the
  // page had loaded with. He submitted, and the row recorded 389,451 — below
  // target, in the current month, which the gate exists to prevent.
  const [planVersion, setPlanVersion] = useState(0);

  // One definition of "this person's own figures for ONE month": the monthly
  // target rows assigned to him, and his own OPEN plan rows dated in that month.
  // The gate below and the pre-submit re-check in handleSubmitPlan both call
  // this, so they cannot measure the same thing two different ways.
  //
  // Deliberately NOT computePlanningPageSummary: that narrows the scope to
  // CONTRIBUTOR_ROLES, so a manager filing his own plan would be judged against
  // a target of 0.
  const readOwnPlanFor = useCallback(async (monthKey) => {
    const bounds = monthBoundsOf(monthKey);
    const [rows, planned] = await Promise.all([
      fetchMonthlyTargets({
        companyId, contributorIds: [user.id], start: bounds.start, end: bounds.end,
      }),
      fetchPlannedOpen({
        companyId, ownerIds: [user.id], start: bounds.start, end: bounds.end, productGroup: null,
      }),
    ]);
    return {
      target: Object.values(targetPerPerson(rows)).reduce((sum, v) => sum + v, 0),
      plannedOpen: planned.total,
      loaded: true,
      failed: !!planned.failed,
    };
  }, [companyId, user?.id]);

  useEffect(() => {
    if (!companyId || !user?.id || !activeMonthKey) {
      setOwnPlan({ target: 0, plannedOpen: 0, loaded: false, failed: false });
      return undefined;
    }
    let alive = true;
    (async () => {
      const next = await readOwnPlanFor(activeMonthKey);
      if (!alive) return;
      setOwnPlan(next);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, user?.id, activeMonthKey, planVersion, readOwnPlanFor]);

  // Complete when the owner has planned at least his own target. Deliberately NOT
  // target ÷ win rate: that is a coverage estimate, and gating on it meant the
  // "Still Unplanned" figure on screen was never the amount that would unlock the
  // button — Amer could plan his target in full and still be refused. Required
  // Plan stays on the row and in the approval queue as the coverage view.
  const planComplete = ownPlan.loaded && !ownPlan.failed
    && ownPlan.plannedOpen >= ownPlan.target;

  // Required Plan is Remaining Target ÷ win rate, and a month that has not
  // started has no invoiced revenue, so its ENTIRE target is still remaining.
  // Requiring full coverage there made early submission unreachable — Amer had
  // to plan another 545,351 SAR before the button would unlock at all. So the
  // next-month path may be submitted under-planned; the shortfall is recorded on
  // the row (total_planned vs required_plan) and shown to the approving manager,
  // rather than the plan being silently accepted as if it were complete.
  // Current-month submission keeps the original rule.
  // Both now measured against the owner's OWN target — the same basis as the gate
  // above, so the shortfall the salesman is shown is exactly the amount that will
  // unlock his button. Taken from ownPlan rather than the summary for the same
  // reason the gate is: the summary follows the owner filter and the shared
  // period, and a shortfall that moves with a dropdown is not actionable.
  //
  // The approval queue still shows its own "short by" from the row's
  // total_planned vs required_plan, which is the coverage view (÷ win rate) and
  // so a larger number. That is the manager's question, not the salesman's.
  const underPlanned = ownPlan.loaded && ownPlan.target > 0
    && ownPlan.plannedOpen < ownPlan.target;
  const plannedShortfall = Math.max(0, ownPlan.target - ownPlan.plannedOpen);

  // ── Whose figures the bar DESCRIBES, which is not whose it gates on ─────────
  //
  // When a lead points the owner filter at a subordinate, the bar is about that
  // person's plan — the opportunity list and the tiles below it already are — so
  // a shortfall read off ownPlan would print the VIEWER's missing amount under
  // the subordinate's name. The alternative was to show no amount at all; a
  // number is the whole reason a lead opens that screen, so it is computed for
  // the viewed owner instead, from the same three calls on the same month.
  //
  // The GATE is untouched: planComplete and canSubmit stay on ownPlan, and
  // canSubmit is false while viewing someone else anyway.
  //
  // Fetched only when actually viewing someone else — otherwise this IS ownPlan,
  // so the ordinary case keeps its two queries.
  const [viewedPlan, setViewedPlan] = useState({ target: 0, plannedOpen: 0, loaded: false, failed: false });
  useEffect(() => {
    if (!isViewingOther || !companyId || !viewedOwnerId || !activeMonthKey) {
      setViewedPlan({ target: 0, plannedOpen: 0, loaded: false, failed: false });
      return undefined;
    }
    let alive = true;
    (async () => {
      const bounds = monthBoundsOf(activeMonthKey);
      const [rows, planned] = await Promise.all([
        fetchMonthlyTargets({
          companyId, contributorIds: [viewedOwnerId], start: bounds.start, end: bounds.end,
        }),
        fetchPlannedOpen({
          companyId, ownerIds: [viewedOwnerId], start: bounds.start, end: bounds.end, productGroup: null,
        }),
      ]);
      if (!alive) return;
      setViewedPlan({
        target: Object.values(targetPerPerson(rows)).reduce((sum, v) => sum + v, 0),
        plannedOpen: planned.total,
        loaded: true,
        failed: !!planned.failed,
      });
    })();
    return () => { alive = false; };
  }, [isViewingOther, companyId, viewedOwnerId, activeMonthKey]);

  const subjectPlan = isViewingOther ? viewedPlan : ownPlan;
  // Identical to plannedShortfall for one's own plan — deliberately written as
  // the same expression on the same two numbers, so the figure the bar prints
  // cannot drift from the figure the gate uses.
  const subjectShortfall = isViewingOther
    ? Math.max(0, viewedPlan.target - viewedPlan.plannedOpen)
    : plannedShortfall;
  const subjectComplete = subjectPlan.loaded && !subjectPlan.failed
    && subjectPlan.plannedOpen >= subjectPlan.target;
  const subjectUnderPlanned = subjectPlan.loaded && subjectPlan.target > 0
    && subjectPlan.plannedOpen < subjectPlan.target;

  // Nobody submits on someone else's behalf: the bar still shows, so a lead can
  // read where that person's plan stands, but the button is not theirs to press.
  // Whether the figures on screen are real yet. An unloaded summary is all
  // zeros, and `planComplete` then reads 0 >= 0 as "complete" — which is how a
  // plan was filed with total_planned 0.00 and required_plan 0.00 while the
  // owner had 386,340 SAR of open pipeline and a 406,000 target. A failed fetch
  // lands on the same zeros, so both are excluded here.
  const activeSummaryError = planningNextMonth ? nextSummaryError
    : planningPrevMonth ? prevSummaryError
      : summaryError;
  const summaryReady = !summaryLoading && !activeSummaryError;

  // The grace window is for a month that is already over and already late, so
  // the completeness bar is not applied to it either — withholding the button
  // from someone trying to file a late plan is what created this gap.
  const canSubmit = summaryReady
    && (planningNextMonth || planningPrevMonth || planComplete)
    && !planSubmission?.is_submitted
    && !isViewingOther;
  // Managers file their own plan too. The bar also appears for a lead who is
  // reading a subordinate's plan, because its whole content is that plan's state.
  const showSubmitBar = (isSalesman || isSupervisor || isManager || isViewingOther) && !!companyId;

  // ── The line under the submit bar's heading ─────────────────────────────────
  //
  // The "how much is missing" figure here used to be activeSummary.plannedGap,
  // which answers a different question than the button does: it is team- and
  // filter-wide, measured against Required Plan (target ÷ win rate) and net of
  // the open funnel, while the button unlocks on the owner's OWN open plan
  // against his OWN target for the month on screen. So a salesman with a big
  // funnel read "Add 0 SAR more to enable submission" beside a disabled button,
  // and a lead with "All Salesmen" selected read his whole team's gap.
  //
  // It is now the figure the gate actually uses — the same target − planned as
  // plannedShortfall — and it names both sides, so it can be checked against the
  // plan listed underneath it.
  //
  // "Add 0 SAR" is no longer reachable: until the fetch lands the numbers are
  // 0 and 0, and those two states now say so instead of quoting a zero.
  const submitBarNote = () => {
    if (planSubmission?.is_submitted) {
      const when = planSubmission.submitted_at
        ? new Date(planSubmission.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "";
      return `Submitted ${when}${planSubmission.is_late ? " (Late)" : ""}`;
    }
    if (!subjectPlan.loaded) {
      return isViewingOther ? "Loading their figures…" : "Loading your figures…";
    }
    if (subjectPlan.failed) {
      return isViewingOther
        ? "Couldn't load their plan figures — refresh to try again."
        : "Couldn't load your plan figures — refresh to try again.";
    }

    const month = monthNameOf(activeMonthKey);

    // Next month and the grace window may both be filed under-planned, so these
    // say what will happen rather than what is being withheld. The old single
    // branch told someone to "enable submission" beside an already-enabled
    // button all through the grace window.
    if (planningNextMonth && subjectUnderPlanned) {
      return `${fmtSAR(subjectShortfall)} SAR under target — you can submit, your manager will see it flagged as under-planned`;
    }
    if (planningPrevMonth && subjectUnderPlanned) {
      return `${fmtSAR(subjectShortfall)} SAR under target — you can still file this late ${month} plan`;
    }
    if (!subjectComplete) {
      const sides = `(target ${fmtSAR(subjectPlan.target)}, planned ${fmtSAR(subjectPlan.plannedOpen)})`;
      return isViewingOther
        ? `Needs ${fmtSAR(subjectShortfall)} SAR more in the ${month} plan before it can be submitted ${sides}`
        : `Add ${fmtSAR(subjectShortfall)} SAR more to your ${month} plan to enable submission ${sides}`;
    }
    return `Due ${deadlineDay.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
  };

  // Every month that can be submitted right now, oldest first. Usually just this
  // month; a second appears during the early window (next month) or the grace
  // window (last month). The two windows cannot overlap — one is the first 3 days
  // of a month, the other the last 7 — but nothing here depends on that.
  const monthOptions = [
    ...(graceOpen ? [{ key: "prev", label: `${monthNameOf(prevMonthKey)} (late)`, month: prevMonthKey }] : []),
    { key: "current", label: monthNameOf(currentMonthKey), month: currentMonthKey },
    ...(earlyOpen ? [{ key: "next", label: `${monthNameOf(nextMonthKey)} (early)`, month: nextMonthKey }] : []),
  ];
  const extraMonthOpen = graceOpen || earlyOpen;

  // The owner scope a submitted plan covers: a salesman's own, a lead's own plus
  // their team, null (whole company) for a director. Deliberately ignores the
  // owner FILTER — what a lead is looking at must not change what they file.
  // A plan is about the person who files it and NOBODY ELSE.
  //
  // This used to scope a supervisor's plan to himself PLUS his whole downline,
  // which double-counted: the Sales Manager assigns a target to every supervisor
  // and salesman directly, and each of them files their own plan against it. So
  // Amer's plan covered Hussein, whose own plan Amer had already approved, and
  // Amer's completeness was judged against 826,000 — his own 406,000 plus two
  // targets belonging to people who plan for themselves.
  //
  // A supervisor's plan now behaves exactly like a salesman's. A director still
  // gets null (whole company); directors do not file plans.
  const resolveSubmitterScope = useCallback(async () => {
    if (DIRECTOR_ROLES.includes(role)) return null;
    return [user?.id].filter(Boolean).length
      ? [user?.id]
      : ["00000000-0000-0000-0000-000000000000"];
  }, [role, user?.id]);

  const handleSubmitPlan = async () => {
    if (!canSubmit || submitting) return;
    // Belt and braces. The summary on screen belongs to whoever is selected, so
    // submitting while pointed at someone else would file the VIEWER's plan
    // carrying the OTHER person's numbers.
    if (isViewingOther) return;
    // The month being submitted is whichever one is on screen — this month, or
    // next month during the early window. Everything on the row is derived from
    // that month, not from today's date: an October plan sent on 24 September
    // carries October's deadline and is not late.
    const planMonth = activeMonthKey;
    setSubmitting(planMonth);
    // Clear any previous failure, so a retry that succeeds does not leave the old
    // error standing next to a plan that is now filed.
    setSubmitError(null);
    setSubmitRefused(false);
    const stamp = new Date();
    try {
      // ── The gate, re-measured against the database, before anything is written
      //
      // canSubmit was decided when the page last read these figures, and a plan
      // can change between that read and this click — by the person's own edits
      // (the refresh below covers those), by a second tab, or by a manager
      // editing a row during review. The write that follows records the plan's
      // CURRENT value, so without this an under-target plan could be filed
      // against a button that was enabled for figures that no longer existed.
      //
      // Only the current month is gated, exactly as planComplete gates it: next
      // month and the grace window may be filed under target by design, and
      // their shortfall is recorded on the row for the approver to see.
      const atClick = await readOwnPlanFor(planMonth);
      setOwnPlan(atClick);          // so the bar and the button follow reality
      const gatedMonth = !planningNextMonth && !planningPrevMonth;
      if (gatedMonth && atClick.loaded && !atClick.failed
          && atClick.plannedOpen < atClick.target) {
        const short = atClick.target - atClick.plannedOpen;
        setSubmitRefused(true);
        setSubmitError(
          `Your plan changed — it is now ${fmtSAR(atClick.plannedOpen)} SAR, below your target of ${fmtSAR(atClick.target)} SAR. `
          + `Add ${fmtSAR(short)} SAR more to submit.`,
        );
        return;
      }
      if (gatedMonth && (!atClick.loaded || atClick.failed)) {
        setSubmitError(
          "Your figures could not be re-read just now, so the plan was not submitted. Please reload and try again.",
        );
        return;
      }

      // Recomputed HERE rather than read from state. Trusting whatever was in
      // state is what recorded a plan of zero, and state can be wrong for more
      // reasons than the load race: it follows the shared period selector, so a
      // supervisor viewing "This Year", or filtered to one salesman, would have
      // filed those figures against a single month's plan.
      //
      // Bounded to the plan's own month and scoped to the submitter's own team,
      // which is what a plan_month row is actually about.
      const bounds = monthBoundsOf(planMonth);
      const ownerIds = await resolveSubmitterScope();
      const fresh = await computePlanningPageSummary({
        companyId, ownerIds, start: bounds.start, end: bounds.end,
        productGroup: null,
      });
      // Never record figures assembled from a partially failed read: a dropped
      // opportunities query returns 0 planned, which is indistinguishable from
      // an empty plan once it is written down.
      if (fresh.partialFailure) {
        alert("Your figures could not be loaded just now, so the plan was not submitted. Please reload and try again.");
        return;
      }
      const summaryForMonth = { ...emptySummary, ...fresh, winRate3m: fresh.winRatePct };

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
        // `flagged` is deliberately NOT written. It is the deadline checker's
        // record that this month was missed, and submitting late does not undo
        // that — this payload used to set it to false, which quietly cleared the
        // flag on exactly the late submissions the grace window now enables.
        // Omitting it leaves an existing flag alone, and a fresh row still gets
        // the column default of false.
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
      // This used to log and stop. The button went back to normal and the user
      // was told nothing, which is indistinguishable from never having clicked —
      // so a salesman whose submit failed had every reason to believe it had
      // worked. Anything in the try can land here: the upsert, the scope lookup,
      // or the summary recompute.
      console.error("Submit plan:", err);
      setSubmitError(err?.message || String(err) || "Unknown error");
    } finally {
      setSubmitting(null);
    }
  };

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
      if (isCurrent()) { setCurrentSummary(emptySummary); setCurrentSummaryLoading(false); }
      return;
    }
    setCurrentSummaryLoading(true);
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

      // A read inside the summary failed, so these numbers are incomplete. Say
      // so instead of presenting them as the plan.
      if (sum.partialFailure) {
        setSummaryError("Some figures could not be loaded. Reload before submitting.");
      }

      setCurrentSummary({
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
        setCurrentSummary(emptySummary);
        setSummaryError(err?.message || "Could not load the summary.");
      }
    } finally {
      if (isCurrent()) setCurrentSummaryLoading(false);
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
      setNextSummaryError(null);
    } catch (err) {
      console.error("Next-month summary:", err);
      setNextSummary(emptySummary);
      setNextSummaryError(err?.message || "Could not load next month's figures.");
    } finally {
      setNextSummaryLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earlyOpen, companyId, user?.id, role, nextMonthKey, filterProductGroup]);

  useEffect(() => { fetchNextMonthSummary(); }, [fetchNextMonthSummary]);

  // Last month's figures, for the grace window. Same chain again, bounded to the
  // month that just ended — so a late plan records that month's planned value
  // and required plan, not the new month's, which is what the shared period
  // selector has already moved on to.
  const fetchPrevMonthSummary = useCallback(async () => {
    if (!graceOpen || !companyId || !user?.id) { setPrevSummary(emptySummary); return; }
    setPrevSummaryLoading(true);
    try {
      const bounds = monthBoundsOf(prevMonthKey);
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
      setPrevSummary({ ...emptySummary, ...sum, winRate3m: sum.winRatePct });
      setPrevSummaryError(null);
    } catch (err) {
      console.error("Previous-month summary:", err);
      setPrevSummary(emptySummary);
      setPrevSummaryError(err?.message || "Could not load last month's figures.");
    } finally {
      setPrevSummaryLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graceOpen, companyId, user?.id, role, prevMonthKey, filterProductGroup]);

  useEffect(() => { fetchPrevMonthSummary(); }, [fetchPrevMonthSummary]);

  // ── "This user's plan rows changed" — ONE callback, every writer calls it ────
  //
  // Everything that reads the plan hangs off this: the tiles for the month on
  // screen, next month's and last month's tiles, and — the reason it exists —
  // ownPlan, which is what the submit gate and the submit bar's shortfall are
  // measured from.
  //
  // It replaces three different arrangements: OpportunitiesModule refreshed the
  // current and next-month summaries, FutureOrdersModule only the current one,
  // and Customer Master's "add to plan" notified nothing at all — so adding a
  // row there left every figure on the page, including the gate, describing a
  // plan that no longer existed.
  const refreshPlanData = useCallback(() => {
    fetchPlanningSummary();
    fetchNextMonthSummary();
    fetchPrevMonthSummary();
    setPlanVersion((v) => v + 1);
  }, [fetchPlanningSummary, fetchNextMonthSummary, fetchPrevMonthSummary]);

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
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {isViewingOther ? `${filterOwnerName || "Team member"}: Plan Locked` : "Plan Locked"}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {/* "Contact your manager" is advice for the plan's owner, not for
                    a lead reading it. */}
                {planSubmission.approved_at
                  ? `Approved ${new Date(planSubmission.approved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.${isViewingOther ? "" : " Contact your manager if changes are needed."}`
                  : `Approved.${isViewingOther ? "" : " Contact your manager if changes are needed."}`}
              </p>
            </div>
          </div>
        )}

        {showSubmitBar && planSubmission?.approval_status === "rejected" && (
          <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
            <span className="text-base">❌</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {isViewingOther ? `${filterOwnerName || "Team member"}: Plan Sent Back` : "Plan Sent Back"}
              </p>
              <p className="text-xs text-amber-700">
                {planSubmission.rejection_reason
                  ? `"${planSubmission.rejection_reason}"${isViewingOther ? " — awaiting their revision." : " — revise your plan and submit again."}`
                  : isViewingOther ? "Awaiting their revision." : "Revise your plan and submit again."}
              </p>
            </div>
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
                  {/* Whose plan this is, whenever it is not the reader's own. */}
                  {isViewingOther && (
                    <span className="text-muted-foreground font-normal">
                      {filterOwnerName || "Team member"}:{" "}
                    </span>
                  )}
                  {planSubmission?.is_submitted
                    ? `✅ ${monthNameOf(activeMonthKey)} Plan Submitted`
                    : isLate
                      ? `🚨 ${monthNameOf(activeMonthKey)} Plan Overdue`
                      : `📋 ${monthNameOf(activeMonthKey)} Plan Due by 25th`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {submitBarNote()}
                </p>
              </div>
            </div>

            {isViewingOther ? (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border whitespace-nowrap">
                read-only — only {filterOwnerName || "the owner"} can submit this
              </span>
            ) : !planSubmission?.is_submitted && (
              <button
                onClick={handleSubmitPlan}
                disabled={!canSubmit || submitting === activeMonthKey}
                className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl transition-colors ${
                  canSubmit
                    ? isLate
                      ? "bg-red-600 text-white hover:bg-red-700"
                      /* Amber, not blue: submitting under target is allowed but
                         is not the same as submitting a complete plan. */
                      : planningNextMonth && underPlanned
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {submitting === activeMonthKey && (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {/* "Plan Incomplete" was shown for three different situations —
                    genuinely under-planned, still loading, and failed to load —
                    and the last two are not the salesman's fault to fix.
                    ownPlan is checked alongside the summary because the gate
                    reads BOTH: with the summary loaded and ownPlan still in
                    flight, the button read "Plan Incomplete" about figures it
                    did not have yet. */}
                {canSubmit
                  ? isLate
                    ? "Submit Late"
                    : planTarget === "next" && earlyOpen
                      ? `Submit ${monthNameOf(activeMonthKey)} Plan`
                      : "Submit Plan"
                  : summaryLoading || !ownPlan.loaded
                    ? "Loading your figures…"
                    : activeSummaryError || ownPlan.failed
                      ? "Figures unavailable — reload"
                      : "Plan Incomplete"}
              </button>
            )}
          </div>
        )}

        {/* A submit that threw. Directly under the submit bar, because that is
            where the person is looking after pressing the button, and it says
            plainly that the plan was NOT filed — the thing the silent catch left
            them to guess. Same styling as the summary error below. */}
        {submitError && (
          <div className="flex items-start gap-2 p-3 mb-3 rounded-xl bg-red-50 border border-red-200">
            <Icon name="AlertCircle" size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700">
                {monthNameOf(activeMonthKey)} plan was NOT submitted
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                {submitRefused
                  ? `${submitError} Nothing was saved.`
                  : `${submitError} — nothing was saved. Try again, and tell your administrator if it keeps failing.`}
              </p>
            </div>
            <button
              onClick={handleSubmitPlan}
              className="ml-auto text-xs px-3 py-1.5 border border-red-300 rounded-lg text-red-700 hover:bg-red-100 transition-colors flex-shrink-0"
            >
              Retry
            </button>
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
              {!summaryLoading && !summaryData.hasTargetRows ? "No target assigned" : tilePeriodLabel}
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
                : `${tilePeriodLabel} planning gap`}
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
              // "Add to plan" here writes an opportunity like any other plan
              // row, so it has to refresh what reads the plan.
              onPlanChange={refreshPlanData}
              filterOwner={filterOwner}
              onFilterOwnerChange={setFilterOwner}
            />
          )}

          {activeTab === "opportunities" && (
            <>
            {/* During the last 7 days of the month both plans are live. The
                switch lives HERE, inside the tab whose contents it changes —
                not up by the period selector, where it was invisible to anyone
                looking at their plan. It gets banner styling because a salesman
                has to notice it without being told it exists. */}
            {showSubmitBar && extraMonthOpen && (
              <div className={`px-4 py-3 mb-4 border rounded-xl ${
                graceOpen
                  ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800"
                  : "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800"
              }`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    {/* Amber, not blue: the grace window is a last chance on a
                        plan that is already late, not an invitation to plan ahead. */}
                    <p className={`text-sm font-semibold ${
                      graceOpen ? "text-amber-900 dark:text-amber-100" : "text-blue-900 dark:text-blue-100"
                    }`}>
                      {graceOpen
                        ? `⏳ ${monthNameOf(prevMonthKey)} can still be submitted`
                        : `🗓️ ${monthNameOf(nextMonthKey)} planning is open`}
                    </p>
                    <p className={`text-xs ${
                      graceOpen ? "text-amber-700 dark:text-amber-300" : "text-blue-700 dark:text-blue-300"
                    }`}>
                      {graceOpen
                        ? `Last ${GRACE_DAYS} days to file it — until ${graceClosesAfter(now).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. It still counts as late.`
                        : "You can plan next month now — pick which month you are working on."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
                    {monthOptions.map((opt) => {
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
                </div>
              </div>
            )}
            <OpportunitiesModule
              adminCompany={adminCompany}
              onOpportunityChange={refreshPlanData}
              // Scoped to next month while that is what is being planned. The
              // SHARED period selector is deliberately not touched — it is the
              // dashboards' period too, and moving it would drag every other
              // screen into next month.
              periodStart={planningNextMonth ? monthBoundsOf(nextMonthKey).start
                : planningPrevMonth ? monthBoundsOf(prevMonthKey).start : rangeStart}
              periodEnd={planningNextMonth ? monthBoundsOf(nextMonthKey).end
                : planningPrevMonth ? monthBoundsOf(prevMonthKey).end : rangeEnd}
              // Which month's lock governs editing here. Without this the module
              // checks the CURRENT month's lock, so an approved September plan
              // would freeze October's planning and an approved October plan
              // would not be protected at all.
              planMonth={activeMonthKey}
              filterOwner={filterOwner}
              onFilterOwnerChange={setFilterOwner}
              // Same rule as the read-only chip and the hidden submit button:
              // somebody else's plan is readable, not editable.
              isViewingOther={isViewingOther}
              filterProductGroup={filterProductGroup}
              onFilterProductGroupChange={setFilterProductGroup}
              productGroups={productGroups}
            />
            </>
          )}

          {activeTab === "future_orders" && (
            <FutureOrdersModule
              adminCompany={adminCompany}
              onGoToOpportunities={() => setActiveTab("opportunities")}
              onOrderChange={refreshPlanData}
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
