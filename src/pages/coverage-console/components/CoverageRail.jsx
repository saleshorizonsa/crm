import React from "react";

// Horizontal stacked rail: invoiced + weighted funnel + weighted planning,
// measured against target. The rail is scaled to whichever is larger — total
// coverage or target — so the shortfall (or overshoot) is always visible.
const CoverageRail = ({
  invoiced = 0,
  weightedFunnel = 0,
  weightedPlanning = 0,
  target = 0,
  compact,
  SAR,
}) => {
  const coverage = invoiced + weightedFunnel + weightedPlanning;
  const scale = Math.max(coverage, target, 1);
  const pct = (n) => `${Math.max(0, (n / scale) * 100)}%`;
  const targetPct = Math.min((target / scale) * 100, 100);
  const gap = target - coverage;

  const segments = [
    { key: "invoiced", label: "Invoiced", value: invoiced, color: "#064e3b" },
    { key: "funnel", label: "Funnel (weighted)", value: weightedFunnel, color: "#10b981" },
    { key: "planning", label: "Planning (weighted)", value: weightedPlanning, color: "#3b82f6" },
  ];

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
          {segments.map((s) =>
            s.value > 0 ? (
              <div
                key={s.key}
                style={{ width: pct(s.value), background: s.color }}
                title={`${s.label}: ${SAR(s.value)} SAR`}
                className="h-full transition-all"
              />
            ) : null
          )}
        </div>

        {/* Target marker */}
        {target > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-900"
            style={{ left: `${targetPct}%` }}
            title={`Target: ${SAR(target)} SAR`}
          >
            <div className="absolute -top-0.5 -left-1 w-2.5 h-2.5 rounded-full bg-gray-900" />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2.5 flex-wrap">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-[10px] font-mono text-gray-500">
              {s.label} {compact(s.value)}
            </span>
          </div>
        ))}
        <div className="ml-auto text-[10px] font-mono">
          {gap > 0 ? (
            <span className="text-red-600 font-semibold">
              Short {compact(gap)} SAR
            </span>
          ) : (
            <span className="text-emerald-700 font-semibold">
              Over by {compact(Math.abs(gap))} SAR
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoverageRail;
