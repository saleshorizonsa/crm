import React, { useState, useEffect, useCallback } from 'react';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';
import { achievedBreakdown } from 'utils/productGroupAchievement';
import { achievedByClient } from 'utils/clientTargetAchievement';

const fmtSAR = (n) => new Intl.NumberFormat('en-SA', { maximumFractionDigits: 0 }).format(Number(n) || 0);
const barColor = (pct) => (pct >= 80 ? '#059669' : pct >= 50 ? '#3B82F6' : '#F59E0B');

// One card for how a Target ADDS UP: product-group commitments and per-client
// commitments, in separately labelled sections. A consolidated Target deserves
// a single place showing its parts, which is why this is one card and not two.
//
// Product-group target = a sales_targets row, target_type 'by_products', with
// the group in product_group. Client target = a client_targets row hanging off
// that salesman's by_clients container row.
//
// The two sections are never added together into one "achieved": a group counts
// a whole deal once per group it contains, while a client counts each deal
// exactly once. Totals are therefore shown per section.
//
// Achieved follows the director's rule: a deal counts FULLY toward a group if
// ANY of its lines belongs to that group — not the matching line's value. A deal
// spanning two groups therefore counts in full toward both, so the group totals
// can exceed actual revenue. That is deliberate: this is a per-group attainment
// view, not a revenue breakdown. See utils/productGroupAchievement.js.
export default function TargetBreakdownCard({ companyId, period }) {
  const { start, end, label } = period || {};
  const [targets, setTargets] = useState([]);
  const [achieved, setAchieved] = useState({});
  // Invoiced deals with no product lines: shown, never counted toward a target.
  const [unassigned, setUnassigned] = useState({ value: 0, count: 0 });
  const [clients, setClients] = useState([]);          // [{ contact_id, label, target_amount }]
  const [clientAchieved, setClientAchieved] = useState({});
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchData = useCallback(async () => {
    if (!companyId || !start || !end) {
      setTargets([]); setAchieved({}); setUnassigned({ value: 0, count: 0 });
      setClients([]); setClientAchieved({});
      return;
    }
    setLoading(true);
    try {
      // ── Targets ── a product-group target IS a sales_targets row:
      // target_type 'by_products' carrying the group in product_group. It used
      // to be a child row in product_group_targets; that table is no longer
      // read or written. Rows with no product_group are skipped rather than
      // bucketed as 'Unassigned', which is reserved for INVOICED DEALS that
      // carry no product lines — mixing a target with no group into that
      // bucket made an achievement figure look like it had a goal.
      const { data: pgTargets } = await supabase
        .from('sales_targets')
        .select('product_group, target_amount, progress_amount')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .eq('period_type', 'monthly')
        .eq('target_type', 'by_products')
        .not('product_group', 'is', null)
        .lte('period_start', end)
        .gte('period_end', start);

      const map = {};
      (pgTargets || []).forEach((pg) => {
        const g = pg.product_group;
        if (!g) return;
        if (!map[g]) map[g] = { product_group: g, target_amount: 0, progress_amount: 0 };
        map[g].target_amount += parseFloat(pg.target_amount) || 0;
        map[g].progress_amount += parseFloat(pg.progress_amount) || 0;
      });
      const grouped = Object.values(map).sort((a, b) => b.target_amount - a.target_amount);

      // ── Client targets ── children of this period's by_clients rows.
      const { data: periodRows } = await supabase
        .from('sales_targets')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .eq('period_type', 'monthly')
        .lte('period_start', end)
        .gte('period_end', start);
      const periodIds = (periodRows || []).map((r) => r.id);

      let clientRows = [];
      if (periodIds.length) {
        const { data: cts } = await supabase
          .from('client_targets')
          .select('contact_id, target_amount, contact:contact_id(first_name, last_name, company_name)')
          .in('sales_target_id', periodIds);
        const cmap = {};
        (cts || []).forEach((c) => {
          if (!c.contact_id) return;
          const label = c.contact?.company_name
            || `${c.contact?.first_name || ''} ${c.contact?.last_name || ''}`.trim()
            || 'Unnamed';
          if (!cmap[c.contact_id]) cmap[c.contact_id] = { contact_id: c.contact_id, label, target_amount: 0 };
          cmap[c.contact_id].target_amount += parseFloat(c.target_amount) || 0;
        });
        clientRows = Object.values(cmap).sort((a, b) => b.target_amount - a.target_amount);
      }

      // ── Achieved ── groups: full deal value once per group it contains.
      //                clients: each deal counted once, against its contact.
      const { byGroup: ach, unassigned: un } = await achievedBreakdown({ companyId, ownerIds: null, start, end });
      const clientAch = await achievedByClient({ companyId, ownerIds: null, start, end });
      setUnassigned(un);

      setTargets(grouped);
      setAchieved(ach);
      setClients(clientRows);
      setClientAchieved(clientAch);
    } finally {
      setLoading(false);
    }
  }, [companyId, start, end]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalTarget = targets.reduce((s, g) => s + g.target_amount, 0);
  const totalAchieved = targets.reduce((s, g) => s + (achieved[g.product_group] || 0), 0);
  const totalDeficit = Math.max(0, totalTarget - totalAchieved);
  const clientTotalTarget = clients.reduce((s2, c) => s2 + c.target_amount, 0);
  const clientTotalAchieved = clients.reduce((s2, c) => s2 + (clientAchieved[c.contact_id] || 0), 0);
  const hasAny = targets.length > 0 || clients.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => hasAny && setShowDetails(true)}
        className={`w-full text-left bg-white rounded-2xl border border-gray-200 p-5 relative overflow-hidden transition-all duration-150 ${
          hasAny ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : 'cursor-default'
        }`}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500 rounded-t-2xl" />
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Target Breakdown</p>
          <span className="text-lg">🧩</span>
        </div>

        {loading ? (
          <div className="h-8 w-32 bg-gray-100 rounded animate-pulse" />
        ) : !hasAny ? (
          <div>
            <p className="text-sm text-gray-500">No product group or client targets set</p>
            <p className="text-xs text-gray-400 mt-1">Set targets in Admin Dashboard → Sales Managers Target</p>
          </div>
        ) : (
          <>
            {/* Both sections are parts of one Target, so the headline adds
                their commitments. Their ACHIEVED figures are NOT added: a
                group counts a deal once per group it contains, a client
                counts each deal once. The modal breaks out each section. */}
            <p className="text-2xl font-bold text-gray-900 tabular-nums mb-1">
              {fmtSAR(totalTarget + clientTotalTarget)}<span className="text-sm font-normal text-gray-400 ml-1">SAR</span>
            </p>
            <p className="text-xs text-gray-400 mb-3">
              {targets.length} group{targets.length === 1 ? '' : 's'} · {clients.length} client{clients.length === 1 ? '' : 's'}
              <span className="block text-[10px] text-gray-300 mt-0.5">Groups may overlap</span>
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
                  <h2 className="text-base font-semibold text-gray-900">🧩 Target Breakdown</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                </div>
                <button onClick={() => setShowDetails(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
                  <Icon name="X" size={16} className="text-gray-500" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 py-4 bg-gray-50 flex-shrink-0">
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

              {/* Without this the totals read like an arithmetic error. */}
              <p className="px-6 pb-3 -mt-1 text-xs text-gray-400 flex items-start gap-1.5 bg-gray-50 flex-shrink-0">
                <Icon name="Info" size={12} className="mt-0.5 flex-shrink-0" />
                Groups may overlap — a deal counts fully toward every group it contains, so totals
                reflect per-group attainment, not a revenue breakdown.
              </p>

              <div className="flex-1 overflow-y-auto overflow-x-auto px-6 py-4" style={{ scrollbarWidth: 'thin' }}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <span>📦</span> Product Groups
                </h3>
                {targets.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500">No product group targets have been set yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Go to Admin Dashboard → Sales Managers Target to set product group targets.</p>
                    {unassigned.count > 0 && (
                      <p className="text-xs text-amber-700 mt-3">
                        {fmtSAR(unassigned.value)} SAR across {unassigned.count} invoiced deal{unassigned.count === 1 ? '' : 's'} has no product line items recorded.
                      </p>
                    )}
                  </div>
                ) : (
                  <table className="w-full min-w-[520px] border-collapse text-sm">
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

                      {/* Invoiced revenue with no product detail. Deliberately
                          outside the target columns: it matches no target, so it
                          can never move anyone's attainment. Its size is the
                          signal — how much revenue was never itemised. */}
                      {unassigned.count > 0 && (
                        <tr className="bg-amber-50/60 border-t-2 border-amber-200">
                          <td className="px-3 py-3">
                            <p className="font-medium text-amber-900">Unassigned</p>
                            <p className="text-xs text-amber-700 mt-0.5 font-normal">
                              Invoiced deals with no product line items recorded — not counted toward any target.
                            </p>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-400">—</td>
                          <td className="px-3 py-3 tabular-nums text-amber-800 font-medium">
                            {fmtSAR(unassigned.value)} SAR
                            <span className="block text-xs font-normal text-amber-600">
                              {unassigned.count} deal{unassigned.count === 1 ? '' : 's'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-400">—</td>
                          <td className="px-3 py-3 text-xs text-gray-400">—</td>
                          <td className="px-3 py-3 text-xs text-gray-400">—</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}

                {/* ── Clients ── each deal counts once, against its own
                    contact, so unlike the groups above these never overlap.
                    Kept in its own section for exactly that reason. */}
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-6 mb-2 flex items-center gap-1.5">
                  <span>👤</span> Clients
                </h3>
                {clients.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500">No client targets have been set yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Go to Admin Dashboard → Sales Managers Target to set client targets.</p>
                  </div>
                ) : (
                  <table className="w-full min-w-[520px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        {['Client', 'Target', 'Achieved', 'Deficit', 'Attainment'].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide text-left border-b border-gray-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((c, i) => {
                        const a = clientAchieved[c.contact_id] || 0;
                        const deficit = Math.max(0, c.target_amount - a);
                        const attPct = c.target_amount > 0 ? (a / c.target_amount) * 100 : 0;
                        return (
                          <tr key={c.contact_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-3 font-medium text-gray-900">{c.label}</td>
                            <td className="px-3 py-3 tabular-nums text-blue-600 font-medium">{fmtSAR(c.target_amount)} SAR</td>
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
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
                        <td className="px-3 py-3">Total</td>
                        <td className="px-3 py-3 tabular-nums">{fmtSAR(clientTotalTarget)} SAR</td>
                        <td className="px-3 py-3 tabular-nums">{fmtSAR(clientTotalAchieved)} SAR</td>
                        <td className="px-3 py-3 tabular-nums">
                          {fmtSAR(Math.max(0, clientTotalTarget - clientTotalAchieved))} SAR
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {clientTotalTarget > 0 ? `${((clientTotalAchieved / clientTotalTarget) * 100).toFixed(0)}%` : '—'}
                        </td>
                      </tr>
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
