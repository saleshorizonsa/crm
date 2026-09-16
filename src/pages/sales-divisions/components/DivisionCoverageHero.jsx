import React from "react";
import DivisionCoverageRail from "./DivisionCoverageRail";
import DivisionPacingRail from "./DivisionPacingRail";

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
  if (metrics.coverageOk && metrics.pacingOk)
    return { text: "Healthy", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  if (!metrics.coverageOk && !metrics.pacingOk)
    return { text: "Off Plan", cls: "bg-red-50 text-red-800 border-red-200" };
  return { text: "At Risk", cls: "bg-amber-50 text-amber-800 border-amber-200" };
}

export function DivisionCoverageHero({ metrics, scope, title, sub }) {
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
            <div>
              Pacing{" "}
              <span className={metrics.pacingOk ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                {metrics.pacingOk ? "PASS" : "FAIL"} {(metrics.pace * 100).toFixed(1)}% vs{" "}
                {(metrics.elapsed * 100).toFixed(1)}%
              </span>
            </div>
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

      <DivisionCoverageRail
        invoiced={metrics.achieved}
        weightedFunnel={metrics.weightedFunnel}
        weightedPlanning={metrics.weightedPlanning}
        target={metrics.target}
        compact={compact}
        SAR={SAR}
      />
      <div className="mt-4">
        <DivisionPacingRail
          pace={metrics.pace}
          elapsed={metrics.elapsed}
          dayOfMonth={metrics.dayOfMonth}
          totalDays={metrics.totalDays}
          pctFmt={pctFmt}
        />
      </div>
    </div>
  );
}

export function DivisionCycleLedger({ metrics, exceptionCount = null }) {
  const rows = [
    ["Target", SAR(metrics.target) + " SAR", ""],
    ["Achieved", SAR(metrics.achieved) + " SAR", (metrics.pace * 100).toFixed(1) + "% of target", "pos"],
    ["Gap to target", SAR(metrics.deficit) + " SAR", "", "neg"],
    [
      "Win rate",
      metrics.winRatePct.toFixed(1) + "%",
      metrics.winRateBorrowed ? "company rate (no deals in 3 months)" : "3-month average",
    ],
    ["Required pipeline", SAR(metrics.requiredRaw) + " SAR", "target ÷ win rate"],
    ["Planned pipeline", SAR(metrics.planned) + " SAR", ""],
    ["Planned gap", SAR(metrics.plannedGap) + " SAR", "", "neg"],
    ["Future carry-in", SAR(metrics.carryIn) + " SAR", "reduces req. plan"],
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
