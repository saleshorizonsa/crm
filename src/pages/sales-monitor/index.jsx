import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  OUTCOME_ORDER,
  DEPARTED_ID,
  NO_CUSTOMER,
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
  achieved: (p) => p.achieved,
  achievedPct: (p) => p.achievedPct ?? -1,
  fromPlan: (p) => p.fromPlan,
  wni: (p) => p.wonNotInvoiced,
  visits: (p) => p.visitsMtd,
  lastVisit: (p) => p.lastVisit || "",
  coverage: (p) => (p.coverageMet ? Infinity : p.coverageRatio ?? -1),
};

export default function SalesMonitor() {
  const { user, company, userProfile } = useAuth();
  const role = userProfile?.role;
  const navigate = useNavigate();
  const canPick = MONITOR_PICKER_ROLES.includes(role);

  const [monthKey, setMonthKey] = useState(thisMonthKey());
  const [divisionId, setDivisionId] = useState("");
  const [visitDay, setVisitDay] = useState(null);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drill, setDrill] = useState(null);       // a DrillSheet tree + header
  const [sort, setSort] = useState({ key: "exceptions", dir: "desc" });
  const [sevFilter, setSevFilter] = useState("all");

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
  useEffect(() => { setVisitDay(null); }, [monthKey]);

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
  const Th = ({ k, children, left = false }) => (
    <th scope="col" className={`px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200 align-bottom ${left ? "text-left sticky left-0 bg-gray-50 z-10" : "text-right"}`}>
      {k ? (
        <button type="button" onClick={() => toggleSort(k)} className="uppercase tracking-wide hover:text-gray-800">
          {children}{sort.key === k ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
        </button>
      ) : children}
    </th>
  );

  const byPerson = new Map();
  model.dayContacts.forEach((r) => {
    if (!byPerson.has(r.ownerId)) byPerson.set(r.ownerId, []);
    byPerson.get(r.ownerId).push(r);
  });
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
          <Card testid="card-planned" title="Planned" value={money(c.planned.total)} sub="open + became a live deal" onOpen={() => openCard("planned")}>
            <Line label="% of target" value={fmtPct(c.planned.pctOfTarget, 0)} />
            <Line label={`% of required (${money(c.planned.requiredPlan)})`} value={fmtPct(c.planned.pctOfRequired, 0)} />
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
            {OUTCOME_ORDER.map((l) => (
              <Line key={l} label={l} value={`${c.outcomes[l].count} · ${money(c.outcomes[l].value)}`} cls={OUTCOME_STYLE[l]} />
            ))}
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
            <p className="text-xs text-gray-600">Exceptions first. Click a column to sort, a row to open the salesman. Coverage = (open deals due + open plan) ÷ (target − achieved).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-xs" data-testid="monitor-scoreboard">
              <thead className="bg-gray-50">
                <tr>
                  <Th k="name" left>Salesman</Th>
                  <Th>Division</Th>
                  <Th k="target">Target</Th>
                  <Th k="planned">Planned (% req.)</Th>
                  <Th>Plan status</Th>
                  <Th k="achieved">Achieved</Th>
                  <Th k="achievedPct">% target</Th>
                  <Th k="fromPlan">From / outside plan</Th>
                  <Th>A / B / F / P</Th>
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
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{money(p.planned)} <span className="text-gray-500">({fmtPct(p.plannedPctOfRequired, 0)})</span></td>
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
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                      {OUTCOME_ORDER.map((l, i) => (
                        <span key={l} className={OUTCOME_STYLE[l]} title={`${l}: ${money(p.outcomes[l].value)}`}>{i ? " / " : ""}{p.outcomes[l].count}</span>
                      ))}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{money(p.wonNotInvoiced)}</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{p.visitsMtd} <span className="text-gray-500">({fmtPct(p.visitsMtdInPlanPct, 0)})</span></td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{shortDay(p.lastVisit)}</td>
                    <td className="px-2 py-2 text-right font-mono">{p.coverageMet ? "met" : p.coverageRatio === null ? NO_FIGURE : `${p.coverageRatio.toFixed(2)}×`}</td>
                    <td className={`px-2 py-2 text-right font-mono ${p.exceptions ? "text-red-700 font-semibold" : "text-gray-400"}`}>{p.exceptions}</td>
                  </tr>
                ))}
                {!people.length && (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-sm text-gray-400">Nobody in this view carries a target.</td></tr>
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
            {[...byPerson.entries()].sort((a, b) => model.people.find((p) => p.id === a[0])?.name?.localeCompare(model.people.find((p) => p.id === b[0])?.name || "") || 0).map(([pid, rows]) => (
              <div key={pid} data-testid={`day-person-${pid}`}>
                <h3 className="text-sm font-semibold text-gray-800">{rows[0].person} <span className="font-normal text-gray-500">· {rows.length}</span></h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-xs mt-1">
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((r) => (
                        <tr key={r.id} onClick={() => r.dealId && openRecord({ dealId: r.dealId })} className={r.dealId ? "cursor-pointer hover:bg-gray-50" : ""}>
                          <td className="py-1.5 pr-2 font-mono text-gray-500 w-12">{r.time || "—"}</td>
                          <td className="py-1.5 pr-2 w-20">{r.kindLabel}</td>
                          <td className={`py-1.5 pr-2 ${r.customerKnown ? "text-gray-900" : "italic text-gray-500"}`}>{r.customerKnown ? r.customer : NO_CUSTOMER}</td>
                          <td className="py-1.5 pr-2">
                            {r.inPlan
                              ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">In plan · {money(r.planValue)}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className={`py-1.5 pr-2 capitalize ${r.response === "negative" ? "text-red-700" : r.response === "positive" ? "text-emerald-700" : "text-gray-600"}`}>{r.response || "—"}</td>
                          <td className="py-1.5 pr-2 text-gray-700">{r.nextAction || "—"}</td>
                          <td className="py-1.5 text-gray-600">{r.planOutcome || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {!model.dayContacts.length && <p className="text-sm text-gray-500">Nothing logged on {shortDay(model.day)}.</p>}
            <div data-testid="monitor-no-visit">
              <h3 className="text-sm font-semibold text-gray-800">No visit, call or WhatsApp on {shortDay(model.day)} ({model.noVisitPeople.length})</h3>
              {model.noVisitPeople.length ? (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {model.noVisitPeople.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => openPerson(p.id)} className="text-xs px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                        {p.name}<span className="text-red-500"> · last {shortDay(p.lastVisit)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-gray-500 mt-1">Everyone logged at least one.</p>}
            </div>

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
