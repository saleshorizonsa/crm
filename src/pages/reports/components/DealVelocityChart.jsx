import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { useCurrency } from "../../../contexts/CurrencyContext";

const STAGE_COLORS = {
  lead:          "#64748b",
  contact_made:  "#3b82f6",
  proposal_sent: "#f59e0b",
  negotiation:   "#f97316",
  won:           "#10b981",
};
const STAGE_LABELS = {
  lead: "Lead", contact_made: "Qualified", proposal_sent: "Proposal",
  negotiation: "Negotiation", won: "Won",
};

const DealVelocityChart = ({ deals = [] }) => {
  const { formatCurrency } = useCurrency();

  const { avgDays, velocityData, radarData } = useMemo(() => {
    const stageTimes = {};
    const stageCounts = {};

    deals.forEach((d) => {
      if (!d.created_at || !d.expected_close_date) return;
      const days = Math.round(
        (new Date(d.expected_close_date) - new Date(d.created_at)) / 86400000,
      );
      if (days < 0 || days > 730) return;
      const s = d.stage;
      if (!stageTimes[s])  stageTimes[s]  = 0;
      if (!stageCounts[s]) stageCounts[s] = 0;
      stageTimes[s]  += days;
      stageCounts[s]++;
    });

    const velocityData = Object.keys(STAGE_LABELS).map((s) => ({
      stage: STAGE_LABELS[s],
      avgDays: stageCounts[s] > 0 ? Math.round(stageTimes[s] / stageCounts[s]) : 0,
      count:   stageCounts[s] || 0,
      fill:    STAGE_COLORS[s],
    })).filter((s) => s.count > 0);

    const allDays = Object.keys(stageTimes).reduce((s, k) => s + stageTimes[k], 0);
    const allCounts = Object.values(stageCounts).reduce((s, v) => s + v, 0);
    const avgDays = allCounts > 0 ? Math.round(allDays / allCounts) : 0;

    // Radar data: deal health dimensions
    const openDeals  = deals.filter((d) => !["won", "lost"].includes(d.stage));
    const wonDeals   = deals.filter((d) => d.stage === "won");
    const lostDeals  = deals.filter((d) => d.stage === "lost");
    const closed     = wonDeals.length + lostDeals.length;
    const highPri    = deals.filter((d) => d.priority === "high").length;
    const today      = new Date(); today.setHours(0, 0, 0, 0);
    const overdue    = openDeals.filter((d) => d.expected_close_date && new Date(d.expected_close_date) < today).length;

    const radarData = [
      { subject: "Win Rate",       value: closed > 0 ? Math.round((wonDeals.length / closed) * 100) : 0 },
      { subject: "Deal Volume",    value: Math.min(deals.length * 5, 100) },
      { subject: "High Priority",  value: deals.length > 0 ? Math.round((highPri / deals.length) * 100) : 0 },
      { subject: "On Track",       value: openDeals.length > 0 ? Math.round(((openDeals.length - overdue) / openDeals.length) * 100) : 100 },
      { subject: "Avg Deal Size",  value: Math.min(Math.round((wonDeals.reduce((s, d) => s + (d.amount || 0), 0) / Math.max(wonDeals.length, 1)) / 1000), 100) },
    ];

    return { avgDays, velocityData, radarData };
  }, [deals]);

  const VelTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 text-xs shadow-enterprise-md">
        <p className="font-semibold mb-1">{d.stage}</p>
        <p className="text-muted-foreground">Avg days: <span className="font-medium text-card-foreground">{d.avgDays}</span></p>
        <p className="text-muted-foreground">Deals: <span className="font-medium text-card-foreground">{d.count}</span></p>
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-card-foreground">Deal Velocity & Health</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Average days per stage · Overall avg: <span className="font-medium text-card-foreground">{avgDays} days</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Velocity bar chart */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Avg Days to Close by Stage</p>
          {velocityData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              No close date data available
            </div>
          ) : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={velocityData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="stage" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="d" width={28} />
                  <Tooltip content={<VelTooltip />} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
                  <Bar dataKey="avgDays" radius={[4, 4, 0, 0]}>
                    {velocityData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Health radar */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Pipeline Health Score</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealVelocityChart;
