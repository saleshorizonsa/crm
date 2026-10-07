// THE COVERAGE RAIL — one implementation, used by Insights and the Coverage
// Console.
//
// It existed twice, hand-copied, with a comment in each telling the reader to
// "keep the two in step by hand". Two copies of a bar chart was survivable;
// two copies of a drill-down is not, so the drill-down was the moment to merge
// them. Both pages now render this file.
//
// Every part of the rail, and every legend entry, opens a panel showing the
// rows behind it. The arithmetic is not here: utils/coverageDrill.js groups the
// row sets the metrics carry, and this file draws them.
//
// NON-INTERACTIVE WITHOUT `drill`. A caller that cannot supply the row sets
// gets exactly the old rail — a bar and a legend — rather than clickable
// segments that open an empty panel.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RAIL_SEGMENTS,
  DRILL_COLUMNS,
  buildCoverageDrill,
} from "utils/coverageDrill";

const money = (v) => Math.abs(Math.round(Number(v) || 0)).toLocaleString("en-US");
const fmtDate = (d) =>
  (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtMonth = (d) =>
  (d ? new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—");

/** One cell, formatted by its column type. Numbers never wrap. */
function cellText(row, col) {
  const v = row[col.key];
  if (col.type === "money") return `${money(v)}${v < 0 ? " CR" : ""}`;
  if (col.type === "pct") return v == null ? "—" : `${Number(v).toFixed(0)}%`;
  if (col.type === "int") return v == null ? "—" : String(v);
  if (col.type === "date") return fmtDate(v);
  if (col.type === "month") return fmtMonth(v);
  if (col.type === "flags") return (v || []).join(" · ") || "—";
  return v == null || v === "" ? "—" : String(v);
}

const FLAG_STYLE = {
  OVERDUE: "bg-red-50 text-red-700 border-red-200",
  UNDATED: "bg-amber-50 text-amber-700 border-amber-200",
  STUCK: "bg-amber-50 text-amber-700 border-amber-200",
  "NOT CONVERTED": "bg-amber-50 text-amber-700 border-amber-200",
  STALE: "bg-red-50 text-red-700 border-red-200",
};

/* ── the table style of Session 9: frozen first column, wrapped headers ───── */
const STICKY_EDGE = "border-r border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.10)]";
const HEAD_WRAP = "whitespace-normal break-words max-w-[7.5rem] align-bottom";

function DrillTable({ columns, rows, onRowClick, emptyText }) {
  const [sort, setSort] = useState({ key: null, dir: "desc" });

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => {
      const v = r[sort.key];
      if (col?.type === "flags") return (v || []).join(",");
      if (typeof v === "number") return v;
      return String(v ?? "").toLowerCase();
    };
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === y) return 0;
      const less = x < y ? -1 : 1;
      return sort.dir === "asc" ? less : -less;
    });
  }, [rows, sort, columns]);

  if (!rows.length) {
    return <div className="py-10 text-center text-sm text-gray-400">{emptyText}</div>;
  }

  const toggle = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  sort.key === c.key
                    ? (sort.dir === "asc" ? "ascending" : "descending")
                    : "none"
                }
                className={[
                  "px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 select-none",
                  i === 0
                    ? `text-left whitespace-nowrap sticky left-0 z-20 bg-gray-50 ${STICKY_EDGE}`
                    : `text-right ${HEAD_WRAP}`,
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  title={`Sort by ${c.label}`}
                  className={[
                    "w-full uppercase tracking-wide cursor-pointer hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded",
                    i === 0 ? "text-left" : `text-right ${HEAD_WRAP}`,
                  ].join(" ")}
                >
                  {c.label}
                  <span aria-hidden="true">
                    {sort.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((r, idx) => (
            <tr
              key={r.dealId || r.oppId || idx}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`group ${onRowClick ? "cursor-pointer" : ""} hover:bg-gray-50 transition-colors`}
            >
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={[
                    "px-3 py-2.5",
                    i === 0
                      ? `sticky left-0 z-10 bg-white group-hover:bg-gray-50 ${STICKY_EDGE} font-medium text-gray-900`
                      : "text-right whitespace-nowrap font-mono",
                    c.type === "money" && Number(r[c.key]) < 0 ? "text-red-600" : "",
                  ].join(" ")}
                >
                  {c.type === "flags" ? (
                    (r.flags || []).length ? (
                      <span className="inline-flex gap-1 flex-wrap justify-end">
                        {r.flags.map((f) => (
                          <span
                            key={f}
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${FLAG_STYLE[f] || "bg-gray-50 text-gray-600 border-gray-200"}`}
                          >
                            {f}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )
                  ) : (
                    cellText(r, c)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Level-1 list: a name and a figure, clickable. */
function GroupList({ items, onPick, unit }) {
  if (!items.length) {
    return <div className="py-10 text-center text-sm text-gray-400">Nothing in this segment.</div>;
  }
  const max = Math.max(...items.map((i) => Math.abs(i.total)), 1);
  return (
    <div className="divide-y divide-gray-50">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onPick(it)}
          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-gray-900 truncate">{it.name}</span>
            <span className="block mt-1 h-1 rounded-full bg-gray-100 overflow-hidden">
              <span
                className="block h-full rounded-full bg-gray-800"
                style={{ width: `${Math.min((Math.abs(it.total) / max) * 100, 100)}%` }}
              />
            </span>
          </span>
          <span className="font-mono text-sm text-gray-900 whitespace-nowrap">{money(it.total)}</span>
          <span className="text-gray-300">›</span>
        </button>
      ))}
      {unit && <div className="px-4 py-2 text-[10px] font-mono text-gray-400">{unit}</div>}
    </div>
  );
}

/** Rows → a worksheet, using the same columns the panel shows. */
function exportRows({ segment, columns, rows, scopeLabel }) {
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => {
    const v = r[c.key];
    if (c.type === "flags") return (v || []).join(" ");
    if (typeof v === "number") return v;
    return v == null ? "" : String(v);
  }));
  const csv = [header, ...body]
    .map((line) => line.map((cell) => {
      const s = String(cell ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\r\n");
  // A BOM so Excel opens Arabic customer names in UTF-8 rather than mojibake.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${segment}-${scopeLabel || "coverage"}.csv`.replace(/\s+/g, "-").toLowerCase();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── the panel ─────────────────────────────────────────────────────────────── */
function DrillPanel({ segment, drill, byDivision, onClose, onOpenRecord, scopeLabel }) {
  const [division, setDivision] = useState(null);
  const [person, setPerson] = useState(null);
  const panelRef = useRef(null);

  // Esc closes, and the panel takes focus so a keyboard user is inside it.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!segment) return null;
  const seg = drill.segments[segment];
  if (!seg) return null;

  const columns = DRILL_COLUMNS[segment] || [];
  const level = person ? 2 : 1;
  const rows = person ? person.rows : [];

  const crumbs = [
    { label: seg.label, onClick: () => { setDivision(null); setPerson(null); } },
    ...(division ? [{ label: division.name, onClick: () => setPerson(null) }] : []),
    ...(person ? [{ label: person.name, onClick: null }] : []),
  ];

  const l1Items = byDivision && !division ? (seg.divisions || []) : (division ? division.people : seg.people);
  const pickL1 = (it) => {
    if (byDivision && !division) setDivision(it);
    else setPerson(it);
  };

  return (
    <>
      {/* The rail stays visible: the scrim covers the page, not the rail's own
          card, and clicking it closes. */}
      <div
        className="fixed inset-0 z-40 bg-gray-900/20"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`${seg.label} breakdown`}
        className="fixed z-50 top-0 right-0 bottom-0 w-full sm:w-[min(640px,100vw)] bg-white shadow-2xl flex flex-col focus:outline-none"
      >
        <header className="px-4 py-3 border-b border-gray-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <nav className="flex items-center gap-1 text-[11px] font-mono text-gray-400 flex-wrap">
              {crumbs.map((c, i) => (
                <span key={c.label} className="flex items-center gap-1">
                  {i > 0 && <span>›</span>}
                  {c.onClick ? (
                    <button type="button" onClick={c.onClick} className="hover:text-gray-700 underline decoration-dotted">
                      {c.label}
                    </button>
                  ) : (
                    <span className="text-gray-700">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-semibold font-mono text-gray-900">
                {money(level === 1 ? seg.total : person.total)}
              </span>
              <span className="text-xs text-gray-500">SAR</span>
              {!seg.inCoverage && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">
                  not in coverage
                </span>
              )}
            </div>
            {level === 1 && seg.key === "shortfall" && Math.abs(seg.peopleTotal - seg.total) > 1 && (
              <p className="mt-1 text-[11px] text-gray-500">
                Personal gaps add to {money(seg.peopleTotal)}. The rail shows the
                scope's own target less its own coverage — one person's overshoot
                does not fill another's gap.
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => exportRows({
                segment,
                columns: level === 1
                  ? [{ key: "name", label: byDivision && !division ? "Division" : "Person" }, { key: "total", label: seg.label, type: "money" }]
                  : columns,
                rows: level === 1 ? l1Items : rows,
                scopeLabel: person ? person.name : (division ? division.name : scopeLabel),
              })}
              className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
            >
              Export to Excel
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded hover:bg-gray-100 text-gray-500 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {level === 1 ? (
            <GroupList
              items={l1Items}
              onPick={pickL1}
              unit={byDivision && !division ? "By division — open one for its people" : null}
            />
          ) : (
            <DrillTable
              columns={columns}
              rows={rows}
              onRowClick={onOpenRecord ? (r) => onOpenRecord(r) : undefined}
              emptyText="No rows."
            />
          )}
        </div>

        <footer className="px-4 py-2 border-t border-gray-100 text-[10px] font-mono text-gray-400">
          {level === 1
            ? `${l1Items.length} ${byDivision && !division ? "divisions" : "people"}`
            : `${rows.length} rows · click a row to open it`}
        </footer>
      </aside>
    </>
  );
}

/* ── the rail itself ──────────────────────────────────────────────────────── */
const CoverageRail = ({
  invoiced = 0,
  weightedFunnel = 0,
  weightedPlanning = 0,
  target = 0,
  compact,
  SAR,
  // Optional. Omit it and the rail is exactly the old read-only bar.
  drill = null,
  metrics = null,
  users = [],
  divisions = [],
  byDivision = false,
  monthEnd = null,
  onOpenRecord = null,
  scopeLabel = "",
}) => {
  const [open, setOpen] = useState(null);
  const navigate = useNavigate();

  // LEVEL 3 — open the record in the window that already exists, rather than a
  // read-only copy of it inside the panel. A deal goes to the Pipeline with
  // state.openDealId, which sales-pipeline already consumes to open its
  // DealModal (the same route the KPI strip's Invoiced list uses). A plan item
  // goes to Planning, which owns it; Planning has no "open this one" entry
  // point yet, so it lands on the page rather than pretending to deep-link.
  //
  // The panel itself stays VIEW ONLY: nothing here edits.
  const openRecord = onOpenRecord || ((r) => {
    if (r?.dealId) navigate("/sales-pipeline", { state: { openDealId: r.dealId } });
    else if (r?.oppId) navigate("/planning");
  });

  const coverage = invoiced + weightedFunnel + weightedPlanning;
  const scale = Math.max(coverage, target, 1);
  const pct = (n) => `${Math.max(0, (n / scale) * 100)}%`;
  const targetPct = Math.min((target / scale) * 100, 100);
  const gap = target - coverage;

  const built = useMemo(
    () => (drill || metrics?.drill
      ? buildCoverageDrill({
        metrics: metrics || { drill, achieved: invoiced, weightedFunnel, weightedPlanning, target, coverage },
        users, divisions, byDivision, monthEnd,
      })
      : null),
    [drill, metrics, users, divisions, byDivision, monthEnd, invoiced, weightedFunnel, weightedPlanning, target, coverage],
  );

  const wonNotInvoiced = built?.segments?.wonNotInvoiced?.total || 0;

  // Drawn parts: the three coverage ones, then the shortfall as the empty
  // remainder of the bar, then won-not-invoiced hatched AFTER the target marker
  // so it reads as "beyond the coverage story", which is what it is.
  const drawn = [
    { key: "invoiced", value: invoiced },
    { key: "funnel", value: weightedFunnel },
    { key: "planning", value: weightedPlanning },
  ];
  const interactive = !!built;
  const segMeta = (key) => RAIL_SEGMENTS.find((s) => s.key === key);

  const openable = (key) => interactive && (built.segments[key]?.total || 0) !== 0;
  const activate = (key) => { if (openable(key)) setOpen(key); };

  const partProps = (key, extraClass = "") => ({
    role: openable(key) ? "button" : undefined,
    tabIndex: openable(key) ? 0 : undefined,
    onClick: () => activate(key),
    onKeyDown: (e) => {
      if (!openable(key)) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(key); }
    },
    className: `h-full transition-all ${openable(key) ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-inset" : ""} ${extraClass}`,
  });

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
          Coverage rail
        </span>
        <span className="text-[11px] font-mono text-gray-500">
          {compact(coverage)} of {compact(target)} SAR
        </span>
      </div>

      {/* Rail */}
      <div className="relative h-7 w-full rounded-lg bg-gray-100 overflow-hidden">
        <div className="absolute inset-0 flex">
          {drawn.map((d) =>
            d.value > 0 ? (
              <div
                key={d.key}
                style={{ width: pct(d.value), background: segMeta(d.key).color }}
                title={`${segMeta(d.key).label}: ${SAR(d.value)} SAR${openable(d.key) ? " — click for the breakdown" : ""}`}
                aria-label={`${segMeta(d.key).label} ${SAR(d.value)} SAR`}
                {...partProps(d.key)}
              />
            ) : null
          )}
          {/* The shortfall is the empty stretch between coverage and target, so
              it is clickable where it already is rather than drawn twice. */}
          {gap > 0 && (
            <div
              style={{ width: pct(gap) }}
              title={`Coverage shortfall: ${SAR(gap)} SAR${openable("shortfall") ? " — click for the breakdown" : ""}`}
              aria-label={`Coverage shortfall ${SAR(gap)} SAR`}
              {...partProps("shortfall")}
            />
          )}
        </div>

        {/* Target marker */}
        {target > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-900 pointer-events-none"
            style={{ left: `${targetPct}%` }}
            title={`Target: ${SAR(target)} SAR`}
          >
            <div className="absolute -top-0.5 -left-1 w-2.5 h-2.5 rounded-full bg-gray-900" />
          </div>
        )}
      </div>

      {/* The fourth part: won but not invoiced, on its own line because it is
          NOT part of coverage and must not read as if it were. */}
      {wonNotInvoiced > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <div
            className="relative h-2.5 rounded-md overflow-hidden"
            style={{
              width: pct(wonNotInvoiced),
              minWidth: "8px",
              background:
                "repeating-linear-gradient(45deg, #10b981 0 4px, #a7f3d0 4px 8px)",
            }}
            title={`Won, not invoiced: ${SAR(wonNotInvoiced)} SAR — not counted in coverage${openable("wonNotInvoiced") ? ". Click for the breakdown" : ""}`}
            aria-label={`Won not invoiced ${SAR(wonNotInvoiced)} SAR, not in coverage`}
            {...partProps("wonNotInvoiced")}
          />
          <span className="text-[10px] font-mono text-gray-400">
            won, not invoiced — not in coverage
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2.5 flex-wrap">
        {["invoiced", "funnel", "planning"].map((key) => {
          const s = segMeta(key);
          const value = key === "invoiced" ? invoiced : key === "funnel" ? weightedFunnel : weightedPlanning;
          return (
            <button
              key={key}
              type="button"
              disabled={!openable(key)}
              onClick={() => activate(key)}
              className={`flex items-center gap-1.5 rounded ${openable(key) ? "cursor-pointer hover:bg-gray-50 px-1 -mx-1" : "cursor-default"}`}
            >
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              <span className={`text-[10px] font-mono text-gray-500 ${openable(key) ? "underline decoration-dotted" : ""}`}>
                {s.label} {compact(value)}
              </span>
            </button>
          );
        })}
        {wonNotInvoiced > 0 && (
          <button
            type="button"
            disabled={!openable("wonNotInvoiced")}
            onClick={() => activate("wonNotInvoiced")}
            title="Already won, invoice not yet raised. Deliberately not counted in coverage or Expected % of target."
            className={`flex items-center gap-1.5 rounded ${openable("wonNotInvoiced") ? "cursor-pointer hover:bg-gray-50 px-1 -mx-1" : "cursor-default"}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ background: "repeating-linear-gradient(45deg, #10b981 0 2px, #a7f3d0 2px 4px)" }}
            />
            <span className={`text-[10px] font-mono text-gray-500 ${openable("wonNotInvoiced") ? "underline decoration-dotted" : ""}`}>
              Won, not invoiced {compact(wonNotInvoiced)} · not in coverage
            </span>
          </button>
        )}
        <div className="ml-auto text-[10px] font-mono">
          {gap > 0 ? (
            <button
              type="button"
              disabled={!openable("shortfall")}
              onClick={() => activate("shortfall")}
              className={`text-red-600 font-semibold ${openable("shortfall") ? "underline decoration-dotted cursor-pointer" : "cursor-default"}`}
            >
              Coverage shortfall {compact(gap)} SAR
            </button>
          ) : (
            <span className="text-emerald-700 font-semibold">Over by {compact(Math.abs(gap))} SAR</span>
          )}
        </div>
      </div>

      {open && built && (
        <DrillPanel
          segment={open}
          drill={built}
          byDivision={byDivision}
          onClose={() => setOpen(null)}
          onOpenRecord={openRecord}
          scopeLabel={scopeLabel}
        />
      )}
    </div>
  );
};

export default CoverageRail;
