import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const MarginReport = ({ deals, formatCurrency }) => {
  const dealMargins = useMemo(() => {
    return deals
      .filter(d => d.deal_products?.length)
      .map(d => {
        const revenue  = d.deal_products.reduce((s, dp) => s + parseFloat(dp.line_total || 0), 0);
        const cost     = d.deal_products.reduce((s, dp) => s + parseFloat(dp.cost_total || dp.cost_price || 0), 0);
        const margin   = revenue - cost;
        const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
        return { ...d, _revenue: revenue, _cost: cost, _margin: margin, _marginPct: marginPct };
      })
      .sort((a, b) => b._marginPct - a._marginPct);
  }, [deals]);

  const totalRevenue  = dealMargins.reduce((s, d) => s + d._revenue, 0);
  const totalCost     = dealMargins.reduce((s, d) => s + d._cost, 0);
  const grossMargin   = totalRevenue - totalCost;
  const avgMarginPct  = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;

  // By material group
  const byGroup = useMemo(() => {
    const map = {};
    deals.forEach(d => {
      d.deal_products?.forEach(dp => {
        const g = dp.product?.material_group || 'No Group';
        if (!map[g]) map[g] = { revenue: 0, cost: 0 };
        map[g].revenue += parseFloat(dp.line_total || 0);
        map[g].cost    += parseFloat(dp.cost_total || dp.cost_price || 0);
      });
    });
    return Object.entries(map)
      .map(([group, s]) => ({
        group,
        marginPct: s.revenue > 0 ? Math.round((s.revenue - s.cost) / s.revenue * 100) : 0,
        revenue: s.revenue,
      }))
      .sort((a, b) => b.marginPct - a.marginPct);
  }, [deals]);

  const lowMarginDeals = dealMargins.filter(d => d._marginPct < 10 && d._marginPct >= 0);

  const kpis = [
    { label: 'Total Revenue',   value: formatCurrency(totalRevenue),  color: 'bg-blue-50  text-blue-700  border-blue-100'  },
    { label: 'Total Cost',      value: formatCurrency(totalCost),     color: 'bg-gray-50  text-gray-700  border-gray-200'  },
    { label: 'Gross Margin',    value: formatCurrency(grossMargin),   color: 'bg-green-50 text-green-700 border-green-100' },
    { label: 'Avg Margin %',    value: `${avgMarginPct.toFixed(1)}%`, color: avgMarginPct >= 20 ? 'bg-green-50 text-green-700 border-green-100' : avgMarginPct >= 10 ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-red-50 text-red-700 border-red-100' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl p-4 border ${k.color}`}>
            <p className="text-xs font-medium opacity-80">{k.label}</p>
            <p className="text-xl font-bold mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Margin % by material group */}
      {byGroup.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Margin % by Product Group</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGroup} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="group" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={v => [`${v}%`, 'Margin']} />
                <Bar dataKey="marginPct" name="Margin %" radius={[0, 4, 4, 0]}>
                  {byGroup.map((entry, i) => (
                    <Cell key={i} fill={entry.marginPct >= 20 ? '#16A34A' : entry.marginPct >= 10 ? '#D97706' : '#DC2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Low margin warnings */}
      {lowMarginDeals.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-3">⚠️ Low Margin Deals (&lt;10%) — {lowMarginDeals.length} deals</h3>
          <div className="space-y-2">
            {lowMarginDeals.slice(0, 10).map(d => (
              <div key={d.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2">
                <span className="font-medium text-gray-800 truncate max-w-[200px]">{d.title}</span>
                <span className="text-gray-500">{d.owner?.full_name}</span>
                <span className="text-red-600 font-semibold">{d._marginPct.toFixed(1)}%</span>
                <span className="text-gray-600">{formatCurrency(d._revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All deals with margin */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Deals with Margin Data ({dealMargins.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Deal</th>
                <th className="px-4 py-2.5 text-left">Salesman</th>
                <th className="px-4 py-2.5 text-right">Revenue</th>
                <th className="px-4 py-2.5 text-right">Cost</th>
                <th className="px-4 py-2.5 text-right">Margin</th>
                <th className="px-4 py-2.5 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dealMargins.slice(0, 50).map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800 max-w-[180px] truncate">{d.title || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{d.owner?.full_name || '—'}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(d._revenue)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{formatCurrency(d._cost)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(d._margin)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${d._marginPct >= 20 ? 'bg-green-100 text-green-700' : d._marginPct >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {d._marginPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MarginReport;
