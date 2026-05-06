import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["#2563EB","#16A34A","#D97706","#7C3AED","#0891B2","#DB2777","#EA580C","#65A30D"];

const pct = (a, b) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);
const fmt = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

const ByClient = ({ deals, formatCurrency }) => {
  const clients = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      const key   = d.contact?.id || "__none__";
      const label = d.contact
        ? `${d.contact.first_name || ""} ${d.contact.last_name || ""}`.trim() || d.contact.company_name || "—"
        : "No Client";
      const company = d.contact?.company_name || "";

      if (!map[key]) map[key] = { key, label, company, total: 0, won: 0, lost: 0, wonCount: 0, lostCount: 0, count: 0 };
      map[key].total += d.amount || 0;
      map[key].count++;
      if (d.stage === "won")       { map[key].won += d.amount || 0; map[key].wonCount++; }
      else if (d.stage === "lost") { map[key].lost += d.amount || 0; map[key].lostCount++; }
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [deals]);

  const chartData = clients.slice(0, 10).map((c) => ({
    name: c.label.length > 14 ? c.label.slice(0, 13) + "…" : c.label,
    value: c.total,
  }));

  if (!clients.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <span className="text-5xl mb-3">🤝</span>
      <p className="text-sm">No client data in this period.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top clients bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Top 10 Clients by Deal Value</h3>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 60, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="value" name="Deal Value" radius={[3,3,0,0]}>
              {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Client table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">All Clients</h3>
          <span className="text-xs text-gray-400">{clients.length} clients</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2.5 text-left">#</th>
                <th className="px-5 py-2.5 text-left">Client</th>
                <th className="px-5 py-2.5 text-left">Company</th>
                <th className="px-5 py-2.5 text-right">Deals</th>
                <th className="px-5 py-2.5 text-right">Total Value</th>
                <th className="px-5 py-2.5 text-right">Won</th>
                <th className="px-5 py-2.5 text-right">Win Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((c, i) => {
                const closed = c.wonCount + c.lostCount;
                return (
                  <tr key={c.key} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{c.label}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{c.company || "—"}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{c.count}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(c.total)}</td>
                    <td className="px-5 py-3 text-right text-green-600 font-medium">{formatCurrency(c.won)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        closed === 0 ? "bg-gray-100 text-gray-400" :
                        c.wonCount/closed >= 0.5 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                      }`}>
                        {pct(c.wonCount, closed)}
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

export default ByClient;
