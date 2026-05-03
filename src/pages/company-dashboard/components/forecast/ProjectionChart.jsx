import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// ── Y-axis / tooltip value formatter ─────────────────────────────────────────

const formatK = (value) => {
  if (value >= 1_000_000) return `SAR ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `SAR ${Math.round(value / 1_000)}K`;
  if (value > 0)          return `SAR ${value}`;
  return "SAR 0";
};

// ── Line definitions ──────────────────────────────────────────────────────────

const LINES = [
  {
    key:    "cumulativeCommitted",
    label:  "Committed",
    color:  "#10b981", // emerald-500
    width:  2.5,
    dash:   "",
  },
  {
    key:    "cumulativeWeighted",
    label:  "Weighted",
    color:  "#3b82f6", // blue-500
    width:  2.5,
    dash:   "",
  },
  {
    key:    "cumulativeBestCase",
    label:  "Best Case",
    color:  "#cbd5e1", // slate-300 — intentionally muted
    width:  1.5,
    dash:   "4 4",
  },
];

// ── Custom tooltip ────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-enterprise-md min-w-36">
      <p className="text-xs font-semibold text-card-foreground mb-2">{label}</p>
      <div className="space-y-1">
        {LINES.map((cfg) => {
          const entry = payload.find((p) => p.dataKey === cfg.key);
          if (!entry) return null;
          return (
            <div key={cfg.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="text-muted-foreground">{cfg.label}</span>
              </span>
              <span
                className="font-semibold tabular-nums"
                style={{ color: cfg.color }}
              >
                {formatK(entry.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * ProjectionChart
 *
 * Props:
 *   projection  — 12-entry array from buildForecast().projection
 *   target      — revenue target amount (number); pass 0 / null to hide the line
 */
const ProjectionChart = ({ projection = [], target = 0 }) => {
  const data = projection.map((p) => ({
    label:               `W${p.week}`,
    tooltip:             `${p.label}`,         // "May 5" style sub-label for tooltip
    cumulativeCommitted: p.cumulativeCommitted,
    cumulativeWeighted:  p.cumulativeWeighted,
    cumulativeBestCase:  p.cumulativeBestCase,
  }));

  const hasData = projection.some(
    (p) => p.cumulativeWeighted > 0 || p.cumulativeCommitted > 0 || p.cumulativeBestCase > 0,
  );

  const showTarget = target > 0;

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">
            12-Week Projection
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cumulative revenue by scenario
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {LINES.map((cfg) => (
            <span key={cfg.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <svg width="20" height="8" className="flex-shrink-0" aria-hidden>
                <line
                  x1="0" y1="4" x2="20" y2="4"
                  stroke={cfg.color}
                  strokeWidth={cfg.width}
                  strokeDasharray={cfg.dash}
                />
              </svg>
              {cfg.label}
            </span>
          ))}
          {showTarget && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <svg width="20" height="8" className="flex-shrink-0" aria-hidden>
                <line
                  x1="0" y1="4" x2="20" y2="4"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                />
              </svg>
              Target
            </span>
          )}
        </div>
      </div>

      {/* Chart or empty state */}
      {!hasData ? (
        <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
          No pipeline data for this period
        </div>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />

              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
                tickFormatter={formatK}
                width={52}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
              />

              {/* Target reference line */}
              {showTarget && (
                <ReferenceLine
                  y={target}
                  stroke="#ef4444"
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  label={{
                    value: formatK(target),
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#ef4444",
                    dy: -4,
                  }}
                />
              )}

              {/* Data lines — render best case first so it sits behind the others */}
              {[...LINES].reverse().map((cfg) => (
                <Line
                  key={cfg.key}
                  type="monotone"
                  dataKey={cfg.key}
                  stroke={cfg.color}
                  strokeWidth={cfg.width}
                  strokeDasharray={cfg.dash}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0, fill: cfg.color }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default ProjectionChart;
