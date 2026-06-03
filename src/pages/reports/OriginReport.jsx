import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { classifyDealsByOrigin } from '../../utils/dealGroupUtils';

const fmt = n => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

const OriginReport = ({ deals, formatCurrency, dateFrom }) => {
  const periodFrom = dateFrom || new Date(new Date().getFullYear(), 0, 1).toISOString();

  const origin = useMemo(
    () => classifyDealsByOrigin(deals, periodFrom),
    [deals, periodFrom]
  );

  // Monthly new vs carry trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const monthFrom = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      const monthTo   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const monthDeals = deals.filter(deal => {
        const dt = deal.creation_date || deal.created_at;
        return dt >= monthFrom && dt <= monthTo;
      });
      const o = classifyDealsByOrigin(monthDeals, monthFrom);
      months.push({ label, newCount: o.newCount, carryCount: o.carryCount, newValue: o.newValue, carryValue: o.carryValue });
    }
    return months;
  }, [deals]);

  // Table rows — all non-lost deals
  const tableDeals = useMemo(() =>
    deals
      .filter(d => d.stage !== 'lost')
      .map(d => ({
        ...d,
        _origin: (new Date(d.creation_date || d.created_at) >= new Date(periodFrom)) ? 'new' : 'carry',
      }))
      .sort((a, b) => parseFloat(b.amount || 0) - parseFloat(a.amount || 0)),
    [deals, periodFrom]
  );

  const kpis = [
    { label: 'New Deals', value: origin.newCount, sub: formatCurrency(origin.newValue), color: 'bg-green-50 text-green-700 border-green-100' },
    { label: 'Carry Forward', value: origin.carryCount, sub: formatCurrency(origin.carryValue), color: 'bg-amber-50 text-amber-700 border-amber-100' },
    { label: 'Won (New)', value: origin.wonNewCount, sub: formatCurrency(origin.wonNewValue), color: 'bg-blue-50 text-blue-700 border-blue-100' },
    { label: 'Won (Carry)', value: origin.wonCarryCount, sub: formatCurrency(origin.wonCarryValue), color: 'bg-purple-50 text-purple-700 border-purple-100' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl p-4 border ${k.color}`}>
            <p className="text-xs font-medium opacity-80">{k.label}</p>
            <p className="text-2xl font-bold mt-1">{k.value}</p>
            <p className="text-xs mt-0.5 opacity-70">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Monthly trend chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly New vs Carry-Forward (last 6 months)</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} />
              <Tooltip formatter={(v, name) => [v, name === 'newCount' ? 'New deals' : 'Carry-forward']} />
              <Legend formatter={v => v === 'newCount' ? 'New' : 'Carry'} />
              <Bar dataKey="newCount" fill="#16A34A" stackId="a" name="newCount" radius={[0,0,0,0]} />
              <Bar dataKey="carryCount" fill="#D97706" stackId="a" name="carryCount" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Deals table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Deal Origin Detail ({tableDeals.length} deals)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Deal</th>
                <th className="px-4 py-2.5 text-left">Salesman</th>
                <th className="px-4 py-2.5 text-left">Stage</th>
                <th className="px-4 py-2.5 text-left">Origin</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tableDeals.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800 max-w-[180px] truncate">{d.title || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{d.owner?.full_name || '—'}</td>
                  <td className="px-4 py-2 capitalize">{d.stage}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${d._origin === 'new' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {d._origin === 'new' ? '✦ New' : '↻ Carry'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(d.amount || 0)}</td>
                  <td className="px-4 py-2 text-gray-400">{(d.creation_date || d.created_at || '').split('T')[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OriginReport;
