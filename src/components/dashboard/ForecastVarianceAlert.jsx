import React, { useState, useEffect, useCallback } from 'react';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';

// Amber alert for contributors whose month-end invoiced total missed their
// forecast by more than the tolerance. Same shape as BounceBackAlert:
// `ownerIds` scopes it (null = whole company for a director; an array = team),
// and "Mark Reviewed" clears the row.
//
// Informational only — there is deliberately no approve/escalate action here.
export default function ForecastVarianceAlert({ companyId, ownerIds = null, reviewerId }) {
  const [flags, setFlags] = useState([]);

  const fetchFlags = useCallback(async () => {
    if (!companyId) { setFlags([]); return; }
    const n = new Date();
    const periodMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
    let q = supabase
      .from('forecast_flags')
      .select('id, period_month, forecast_amount, actual_amount, variance_pct, tolerance_pct, created_at, owner:users!owner_id(id, full_name, role)')
      .eq('company_id', companyId)
      .eq('period_month', periodMonth)
      .eq('reviewed', false)
      .order('created_at', { ascending: false });
    if (Array.isArray(ownerIds)) {
      if (!ownerIds.length) { setFlags([]); return; }
      q = q.in('owner_id', ownerIds);
    }
    const { data, error } = await q;
    // Table not created yet (migrations/add_forecast_flags.sql) — stay invisible
    // rather than surfacing a query error on the dashboard.
    if (error) { setFlags([]); return; }
    setFlags(data || []);
  }, [companyId, ownerIds]);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  const markReviewed = async (id) => {
    await supabase
      .from('forecast_flags')
      .update({ reviewed: true, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    fetchFlags();
  };

  if (!flags.length) return null;

  const fmt = (v) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="TriangleAlert" size={15} className="text-amber-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-amber-800">
          📉 {flags.length} Forecast Variance Alert{flags.length > 1 ? 's' : ''} — outside ±
          {flags[0]?.tolerance_pct ?? 10}%
        </p>
      </div>
      <div className="space-y-2">
        {flags.map((flag) => {
          const v = Number(flag.variance_pct) || 0;
          const under = v < 0;
          return (
            <div key={flag.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {flag.owner?.full_name || 'Unknown'}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Forecast {fmt(flag.forecast_amount)} · Actual {fmt(flag.actual_amount)} ·{' '}
                  <span className={under ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    {v > 0 ? '+' : ''}{v.toFixed(1)}%
                  </span>{' '}
                  {under ? 'under forecast' : 'over forecast'}
                </p>
              </div>
              <button
                onClick={() => markReviewed(flag.id)}
                className="text-xs px-3 py-1.5 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors flex-shrink-0 ml-3"
              >
                Mark Reviewed
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
