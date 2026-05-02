import React, { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useCurrency } from "../../../contexts/CurrencyContext";

const STAGE_COLORS = {
  lead:          "#64748b",
  contact_made:  "#3b82f6",
  proposal_sent: "#f59e0b",
  negotiation:   "#f97316",
  won:           "#10b981",
  lost:          "#ef4444",
};
const STAGE_LABELS = {
  lead: "Lead", contact_made: "Qualified", proposal_sent: "Proposal",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};

const WinLossChart = ({ deals = [] }) => {
  const { formatCurrency } = useCurrency();

  const byStage = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      if (!map[d.stage]) map[d.stage] = { stage: d.stage, count: 0, value: 0 };
      map[d.stage].count++;
      map[d.stage].value += d.amount || 0;
    });
    return Object.values(map).map((s) => ({
      ...s,
      name:  STAGE_LABELS[s.stage] ?? s.stage,
      fill:  STAGE_COLORS[s.stage]  ?? "#94a3b8",
    }));
  }, [deals]);

  const won  = deals.filter((d) => d.stage === "won");
  const lost = deals.filter((d) => d.stage === "lost");
  const closed = won.length + lost.length;

  const winLossPie = [
    { name: "Won",  value: won.length,  fill: "#10b981" },
    { name: "Lost", value: lost.length, fill: "#ef4444" },
    { name: "Open", value: deals.length - closed, fill: "#3b82f6" },
  ].filter((d) => d.value > 0);

  const WLTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 text-xs shadow-enterprise-md">
        <p className="font-semibold mb-1" style={{ color: d.fill }}>{d.name}</p>
        <p className="text-muted-foreground">Count: <span className="font-medium text-card-foreground">{d.value}</span></p>
      </div>
    );
  };

  const StageTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 text-xs shadow-enterprise-md">
        <p className="font-semibold mb-1">{d.name}</p>
        <p className="text-muted-foreground">Count: <span className="font-medium text-card-foreground">{d.count}</span></p>
        <p className="text-muted-foreground">Value: <span className="font-medium text-card-foreground">{formatCurrency(d.value)}</span></p>
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-card-foreground">Win / Loss Analysis</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Deal outcomes and stage distribution</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Win/Loss Donut */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3">Outcome Breakdown</p>
          <div className="h-44 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={winLossPie} cx="50%" cy="50%" innerRadius="52%" outerRadius="78%" paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                  {winLossPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip content={<WLTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold text-card-foreground">{closed}</span>
              <span className="text-[10px] text-muted-foreground">Closed</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 mt-2">
            {winLossPie.map((d) => (
              <span key={d.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                {d.name}: <span className="font-semibold text-card-foreground">{d.value}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Stage bar chart */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3">Deals by Stage</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStage} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} width={72} />
                <Tooltip content={<StageTooltip />} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {byStage.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Win rate summary */}
      {closed > 0 && (
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-bold text-emerald-600">{Math.round((won.length / closed) * 100)}%</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <div>
            <p className="text-lg font-bold text-card-foreground">{formatCurrency(won.reduce((s, d) => s + (d.amount || 0), 0))}</p>
            <p className="text-xs text-muted-foreground">Won Value</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-500">{Math.round((lost.length / closed) * 100)}%</p>
            <p className="text-xs text-muted-foreground">Loss Rate</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WinLossChart;
