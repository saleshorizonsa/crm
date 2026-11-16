import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DailyVisitsList from "components/DailyVisitsList";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import DrillSheet, { money } from "components/DrillSheet";
import { fmtPct, NO_FIGURE } from "utils/formatPct";
import { loadSalesMonitor } from "utils/salesMonitorData";
import {
  computeSalesMonitor,
  personDrill,
  MONITOR_PICKER_ROLES,
  OUTCOME,
  OUTCOME_HELP,
  outcomeLabelsFor,
  DEPARTED_ID,
} from "utils/salesMonitor";
import { THRESHOLDS } from "utils/salesMonitorThresholds";
import { CARD_LINK, stageHref } from "utils/stagePages";
import { exceptionAction, actionTarget } from "utils/exceptionActions";

// SALES MONITOR (/sales-monitor) — session 34, CEO / Director Nader 2026-11-10.
//
// One page to monitor sales and take decisions: target → plan → visits →
// result, and an exception feed. Every card is a micro drill-down through the
// shared DrillSheet: card → division → salesman → customer → the record.
// Every figure is computed in utils/salesMonitor.js from the rows
// utils/salesMonitorData.js reads; this file only lays them out.

const pad = (n) => String(n).padStart(2, "0");
const thisMonthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthTitle = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  return `${MONTH_LONG[m - 1]} ${y}`;
};
const dayTitle = (d) => {
  const [y, m, dd] = String(d).split("-").map(Number);
  return `${dd} ${MONTH_LONG[m - 1].slice(0, 3)} ${y}`;
};
const shortDay = (d) => (d ? dayTitle(d) : "—");

const SEV_STYLE = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
};
const OUTCOME_STYLE = {
  [OUTCOME.achieved]: "text-emerald-700",
  [OUTCOME.bounced]: "text-amber-700",
  [OUTCOME.failed]: "text-red-700",
  [OUTCOME.pending]: "text-gray-600",
};

/** A card that opens its drill. */
function Card({ title, value, sub, children, onOpen, testid, wide = false }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={testid}
      className={`text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 hover:shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-w-0 ${wide ? "w-full sm:flex sm:items-center sm:gap-8" : ""}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-1 text-xl font-semibold font-mono text-gray-900 break-words">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-600">{sub}</div>}
      {children && <div className={wide ? "mt-2 sm:mt-0 text-xs text-gray-700 flex flex-wrap gap-x-6 gap-y-0.5 [&>*]:gap-2" : "mt-2 text-xs text-gray-700 space-y-0.5"}>{children}</div>}
    </button>
  );
}

/**
 * ONE STAGE OF THE SALES PROCESS (session 38, CEO 2026-11-15): a numbered
 * header, an arrow to the next stage (right on a wide screen, down on a phone,
 * where the stages stack in the same order), and that stage's cards.
 */
function Stage({ n, name, testid, arrow = false, children }) {
  return (
    <div data-testid={testid} className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">{n}</span>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">{name}</h2>
        {arrow && (
          <span aria-hidden="true" data-testid={`${testid}-arrow`} className="ml-auto text-gray-400 text-lg leading-none">
            <span className="hidden lg:inline">→</span>
            <span className="lg:hidden">↓</span>
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const Line = ({ label, value, cls = "" }) => (
  <div className="flex justify-between gap-2">
    <span className="text-gray-500">{label}</span>
    <span className={`font-mono ${cls}`}>{value}</span>
  </div>
);

const SORTS = {
  exceptions: (p) => p.exceptions,
  name: (p) => p.name,
  target: (p) => p.target,
  planned: (p) => p.planned,
  submitted: (p) => p.submittedPlanned ?? -1,
  achieved: (p) => p.achieved,
  achievedPct: (p) => p.achievedPct ?? -1,
  fromPlan: (p) => p.fromPlan,
  wni: (p) => p.wonNotInvoiced,
  visits: (p) => p.visitsMtd,
  lastVisit: (p) => p.lastVisit || "",
  outAchieved: (p) => p.outcomes.Achieved.count,
  outBounced: (p) => p.outcomes.Bounced.count,
  outFailed: (p) => p.outcomes.Failed.count,
  outPending: (p) => p.outcomes.Pending.count,
  coverage: (p) => (p.coverageMet ? Infinity : p.coverageRatio ?? -1),
};
// Session 41: the Funnel band's columns sort on the funnel's per-person figures.
const FUNNEL_SORTS = {
  converted: (f) => (f ? f.converted : -1),
  funnelOpen: (f) => (f ? f.openValue : -1),
  stuck: (f) => (f ? f.stuck : -1),
};

export default function SalesMonitor() {
  const { user, company, userProfile } = useAuth();
  const role = userProfile?.role;
  const navigate = useNavigate();
  const canPick = MONITOR_PICKER_ROLES.includes(role);

  // ?day=yyyy-MM-dd&division=<id> — how the Insights Visits panel opens this
  // page on the same day and division. Read once, as the starting state.
  const [params] = useSearchParams();
  const linkDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") || "") ? params.get("day") : null;
  // ?month=yyyy-MM — how a stage page's back link returns (session 39).
  const linkMonth = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : null;
  const [monthKey, setMonthKey] = useState(linkDay ? linkDay.slice(0, 7) : linkMonth || thisMonthKey());
  const [divisionId, setDivisionId] = useState(params.get("division") || "");
  const [visitDay, setVisitDay] = useState(linkDay);
  const firstMonth = React.useRef(true);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drill, setDrill] = useState(null);       // a DrillSheet tree + header
  const [sort, setSort] = useState({ key: "exceptions", dir: "desc" });
  const [sevFilter, setSevFilter] = useState("all");
  const [tip, setTip] = useState(null);           // the open outcome definition (tap)

  const load = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    setLoading(true);
    setError("");
    try {
      setRaw(await loadSalesMonitor({
        companyId: company.id, viewerId: user.id, role, monthKey, now: new Date(),
      }));
    } catch (e) {
      console.error("Sales Monitor load failed:", e);
      setError(e?.message || "Failed to load the Sales Monitor");
    } finally {
      setLoading(false);
    }
  }, [company?.id, user?.id, role, monthKey]);

  useEffect(() => { load(); }, [load]);
  // A new month starts on its default day — but not on mount, where the day
  // may have come from a link.
  useEffect(() => {
    if (firstMonth.current) { firstMonth.current = false; return; }
    setVisitDay(null);
  }, [monthKey]);

  const model = useMemo(
    () => (raw ? computeSalesMonitor(raw, { divisionId: divisionId || null, visitDay }) : null),
    [raw, divisionId, visitDay],
  );

  const period = monthTitle(monthKey);
  const place = model?.division ? [model.division.name] : [];

  // What a click opens: the deal in the pipeline, the plan on Planning, or the
  // salesman's own sheet (a departed owner opens the departed row's sheet).
  const openRecord = (row) => {
    const rec = row?.record || {};
    const dealId = rec.kind === "person" ? null : row?.dealId || rec.dealId;
    const oppId = rec.kind === "person" ? null : row?.oppId || rec.oppId;
    if (dealId) { navigate("/sales-pipeline", { state: { openDealId: dealId } }); return; }
    if (oppId) { navigate("/planning"); return; }
    const pid = rec.personId || row?.personId;
    if (!pid) return;
    const tree = personDrill(model, pid) || personDrill(model, DEPARTED_ID);
    if (tree) setDrill({ ...tree, title: "Salesman", place: [...place, tree.label] });
  };

  // A card opens its stage page on that card's tab (session 39), with the
  // month, division and day kept.
  const openCard = (key) => {
    const link = CARD_LINK[key];
    if (!link) return;
    navigate(stageHref(link.stage, {
      month: monthKey, division: divisionId, day: visitDay, view: link.view, tab: link.tab || null,
    }));
  };
  // An exception's clearing action, where its screen exists.
  const runAction = (e, a) => {
    if (a.to === "person") { openPerson(e.ownerId); return; }
    const t = actionTarget(a.to, e);
    if (t) navigate({ pathname: t.path, hash: t.hash || "" }, t.state ? { state: t.state } : undefined);
  };

  const openPerson = (id) => {
    const tree = personDrill(model, id);
    if (tree) setDrill({ ...tree, title: "Salesman", place: [...place, tree.label] });
  };

  // ── guards ──
  if (loading && !raw) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">Loading the Sales Monitor…</p>
          </div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-sm font-semibold text-red-700 mb-2">The Sales Monitor could not load</p>
          <p className="text-xs text-gray-500 font-mono mb-5">{error}</p>
          <button type="button" onClick={load} className="text-xs border border-gray-300 rounded-lg px-4 py-2 hover:bg-white">Retry</button>
        </div>
      </div>
    );
  }
  if (!model) return null;

  const c = model.cards;
  const funnelOf = (p) => model.funnel?.perPerson?.[p.id] || null;
  const people = [...model.people].sort((a, b) => {
    const f = FUNNEL_SORTS[sort.key] ? (q) => FUNNEL_SORTS[sort.key](funnelOf(q)) : SORTS[sort.key] || SORTS.exceptions;
    const x = f(a); const y = f(b);
    const less = x < y ? -1 : x > y ? 1 : 0;
    const primary = sort.dir === "asc" ? less : -less;
    return primary || a.name.localeCompare(b.name);
  });
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const Th = ({ k, children, left = false, help = null }) => (
    <th scope="col" title={help || undefined} className={`relative px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200 align-bottom ${left ? "text-left sticky left-0 bg-gray-50 z-10" : "text-right"}`}>
      {k ? (
        <button type="button" onClick={() => toggleSort(k)} title={help || undefined} className="uppercase tracking-wide hover:text-gray-800">
          {children}{sort.key === k ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
        </button>
      ) : children}
      {help && (
        <>
          {/* Tap target for touch screens, where a hover title never shows. */}
          <button
            type="button"
            aria-label={`What ${children} means`}
            aria-expanded={tip === k}
            data-testid={`help-${k}`}
            onClick={(e) => { e.stopPropagation(); setTip(tip === k ? null : k); }}
            className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[9px] normal-case text-gray-500 hover:bg-gray-100"
          >
            i
          </button>
          {tip === k && (
            <span role="tooltip" data-testid={`tip-${k}`} className="absolute right-0 top-full mt-1 z-30 w-48 normal-case tracking-normal font-normal text-[11px] text-left text-gray-800 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1.5">
              {help}
            </span>
          )}
        </>
      )}
    </th>
  );
  const outcomeLabels = outcomeLabelsFor(model.closed);
  const OUTCOME_KEY = { Achieved: "outAchieved", Bounced: "outBounced", Failed: "outFailed", Pending: "outPending" };

  const feed = model.exceptions.filter((e) => sevFilter === "all" || e.severity === sevFilter);
  const maxDay = model.isCurrent ? model.today : model.monthEnd;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── title + pickers ── */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Sales Monitor</h1>
            <p className="text-sm text-gray-600">Target → plan → funnel → visits → result for {period}{model.division ? ` · ${model.division.name}` : ""}. Click any card to open its stage page.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-xs text-gray-600">
              <span className="block mb-1">Month</span>
              <input
                type="month"
                data-testid="monitor-month"
                value={monthKey}
                max={thisMonthKey(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1))}
                onChange={(e) => e.target.value && setMonthKey(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
              />
            </label>
            {canPick && (
              <label className="text-xs text-gray-600">
                <span className="block mb-1">Division</span>
                <select
                  data-testid="monitor-division"
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">All divisions</option>
                  {model.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>

        {!canPick && model.division && (
          <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2" data-testid="monitor-division-chip">
            Showing division {model.division.name} only.
            <button type="button" onClick={() => setDivisionId("")} className="underline">Show all</button>
          </div>
        )}

        {model.notes.length > 0 && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5" data-testid="monitor-notes">
            {model.notes.map((n) => <p key={n}>{n}</p>)}
          </div>
        )}

        {/* ── A. THE SALES PROCESS (session 38, CEO 2026-11-15) ──
            Target → Planned → Funnel → Visits → Achieved (Funnel: session 41),
            each card under its stage.
            The cards are the ones this page always had, moved, not changed. */}
        <section aria-label="Sales process" data-testid="monitor-stages" className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Stage n={1} name="Target" testid="stage-target" arrow>
            <Card testid="card-target" title="Target" value={money(c.target.total)} sub={c.target.span} onOpen={() => openCard("target")}>
              <Line label="People with a target" value={model.people.filter((p) => p.target > 0).length} />
            </Card>
          </Stage>
          <Stage n={2} name="Planned" testid="stage-planned" arrow>
            <Card testid="card-plan-status" title="Plan submission" value={c.planStatus.loaded ? `${c.planStatus.onTime + c.planStatus.late} of ${c.planStatus.people}` : NO_FIGURE} sub="submitted" onOpen={() => openCard("planStatus")}>
              {c.planStatus.loaded ? (
                <>
                  <Line label="On time / late" value={`${c.planStatus.onTime} / ${c.planStatus.late}`} />
                  <Line label="Not submitted" value={c.planStatus.missing} cls={c.planStatus.missing ? "text-red-700" : ""} />
                  <Line label="Approved / rejected" value={`${c.planStatus.approved} / ${c.planStatus.rejected}`} />
                </>
              ) : <p className="text-amber-700">Plan submissions could not be read.</p>}
            </Card>
            <Card testid="card-planned" title="Planned" value={`${c.planned.submitted === null ? NO_FIGURE : money(c.planned.submitted)} · ${money(c.planned.total)}`} sub="submitted · plan now" onOpen={() => openCard("planned")}>
              <Line label={`Submitted (${c.planned.submittedPeople} of ${c.planned.planHolders} plans)`} value={c.planned.submitted === null ? NO_FIGURE : money(c.planned.submitted)} />
              <Line label="Plan now (open + live deal)" value={money(c.planned.total)} />
              <Line label="Plan now, % of target" value={fmtPct(c.planned.pctOfTarget, 0)} />
              {c.planned.required ? (
                <>
                  <div data-testid="required-submitted">
                    <Line label={`Required, from ${c.planned.required.submitted.count} submitted plan${c.planned.required.submitted.count === 1 ? "" : "s"}`} value={money(c.planned.required.submitted.required)} />
                    <Line label="… their plan now, % of it" value={fmtPct(c.planned.required.submitted.pct, 0)} />
                  </div>
                  {c.planned.required.estimated.count > 0 && (
                    <div data-testid="required-estimated">
                      <Line label={`Required (estimated for ${c.planned.required.estimated.count} not submitted)`} value={money(c.planned.required.estimated.required)} />
                      <Line label="… their plan now, % of it" value={fmtPct(c.planned.required.estimated.pct, 0)} />
                    </div>
                  )}
                </>
              ) : <Line label="Required" value={NO_FIGURE} />}
              <p className="text-[11px] text-gray-500 pt-1" data-testid="planned-explain">Submitted = the total on each plan when it was filed. Plan now = the month's plan items today that are still open or became a live deal. Required from submitted plans = each plan's own required plan, as filed. Estimated = for each person with no submitted plan, today's gap to target ÷ their conversion rate.</p>
              <p className="text-[11px] text-gray-500" data-testid="company-required">Insights' company required pipeline, for comparison only: {money(c.planned.companyRequired.value)} = (target {money(c.planned.companyRequired.target)} − achieved {money(c.planned.companyRequired.achieved)}) ÷ {fmtPct(c.planned.companyRequired.winRatePct, 1)} conversion.</p>
            </Card>
          </Stage>
          <Stage n={3} name="Funnel" testid="stage-funnel" arrow>
            {(() => {
              const F = model.funnel.cards;
              return (
                <>
                  <Card testid="card-funnel-plan" title="Plan → deal" value={`${F.plan.converted.count} of ${F.plan.total.count}`} sub={`converted · ${fmtPct(F.plan.convertedPct, 0)} of items, ${fmtPct(F.plan.convertedValuePct, 0)} of value`} onOpen={() => openCard("funnelPlan")}>
                    <Line label="Converted" value={money(F.plan.converted.value)} />
                    <Line label="Not started (still open)" value={`${F.plan.notStarted.count} · ${money(F.plan.notStarted.value)}`} cls={F.plan.notStarted.count ? "text-red-700" : ""} />
                    <Line label="Moved to later months" value={`${F.plan.moved.count} · ${money(F.plan.moved.value)}`} />
                    {F.plan.other.count > 0 && <Line label="Other" value={`${F.plan.other.count} · ${money(F.plan.other.value)}`} />}
                  </Card>
                  <Card testid="card-funnel-stages" title="Deals by stage" value={money(F.stages.total)} sub="open funnel, as Insights" onOpen={() => openCard("funnelStages")}>
                    {F.stages.byStage.map((x) => <Line key={x.stage} label={x.label} value={`${x.count} · ${money(x.value)}`} />)}
                    <Line label="… of which undated" value={`${F.stages.undated.count} · ${money(F.stages.undated.value)}`} />
                    <Line label="All dates (any close date)" value={money(F.stages.allDates.total)} />
                  </Card>
                  <Card testid="card-funnel-moves" title="Movement" value={F.movement.loaded ? `${F.movement.week.forward} ↑ · ${F.movement.week.back} ↓` : NO_FIGURE} sub={`forward · back, 7 days to ${shortDay(F.movement.day)}`} onOpen={() => openCard("funnelMoves")}>
                    {F.movement.loaded ? (
                      <>
                        <Line label="7 days: won / lost / new leads" value={`${F.movement.week.won} / ${F.movement.week.lost} / ${F.movement.week.new}`} />
                        <Line label="Month to date: forward / back" value={`${F.movement.mtd.forward} / ${F.movement.mtd.back}`} />
                        <Line label="Month to date: won / lost / new leads" value={`${F.movement.mtd.won} / ${F.movement.mtd.lost} / ${F.movement.mtd.new}`} />
                      </>
                    ) : <p className="text-amber-700">Deal stage history could not be read.</p>}
                  </Card>
                  <Card testid="card-funnel-stuck" title="Stuck and overdue" value={`${F.stuck.stuck.count} · ${F.stuck.overdue.count}`} sub={`stuck ${THRESHOLDS.stuckDays}+ days · past close date`} onOpen={() => openCard("funnelStuck")}>
                    <Line label="Stuck, value" value={money(F.stuck.stuck.value)} cls={F.stuck.stuck.count ? "text-red-700" : ""} />
                    <Line label="Past close date, value" value={money(F.stuck.overdue.value)} cls={F.stuck.overdue.count ? "text-red-700" : ""} />
                    <Line label="Auto-moved to Future Orders this month" value={F.stuck.autoMoved.loaded ? `${F.stuck.autoMoved.count} · ${money(F.stuck.autoMoved.value)}` : NO_FIGURE} />
                    <Line label={`Due to auto-move within ${THRESHOLDS.autoMoveSoonDays} day`} value={F.stuck.dueSoon.count} />
                  </Card>
                </>
              );
            })()}
          </Stage>
          <Stage n={4} name="Visits" testid="stage-visits" arrow>
            <Card testid="card-visits" title="Visits" value={`${c.visits.today.count} · ${c.visits.mtd.count}`} sub={`${shortDay(c.visits.day)} · month to date`} onOpen={() => openCard("visits")}>
              <Line label="To planned customers (MTD)" value={fmtPct(c.visits.mtd.inPlanPct, 0)} />
              <Line label="+ / = / −" value={`${c.visits.mtd.responses.positive} / ${c.visits.mtd.responses.neutral} / ${c.visits.mtd.responses.negative}`} />
            </Card>
            <Card testid="card-planned-visited" title="Planned customers visited" value={`${c.visits.plannedVisited} of ${c.visits.plannedCustomers}`} sub="month to date" onOpen={() => openCard("plannedVisited")}>
              <Line label="Visited" value={c.visits.plannedVisited} />
              <Line label="Not visited" value={c.visits.plannedCustomers - c.visits.plannedVisited} cls={c.visits.plannedCustomers - c.visits.plannedVisited ? "text-red-700" : ""} />
            </Card>
          </Stage>
          <Stage n={5} name="Achieved" testid="stage-achieved">
            <Card testid="card-achieved" title="Achieved" value={money(c.achieved.total)} sub={`${fmtPct(c.achieved.pctOfTarget, 0)} of target`} onOpen={() => openCard("achieved")}>
              {c.achieved.isCurrent
                ? <Line label="Month elapsed" value={fmtPct(c.achieved.elapsedPct, 0)} cls={c.achieved.pacingOk ? "text-emerald-700" : "text-red-700"} />
                : <Line label="Month closed" value="—" />}
              {c.achieved.returns > 0 && <Line label="Returns" value={`−${money(c.achieved.returns)}`} />}
            </Card>
            <Card testid="card-from-plan" title="From plan vs outside plan" value={money(c.fromPlan.fromPlan)} sub={`from this month's plan · ${fmtPct(c.fromPlan.fromPlanPct, 0)} of invoiced`} onOpen={() => openCard("fromPlan")}>
              <Line label="Outside plan" value={money(c.fromPlan.outsidePlan)} />
              {c.fromPlan.returns > 0 && <Line label="Returns" value={`−${money(c.fromPlan.returns)}`} />}
            </Card>
            <Card testid="card-outcomes" title="Plan outcomes" value={`${c.outcomes.total.count} items`} sub={`achieved from plan ${fmtPct(c.outcomes.achievedFromPlanPct, 0)}`} onOpen={() => openCard("outcomes")}>
              {outcomeLabels.map((l) => (
                <div key={l} title={OUTCOME_HELP[l]}>
                  <Line label={l} value={`${c.outcomes[l].count} · ${money(c.outcomes[l].value)}`} cls={OUTCOME_STYLE[l]} />
                </div>
              ))}
              <p className="text-[11px] text-gray-500 pt-1" data-testid="outcomes-explain">
                {outcomeLabels.map((l) => `${l}: ${OUTCOME_HELP[l].toLowerCase()}`).join(" · ")}.
              </p>
            </Card>
          </Stage>
        </section>

        {/* Under the four stages: Exceptions, full width. */}
        <section aria-label="Exceptions summary">
          <Card wide testid="card-exceptions" title="Exceptions" value={c.exceptions.total} sub="need a decision" onOpen={() => openCard("exceptions")}>
            <Line label="High" value={c.exceptions.high} cls={c.exceptions.high ? "text-red-700" : ""} />
            <Line label="Medium" value={c.exceptions.medium} />
            <Line label="Low" value={c.exceptions.low} />
          </Card>
        </section>

        {/* ── C. scoreboard ── */}
        <section className="bg-white border border-gray-200 rounded-xl" aria-label="Salesman scoreboard">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Salesman scoreboard</h2>
            <p className="text-xs text-gray-600">Columns follow the process: target, plan, funnel, visits, achieved. Exceptions first. Click a column to sort, a row to open the salesman. Submitted plan = the total on the plan as filed; Plan now = its items today (open or a live deal), as % of the submitted required plan, or of an estimate ("est.") where none was submitted. Coverage = (open deals due + open plan) ÷ (target − achieved).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1640px] text-xs" data-testid="monitor-scoreboard">
              <thead className="bg-gray-50">
                <tr data-testid="scoreboard-bands">
                  <th scope="colgroup" colSpan={2} data-testid="band-who" className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-700 text-center border-b border-gray-200 sticky left-0 bg-gray-50 z-10"></th>
                  <th scope="colgroup" colSpan={1} data-testid="band-target" className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-700 text-center border-b border-gray-200 border-l border-gray-200">Target</th>
                  <th scope="colgroup" colSpan={4} data-testid="band-planned" className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-700 text-center border-b border-gray-200 border-l border-gray-200">Planned</th>
                  <th scope="colgroup" colSpan={3} data-testid="band-funnel" className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-700 text-center border-b border-gray-200 border-l border-gray-200">Funnel</th>
                  <th scope="colgroup" colSpan={2} data-testid="band-visits" className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-700 text-center border-b border-gray-200 border-l border-gray-200">Visits</th>
                  <th scope="colgroup" colSpan={4 + outcomeLabels.length} data-testid="band-achieved" className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-700 text-center border-b border-gray-200 border-l border-gray-200">Achieved</th>
                  <th scope="colgroup" colSpan={1} data-testid="band-who" className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-700 text-center border-b border-gray-200 border-l border-gray-200"></th>
                </tr>
                <tr>
                  <Th k="name" left>Salesman</Th>
                  <Th>Division</Th>
                  <Th k="target">Target</Th>
                  <Th>Plan status</Th>
                  <Th k="submitted">Submitted plan</Th>
                  <Th k="planned">Plan now (% req.)</Th>
                  <Th k="coverage">Coverage</Th>
                  <Th k="converted" help="Plan items of the month converted into a deal, of all the month's plan items">Converted</Th>
                  <Th k="funnelOpen" help="Open funnel, as Insights: open deals due this month or undated">Open deals</Th>
                  <Th k="stuck" help={`Open deals with no stage change for ${THRESHOLDS.stuckDays} days or more`}>Stuck</Th>
                  <Th k="visits">Visits MTD (% planned)</Th>
                  <Th k="lastVisit">Last visit</Th>
                  <Th k="achieved">Achieved</Th>
                  <Th k="achievedPct">% target</Th>
                  <Th k="fromPlan">From / outside plan</Th>
                  {outcomeLabels.map((l) => <Th key={l} k={OUTCOME_KEY[l]} help={OUTCOME_HELP[l]}>{l}</Th>)}
                  <Th k="wni">Won not invoiced</Th>
                  <Th k="exceptions">Exceptions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {people.map((p) => (
                  <tr key={p.id} onClick={() => openPerson(p.id)} className="group cursor-pointer hover:bg-gray-50" data-testid={`score-row-${p.id}`}>
                    <td className="px-2 py-2 sticky left-0 bg-white group-hover:bg-gray-50 font-medium text-gray-900 whitespace-nowrap">{p.name}</td>
                    <td className="px-2 py-2 text-right text-gray-600">{p.division}</td>
                    <td className="px-2 py-2 text-right font-mono">{money(p.target)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {p.planStatus ? (
                        <span className={p.planStatus.submitted ? (p.planStatus.approval === "rejected" ? "text-red-700" : "text-gray-700") : "text-red-700"}>
                          {p.planStatus.submitted ? `${p.planStatus.timing === "submitted late" ? "late" : "on time"} · ${p.planStatus.approval}` : p.planStatus.approval === "rejected" ? "rejected" : "missing"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap" title="total_planned on the plan as filed">{p.submittedPlanned === null ? NO_FIGURE : money(p.submittedPlanned)}</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap" title={p.requiredSource === "submitted" ? `open + live-deal plan items today, as % of the submitted required plan ${money(p.requiredPlan)}` : p.requiredSource === "estimated" ? `open + live-deal plan items today, as % of an ESTIMATED required plan ${money(p.requiredPlan)} (no submitted plan): gap to target ÷ conversion rate` : "open + live-deal plan items today"}>{money(p.planned)} <span className="text-gray-500">({fmtPct(p.plannedPctOfRequired, 0)}{p.requiredSource === "estimated" ? " est." : ""})</span></td>
                    <td className="px-2 py-2 text-right font-mono">{p.coverageMet ? "met" : p.coverageRatio === null ? NO_FIGURE : `${p.coverageRatio.toFixed(2)}×`}</td>
                    <td data-testid="fn-converted" className="px-2 py-2 text-right font-mono whitespace-nowrap">{funnelOf(p) ? `${funnelOf(p).converted} of ${funnelOf(p).items}` : NO_FIGURE}</td>
                    <td data-testid="fn-open" className="px-2 py-2 text-right font-mono">{funnelOf(p) ? money(funnelOf(p).openValue) : NO_FIGURE}</td>
                    <td data-testid="fn-stuck" className={`px-2 py-2 text-right font-mono ${funnelOf(p)?.stuck ? "text-red-700" : "text-gray-400"}`}>{funnelOf(p) ? funnelOf(p).stuck : NO_FIGURE}</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{p.visitsMtd} <span className="text-gray-500">({fmtPct(p.visitsMtdInPlanPct, 0)})</span></td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{shortDay(p.lastVisit)}</td>
                    <td className="px-2 py-2 text-right font-mono">{money(p.achieved)}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtPct(p.achievedPct, 0)}</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{money(p.fromPlan)} / {money(p.outsidePlan)}</td>
                    {outcomeLabels.map((l) => (
                      <td key={l} data-testid={`out-${l}`} className={`px-2 py-2 text-right font-mono ${p.outcomes[l].count ? OUTCOME_STYLE[l] : "text-gray-300"}`} title={`${l}: ${money(p.outcomes[l].value)} planned`}>{p.outcomes[l].count}</td>
                    ))}
                    <td className="px-2 py-2 text-right font-mono">{money(p.wonNotInvoiced)}</td>
                    <td className={`px-2 py-2 text-right font-mono ${p.exceptions ? "text-red-700 font-semibold" : "text-gray-400"}`}>{p.exceptions}</td>
                  </tr>
                ))}
                {!people.length && (
                  <tr><td colSpan={17 + outcomeLabels.length} className="px-4 py-8 text-center text-sm text-gray-400">Nobody in this view carries a target.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── D. daily visits ── */}
        <section className="bg-white border border-gray-200 rounded-xl" aria-label="Daily visits">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Visits, calls and WhatsApps — {shortDay(model.day)}</h2>
              <p className="text-xs text-gray-600">"In plan" = the customer has an open or converted plan item of this salesman this month.</p>
            </div>
            <label className="text-xs text-gray-600">
              <span className="block mb-1">Day</span>
              <input
                type="date"
                data-testid="monitor-day"
                value={model.day}
                min={model.monthStart}
                max={maxDay}
                onChange={(e) => e.target.value && setVisitDay(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
              />
            </label>
          </div>
          <div className="p-4 space-y-4">
            <DailyVisitsList model={model} onOpenPerson={openPerson} />

            {/* month to date */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Month to date — contacts per salesman per day</h3>
              <div className="overflow-x-auto mt-1">
                <table className="text-[11px] font-mono" data-testid="monitor-grid">
                  <thead>
                    <tr>
                      <th className="text-left pr-3 font-sans font-semibold text-gray-500 sticky left-0 bg-white">Salesman</th>
                      {model.grid.days.map((d) => <th key={d} className="px-1 text-gray-400 font-normal">{Number(d.slice(8))}</th>)}
                      <th className="px-2 text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.grid.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="pr-3 font-sans text-gray-800 whitespace-nowrap sticky left-0 bg-white">{r.name}</td>
                        {r.days.map((n, i) => (
                          <td key={model.grid.days[i]} className={`px-1 text-center ${n ? "text-gray-900 bg-blue-50" : "text-gray-300"}`}>{n || "·"}</td>
                        ))}
                        <td className="px-2 text-right font-semibold">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-700 mt-2">
                Planned customers contacted this month: <span className="font-semibold">{c.visits.plannedVisited} of {c.visits.plannedCustomers}</span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs mt-1" data-testid="monitor-plan-customers">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-gray-500">
                      <th className="text-left py-1">Customer</th><th className="text-left">Salesman</th><th className="text-right">Planned</th>
                      <th className="text-right">Contacts MTD</th><th className="text-right">Last contact</th><th className="text-right">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...model.planCustomerRows].sort((a, b) => Number(a.visited) - Number(b.visited) || b.planned - a.planned).map((g) => (
                      <tr key={g.key} className={g.visited ? "" : "bg-red-50/40"}>
                        <td className="py-1">{g.customer}</td>
                        <td>{g.person}</td>
                        <td className="text-right font-mono">{money(g.planned)}</td>
                        <td className={`text-right font-mono ${g.visited ? "" : "text-red-700"}`}>{g.contactsMtd}</td>
                        <td className="text-right">{shortDay(g.lastContact)}</td>
                        <td className="text-right">{g.outcome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ── E. exception feed ── */}
        <section id="monitor-feed" className="bg-white border border-gray-200 rounded-xl" aria-label="Exception feed">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Exceptions</h2>
              <p className="text-xs text-gray-600">High first, newest first. Click one to open the record; each says what clears it. Won not invoiced counts from {THRESHOLDS.wonNotInvoicedDays} days.</p>
            </div>
            <div className="flex gap-1" role="group" aria-label="Severity">
              {["all", "high", "medium", "low"].map((s) => (
                <button key={s} type="button" onClick={() => setSevFilter(s)} data-testid={`sev-${s}`}
                  className={`text-xs px-2.5 py-1 rounded border ${sevFilter === s ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 hover:bg-gray-50"}`}>
                  {s === "all" ? `All ${c.exceptions.total}` : `${s[0].toUpperCase()}${s.slice(1)} ${c.exceptions[s]}`}
                </button>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-gray-100" data-testid="monitor-feed-list">
            {feed.map((e) => {
              // What clears it, in one line, and a button where its screen exists (session 39).
              const act = exceptionAction(e, { monthStart: model.monthStart });
              return (
                <li key={e.id} className="flex flex-col sm:flex-row sm:items-start hover:bg-gray-50">
                  <button type="button" onClick={() => openRecord(e)} className="flex-1 min-w-0 text-left px-4 py-2.5 flex items-start gap-3">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase ${SEV_STYLE[e.severity]}`}>{e.severity}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-900">{e.title}</span>
                      <span className="block text-xs text-gray-600 break-words">{e.group} · {e.owner} · {e.detail}</span>
                      <span className="block text-xs text-blue-800 mt-0.5" data-testid="feed-action">To clear it: {act.text}</span>
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{shortDay(e.date)}</span>
                  </button>
                  {act.to && (
                    <button type="button" data-testid="feed-action-button" onClick={() => runAction(e, act)}
                      className="mx-4 mb-2 sm:my-2.5 sm:ml-0 self-start text-[11px] px-2 py-0.5 rounded border border-blue-300 text-blue-800 hover:bg-blue-50 whitespace-nowrap">
                      {act.button}
                    </button>
                  )}
                </li>
              );
            })}
            {!feed.length && <li className="px-4 py-8 text-center text-sm text-gray-400">No exceptions.</li>}
          </ul>
        </section>
      </main>

      {drill && (
        <DrillSheet
          label={drill.label}
          title={drill.title || drill.label}
          period={period}
          place={drill.place || []}
          explain={drill.explain || null}
          total={drill.total}
          unit={drill.unit || "SAR"}
          columns={drill.columns || []}
          groupLabels={drill.groupLabels || []}
          rows={drill.rows || null}
          onOpenRecord={(r) => openRecord(r)}
          onClose={() => setDrill(null)}
          scopeLabel={model.division?.name || "company"}
          children={drill.children || null}
          tabs={drill.tabs || null}
          initialSelection={drill.initialSelection || null}
          exportInfo={drill.tabs ? { prefix: "Sales Monitor", card: drill.card || drill.label, period } : null}
        />
      )}
    </div>
  );
}
