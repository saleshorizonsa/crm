// THE COVERAGE RAIL â€” one implementation, used by Insights and the Coverage
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
// gets exactly the old rail â€” a bar and a legend â€” rather than clickable
// segments that open an empty panel.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RAIL_SEGMENTS,
  DRILL_COLUMNS,
  buildCoverageDrill,
} from "utils/coverageDrill";

import DrillSheet, { money } from "components/DrillSheet";

/**
 * The coverage sheet is the SHARED sheet (components/DrillSheet.jsx), handed a
 * tree. Session 10's panel lived here and knew about segments, divisions and
 * people; Session 13 needed the same sheet on Planning, so the sheet moved out
 * and this is what is left of the coverage-specific part: which tree to build.
 *
 *   company view   division â†’ person â†’ rows
 *   anywhere else  person â†’ rows
 *
 * Shortfall keeps its own note, because a scope's gap is not the sum of the
 * personal gaps and the reader has to be told so.
 */
function CoverageDrillPanel({ segment, drill, byDivision, onClose, onOpenRecord, scopeLabel }) {
  if (!segment) return null;
  const seg = drill.segments[segment];
  if (!seg) return null;

  const children = byDivision && seg.divisions
    ? seg.divisions.map((d) => ({ ...d, children: d.people }))
    : seg.people;

  const note = seg.key === "shortfall" && Math.abs(seg.peopleTotal - seg.total) > 1
    ? `Personal gaps add to ${money(seg.peopleTotal)}. The rail shows the scope's own target less its own coverage â€” one person's overshoot does not fill another's gap.`
    : null;

  return (
    <DrillSheet
      label={seg.label}
      total={seg.total}
      badge={seg.inCoverage ? null : "not in coverage"}
      note={note}
      columns={DRILL_COLUMNS[segment] || []}
      groupLabels={byDivision && seg.divisions ? ["By division", "Person"] : ["Person"]}
      onOpenRecord={onOpenRecord}
      onClose={onClose}
      scopeLabel={scopeLabel}
    >
      {children}
    </DrillSheet>
  );
}

/* â”€â”€ the rail itself â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

  // LEVEL 3 â€” open the record in the window that already exists, rather than a
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
                title={`${segMeta(d.key).label}: ${SAR(d.value)} SAR${openable(d.key) ? " â€” click for the breakdown" : ""}`}
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
              title={`Coverage shortfall: ${SAR(gap)} SAR${openable("shortfall") ? " â€” click for the breakdown" : ""}`}
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
            title={`Won, not invoiced: ${SAR(wonNotInvoiced)} SAR â€” not counted in coverage${openable("wonNotInvoiced") ? ". Click for the breakdown" : ""}`}
            aria-label={`Won not invoiced ${SAR(wonNotInvoiced)} SAR, not in coverage`}
            {...partProps("wonNotInvoiced")}
          />
          <span className="text-[10px] font-mono text-gray-400">
            won, not invoiced â€” not in coverage
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
              Won, not invoiced {compact(wonNotInvoiced)} Â· not in coverage
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
        <CoverageDrillPanel
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

