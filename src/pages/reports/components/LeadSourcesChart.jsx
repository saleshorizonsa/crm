import React, { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";

const SOURCE_COLORS = [
  "#6366f1","#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899",
];
const SOURCE_LABELS = {
  website:        "Website",
  referral:       "Referral",
  cold_call:      "Cold Call",
  social_media:   "Social Media",
  email_campaign: "Email Campaign",
  event:          "Event",
  other:          "Other",
};

const LeadSourcesChart = ({ contacts = [], deals = [] }) => {
  const sourceData = useMemo(() => {
    const map = {};
    contacts.forEach((c) => {
      const src = c.lead_source || "other";
      if (!map[src]) map[src] = { source: src, name: SOURCE_LABELS[src] ?? src, count: 0 };
      map[src].count++;
    });
    // Fallback: derive from deal contacts if no standalone contacts
    if (contacts.length === 0) {
      deals.forEach((d) => {
        const src = d.contact?.lead_source || "other";
        if (!map[src]) map[src] = { source: src, name: SOURCE_LABELS[src] ?? src, count: 0 };
        map[src].count++;
      });
    }
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .map((s, i) => ({ ...s, fill: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
  }, [contacts, deals]);

  const total = sourceData.reduce((s, d) => s + d.count, 0);

  const SrcTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 text-xs shadow-enterprise-md">
        <p className="font-semibold mb-1" style={{ color: d.fill }}>{d.name}</p>
        <p className="text-muted-foreground">
          Leads: <span className="font-medium text-card-foreground">{d.count}</span>
          <span className="ml-2 text-muted-foreground">({total > 0 ? Math.round((d.count / total) * 100) : 0}%)</span>
        </p>
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-card-foreground">Lead Sources</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Where your contacts are coming from</p>
      </div>

      {sourceData.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          No lead source data for this period
        </div>
      ) : (
        <>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} width={96} />
                <Tooltip content={<SrcTooltip />} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {sourceData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Compact legend */}
          <div className="mt-4 grid grid-cols-2 gap-1.5">
            {sourceData.map((s) => (
              <div key={s.source} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.fill }} />
                  {s.name}
                </span>
                <span className="font-semibold text-card-foreground tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default LeadSourcesChart;
