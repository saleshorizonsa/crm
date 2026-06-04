import React, { useState, useMemo } from 'react';
import Icon from '../../../components/AppIcon';
import { useCurrency } from '../../../contexts/CurrencyContext';

export default function CustomerAccountsTab({ accounts, loading, role, onCreateDeal }) {
  const { formatCurrency } = useCurrency();
  const [searchTerm,      setSearchTerm]      = useState('');
  const [filterSalesman,  setFilterSalesman]  = useState('all');
  const [filterGroup,     setFilterGroup]     = useState('all');
  const [filterABC,       setFilterABC]       = useState('all');
  const [filterDormant,   setFilterDormant]   = useState(false);
  const [expandedAccount, setExpandedAccount] = useState(null);

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (!a.customer_name.toLowerCase().includes(t) && !(a.salesman_name || '').toLowerCase().includes(t)) return false;
      }
      if (filterSalesman !== 'all' && a.salesman_name !== filterSalesman) return false;
      if (filterGroup !== 'all' && !a.product_groups.includes(filterGroup)) return false;
      if (filterABC !== 'all' && a.abc_rank !== filterABC) return false;
      if (filterDormant && !a.is_dormant) return false;
      return true;
    });
  }, [accounts, searchTerm, filterSalesman, filterGroup, filterABC, filterDormant]);

  const salesmanList = useMemo(() => [...new Set(accounts.map(a => a.salesman_name).filter(Boolean))].sort(), [accounts]);
  const groupList    = useMemo(() => [...new Set(accounts.flatMap(a => a.product_groups))].sort(), [accounts]);

  const totalSpend  = accounts.reduce((s, a) => s + a.total_spend, 0);
  const dormantCount = accounts.filter(a => a.is_dormant).length;
  const aClassCount  = accounts.filter(a => a.abc_rank === 'A').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icon name="Loader2" size={32} className="text-gray-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Customers',          value: accounts.length,              color: 'text-gray-800' },
          { label: 'Total Historical Revenue', value: formatCurrency(totalSpend),   color: 'text-blue-700' },
          { label: 'Dormant Customers',        value: dormantCount,                 color: 'text-red-600'  },
          { label: 'A-Class Customers',        value: aClassCount,                  color: 'text-green-600'},
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 flex-wrap items-center">
        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search customer or salesman..."
          className="flex-1 min-w-48 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        {role !== 'salesman' && (
          <select value={filterSalesman} onChange={e => setFilterSalesman(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none">
            <option value="all">All Salesmen</option>
            {salesmanList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none">
          <option value="all">All Groups</option>
          {groupList.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filterABC} onChange={e => setFilterABC(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none">
          <option value="all">All Tiers</option>
          <option value="A">A — Top</option>
          <option value="B">B — Mid</option>
          <option value="C">C — Small</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterDormant} onChange={e => setFilterDormant(e.target.checked)} className="w-4 h-4 rounded" />
          Dormant only (90+ days)
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Customer</th>
                {role !== 'salesman' && <th className="px-4 py-3 text-left">Salesman</th>}
                <th className="px-4 py-3 text-right">Total Spend</th>
                <th className="px-4 py-3 text-center">Invoices</th>
                <th className="px-4 py-3 text-left">Groups</th>
                <th className="px-4 py-3 text-left">Last Purchase</th>
                <th className="px-4 py-3 text-center">Tier</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredAccounts.map(account => (
                <React.Fragment key={account.customer_name}>
                  <tr
                    onClick={() => setExpandedAccount(expandedAccount === account.customer_name ? null : account.customer_name)}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${account.is_dormant ? 'bg-red-50/30' : account.is_at_risk ? 'bg-amber-50/30' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{account.customer_name}</div>
                      {account.is_dormant && <div className="text-xs text-red-500 mt-0.5">⚠️ {account.days_since_purchase}d since last purchase</div>}
                      {account.is_at_risk && !account.is_dormant && <div className="text-xs text-amber-500 mt-0.5">⏳ {account.days_since_purchase}d — at risk</div>}
                    </td>
                    {role !== 'salesman' && <td className="px-4 py-3 text-gray-500">{account.salesman_name || '—'}</td>}
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(account.total_spend)}</td>
                    <td className="px-4 py-3 text-center">{account.invoice_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {account.product_groups.slice(0, 3).map(g => (
                          <span key={g} className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{g}</span>
                        ))}
                        {account.product_groups.length > 3 && <span className="text-xs text-gray-400">+{account.product_groups.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {account.last_invoice_date ? new Date(account.last_invoice_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${account.abc_rank === 'A' ? 'bg-green-100 text-green-700' : account.abc_rank === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                        {account.abc_rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={e => { e.stopPropagation(); onCreateDeal(account); }}
                        className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium whitespace-nowrap"
                      >
                        + Deal
                      </button>
                    </td>
                  </tr>
                  {expandedAccount === account.customer_name && (
                    <tr>
                      <td colSpan={role !== 'salesman' ? 8 : 7} className="px-6 py-3 bg-gray-50 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Invoice History</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left pb-1">Invoice #</th>
                              <th className="text-left pb-1">Date</th>
                              <th className="text-left pb-1">Description</th>
                              <th className="text-left pb-1">Group</th>
                              <th className="text-right pb-1">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {account.invoices.sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date)).map((inv, i) => (
                              <tr key={i} className="border-t border-gray-100">
                                <td className="py-1.5 text-gray-500 font-mono">{inv.invoice_number || '—'}</td>
                                <td className="py-1.5 text-gray-500">{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('en-GB') : '—'}</td>
                                <td className="py-1.5 text-gray-500 max-w-xs truncate">{inv.item_description || '—'}</td>
                                <td className="py-1.5">{inv.product_group && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{inv.product_group}</span>}</td>
                                <td className="py-1.5 text-right font-medium tabular-nums">{formatCurrency(inv.amount_excl_vat)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {filteredAccounts.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400 text-sm">
            {accounts.length === 0 ? 'No customer history imported yet. Use the Import tab to upload data.' : 'No customers match your filters.'}
          </div>
        )}
        {filteredAccounts.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 flex justify-between">
            <span>Showing {filteredAccounts.length} of {accounts.length} customers</span>
          </div>
        )}
      </div>
    </div>
  );
}
