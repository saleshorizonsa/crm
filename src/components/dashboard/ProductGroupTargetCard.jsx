import React, { useState, useEffect, useCallback } from 'react';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';

const fmtSAR = (n) => new Intl.NumberFormat('en-SA', { maximumFractionDigits: 0 }).format(Number(n) || 0);
const barColor = (pct) => (pct >= 80 ? '#059669' : pct >= 50 ? '#3B82F6' : '#F59E0B');

// Product-group targets vs achieved. Targets come from product_group_targets
// (linked to sales_targets in the period); achieved is summed from invoiced won
// deals' product lines (deal_products → products.material_group). Empty-state safe.
export default function ProductGroupTargetCard({ companyId, period }) {
  const { start, end, label } = period || {};
  const [targets, setTargets] = useState([]);
  const [achieved, setAchieved] = useState({});
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchData = useCallback(async () => {
    if (!companyId || !start || !end) { setTargets([]); setAchieved({}); return; }
    setLoading(true);
    try {
      // ── Targets ── product_group_targets linked to this period's sales_targets.
      const { data: salesTargets } = await supabase
        .from('sales_targets')
        .select('id')
        .eq('company_id', companyId)
        .lte('period_start', end)
        .gte('period_end', start);
      const targetIds = (salesTargets || []).map((t) => t.id);

      let grouped = [];
      if (targetIds.length) {
        const { data: pgTargets } = await supabase
          .from('product_group_targets')
          .select('product_group, target_amount, progress_amount')
          .in('sales_target_id', targetIds);
        const map = {};
        (pgTargets || []).forEach((pg) => {
          const g = pg.product_group || 'Unassigned';
          if (!map[g]) map[g] = { product_group: g, target_amount: 0, progress_amount: 0 };
          map[g].target_amount += parseFloat(pg.target_amount) || 0;
          map[g].progress_amount += parseFloat(pg.progress_amount) || 0;
        });
        grouped = Object.values(map).sort((a, b) => b.target_amount - a.target_amount);
      }

      // ── Achieved ── invoiced won deals in period, summed per material_group.
      const { data: wonDeals } = await supabase
        .from('deals')
        .select('id, amount, final_amount, deal_products(line_total, product:products!product_id(material_group))')
        .eq('company_id', companyId)
        .eq('stage', 'won')
        .eq('is_invoiced', true)
        .gte('invoice_date', start)
        .lte('invoice_date', end);
      const ach = {};
      (wonDeals || []).forEach((d) => {
        const lines = d.deal_products || [];
        if (lines.length > 0) {
          lines.forEach((dp) => {
            const g = dp.product?.material_group || 'Unassigned';
            ach[g] = (ach[g] || 0) + (parseFloat(dp.line_total) || 0);
          });
        } else {
          ach['Unassigned'] = (ach['Unassigned'] || 0) + (parseFloat(d.final_amount ?? d.amount) || 0);
        }
      });

      setTargets(grouped);
      setAchieved(ach);
    } finally {
      setLoading(false);
    }
  }, [companyId, start, end]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalTarget = targets.reduce((s, g) => s + g.target_amount, 0);
  const totalAchieved = targets.reduce((s, g) => s + (achieved[g.product_group] || 0), 0);
  const totalDeficit = Math.max(0, totalTarget - totalAchieved);

  return (
    <>
      <button
        type="button"
        onClick={() => targets.length > 0 && setShowDetails(true)}
        className={`w-full text-left bg-white rounded-2xl border border-gray-200 p-5 relative overflow-hidden transition-all duration-150 ${
          targets.length > 0 ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : 'cursor-default'
        }`}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500 rounded-t-2xl" />
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Product Groups</p>
          <span className="text-lg">📦</span>
        </div>

        {loading ? (
          <div className="h-8 w-32 bg-gray-100 rounded animate-pulse" />
        ) : targets.length === 0 ? (
          <div>
            <p className="text-sm text-gray-500">No product group targets set</p>
            <p className="text-xs text-gray-400 mt-1">Set targets in Admin Dashboard → Sales Managers Target</p>
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mb-1">
              {fmtSAR(totalTarget)}<span className="text-sm font-normal text-gray-400 ml-1">SAR</span>
            </p>
            <p className="text-xs text-gray-400 mb-3">
              {totalTarget > 0 ? ((totalAchieved / totalTarget) * 100).toFixed(1) : 0}% achieved · {targets.length} groups
            </p>
            <div className="space-y-1.5">
              {targets.slice(0, 3).map((g) => {
                const a = achieved[g.product_group] || 0;
                const pct = g.target_amount > 0 ? Math.min((a / g.target_amount) * 100, 100) : 0;
                return (
                  <div key={g.product_group}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-700 font-medium truncate max-w-28">{g.product_group}</span>
                      <span className="text-gray-400 tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor(pct) }} />
                    </div>
                  </div>
                );
              })}
              {targets.length > 3 && (
                <p className="text-xs text-gray-400 text-center pt-1">+{targets.length - 3} more groups →</p>
              )}
            </div>
          </>
        )}
      </button>

      {showDetails && (
        <>
          <div className="fixed inset-0 z-[60] bg-black bg-opacity-40 backdrop-blur-sm" onClick={() => setShowDetails(false)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden pointer-events-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">📦 Product Group Targets</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                </div>
                <button onClick={() => setShowDetails(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
                  <Icon name="X" size={16} className="text-gray-500" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 px-6 py-4 bg-gray-50 flex-shrink-0">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-blue-600 tabular-nums">{fmtSAR(totalTarget)} SAR</p>
                  <p className="text-xs text-blue-500 mt-0.5">Total Target</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-green-600 tabular-nums">{fmtSAR(totalAchieved)} SAR</p>
                  <p className="text-xs text-green-500 mt-0.5">Total Achieved</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-red-600 tabular-nums">{fmtSAR(totalDeficit)} SAR</p>
                  <p className="text-xs text-red-500 mt-0.5">Total Deficit</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: 'thin' }}>
                {targets.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500">No product group targets have been set yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Go to Admin Dashboard → Sales Managers Target to set product group targets.</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        {['Product Group', 'Target', 'Achieved', 'Deficit', 'Attainment', 'Win Rate'].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide text-left border-b border-gray-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((g, i) => {
                        const a = achieved[g.product_group] || 0;
                        const deficit = Math.max(0, g.target_amount - a);
                        const attPct = g.target_amount > 0 ? (a / g.target_amount) * 100 : 0;
                        return (
                          <tr key={g.product_group} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-3 font-medium text-gray-900">{g.product_group}</td>
                            <td className="px-3 py-3 tabular-nums text-blue-600 font-medium">{fmtSAR(g.target_amount)} SAR</td>
                            <td className="px-3 py-3 tabular-nums text-green-600 font-medium">{fmtSAR(a)} SAR</td>
                            <td className="px-3 py-3 tabular-nums">
                              <span className={deficit === 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                {deficit === 0 ? '✓ On Target' : `${fmtSAR(deficit)} SAR`}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full min-w-12">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(attPct, 100)}%`, background: barColor(attPct) }} />
                                </div>
                                <span className="text-xs tabular-nums text-gray-600 min-w-8">{attPct.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-400">—</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
                <button onClick={() => setShowDetails(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
