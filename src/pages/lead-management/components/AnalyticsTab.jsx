import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { useCurrency } from '../../../contexts/CurrencyContext';

const COLORS = ['#2563EB','#16A34A','#D97706','#7C3AED','#0891B2','#DB2777','#EA580C','#65A30D','#DC2626','#6366F1'];
const ABC_COLORS = { A: '#16A34A', B: '#2563EB', C: '#9CA3AF' };

const fmt = n => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

export default function AnalyticsTab({ accounts, role, onCreateDeal }) {
  const { formatCurrency } = useCurrency();

  const totalRevenue   = accounts.reduce((s, a) => s + a.total_spend, 0);
  const totalInvoices  = accounts.reduce((s, a) => s + a.invoice_count, 0);
  const avgSpend       = accounts.length > 0 ? totalRevenue / accounts.length : 0;
  const dormantCount   = accounts.filter(a => a.is_dormant).length;
  const aClassCount    = accounts.filter(a => a.abc_rank === 'A').length;

  // Top 10 by spend
  const top10 = accounts.slice(0, 10).map(a => ({
    name: a.customer_name.length > 25 ? a.customer_name.slice(0, 25) + '…' : a.customer_name,
    value: a.total_spend,
    abc: a.abc_rank,
  }));

  // Revenue by product group
  const byGroup = useMemo(() => {
    const map = {};
    accounts.forEach(a => {
      a.invoices?.forEach(inv => {
        const g = inv.product_group || 'Other';
        map[g] = (map[g] || 0) + parseFloat(inv.amount_excl_vat || 0);
      });
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [accounts]);

  // Revenue by salesman
  const bySalesman = useMemo(() => {
    const map = {};
    accounts.forEach(a => { map[a.salesman_name || 'Unknown'] = (map[a.salesman_name || 'Unknown'] || 0) + a.total_spend; });
    return Object.entries(map).map(([name, value]) => ({ name: name.split(' ').slice(0, 2).join(' '), value })).sort((a, b) => b.value - a.value);
  }, [accounts]);

  // Top 10 by invoice count
  const top10ByInvoice = accounts.slice(0, 10).map(a => ({ name: a.customer_name, count: a.invoice_count, spend: a.total_spend }));

  // Dormant list
  const dormantList = accounts.filter(a => a.is_dormant).sort((a, b) => (b.days_since_purchase || 0) - (a.days_since_purchase || 0));

  const kpis = [
    { label: 'Total Customers',    value: accounts.length               },
    { label: 'Total Revenue',      value: formatCurrency(totalRevenue)  },
    { label: 'Total Invoices',     value: totalInvoices                 },
    { label: 'Avg Spend / Customer', value: formatCurrency(avgSpend)    },
    { label: 'Dormant (90d+)',     value: dormantCount,   color: 'text-red-600'   },
    { label: 'A-Class Customers',  value: aClassCount,    color: 'text-green-600' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-lg font-bold ${k.color || 'text-gray-800'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 horizontal bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Top 10 Customers by Revenue</h3>
          <div style={{ height: Math.max(280, top10.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10} layout="vertical" margin={{ left: 0, right: 60 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmt} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
                <Tooltip formatter={v => [formatCurrency(v), 'Revenue']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {top10.map((e, i) => <Cell key={i} fill={ABC_COLORS[e.abc] || '#6366F1'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by product group pie */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Revenue by Product Group</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byGroup} dataKey="value" nameKey="name" cx="45%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {byGroup.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => [formatCurrency(v), 'Revenue']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Revenue by salesman */}
      {role !== 'salesman' && bySalesman.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Revenue by Salesman</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySalesman}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
                <Tooltip formatter={v => [formatCurrency(v), 'Revenue']} />
                <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top 10 by invoice count */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Top 10 by Invoice Count (Most Active Buyers)</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left">#</th>
              <th className="px-4 py-2.5 text-left">Customer</th>
              <th className="px-4 py-2.5 text-center">Invoices</th>
              <th className="px-4 py-2.5 text-right">Total Spend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {top10ByInvoice.map((a, i) => (
              <tr key={a.name} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400 font-medium">{i + 1}</td>
                <td className="px-4 py-2 font-medium text-gray-800">{a.name}</td>
                <td className="px-4 py-2 text-center font-semibold text-blue-700">{a.count}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{formatCurrency(a.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dormant customers */}
      {dormantList.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100 bg-red-50">
            <h3 className="text-sm font-semibold text-red-700">⚠️ Dormant Customers — No purchase in 90+ days ({dormantList.length})</h3>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Customer</th>
                {role !== 'salesman' && <th className="px-4 py-2.5 text-left">Salesman</th>}
                <th className="px-4 py-2.5 text-right">Total Spend</th>
                <th className="px-4 py-2.5 text-center">Days Dormant</th>
                <th className="px-4 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dormantList.slice(0, 20).map(a => (
                <tr key={a.customer_name} className="hover:bg-red-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{a.customer_name}</td>
                  {role !== 'salesman' && <td className="px-4 py-2 text-gray-500">{a.salesman_name || '—'}</td>}
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(a.total_spend)}</td>
                  <td className="px-4 py-2 text-center text-red-600 font-semibold">{a.days_since_purchase}d</td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => onCreateDeal(a)} className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium">
                      + Deal
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
