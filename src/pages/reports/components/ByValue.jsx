import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const STAGE_LABELS = {
  lead: "Lead", contact_made: "Qualified", proposal_sent: "Proposal",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};
const STAGE_COLORS = {
  lead: "#93C5FD", contact_made: "#6EE7B7", proposal_sent: "#FCD34D",
  negotiation: "#FDBA74", won: "#16A34A", lost: "#DC2626",
};
const PIE_COLORS = ["#2563EB","#16A34A","#D97706","#7C3AED","#0891B2","#DB2777"];

const fmt = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

const CurrTip = ({ active, payload, label, formatCurrency }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color }}>{e.name}: {formatCurrency(e.value)}</p>
      ))}
    </div>
  );
};

const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  return new Date(+y, +m - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

const ByValue = ({ deals, formatCurrency }) => {
  const stats = useMemo(() => {
    let pipeline = 0, won = 0, lost = 0, wonCount = 0, lostCount = 0;
    deals.forEach((d) => {
      if (d.stage === "won")       { won += d.amount || 0; wonCount++; }
      else if (d.stage === "lost") { lost += d.amount || 0; lostCount++; }
      else                         { pipeline += d.amount || 0; }
    });
    const closed = wonCount + lostCount;
    return { pipeline, won, lost, winRate: closed ? Math.round(wonCount / closed * 100) : 0, wonCount, lostCount };
  }, [deals]);

  const monthData = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      const key = d.created_at?.slice(0, 7);
      if (!key) return;
      if (!map[key]) map[key] = { month: key, Won: 0, Pipeline: 0, Lost: 0 };
      if (d.stage === "won")       map[key].Won      += d.amount || 0;
      else if (d.stage === "lost") map[key].Lost     += d.amount || 0;
      else                         map[key].Pipeline += d.amount || 0;
    });
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({ ...r, month: monthLabel(r.month) }));
  }, [deals]);

  const stageData = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      const s = d.stage;
      if (!map[s]) map[s] = { name: STAGE_LABELS[s] || s, value: 0, count: 0 };
      map[s].value += d.amount || 0;
      map[s].count++;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [deals]);

  if (!deals.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <span className="text-5xl mb-3">📊</span>
      <p className="text-sm">No deals in this period.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Pipeline", value: formatCurrency(stats.pipeline), color: "text-blue-600",  bg: "bg-blue-50"  },
          { label: "Won",             value: formatCurrency(stats.won),      color: "text-green-600", bg: "bg-green-50" },
          { label: "Lost",            value: formatCurrency(stats.lost),     color: "text-red-500",   bg: "bg-red-50"   },
          { label: "Win Rate",        value: `${stats.winRate}%`,            color: "text-purple-600",bg: "bg-purple-50"},
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 border border-white/60`}>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Monthly bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Month</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={48} />
            <Tooltip content={<CurrTip formatCurrency={formatCurrency} />} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Won"      fill="#16A34A" radius={[3,3,0,0]} />
            <Bar dataKey="Pipeline" fill="#2563EB" radius={[3,3,0,0]} />
            <Bar dataKey="Lost"     fill="#DC2626" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stage breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Stage Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={stageData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                outerRadius={90}
                label={false}
              >
                {stageData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">By Stage</h3>
          <div className="space-y-3">
            {stageData.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <div className="flex-1 text-sm text-gray-700">{s.name}</div>
                <div className="text-sm font-semibold text-gray-900">{formatCurrency(s.value)}</div>
                <div className="text-xs text-gray-400 w-14 text-right">{s.count} deal{s.count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ByValue;
