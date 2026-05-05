import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["#2563EB","#16A34A","#D97706","#7C3AED","#0891B2","#DB2777","#EA580C","#65A30D"];

const fmt = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const pct = (a, b) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);

const ByLocation = ({ deals, formatCurrency }) => {
  const [drillCountry, setDrillCountry] = useState(null);

  const countries = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      const country = d.contact?.country || "Unknown";
      if (!map[country]) map[country] = { name: country, total: 0, won: 0, lost: 0, wonCount: 0, lostCount: 0, count: 0, cities: {} };
      map[country].total += d.amount || 0;
      map[country].count++;
      if (d.stage === "won")       { map[country].won += d.amount || 0; map[country].wonCount++; }
      else if (d.stage === "lost") { map[country].lost += d.amount || 0; map[country].lostCount++; }

      const city = d.contact?.city || "Unknown";
      if (!map[country].cities[city]) map[country].cities[city] = { name: city, total: 0, won: 0, wonCount: 0, lostCount: 0, count: 0 };
      map[country].cities[city].total += d.amount || 0;
      map[country].cities[city].count++;
      if (d.stage === "won")       { map[country].cities[city].won += d.amount || 0; map[country].cities[city].wonCount++; }
      else if (d.stage === "lost") { map[country].cities[city].lostCount++; }
    });

    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .map((c) => ({ ...c, cities: Object.values(c.cities).sort((a, b) => b.total - a.total) }));
  }, [deals]);

  const chartData = countries.slice(0, 10).map((c) => ({ name: c.name.slice(0, 16), value: c.total }));

  const drillData = drillCountry
    ? countries.find((c) => c.name === drillCountry)?.cities || []
    : null;

  if (!countries.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <span className="text-5xl mb-3">🌍</span>
      <p className="text-sm">No location data in this period.</p>
      <p className="text-xs mt-1">Contacts need a country to appear here.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Country bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Top 10 Countries by Deal Value</h3>
        <p className="text-xs text-gray-400 mb-4">Click a bar to drill into cities</p>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}
            onClick={(e) => { if (e?.activeLabel) setDrillCountry(drillCountry === e.activeLabel ? null : e.activeLabel); }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="value" name="Deal Value" radius={[3,3,0,0]} cursor="pointer">
              {chartData.map((entry, i) => (
                <Cell key={i} fill={drillCountry === entry.name ? "#1D4ED8" : COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* City drill-down */}
      {drillCountry && drillData && (
        <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-blue-100 flex items-center justify-between bg-blue-50">
            <h3 className="text-sm font-semibold text-blue-800">Cities in {drillCountry}</h3>
            <button onClick={() => setDrillCountry(null)} className="text-xs text-blue-500 hover:text-blue-700">✕ Close</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-2.5 text-left">#</th>
                  <th className="px-5 py-2.5 text-left">City</th>
                  <th className="px-5 py-2.5 text-right">Deals</th>
                  <th className="px-5 py-2.5 text-right">Total Value</th>
                  <th className="px-5 py-2.5 text-right">Won Value</th>
                  <th className="px-5 py-2.5 text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {drillData.map((city, i) => {
                  const closed = city.wonCount + city.lostCount;
                  return (
                    <tr key={city.name} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{city.name}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{city.count}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(city.total)}</td>
                      <td className="px-5 py-3 text-right text-green-600 font-medium">{formatCurrency(city.won)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          closed === 0 ? "bg-gray-100 text-gray-400" :
                          city.wonCount/closed >= 0.5 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}>
                          {pct(city.wonCount, closed)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Country summary table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">All Countries</h3>
          <span className="text-xs text-gray-400">{countries.length} countries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2.5 text-left">#</th>
                <th className="px-5 py-2.5 text-left">Country</th>
                <th className="px-5 py-2.5 text-right">Deals</th>
                <th className="px-5 py-2.5 text-right">Total Value</th>
                <th className="px-5 py-2.5 text-right">Won</th>
                <th className="px-5 py-2.5 text-right">Win Rate</th>
                <th className="px-5 py-2.5 text-right">Cities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {countries.map((c, i) => {
                const closed = c.wonCount + c.lostCount;
                return (
                  <tr key={c.name}
                    className={`hover:bg-gray-50 cursor-pointer ${drillCountry === c.name ? "bg-blue-50" : ""}`}
                    onClick={() => setDrillCountry(drillCountry === c.name ? null : c.name)}>
                    <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-900 flex items-center gap-1.5">
                      {c.name}
                      {drillCountry === c.name && <span className="text-xs text-blue-500">▲</span>}
                    </td>
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
                    <td className="px-5 py-3 text-right text-gray-400 text-xs">{c.cities.length}</td>
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

export default ByLocation;
