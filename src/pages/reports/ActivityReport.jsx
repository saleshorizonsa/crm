import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const ActivityReport = ({ deals, formatCurrency }) => {
  const today = new Date();

  // Won vs Lost per month (last 6)
  const monthlyWonLost = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const label   = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const mFrom   = new Date(d.getFullYear(), d.getMonth(), 1);
      const mTo     = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const won  = deals.filter(deal => deal.stage === 'won'  && deal.closed_at && new Date(deal.closed_at) >= mFrom && new Date(deal.closed_at) <= mTo).length;
      const lost = deals.filter(deal => deal.stage === 'lost' && deal.closed_at && new Date(deal.closed_at) >= mFrom && new Date(deal.closed_at) <= mTo).length;
      months.push({ label, won, lost });
    }
    return months;
  }, [deals]);

  // Overdue deals
  const overdueDeals = useMemo(() =>
    deals.filter(d =>
      !['won', 'lost'].includes(d.stage) &&
      d.expected_close_date &&
      new Date(d.expected_close_date) < today
    ).sort((a, b) => new Date(a.expected_close_date) - new Date(b.expected_close_date)),
    [deals]
  );

  // Stale deals (created 30+ days ago, still open)
  const staleDeals = useMemo(() => {
    const cutoff = new Date(today.getTime() - 30 * 86400000);
    return deals
      .filter(d => !['won', 'lost'].includes(d.stage) && new Date(d.created_at) < cutoff)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [deals]);

  // Avg days to close per salesman
  const salesmanVelocity = useMemo(() => {
    const map = {};
    deals.filter(d => d.stage === 'won' && d.created_at && d.closed_at).forEach(d => {
      const name = d.owner?.full_name || 'Unknown';
      if (!map[name]) map[name] = { days: 0, count: 0 };
      map[name].days += Math.floor((new Date(d.closed_at) - new Date(d.created_at)) / 86400000);
      map[name].count++;
    });
    return Object.entries(map)
      .map(([name, s]) => ({ name, avgDays: Math.round(s.days / s.count), count: s.count }))
      .sort((a, b) => a.avgDays - b.avgDays);
  }, [deals]);

  const kpis = [
    { label: 'Overdue Deals',  value: overdueDeals.length,  color: 'bg-red-50   text-red-700   border-red-100'   },
    { label: 'Stale (30d+)',   value: staleDeals.length,    color: 'bg-amber-50 text-amber-700 border-amber-100' },
    { label: 'Overdue Value',  value: formatCurrency(overdueDeals.reduce((s, d) => s + parseFloat(d.amount || 0), 0)), color: 'bg-red-50 text-red-700 border-red-100' },
    { label: 'Won This View',  value: deals.filter(d => d.stage === 'won').length, color: 'bg-green-50 text-green-700 border-green-100' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl p-4 border ${k.color}`}>
            <p className="text-xs font-medium opacity-80">{k.label}</p>
            <p className="text-2xl font-bold mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Won vs Lost per month */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Won vs Lost per Month (last 6 months)</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyWonLost}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="won"  fill="#16A34A" name="Won"  radius={[4,4,0,0]} />
              <Bar dataKey="lost" fill="#DC2626" name="Lost" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Avg days to close */}
      {salesmanVelocity.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Avg Days to Close (Won deals by salesman)</h3>
          <div className="space-y-2">
            {salesmanVelocity.map(s => (
              <div key={s.name} className="flex items-center gap-3 text-xs">
                <span className="w-36 text-gray-700 font-medium truncate">{s.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, s.avgDays / 180 * 100)}%` }} />
                </div>
                <span className="w-20 text-right text-gray-600">{s.avgDays} days</span>
                <span className="w-16 text-right text-gray-400">{s.count} won</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue deals */}
      {overdueDeals.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100 bg-red-50">
            <h3 className="text-sm font-semibold text-red-700">Overdue Deals ({overdueDeals.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Deal</th>
                  <th className="px-4 py-2.5 text-left">Salesman</th>
                  <th className="px-4 py-2.5 text-left">Stage</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-left">Expected Close</th>
                  <th className="px-4 py-2.5 text-left">Days Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {overdueDeals.map(d => {
                  const daysOver = Math.floor((today - new Date(d.expected_close_date)) / 86400000);
                  return (
                    <tr key={d.id} className="hover:bg-red-50">
                      <td className="px-4 py-2 font-medium text-gray-800 max-w-[180px] truncate">{d.title || '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{d.owner?.full_name || '—'}</td>
                      <td className="px-4 py-2 capitalize">{d.stage}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(d.amount || 0)}</td>
                      <td className="px-4 py-2 text-red-600">{d.expected_close_date}</td>
                      <td className="px-4 py-2 text-red-600 font-semibold">{daysOver}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stale deals */}
      {staleDeals.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-100 bg-amber-50">
            <h3 className="text-sm font-semibold text-amber-700">Stale Deals — No movement 30+ days ({staleDeals.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Deal</th>
                  <th className="px-4 py-2.5 text-left">Salesman</th>
                  <th className="px-4 py-2.5 text-left">Stage</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-left">Created</th>
                  <th className="px-4 py-2.5 text-left">Age (days)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {staleDeals.slice(0, 30).map(d => {
                  const age = Math.floor((today - new Date(d.created_at)) / 86400000);
                  return (
                    <tr key={d.id} className="hover:bg-amber-50">
                      <td className="px-4 py-2 font-medium text-gray-800 max-w-[180px] truncate">{d.title || '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{d.owner?.full_name || '—'}</td>
                      <td className="px-4 py-2 capitalize">{d.stage}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(d.amount || 0)}</td>
                      <td className="px-4 py-2 text-gray-500">{d.created_at?.split('T')[0]}</td>
                      <td className="px-4 py-2 text-amber-700 font-semibold">{age}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityReport;
