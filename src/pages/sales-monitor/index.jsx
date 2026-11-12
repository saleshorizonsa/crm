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
function Card({ title, value, sub, children, onOpen, testid }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={testid}
      className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 hover:shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-w-0"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-1 text-xl font-semibold font-mono text-gray-900 break-words">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-600">{sub}</div>}
      {children && <div className="mt-2 text-xs text-gray-700 space-y-0.5">{children}</div>}
    </button>
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

export default function SalesMonitor() {
  const { user, company, userProfile } = useAuth();
  const role = userProfile?.role;
  const navigate = useNavigate();
  const canPick = MONITOR_PICKER_ROLES.includes(role);

  // ?day=yyyy-MM-dd&division=<id> — how the Insights Visits panel opens this
  // page on the same day and division. Read once, as the starting state.
  const [params] = useSearchParams();
  const linkDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") || "") ? params.get("day") : null;
  const [monthKey, setMonthKey] = useState(linkDay ? linkDay.slice(0, 7) : thisMonthKey());
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

  const openCard = (key) => {
    const node = model?.drills?.[key];
    if (node) setDrill({ ...node, title: node.label, place });
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
  const people = [...model.people].sort((a, b) => {
    const f = SORTS[sort.key] || SORTS.exceptions;
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
            <p className="text-sm text-gray-600">Target → plan → visits → result for {period}{model.division ? ` · ${model.division.name}` : ""}. Click any card to see what is behind it.</p>
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

        {/* ── A. top cards ── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Summary">
          <Card testid="card-target" title="Target" value={money(c.target.total)} sub={c.target.span} onOpen={() => openCard("target")}>
            <Line label="People with a target" value={model.people.filter((p) => p.target > 0).length} />
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
          <Card testid="card-plan-status" title="Plan submission" value={c.planStatus.loaded ? `${c.planStatus.onTime + c.planStatus.late} of ${c.planStatus.people}` : NO_FIGURE} sub="submitted" onOpen={() => openCard("planStatus")}>
            {c.planStatus.loaded ? (
              <>
                <Line label="On time / late" value={`${c.planStatus.onTime} / ${c.planStatus.late}`} />
                <Line label="Not submitted" value={c.planStatus.missing} cls={c.planStatus.missing ? "text-red-700" : ""} />
                <Line label="Approved / rejected" value={`${c.planStatus.approved} / ${c.planStatus.rejected}`} />
              </>
            ) : <p className="text-amber-700">Plan submissions could not be read.</p>}
          </Card>
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
          <Card testid="card-visits" title="Visits" value={`${c.visits.today.count} · ${c.visits.mtd.count}`} sub={`${shortDay(c.visits.day)} · month to date`} onOpen={() => openCard("visits")}>
            <Line label="To planned customers (MTD)" value={fmtPct(c.visits.mtd.inPlanPct, 0)} />
            <Line label="+ / = / −" value={`${c.visits.mtd.responses.positive} / ${c.visits.mtd.responses.neutral} / ${c.visits.mtd.responses.negative}`} />
          </Card>
          <Card testid="card-exceptions" title="Exceptions" value={c.exceptions.total} sub="need a decision" onOpen={() => document.getElementById("monitor-feed")?.scrollIntoView({ behavior: "smooth" })}>
            <Line label="High" value={c.exceptions.high} cls={c.exceptions.high ? "text-red-700" : ""} />
            <Line label="Medium" value={c.exceptions.medium} />
            <Line label="Low" value={c.exceptions.low} />
          </Card>
        </section>

        {/* ── C. scoreboard ── */}
        <section className="bg-white border border-gray-200 rounded-xl" aria-label="Salesman scoreboard">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Salesman scoreboard</h2>
            <p className="text-xs text-gray-600">Exceptions first. Click a column to sort, a row to open the salesman. Submitted plan = the total on the plan as filed; Plan now = its items today (open or a live deal), as % of the submitted required plan, or of an estimate ("est.") where none was submitted. Coverage = (open deals due + open plan) ÷ (target − achieved).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1420px] text-xs" data-testid="monitor-scoreboard">
              <thead className="bg-gray-50">
                <tr>
                  <Th k="name" left>Salesman</Th>
                  <Th>Division</Th>
                  <Th k="target">Target</Th>
                  <Th k="submitted">Submitted plan</Th>
                  <Th k="planned">Plan now (% req.)</Th>
                  <Th>Plan status</Th>
                  <Th k="achieved">Achieved</Th>
                  <Th k="achievedPct">% target</Th>
                  <Th k="fromPlan">From / outside plan</Th>
                  {outcomeLabels.map((l) => <Th key={l} k={OUTCOME_KEY[l]} help={OUTCOME_HELP[l]}>{l}</Th>)}
                  <Th k="wni">Won not invoiced</Th>
                  <Th k="visits">Visits MTD (% planned)</Th>
                  <Th k="lastVisit">Last visit</Th>
                  <Th k="coverage">Coverage</Th>
                  <Th k="exceptions">Exceptions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {people.map((p) => (
                  <tr key={p.id} onClick={() => openPerson(p.id)} className="group cursor-pointer hover:bg-gray-50" data-testid={`score-row-${p.id}`}>
                    <td className="px-2 py-2 sticky left-0 bg-white group-hover:bg-gray-50 font-medium text-gray-900 whitespace-nowrap">{p.name}</td>
                    <td className="px-2 py-2 text-right text-gray-600">{p.division}</td>
                    <td className="px-2 py-2 text-right font-mono">{money(p.target)}</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap" title="total_planned on the plan as filed">{p.submittedPlanned === null ? NO_FIGURE : money(p.submittedPlanned)}</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap" title={p.requiredSource === "submitted" ? `open + live-deal plan items today, as % of the submitted required plan ${money(p.requiredPlan)}` : p.requiredSource === "estimated" ? `open + live-deal plan items today, as % of an ESTIMATED required plan ${money(p.requiredPlan)} (no submitted plan): gap to target ÷ conversion rate` : "open + live-deal plan items today"}>{money(p.planned)} <span className="text-gray-500">({fmtPct(p.plannedPctOfRequired, 0)}{p.requiredSource === "estimated" ? " est." : ""})</span></td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {p.planStatus ? (
                        <span className={p.planStatus.submitted ? (p.planStatus.approval === "rejected" ? "text-red-700" : "text-gray-700") : "text-red-700"}>
                          {p.planStatus.submitted ? `${p.planStatus.timing === "submitted late" ? "late" : "on time"} · ${p.planStatus.approval}` : "missing"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{money(p.achieved)}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtPct(p.achievedPct, 0)}</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{money(p.fromPlan)} / {money(p.outsidePlan)}</td>
                    {outcomeLabels.map((l) => (
                      <td key={l} data-testid={`out-${l}`} className={`px-2 py-2 text-right font-mono ${p.outcomes[l].count ? OUTCOME_STYLE[l] : "text-gray-300"}`} title={`${l}: ${money(p.outcomes[l].value)} planned`}>{p.outcomes[l].count}</td>
                    ))}
                    <td className="px-2 py-2 text-right font-mono">{money(p.wonNotInvoiced)}</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{p.visitsMtd} <span className="text-gray-500">({fmtPct(p.visitsMtdInPlanPct, 0)})</span></td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{shortDay(p.lastVisit)}</td>
                    <td className="px-2 py-2 text-right font-mono">{p.coverageMet ? "met" : p.coverageRatio === null ? NO_FIGURE : `${p.coverageRatio.toFixed(2)}×`}</td>
                    <td className={`px-2 py-2 text-right font-mono ${p.exceptions ? "text-red-700 font-semibold" : "text-gray-400"}`}>{p.exceptions}</td>
                  </tr>
                ))}
                {!people.length && (
                  <tr><td colSpan={14 + outcomeLabels.length} className="px-4 py-8 text-center text-sm text-gray-400">Nobody in this view carries a target.</td></tr>
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
              <p className="text-xs text-gray-600">High first, newest first. Click one to open the record. Won not invoiced counts from {THRESHOLDS.wonNotInvoicedDays} days.</p>
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
            {feed.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => openRecord(e)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-start gap-3">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase ${SEV_STYLE[e.severity]}`}>{e.severity}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-900">{e.title}</span>
                    <span className="block text-xs text-gray-600 break-words">{e.group} · {e.owner} · {e.detail}</span>
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{shortDay(e.date)}</span>
                </button>
              </li>
            ))}
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
        />
      )}
    </div>
  );
}
