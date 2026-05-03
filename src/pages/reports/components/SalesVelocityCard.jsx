import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// Build monthly cumulative revenue for a sparkline
const buildMonthlyData = (deals) => {
  const won = deals.filter((d) => d.stage === "won");
  const monthly = {};
  won.forEach((d) => {
    if (!d.created_at) return;
    const key = new Date(d.created_at).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    monthly[key] = (monthly[key] || 0) + (d.amount || 0);
  });
  return Object.entries(monthly)
    .map(([month, revenue]) => ({ month, revenue }))
    .slice(-6);
};

const SalesVelocityCard = ({ deals = [], prevDeals = [] }) => {
  const { formatCurrency } = useCurrency();

  const won    = deals.filter((d) => d.stage === "won");
  const open   = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const closed = deals.filter((d) => ["won", "lost"].includes(d.stage));

  const winRate    = closed.length > 0 ? won.length / closed.length : 0;
  const avgDeal    = won.length > 0 ? won.reduce((s, d) => s + (d.amount || 0), 0) / won.length : 0;
  const revenue    = won.reduce((s, d) => s + (d.amount || 0), 0);

  // Avg sales cycle from created_at to expected_close_date for won deals
  const wonDated = won.filter((d) => d.created_at && d.expected_close_date);
  const avgCycleDays = wonDated.length > 0
    ? wonDated.reduce((s, d) => {
        const days = Math.max(1, (new Date(d.expected_close_date) - new Date(d.created_at)) / 86400000);
        return s + days;
      }, 0) / wonDated.length
    : 30;

  // Sales Velocity = (Open Deals × Win Rate × Avg Deal Size) / Avg Cycle Days
  const velocity         = avgCycleDays > 0 ? (open.length * winRate * avgDeal) / avgCycleDays : 0;
  const monthlyForecast  = velocity * 30;
  const quarterlyForecast = velocity * 90;

  // Previous period comparison
  const pWon    = prevDeals.filter((d) => d.stage === "won");
  const pClosed = prevDeals.filter((d) => ["won", "lost"].includes(d.stage));
  const pOpen   = prevDeals.filter((d) => !["won", "lost"].includes(d.stage));
  const pWinRate = pClosed.length > 0 ? pWon.length / pClosed.length : 0;
  const pAvgDeal = pWon.length > 0 ? pWon.reduce((s, d) => s + (d.amount || 0), 0) / pWon.length : 0;
  const pVelocity = avgCycleDays > 0 ? (pOpen.length * pWinRate * pAvgDeal) / avgCycleDays : 0;
  const velDelta  = pVelocity > 0 ? Math.round(((velocity - pVelocity) / pVelocity) * 100) : null;

  const sparkData = buildMonthlyData(deals);

  const metrics = [
    {
      label: "Open Deals",
      value: open.length,
      icon: "Layers",
      color: "text-blue-600",
      bg: "bg-blue-50",
      tip: "Active deals in pipeline",
    },
    {
      label: "Win Rate",
      value: `${Math.round(winRate * 100)}%`,
      icon: "Target",
      color: "text-violet-600",
      bg: "bg-violet-50",
      tip: "Won / Closed ratio",
    },
    {
      label: "Avg Deal Size",
      value: formatCurrency(avgDeal),
      icon: "DollarSign",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      tip: "Average won deal value",
    },
    {
      label: "Avg Cycle",
      value: `${Math.round(avgCycleDays)}d`,
      icon: "Clock",
      color: "text-amber-600",
      bg: "bg-amber-50",
      tip: "Days from create to close",
    },
  ];

  return (
    <div className="bg-card border border-border rounded-lg enterprise-shadow p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Sales Velocity</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Pipeline revenue per day</p>
        </div>
        <div className="w-7 h-7 rounded-md bg-emerald-100 flex items-center justify-center">
          <Icon name="Zap" size={14} className="text-emerald-600" />
        </div>
      </div>

      {/* Velocity figure */}
      <div className="flex items-end gap-2 mb-0.5">
        <span className="text-3xl font-bold tabular-nums text-emerald-700">
          {formatCurrency(velocity)}
        </span>
        <span className="text-sm text-muted-foreground pb-1">/ day</span>
        {velDelta !== null && (
          <span className={`pb-1 ml-1 flex items-center gap-0.5 text-xs font-semibold ${velDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            <Icon name={velDelta >= 0 ? "TrendingUp" : "TrendingDown"} size={12} />
            {velDelta >= 0 ? "+" : ""}{velDelta}%
          </span>
        )}
      </div>
      <div className="flex gap-4 mb-4">
        <div>
          <span className="text-xs text-muted-foreground">30-day forecast: </span>
          <span className="text-xs font-semibold text-card-foreground">{formatCurrency(monthlyForecast)}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Quarter: </span>
          <span className="text-xs font-semibold text-card-foreground">{formatCurrency(quarterlyForecast)}</span>
        </div>
      </div>

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <div className="h-20 mb-4 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(v) => [formatCurrency(v), "Revenue"]}
                contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb" }}
                labelStyle={{ fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: "#10b981" }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Component breakdown */}
      <div className="grid grid-cols-2 gap-2.5">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40" title={m.tip}>
            <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${m.bg}`}>
              <Icon name={m.icon} size={13} className={m.color} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-none">{m.label}</p>
              <p className="text-xs font-semibold text-card-foreground tabular-nums mt-0.5">{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground text-center opacity-70">
        Formula: (Open Deals × Win Rate × Avg Deal) ÷ Avg Cycle Days
      </p>
    </div>
  );
};

export default SalesVelocityCard;
