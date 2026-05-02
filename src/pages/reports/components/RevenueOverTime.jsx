import React, { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Line,
} from "recharts";
import { useCurrency } from "../../../contexts/CurrencyContext";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (v, formatCurrency) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
};

const CustomTooltip = ({ active, payload, label, formatCurrency }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-enterprise-md text-xs min-w-36">
      <p className="font-semibold text-card-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums" style={{ color: p.color }}>
            {p.name === "Deals" ? p.value : formatCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const RevenueOverTime = ({ deals = [] }) => {
  const { formatCurrency } = useCurrency();

  const monthly = useMemo(() => {
    const map = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map[key] = { month: MONTHS[d.getMonth()], revenue: 0, pipeline: 0, deals: 0, wonDeals: 0 };
    }
    deals.forEach((deal) => {
      const d = new Date(deal.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map[key]) return;
      map[key].deals++;
      map[key].pipeline += deal.amount || 0;
      if (deal.stage === "won") {
        map[key].revenue   += deal.amount || 0;
        map[key].wonDeals++;
      }
    });
    return Object.values(map);
  }, [deals]);

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-card-foreground">Revenue Over Time</h3>
        <p className="text-xs text-muted-foreground mt-0.5">6-month revenue vs pipeline</p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={monthly} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} width={48} />
            <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
            <Area type="monotone" dataKey="pipeline" name="Pipeline" fill="url(#revGrad)" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={0.4} />
            <Area type="monotone" dataKey="revenue"  name="Revenue"  fill="url(#revGrad)" stroke="#10b981" strokeWidth={2.5} fillOpacity={0.6} />
            <Line type="monotone" dataKey="deals"    name="Deals"    stroke="#f59e0b"     strokeWidth={2} dot={false} yAxisId={0} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueOverTime;
