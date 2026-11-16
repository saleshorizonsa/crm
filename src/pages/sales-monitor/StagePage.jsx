import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import DrillSheet, { money, cellText } from "components/DrillSheet";
import VisitSheet from "components/VisitSheet";
import { exportToExcel } from "utils/exportUtils";
import { fmtPct } from "utils/formatPct";
import { loadSalesMonitor } from "utils/salesMonitorData";
import { computeSalesMonitor, personDrill, MONITOR_PICKER_ROLES, DEPARTED_ID } from "utils/salesMonitor";
import {
  STAGES, stageById, stageContext, buildStagePage, expandableIds, visibleRows, exportStageRows,
  stageHref, monitorHref, levelName,
} from "utils/stagePages";
import { actionTarget } from "utils/exceptionActions";

// SALES MONITOR — ONE PAGE PER STAGE (session 39, CEO 2026-11-16).
//
// /sales-monitor/target | planned | visits | achieved | exceptions. Everything
// the stage's cards had, on one page, expandable in place: salesman ▸
// customer ▸ records. The rows, tabs, totals and next steps come from
// utils/stagePages.js over computeSalesMonitor's model; nothing is computed
// here. Month, division and day travel in the address, so the stage bar and
// the back link keep them.

const pad = (n) => String(n).padStart(2, "0");
const thisMonthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthTitle = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  return `${MONTH_LONG[m - 1]} ${y}`;
};
const SEV_STYLE = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
};

/** A figure as the cards show it. */
const fig = (value, type) => {
  if (value === null || value === undefined) return "—";
  if (type === "money") return money(value);
  if (type === "pct") return fmtPct(value, 0);
  if (type === "int") return String(value);
  return String(value);
};
const valueText = (v, unit) => (v === null || v === undefined ? "—" : unit === "SAR" ? `${money(v)}${v < 0 ? " CR" : ""}` : String(v));

export default function StagePage() {
  const { stage: stageParam } = useParams();
  const { user, company, userProfile } = useAuth();
  const role = userProfile?.role;
  const navigate = useNavigate();
  const canPick = MONITOR_PICKER_ROLES.includes(role);
  const [params, setParams] = useSearchParams();

  const linkDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") || "") ? params.get("day") : null;
  const monthKey = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : (linkDay ? linkDay.slice(0, 7) : thisMonthKey());
  const divisionId = params.get("division") || "";
  const visitDay = linkDay && linkDay.slice(0, 7) === monthKey ? linkDay : null;
  const view = params.get("view") || null;
  const tabParam = params.get("tab") || "";
  const tab = useMemo(() => (tabParam ? tabParam.split(",") : null), [tabParam]);
  const only = params.get("only") || null;

  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [rowDivision, setRowDivision] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [visit, setVisit] = useState(null);
  const [drill, setDrill] = useState(null);
  const closeVisit = useCallback(() => setVisit(null), []);

  const load = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    setLoading(true);
    setError("");
    try {
      setRaw(await loadSalesMonitor({ companyId: company.id, viewerId: user.id, role, monthKey, now: new Date() }));
    } catch (e) {
      console.error("Sales Monitor load failed:", e);
      setError(e?.message || "Failed to load the Sales Monitor");
    } finally {
      setLoading(false);
    }
  }, [company?.id, user?.id, role, monthKey]);
  useEffect(() => { load(); }, [load]);

  const model = useMemo(
    () => (raw ? computeSalesMonitor(raw, { divisionId: divisionId || null, visitDay }) : null),
    [raw, divisionId, visitDay],
  );
  const sc = useMemo(() => (model ? stageContext(model) : null), [model]);
  const stage = stageById(stageParam);
  const page = useMemo(
    () => (sc && stage ? buildStagePage(model, { stage: stage.id, view, tab, only, query, division: rowDivision }, sc) : null),
    [sc, model, stage, view, tab, only, query, rowDivision],
  );

  // A new list starts collapsed.
  const listKey = page ? `${stage.id}|${page.view}|${page.selection.join(",")}|${only || ""}` : "";
  useEffect(() => { setExpanded(new Set()); }, [listKey]);

  const keep = { month: monthKey, division: divisionId, day: visitDay };
  const setList = (next) => {
    const p = new URLSearchParams(params);
    ["view", "tab", "only"].forEach((k) => {
      if (!(k in next)) return;
      const v = next[k];
      if (v === null || v === undefined || (Array.isArray(v) && !v.length) || v === "") p.delete(k);
      else p.set(k, Array.isArray(v) ? v.join(",") : v);
    });
    setParams(p, { replace: true });
  };
  const setKeep = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k === "month") p.delete("day");
    setParams(p, { replace: true });
  };

  if (!stage) return <Navigate to={monitorHref(keep)} replace />;

  if (loading && !raw) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-sm text-gray-500">Loading {stage.name}…</p>
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
  if (!model || !page) return null;

  const period = monthTitle(monthKey);
  const place = model.division ? [model.division.name] : [];
  const searching = !!query.trim();
  // While searching, every row with a match is open, so the match shows.
  const openSet = searching ? new Set(expandableIds(page.nodes)) : expanded;
  const vis = visibleRows(page.nodes, openSet);
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const openPerson = (id) => {
    const tree = personDrill(model, id) || personDrill(model, DEPARTED_ID);
    if (tree) setDrill({ ...tree, title: "Salesman", place: [...place, tree.label] });
  };
  // A record opens as it does on the monitor.
  const openRecord = (o) => {
    if (!o) return;
    if (o.kind === "visit") { const c = model.mtdContacts.find((x) => x.id === o.contactId); if (c) setVisit(c); return; }
    if (o.kind === "deal" && o.dealId) { navigate("/sales-pipeline", { state: { openDealId: o.dealId } }); return; }
    if (o.kind === "plan") { navigate("/planning"); return; }
    if (o.kind === "person" && o.personId) openPerson(o.personId);
  };
  const runAction = (a) => {
    if (!a?.to) return;
    if (a.to === "person") { openPerson(a.exception?.ownerId); return; }
    const t = actionTarget(a.to, a.exception);
    if (t) navigate({ pathname: t.path, hash: t.hash || "" }, t.state ? { state: t.state } : undefined);
  };

  const doExport = () => exportToExcel(
    [{ name: page.views.find((v) => v.active).label, data: exportStageRows(page, openSet) }],
    ["Sales Monitor", stage.name, page.views.length > 1 ? page.views.find((v) => v.active).label : null,
      ...page.sets.map((s) => s.options.find((o) => o.id === page.selection[page.sets.indexOf(s)])).filter((o) => o && !o.isAll).map((o) => o.label),
      page.only ? page.only.label : null, period].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g, "-"),
  );

  const activeView = page.views.find((v) => v.active);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4" data-testid={`stage-page-${stage.id}`}>
        {/* ── back, title, month / division ── */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
          <div className="min-w-0">
            <button type="button" data-testid="stage-back" onClick={() => navigate(monitorHref(keep))} className="text-xs text-gray-600 hover:text-gray-900 underline decoration-dotted">
              ← Sales Monitor
            </button>
            <h1 className="text-2xl font-semibold text-gray-900" data-testid="stage-title">
              {stage.n ? `${stage.n}. ` : ""}{stage.name} — {period}{model.division ? ` · ${model.division.name}` : ""}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-xs text-gray-600">
              <span className="block mb-1">Month</span>
              <input type="month" data-testid="stage-month" value={monthKey}
                max={thisMonthKey(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1))}
                onChange={(e) => e.target.value && setKeep("month", e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white" />
            </label>
            {canPick && (
              <label className="text-xs text-gray-600">
                <span className="block mb-1">Division</span>
                <select data-testid="stage-division" value={divisionId} onChange={(e) => setKeep("division", e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                  <option value="">All divisions</option>
                  {model.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>

        {/* ── the stage bar: switch stage without going back ── */}
        <nav aria-label="Stages" className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" data-testid="stage-bar">
          <ol className="flex flex-nowrap items-center gap-1 min-w-max">
            {STAGES.map((s, i) => {
              const on = s.id === stage.id;
              return (
                <li key={s.id} className="flex items-center gap-1 flex-shrink-0">
                  {i > 0 && <span aria-hidden="true" className="text-gray-400 px-0.5">{s.n ? "→" : "·"}</span>}
                  <button
                    type="button"
                    data-testid={`stagebar-${s.id}`}
                    aria-current={on ? "page" : undefined}
                    onClick={() => navigate(stageHref(s.id, keep))}
                    className={`flex items-center gap-1.5 whitespace-nowrap text-sm px-3 py-1.5 rounded-full border ${on ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                  >
                    {s.n && <span className={`w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center ${on ? "bg-white text-gray-900" : "bg-gray-900 text-white"}`}>{s.n}</span>}
                    {s.name}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {model.notes.length > 0 && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
            {model.notes.map((n) => <p key={n}>{n}</p>)}
          </div>
        )}

        {/* ── the stage's figures in one line ── */}
        <section aria-label="Summary" data-testid="stage-summary" className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-2">
          {page.summary.map((s) => (
            <div key={s.id} data-testid={`sum-${s.id}`} className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">{s.label}</div>
              <div className="font-mono text-base font-semibold text-gray-900">{fig(s.value, s.type)}</div>
            </div>
          ))}
        </section>

        {/* ── the list ── */}
        <section aria-label={activeView.label} className="bg-white border border-gray-200 rounded-xl">
          <div className="px-4 py-3 border-b border-gray-100 space-y-2">
            {page.views.length > 1 && (
              <div role="tablist" aria-label="Card" className="flex gap-1 overflow-x-auto flex-nowrap pb-1">
                {page.views.map((v) => (
                  <button key={v.id} type="button" role="tab" aria-selected={v.active} data-testid={`stage-view-${v.id}`}
                    onClick={() => setList({ view: v.id, tab: null, only: null })}
                    className={`flex-shrink-0 whitespace-nowrap text-sm px-3 py-1 rounded-lg border ${v.active ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900">{activeView.label}</h2>
              <span className="font-mono text-lg font-semibold text-gray-900" data-testid="stage-total">{valueText(page.total, page.unit)}</span>
              <span className="text-xs text-gray-500">{page.unit}</span>
            </div>
            {page.explain && <p className="text-xs text-gray-600" data-testid="stage-explain">{page.explain}</p>}
            {page.sets.map((set, i) => (
              <div key={set.id} role="tablist" aria-label={set.id} className="flex gap-1 overflow-x-auto flex-nowrap pb-1">
                {set.options.map((o) => {
                  const on = page.selection[i] === o.id;
                  return (
                    <button key={o.id} type="button" role="tab" aria-selected={on} title={o.hint || undefined}
                      data-testid={`stage-tab-${set.id}-${o.id}`}
                      onClick={() => { const t = [...page.selection]; t[i] = o.id; setList({ tab: t, only: null }); }}
                      className={`flex-shrink-0 whitespace-nowrap text-xs px-2.5 py-1 rounded-full border ${on ? "bg-gray-900 text-white border-gray-900" : o.count === 0 ? "border-gray-200 text-gray-400 bg-gray-50" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                      {o.label} <span className="font-mono">{o.count}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {page.hints.length > 0 && <p className="text-[11px] text-gray-600">{page.hints.join(" ")}</p>}
            {page.only && (
              <p className="text-xs" data-testid="stage-only">
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">Only: {page.only.label}</span>{" "}
                <button type="button" onClick={() => setList({ only: null })} className="underline text-gray-600">show all</button>
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input type="search" data-testid="stage-search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search salesman, customer, invoice or deal" aria-label="Search this list"
                className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm" />
              {!canPick && page.divisions.length > 1 && (
                <select data-testid="stage-row-division" value={rowDivision} onChange={(e) => setRowDivision(e.target.value)}
                  aria-label="Division" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                  <option value="">All divisions</option>
                  {page.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              <div className="flex gap-1">
                <button type="button" data-testid="stage-expand-all" onClick={() => setExpanded(new Set(expandableIds(page.nodes)))} className="text-xs px-2.5 py-1.5 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap">Expand all</button>
                <button type="button" data-testid="stage-collapse-all" onClick={() => setExpanded(new Set())} className="text-xs px-2.5 py-1.5 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap">Collapse all</button>
                <button type="button" data-testid="stage-export" onClick={doExport} className="text-xs px-2.5 py-1.5 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap">Export to Excel</button>
              </div>
            </div>
          </div>

          {/* Rows: a salesman, what he expands into, and its records. On a
              phone each row stacks its figures under its name. */}
          <div role="treegrid" aria-label={activeView.label} data-testid="stage-rows" className="divide-y divide-gray-100">
            {vis.map(({ node, depth }) => {
              const kids = node.children?.length > 0;
              const isOpen = openSet.has(node.id);
              const cols = page.columns[node.kind] || [];
              // A tab row that counts as one (a person, a visit, a customer)
              // does not repeat "1"; groups show their count, money always shows.
              const valueUnit = node.valueUnit || page.unit;
              const showValue = node.value !== null && node.value !== undefined && !(node.tabRow && valueUnit !== "SAR");
              const onRow = kids ? () => toggle(node.id) : node.open ? () => openRecord(node.open) : undefined;
              return (
                <div
                  key={node.id}
                  role="row"
                  aria-level={depth + 1}
                  aria-expanded={kids ? isOpen : undefined}
                  data-testid="stage-row"
                  data-kind={node.kind}
                  data-depth={depth}
                  data-id={node.id}
                  data-value={node.value ?? ""}
                  data-sum={node.sumKey ? (node.cells?.[node.sumKey] ?? "") : undefined}
                  data-tabrow={node.tabRow ? "true" : undefined}
                  className={`flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2 pr-3 ${depth ? "bg-gray-50/60" : ""}`}
                  style={{ paddingLeft: `${12 + depth * 16}px` }}
                >
                  <div className="flex items-start gap-2 min-w-0 sm:w-72 sm:flex-shrink-0">
                    {kids ? (
                      <button type="button" data-testid="row-toggle" aria-label={isOpen ? "Collapse" : "Expand"} onClick={() => toggle(node.id)}
                        className="w-6 h-6 -my-0.5 flex-shrink-0 rounded hover:bg-gray-200 text-gray-600">{isOpen ? "▾" : "▸"}</button>
                    ) : <span className="w-6 flex-shrink-0" />}
                    <button type="button" onClick={onRow} disabled={!onRow}
                      className={`text-left min-w-0 break-words ${node.kind === "person" || node.kind === "group" ? "font-semibold text-gray-900" : "text-gray-800"} text-sm ${onRow && !kids ? "hover:underline" : ""}`}>
                      <span className="sr-only">{levelName(node.kind)}: </span>
                      {node.kind === "exception" && node.cells?.severity && (
                        <span className={`mr-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase ${SEV_STYLE[node.cells.severity] || ""}`}>{node.cells.severity}</span>
                      )}
                      <span data-testid="row-name">{node.name || "—"}</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs flex-1 min-w-0 pl-8 sm:pl-0" data-testid="row-cells">
                    {showValue && (
                      <span data-cell="value">
                        <span className="text-gray-500">{node.valueLabel || page.valueLabel}</span>{" "}
                        <span className="font-mono font-semibold text-gray-900">{valueText(node.value, valueUnit)}</span>
                      </span>
                    )}
                    {cols.filter((c) => !(node.kind === "exception" && c.key === "severity")).map((c) => (
                      <span key={c.key} data-cell={c.key}>
                        <span className="text-gray-500">{c.label}</span>{" "}
                        <span className="font-mono text-gray-800">{node.cells?.[c.key] === null || node.cells?.[c.key] === undefined || node.cells?.[c.key] === "" ? "—" : c.type ? cellText(node.cells, c) : String(node.cells[c.key])}</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1 pl-8 sm:pl-0 flex-shrink-0">
                    {kids && node.open && (
                      <button type="button" data-testid="row-open" onClick={() => openRecord(node.open)} className="text-[11px] px-2 py-0.5 rounded border border-gray-300 hover:bg-white">Open</button>
                    )}
                    {node.action?.to && (
                      <button type="button" data-testid="row-action" onClick={() => runAction(node.action)} className="text-[11px] px-2 py-0.5 rounded border border-blue-300 text-blue-800 hover:bg-blue-50 whitespace-nowrap">{node.action.button}</button>
                    )}
                  </div>
                </div>
              );
            })}
            {!vis.length && <p className="px-4 py-8 text-center text-sm text-gray-400">{searching ? "Nothing matches the search." : "Nothing in this list."}</p>}
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] font-mono text-gray-600" data-testid="stage-footer">
            {page.rowCount} {page.unit === "SAR" ? "rows" : page.unit} · {vis.length} on screen · click ▸ to expand, a record to open it
          </div>
        </section>

        {/* ── next steps, from this page's own rows ── */}
        <section aria-label="Next steps" data-testid="stage-next-steps" className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Next steps</h2>
          {page.nextSteps.length ? (
            <ul className="mt-2 space-y-1.5">
              {page.nextSteps.map((s) => (
                <li key={s.id} data-testid={`next-${s.id}`} data-count={s.count} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                  <button type="button" data-testid={`next-link-${s.id}`}
                    onClick={() => { setList({ view: s.link.view, tab: s.link.tab, only: s.link.only || null }); setQuery(""); setRowDivision(""); }}
                    className="text-left text-blue-800 hover:underline">
                    {s.text}
                  </button>
                  {s.external && (
                    <button type="button" data-testid={`next-external-${s.id}`} onClick={() => navigate({ pathname: s.external.path, hash: s.external.hash || "" })}
                      className="self-start text-[11px] px-2 py-0.5 rounded border border-blue-300 text-blue-800 hover:bg-blue-50 whitespace-nowrap">{s.external.label}</button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-gray-500" data-testid="next-none">Nothing to act on in this stage.</p>}
        </section>
      </main>

      {visit && <VisitSheet row={visit} nameOf={model.userName || (() => null)} onClose={closeVisit} />}
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
          onOpenRecord={(r) => {
            if (r?.dealId) navigate("/sales-pipeline", { state: { openDealId: r.dealId } });
            else if (r?.oppId) navigate("/planning");
          }}
          onClose={() => setDrill(null)}
          scopeLabel={model.division?.name || "company"}
          children={drill.children || null}
        />
      )}
    </div>
  );
}
