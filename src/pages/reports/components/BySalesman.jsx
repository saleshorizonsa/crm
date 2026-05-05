import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["#2563EB","#16A34A","#D97706","#7C3AED","#0891B2","#DB2777","#EA580C","#65A30D"];

const fmt = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const pct = (a, b) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);

const STAGE_COLORS = {
  lead: "#93C5FD", contact_made: "#6EE7B7", proposal_sent: "#FCD34D",
  negotiation: "#FDBA74", won: "#16A34A", lost: "#DC2626",
};
const STAGE_LABELS = {
  lead: "Lead", contact_made: "Qualified", proposal_sent: "Proposal",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};

const BySalesman = ({ deals, formatCurrency }) => {
  const salesmen = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      const key   = d.owner?.id || "__none__";
      const label = d.owner?.full_name || "Unassigned";

      if (!map[key]) map[key] = {
        key, label, total: 0, won: 0, lost: 0, pipeline: 0,
        wonCount: 0, lostCount: 0, count: 0, stages: {},
      };

      const sm = map[key];
      sm.total += d.amount || 0;
      sm.count++;

      if (d.stage === "won")       { sm.won  += d.amount || 0; sm.wonCount++; }
      else if (d.stage === "lost") { sm.lost += d.amount || 0; sm.lostCount++; }
      else                         { sm.pipeline += d.amount || 0; }

      sm.stages[d.stage] = (sm.stages[d.stage] || 0) + 1;
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [deals]);

  const chartData = salesmen.map((s) => ({
    name: s.label.split(" ")[0],
    Won: s.won,
    Pipeline: s.pipeline,
    Lost: s.lost,
  }));

  if (!salesmen.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <span className="text-5xl mb-3">👤</span>
      <p className="text-sm">No salesman data in this period.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stacked bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Deal Value by Salesman</h3>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="Won"      stackId="a" fill="#16A34A" name="Won" />
            <Bar dataKey="Pipeline" stackId="a" fill="#2563EB" name="Pipeline" />
            <Bar dataKey="Lost"     stackId="a" fill="#DC2626" name="Lost" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Salesman cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {salesmen.map((s, i) => {
          const closed = s.wonCount + s.lostCount;
          const winRate = closed ? Math.round(s.wonCount / closed * 100) : null;
          const allStages = Object.entries(s.stages).sort((a, b) => b[1] - a[1]);

          return (
            <div key={s.key} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: COLORS[i % COLORS.length] }}>
                  {s.label.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{s.label}</p>
                  <p className="text-xs text-gray-400">{s.count} deal{s.count !== 1 ? "s" : ""}</p>
                </div>
                {winRate !== null && (
                  <span className={`ml-auto text-xs font-bold px-2 py-1 rounded-full ${
                    winRate >= 50 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                  }`}>
                    {winRate}% win
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Pipeline</p>
                  <p className="text-sm font-semibold text-blue-600">{fmt(s.pipeline)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Won</p>
                  <p className="text-sm font-semibold text-green-600">{fmt(s.won)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Lost</p>
                  <p className="text-sm font-semibold text-red-500">{fmt(s.lost)}</p>
                </div>
              </div>

              {/* Mini progress bar */}
              {s.total > 0 && (
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-3">
                  {s.won > 0 && <div className="bg-green-500" style={{ width: `${(s.won/s.total)*100}%` }} />}
                  {s.pipeline > 0 && <div className="bg-blue-400" style={{ width: `${(s.pipeline/s.total)*100}%` }} />}
                  {s.lost > 0 && <div className="bg-red-400" style={{ width: `${(s.lost/s.total)*100}%` }} />}
                </div>
              )}

              {/* Stage breakdown */}
              <div className="space-y-1">
                {allStages.map(([stage, count]) => (
                  <div key={stage} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STAGE_COLORS[stage] || "#9CA3AF" }} />
                    <span className="text-gray-500 flex-1">{STAGE_LABELS[stage] || stage}</span>
                    <span className="font-medium text-gray-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Team Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2.5 text-left">#</th>
                <th className="px-5 py-2.5 text-left">Salesman</th>
                <th className="px-5 py-2.5 text-right">Deals</th>
                <th className="px-5 py-2.5 text-right">Pipeline</th>
                <th className="px-5 py-2.5 text-right">Won</th>
                <th className="px-5 py-2.5 text-right">Lost</th>
                <th className="px-5 py-2.5 text-right">Total</th>
                <th className="px-5 py-2.5 text-right">Win Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {salesmen.map((s, i) => {
                const closed = s.wonCount + s.lostCount;
                return (
                  <tr key={s.key} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: COLORS[i % COLORS.length] }}>
                          {s.label.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{s.label}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">{s.count}</td>
                    <td className="px-5 py-3 text-right text-blue-600">{formatCurrency(s.pipeline)}</td>
                    <td className="px-5 py-3 text-right text-green-600 font-medium">{formatCurrency(s.won)}</td>
                    <td className="px-5 py-3 text-right text-red-500">{formatCurrency(s.lost)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(s.total)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        closed === 0 ? "bg-gray-100 text-gray-400" :
                        s.wonCount/closed >= 0.5 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                      }`}>
                        {pct(s.wonCount, closed)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BySalesman;
