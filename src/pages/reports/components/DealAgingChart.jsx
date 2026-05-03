import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const BUCKETS = [
  { label: "0–30d",  min: 0,   max: 30,       color: "#10b981", badge: "bg-emerald-100 text-emerald-700", name: "Fresh"   },
  { label: "31–60d", min: 30,  max: 60,       color: "#f59e0b", badge: "bg-amber-100 text-amber-700",    name: "Active"  },
  { label: "61–90d", min: 60,  max: 90,       color: "#f97316", badge: "bg-orange-100 text-orange-700",  name: "Aging"   },
  { label: "90d+",   min: 90,  max: Infinity, color: "#ef4444", badge: "bg-red-100 text-red-600",        name: "Stale"   },
];

const ageBadge = (age) => {
  if (age > 90) return { cls: "bg-red-100 text-red-600",    label: `${age}d` };
  if (age > 60) return { cls: "bg-orange-100 text-orange-600", label: `${age}d` };
  if (age > 30) return { cls: "bg-amber-100 text-amber-600",  label: `${age}d` };
  return           { cls: "bg-emerald-100 text-emerald-700", label: `${age}d` };
};

const STAGE_SHORT = {
  lead: "Lead", contact_made: "Qualified", proposal_sent: "Proposal",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};

const DealAgingChart = ({ deals = [] }) => {
  const { formatCurrency } = useCurrency();
  const today = new Date();

  const openDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));

  const withAge = useMemo(
    () =>
      openDeals.map((d) => ({
        ...d,
        ageD: Math.floor((today - new Date(d.created_at)) / 86400000),
        overdue: d.expected_close_date && new Date(d.expected_close_date) < today,
      })),
    [openDeals],
  );

  const bucketData = BUCKETS.map((b) => {
    const hits = withAge.filter((d) => d.ageD > b.min && d.ageD <= b.max);
    return {
      ...b,
      count: hits.length,
      value: hits.reduce((s, d) => s + (d.amount || 0), 0),
    };
  });

  const overdueCount = withAge.filter((d) => d.overdue).length;
  const stalest      = [...withAge].sort((a, b) => b.ageD - a.ageD).slice(0, 6);
  const totalValue   = withAge.reduce((s, d) => s + (d.amount || 0), 0);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-2.5 text-xs">
        <p className="font-semibold text-card-foreground mb-1">{d.name} ({d.label})</p>
        <p className="text-muted-foreground">{d.count} deals · {formatCurrency(d.value)}</p>
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg enterprise-shadow p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Deal Aging</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {openDeals.length} open deals · {formatCurrency(totalValue)} at risk
          </p>
        </div>
        {overdueCount > 0 ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
            <Icon name="AlertTriangle" size={11} />
            {overdueCount} overdue
          </span>
        ) : (
          <div className="w-7 h-7 rounded-md bg-amber-100 flex items-center justify-center">
            <Icon name="Clock" size={14} className="text-amber-600" />
          </div>
        )}
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {bucketData.map((b) => (
          <div key={b.label} className="text-center p-2 rounded-lg bg-muted/40">
            <p className="text-xs font-bold text-card-foreground">{b.count}</p>
            <p className="text-[10px] text-muted-foreground">{b.name}</p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="h-32 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bucketData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barSize={32}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {bucketData.map((b) => (
                <Cell key={b.label} fill={b.color} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Oldest deals list */}
      {stalest.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Oldest open deals
          </p>
          <div className="space-y-1.5">
            {stalest.map((d) => {
              const ab = ageBadge(d.ageD);
              return (
                <div key={d.id} className="flex items-center gap-2">
                  <div
                    className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                      d.ageD > 90 ? "bg-red-500" : d.ageD > 60 ? "bg-orange-400" : d.ageD > 30 ? "bg-amber-400" : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-xs text-card-foreground truncate flex-1 min-w-0">
                    {d.title || "Untitled"}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {STAGE_SHORT[d.stage] ?? d.stage}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                    {formatCurrency(d.amount || 0)}
                  </span>
                  <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${ab.cls}`}>
                    {ab.label}
                  </span>
                  {d.overdue && (
                    <Icon name="AlertCircle" size={10} className="text-red-500 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {openDeals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <Icon name="CheckCircle" size={28} className="mb-2 text-emerald-500 opacity-60" />
          <p className="text-xs">No open deals — great job closing!</p>
        </div>
      )}
    </div>
  );
};

export default DealAgingChart;
