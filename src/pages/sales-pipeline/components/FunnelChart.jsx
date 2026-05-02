import React, { useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Legend,
} from "recharts";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

// ── Chart type switcher config ─────────────────────────────────────────────

const CHART_TYPES = [
  { id: "classic",  label: "Classic",  icon: "AlignJustify" },
  { id: "pyramid",  label: "Pyramid",  icon: "Triangle"     },
  { id: "wave",     label: "Wave",     icon: "Activity"     },
  { id: "donut",    label: "Donut",    icon: "PieChart"     },
  { id: "radial",   label: "Radial",   icon: "CircleDot"    },
];

// ── Tooltip helper ─────────────────────────────────────────────────────────

const FunnelTooltip = ({ active, payload, formatCurrency }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-enterprise-md text-xs">
      <p className="font-semibold text-card-foreground mb-1">{d?.stage || d?.name}</p>
      <p className="text-muted-foreground">
        Deals: <span className="font-medium text-card-foreground">{d?.count ?? d?.value}</span>
      </p>
      {d?.value !== undefined && d?.count !== undefined && (
        <p className="text-muted-foreground">
          Value: <span className="font-medium text-card-foreground">{formatCurrency(d.value)}</span>
        </p>
      )}
    </div>
  );
};

// ── Classic chart ──────────────────────────────────────────────────────────

const ClassicFunnel = ({ data, formatCurrency }) => {
  const maxCount = Math.max(...data.map((s) => s.count), 1);
  return (
    <div className="space-y-2 py-2">
      {data.map((stage, idx) => {
        const widthPct = Math.max((stage.count / maxCount) * 100, 8);
        const conv = idx > 0 && data[idx - 1].count > 0
          ? ((stage.count / data[idx - 1].count) * 100).toFixed(0)
          : "—";
        return (
          <div key={stage.stage} className="group">
            {idx > 0 && (
              <div className="flex items-center justify-center my-1">
                <div className="w-px h-3 bg-border" />
                <span className="mx-2 text-[10px] text-muted-foreground tabular-nums bg-muted/40 px-1.5 py-0.5 rounded-full">
                  {conv}% pass-through
                </span>
                <div className="w-px h-3 bg-border" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs font-medium text-card-foreground text-right flex-shrink-0">
                {stage.stage}
              </span>
              <div className="flex-1 flex items-center">
                <div
                  className="h-10 rounded-lg flex items-center justify-between px-3 transition-all duration-500"
                  style={{ width: `${widthPct}%`, minWidth: 120, backgroundColor: stage.fill }}
                >
                  <span className="text-white text-xs font-bold">{stage.count}</span>
                  <span className="text-white text-xs font-semibold opacity-90 hidden sm:block">
                    {formatCurrency(stage.value)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Pyramid chart (SVG trapezoids) ─────────────────────────────────────────

const PyramidFunnel = ({ data, formatCurrency }) => {
  const W = 600;
  const rowH = 68;
  const totalH = data.length * rowH;
  const maxCount = Math.max(...data.map((s) => s.count), 1);

  const getW = (i) => Math.max((data[i].count / maxCount) * W * 0.92, W * 0.08);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox={`0 0 ${W} ${totalH + 8}`} className="w-full max-w-xl" aria-label="Pipeline Pyramid">
        {data.map((stage, i) => {
          const topW   = i === 0 ? getW(0) : getW(i - 1);
          const botW   = getW(i);
          const tl = (W - topW) / 2;
          const tr = (W + topW) / 2;
          const bl = (W - botW) / 2;
          const br = (W + botW) / 2;
          const y  = i * rowH;
          const gap = 4;
          const points = `${tl + gap},${y + gap} ${tr - gap},${y + gap} ${br - gap},${y + rowH - gap} ${bl + gap},${y + rowH - gap}`;
          const midX = W / 2;
          const midY = y + rowH / 2;
          return (
            <g key={stage.stage}>
              <polygon points={points} fill={stage.fill} opacity="0.9" className="drop-shadow-sm" />
              <text x={midX} y={midY - 7} textAnchor="middle" fill="white" fontSize="12" fontWeight="700">
                {stage.stage}
              </text>
              <text x={midX} y={midY + 9} textAnchor="middle" fill="white" fontSize="11" opacity="0.9">
                {stage.count} deals · {formatCurrency(stage.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ── Wave chart (SVG bezier curves) ────────────────────────────────────────

const WaveFunnel = ({ data, formatCurrency }) => {
  const W = 600;
  const rowH = 72;
  const totalH = data.length * rowH;
  const maxCount = Math.max(...data.map((s) => s.count), 1);

  const getW = (i) => Math.max((data[i].count / maxCount) * W * 0.92, W * 0.1);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full max-w-xl" aria-label="Pipeline Wave">
        {data.map((stage, i) => {
          const prevW = i === 0 ? getW(0) : getW(i - 1);
          const currW = getW(i);
          const tl = (W - prevW) / 2;
          const tr = (W + prevW) / 2;
          const bl = (W - currW) / 2;
          const br = (W + currW) / 2;
          const yTop = i * rowH;
          const yBot = yTop + rowH;
          const midY = (yTop + yBot) / 2;
          // Bezier control point at mid-height for smooth wave
          const d = [
            `M ${tl} ${yTop}`,
            `C ${tl} ${midY}, ${bl} ${midY}, ${bl} ${yBot}`,
            `L ${br} ${yBot}`,
            `C ${br} ${midY}, ${tr} ${midY}, ${tr} ${yTop}`,
            "Z",
          ].join(" ");
          const midX = W / 2;
          const midTextY = midY;
          return (
            <g key={stage.stage}>
              <path d={d} fill={stage.fill} opacity="0.88" />
              {/* Separator line */}
              {i < data.length - 1 && (
                <line
                  x1={bl} y1={yBot}
                  x2={br} y2={yBot}
                  stroke="white" strokeWidth="1.5" opacity="0.4"
                />
              )}
              <text x={midX} y={midTextY - 8} textAnchor="middle" fill="white" fontSize="12" fontWeight="700">
                {stage.stage}
              </text>
              <text x={midX} y={midTextY + 8} textAnchor="middle" fill="white" fontSize="11" opacity="0.9">
                {stage.count} deals · {formatCurrency(stage.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ── Donut chart (Recharts) ──────────────────────────────────────────────────

const DonutFunnel = ({ data, formatCurrency }) => {
  const donutData = data.map((s) => ({ name: s.stage, value: s.count, fill: s.fill, rawValue: s.value }));
  const totalCount = data.reduce((s, d) => s + d.count, 0);
  const totalValue = data.reduce((s, d) => s + d.value, 0);

  const DonutTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-enterprise-md text-xs">
        <p className="font-semibold mb-1" style={{ color: d.fill }}>{d.name}</p>
        <p className="text-muted-foreground">Deals: <span className="font-medium text-card-foreground">{d.value}</span></p>
        <p className="text-muted-foreground">Value: <span className="font-medium text-card-foreground">{formatCurrency(d.rawValue)}</span></p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="h-72 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={donutData}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
            >
              {donutData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip formatCurrency={formatCurrency} />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-card-foreground">{totalCount}</span>
          <span className="text-xs text-muted-foreground">Total Deals</span>
          <span className="text-xs font-medium text-primary mt-0.5">{formatCurrency(totalValue)}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {donutData.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.fill }} />
            <span className="text-muted-foreground truncate">{d.name}</span>
            <span className="font-semibold text-card-foreground ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Radial chart (Recharts) ────────────────────────────────────────────────

const RadialFunnel = ({ data, formatCurrency }) => {
  const maxVal = Math.max(...data.map((s) => s.value), 1);
  const radialData = [...data].reverse().map((s, i) => ({
    name:  s.stage,
    value: Math.round((s.value / maxVal) * 100),
    fill:  s.fill,
    count: s.count,
    rawValue: s.value,
  }));

  const RadialTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-enterprise-md text-xs">
        <p className="font-semibold mb-1" style={{ color: d.fill }}>{d.name}</p>
        <p className="text-muted-foreground">Deals: <span className="font-medium text-card-foreground">{d.count}</span></p>
        <p className="text-muted-foreground">Value: <span className="font-medium text-card-foreground">{formatCurrency(d.rawValue)}</span></p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="20%"
            outerRadius="90%"
            barSize={12}
            data={radialData}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar
              background={{ fill: "var(--color-muted)" }}
              dataKey="value"
              cornerRadius={6}
              label={false}
            >
              {radialData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </RadialBar>
            <Tooltip content={<RadialTooltip formatCurrency={formatCurrency} />} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {data.map((d) => (
          <div key={d.stage} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.fill }} />
            <span className="text-muted-foreground truncate">{d.stage}</span>
            <span className="font-semibold text-card-foreground ml-auto">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

const FunnelChart = ({ funnelData = [], showSwitcher = true, defaultType = "classic" }) => {
  const [chartType, setChartType] = useState(defaultType);
  const { formatCurrency } = useCurrency();

  const activeData = funnelData.filter((s) => s.count > 0);
  const hasData = activeData.length > 0;

  const renderChart = () => {
    const data = funnelData; // show all stages even if 0
    if (!hasData) {
      return (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          No deal data for this period
        </div>
      );
    }
    switch (chartType) {
      case "pyramid": return <PyramidFunnel data={data} formatCurrency={formatCurrency} />;
      case "wave":    return <WaveFunnel    data={data} formatCurrency={formatCurrency} />;
      case "donut":   return <DonutFunnel   data={data} formatCurrency={formatCurrency} />;
      case "radial":  return <RadialFunnel  data={data} formatCurrency={formatCurrency} />;
      default:        return <ClassicFunnel data={data} formatCurrency={formatCurrency} />;
    }
  };

  return (
    <div>
      {/* Chart type switcher */}
      {showSwitcher && (
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">View:</span>
          {CHART_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setChartType(type.id)}
              title={type.label}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                chartType === type.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon name={type.icon} size={12} />
              {type.label}
            </button>
          ))}
        </div>
      )}

      {renderChart()}
    </div>
  );
};

export default FunnelChart;
