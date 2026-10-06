import React from "react";
import DivisionCoverageRail from "./DivisionCoverageRail";
import DivisionPacingRail from "./DivisionPacingRail";
// Percentages that cannot crash a render: a figure that has not arrived shows
// "—" instead of taking the page down. See utils/formatPct.js.
import { fmtPct } from "utils/formatPct";

// The Coverage Console's hero (status chip, coverage equation, coverage rail,
// pacing rail) and its Cycle Ledger, copied from
// pages/coverage-console/index.jsx as presentation only. Every number comes in
// through `metrics`, which calcDivisionMetrics() builds from
// utils/planningCalculations.js — nothing is calculated here.

const SAR = (n) => Math.abs(Math.round(n || 0)).toLocaleString("en-US");

const compact = (n) => {
  const a = Math.abs(Math.round(n || 0));
  if (a >= 1e6) return (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (a / 1e3).toFixed(0) + "K";
  return String(a);
};

const pctFmt = (n, d = 1) => ((n || 0) * 100).toFixed(d) + "%";

export function statusChipOf(metrics) {
  if (!metrics) return null;
  // Coverage-only outside the current month, where pacing is null — and the
  // label says so, rather than "Healthy" quietly meaning something narrower.
  if (metrics.pacingOk === null) {
    return metrics.coverageOk
      ? { text: "Healthy (coverage only)", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" }
      : { text: "Off Plan (coverage only)", cls: "bg-red-50 text-red-800 border-red-200" };
  }
  if (metrics.coverageOk && metrics.pacingOk)
    return { text: "Healthy", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  if (!metrics.coverageOk && !metrics.pacingOk)
    return { text: "Off Plan", cls: "bg-red-50 text-red-800 border-red-200" };
  return { text: "At Risk", cls: "bg-amber-50 text-amber-800 border-amber-200" };
}

export function DivisionCoverageHero({ metrics, scope, title, sub, periodLabel }) {
  const chip = statusChipOf(metrics);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
      <div className="flex items-start justify-between mb-5 gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">{scope}</p>
          <h2 className="text-xl font-bold text-gray-900 truncate">{title}</h2>
          <p className="text-sm text-gray-500 mt-0.5 font-mono">{sub}</p>
        </div>

        <div className="text-right flex-shrink-0">
          <span className={`inline-block text-xs font-semibold px-3 py-1.5 rounded-lg border ${chip.cls}`}>
            {chip.text}
          </span>
          <div className="text-[11px] font-mono text-gray-400 mt-2 space-y-1">
            <div>
              Coverage{" "}
              <span className={metrics.coverageOk ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                {metrics.coverageOk ? "PASS" : "FAIL"}{" "}
                {((metrics.coverage / Math.max(metrics.target, 1)) * 100).toFixed(0)}%
              </span>
            </div>
            {/* Pacing is a day-of-month verdict — hidden, not substituted,
                whenever the selected period is not the current month. */}
            {metrics.pacingOk !== null && (
              <div>
                Pacing{" "}
                <span className={metrics.pacingOk ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                  {metrics.pacingOk ? "PASS" : "FAIL"} {(metrics.pace * 100).toFixed(1)}% vs{" "}
                  {(metrics.elapsed * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Coverage equation */}
      <div className="bg-gray-50 border-l-4 border-gray-800 px-4 py-3 mb-5 rounded-r-xl font-mono text-sm flex items-center gap-4 flex-wrap overflow-x-auto">
        {[
          ["Invoiced", metrics.achieved, "text-emerald-900"],
          ["+"],
          ["Funnel weighted", metrics.weightedFunnel, "text-emerald-600"],
          ["+"],
          ["Planning weighted", metrics.weightedPlanning, "text-blue-600"],
          [metrics.coverageOk ? "≥" : "<"],
          ["Target", metrics.target, "text-gray-900"],
        ].map((item, i) => (
          <div key={i}>
            {item.length === 1 ? (
              <span className="text-gray-400 font-bold text-lg">{item[0]}</span>
            ) : (
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-400 uppercase tracking-widest">{item[0]}</span>
                <span className={`font-semibold ${item[2]}`}>{compact(item[1])} SAR</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* The equation's Target column is a 9px micro-label with no room for a
          qualifier, so the span is stated once beneath it. Hidden for All Time,
          where the Target comparison is suppressed anyway. */}
      {!metrics.isAllTime && metrics.targetSpan ? (
        <p className="-mt-3 mb-5 text-[11px] text-gray-500">
          Target covers <span className="font-medium text-gray-700">{metrics.targetSpan}</span>.
        </p>
      ) : null}

      <DivisionCoverageRail
        invoiced={metrics.achieved}
        weightedFunnel={metrics.weightedFunnel}
        weightedPlanning={metrics.weightedPlanning}
        target={metrics.target}
        compact={compact}
        SAR={SAR}
      />
      {/* Pacing is a day-of-month verdict, so the rail is shown only while the
          current month is what is selected — hidden, not computed against a
          month that has ended or not started. */}
      {metrics.pacingOk !== null ? (
        <div className="mt-4">
          <DivisionPacingRail
            pace={metrics.pace}
            elapsed={metrics.elapsed}
            dayOfMonth={metrics.dayOfMonth}
            totalDays={metrics.totalDays}
            pctFmt={pctFmt}
          />
        </div>
      ) : (
        <p className="mt-4 text-[11px] text-gray-500">
          Pacing is measured against the days elapsed in the current month, so it
          is not shown for {periodLabel || "this period"}. Status above is
          coverage only.
        </p>
      )}
    </div>
  );
}

export function DivisionCycleLedger({ metrics, exceptionCount = null }) {
  const rows = [
    // All Time compares an Achieved spanning everything with a Target that only
    // exists for months that have rows, so target-derived rows are dropped.
    ...(metrics.isAllTime
      ? []
      // The note names the span the figure covers. Target here is the sum of the
      // monthly target of every month the window touches, and an incomplete month
      // contributes its whole target — both invisible when the row said only
      // "Target". See targetSpanLabel in utils/salesDivisionMetrics.js.
      : [["Target", SAR(metrics.target) + " SAR", metrics.targetSpan || ""]]),
    [
      "Achieved",
      SAR(metrics.achieved) + " SAR",
      metrics.isAllTime
        ? "all time"
        : metrics.pace !== null
          ? (metrics.pace * 100).toFixed(1) + "% of target"
          : "selected period",
      "pos",
    ],
    ...(metrics.isAllTime
      ? []
      : [["Gap to target", SAR(metrics.deficit) + " SAR", "", "neg"]]),
    [
      metrics.winRateBorrowed ? 'Conversion (3m) — company rate' : 'Conversion (3m)',
      fmtPct(metrics.winRatePct),
      metrics.winRateBorrowed ? "company rate (no deals in 3 months)" : "3-month average · to date",
    ],
    ...(metrics.isAllTime
      ? []
      : [["Required pipeline", SAR(metrics.requiredRaw) + " SAR", "gap to target ÷ win rate"]]),
    ["Planned pipeline", SAR(metrics.planned) + " SAR", "open plan · selected period"],
    ["Open funnel", SAR(metrics.monthFunnel) + " SAR", "open deals closing in the period"],
    ...(metrics.isAllTime
      ? []
      : [["New pipeline needed", SAR(metrics.plannedGap) + " SAR", "required − plan − funnel", "neg"]]),
    // Not netted off the requirement, and only meaningful while the current
    // month is selected: it is a live forward-looking figure, not a property of
    // a past quarter.
    ...(metrics.isCurrentMonth
      ? [["Future carry-in", SAR(metrics.carryIn) + " SAR", "next month · not netted"]]
      : []),
  ];
  if (exceptionCount !== null) {
    rows.push(["Open exceptions", String(exceptionCount), "", exceptionCount > 0 ? "neg" : ""]);
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden self-start">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Cycle ledger</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map(([k, v, n, cls]) => (
          <div key={k} className="flex justify-between items-baseline px-5 py-2.5">
            <span className="text-xs text-gray-500 font-mono">{k}</span>
            <div className="text-right">
              <span
                className={`text-xs font-semibold font-mono ${
                  cls === "pos" ? "text-emerald-700" : cls === "neg" ? "text-red-600" : "text-gray-900"
                }`}
              >
                {v}
              </span>
              {n && <div className="text-[10px] text-gray-400">{n}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
