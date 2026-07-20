import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useCurrency } from "../../../contexts/CurrencyContext";

// ── Y-axis / tooltip value formatter ─────────────────────────────────────────

const formatK = (value) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `${Math.round(value / 1_000)}K`;
  return `${Math.round(value || 0)}`;
};

/**
 * ForecastGroupBreakdown
 *
 * Props:
 *   groups — [{ name, dealCount, totalValue, weightedValue }] from
 *            forecastService.getForecastGroupBreakdown(), pre-sorted desc.
 */
const ForecastGroupBreakdown = ({ groups = [] }) => {
  const { formatCurrency } = useCurrency();

  if (!groups.length) return null;

  const totalWeighted = groups.reduce((s, g) => s + g.weightedValue, 0);
  const totalPipeline = groups.reduce((s, g) => s + g.totalValue, 0);
  const totalDeals    = groups.reduce((s, g) => s + g.dealCount, 0);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-enterprise-md min-w-40">
        <p className="text-xs font-semibold text-card-foreground mb-2">{label}</p>
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">
                {entry.dataKey === "weightedValue" ? "Weighted" : "Total Pipeline"}
              </span>
            </span>
            <span className="font-semibold tabular-nums text-card-foreground">
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <h3 className="text-base font-semibold text-card-foreground mb-0.5">
        Forecast by Product Group
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Weighted open-pipeline value per material group
      </p>

      {/* Bar chart */}
      <div className="bg-card border border-border rounded-lg p-4 mb-4 enterprise-shadow">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={groups} margin={{ top: 5, right: 20, bottom: 48, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={60}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatK}
              tick={{ fontSize: 11 }}
              width={52}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
            <Legend
              formatter={(value) =>
                value === "weightedValue" ? "Weighted" : "Total Pipeline"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="totalValue"    name="totalValue"    fill="#DBEAFE" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="weightedValue" name="weightedValue" fill="#2B4A7A" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden enterprise-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-xs text-muted-foreground font-medium border-b border-border">
                <th className="text-left   px-4 py-3">Product Group</th>
                <th className="text-center px-4 py-3">Deals</th>
                <th className="text-right  px-4 py-3">Total Pipeline</th>
                <th className="text-right  px-4 py-3">Weighted Value</th>
                <th className="text-right  px-4 py-3">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const pct = totalWeighted > 0 ? (g.weightedValue / totalWeighted) * 100 : 0;
                const pctColor = pct >= 20 ? "#059669" : pct >= 10 ? "#D97706" : "#6B7280";
                return (
                  <tr
                    key={g.name}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-card-foreground">{g.name}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{g.dealCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(g.totalValue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: "#2B4A7A" }}>
                      {formatCurrency(g.weightedValue)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium" style={{ color: pctColor }}>
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 border-t-2 border-border text-sm font-semibold">
                <td className="px-4 py-3 text-card-foreground">Total</td>
                <td className="px-4 py-3 text-center text-card-foreground">{totalDeals}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {formatCurrency(totalPipeline)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#2B4A7A" }}>
                  {formatCurrency(totalWeighted)}
                </td>
                <td className="px-4 py-3 text-right text-card-foreground">
                  {totalWeighted > 0 ? "100%" : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ForecastGroupBreakdown;
