import React, { useState, useEffect, useCallback } from 'react';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import { labelForTargetType, divisionsOfPerson } from 'utils/targetBreakdown';

// One person's target rows, for the expandable row in a team / member list.
//
// Built once and shared, because the same "who is on my team" list exists in
// four places (the manager, supervisor and director assignment screens, the
// dashboard team table and the Sales Divisions member list) and three of them
// would otherwise grow their own copy of this.
//
// Loads only when opened: a team list must not fire a query per member on
// render just in case someone expands one.
//
// A row with no division_id means one of two things, and they must not look
// alike: if the person belongs to several divisions the split was never
// recorded and the row is flagged for re-assignment; if they belong to none
// there is simply nothing to attribute it to.
const SAR = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const periodLabel = (row) => {
  const s = String(row.period_start || '').slice(0, 10);
  const e = String(row.period_end || '').slice(0, 10);
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  if (row.period_type === 'yearly') return `${d.getFullYear()}`;
  if (row.period_type === 'monthly') return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  return `${s} → ${e}`;
};

export default function PersonTargetRows({
  userId,
  // Falls back to the signed-in company, so a caller inside a team list does
  // not have to thread it through.
  companyId: companyIdProp,
  // Optional window; omitted shows every target the person holds.
  periodStart = null,
  periodEnd = null,
  // Show only active rows by default — a cancelled target is not a commitment.
  statuses = ['active'],
}) {
  const { company } = useAuth();
  const companyId = companyIdProp || company?.id || null;
  const [rows, setRows] = useState([]);
  const [person, setPerson] = useState(null);
  const [divisionNames, setDivisionNames] = useState({});
  const [extras, setExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      let q = supabase
        .from('sales_targets')
        .select('id, target_amount, target_type, period_type, period_start, period_end, status, division_id, product_group')
        .eq('assigned_to', userId)
        .order('period_start', { ascending: false });
      if (companyId) q = q.eq('company_id', companyId);
      if (Array.isArray(statuses) && statuses.length) q = q.in('status', statuses);
      if (periodStart) q = q.lte('period_start', periodEnd || periodStart);
      if (periodEnd) q = q.gte('period_end', periodStart || periodEnd);

      const [tRes, uRes, dRes, eRes] = await Promise.all([
        q,
        supabase.from('users').select('id, full_name, sales_division_id').eq('id', userId).maybeSingle(),
        companyId
          ? supabase.from('sales_divisions').select('id, name').eq('company_id', companyId)
          : Promise.resolve({ data: [] }),
        supabase.from('user_sales_divisions').select('division_id').eq('user_id', userId),
      ]);

      if (tRes.error) throw tRes.error;
      setRows(tRes.data || []);
      setPerson(uRes.data || null);
      setDivisionNames(Object.fromEntries((dRes.data || []).map((d) => [String(d.id), d.name])));
      setExtras((eRes.data || []).map((r) => String(r.division_id)));
    } catch (e) {
      setError(e?.message || 'Could not load targets.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, companyId, periodStart, periodEnd, JSON.stringify(statuses)]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-xs text-muted-foreground px-3 py-2">Loading targets…</p>;
  if (error) return <p className="text-xs text-red-600 px-3 py-2">{error}</p>;
  if (!rows.length) return <p className="text-xs text-muted-foreground px-3 py-2">No targets assigned.</p>;

  const { all } = divisionsOfPerson(person, extras);
  const isMultiDivision = all.length > 1;

  // Grouped by type, because that is the commitment; the division is a
  // property of each line within it.
  const byType = new Map();
  rows.forEach((r) => {
    const key = r.target_type || 'unspecified';
    if (!byType.has(key)) byType.set(key, { label: labelForTargetType(r.target_type), total: 0, lines: [] });
    const g = byType.get(key);
    const amount = parseFloat(r.target_amount) || 0;
    g.total += amount;
    g.lines.push({ ...r, amount });
  });

  return (
    <div className="space-y-3 px-3 py-2">
      {[...byType.entries()].map(([type, g]) => (
        <div key={type} className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/50">
            <p className="text-xs font-medium text-foreground">{g.label}</p>
            <p className="text-xs font-semibold tabular-nums text-foreground">{SAR(g.total)} SAR</p>
          </div>
          <div className="divide-y divide-border">
            {g.lines.map((ln) => {
              const divName = ln.division_id ? (divisionNames[String(ln.division_id)] || 'Unknown division') : null;
              return (
                <div key={ln.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">{periodLabel(ln)}</span>
                    {divName ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {divName}
                      </span>
                    ) : isMultiDivision ? (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                        title={`In ${all.length} divisions — re-assign this target per division to get real per-division numbers`}
                      >
                        not split by division
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">no division</span>
                    )}
                    {ln.product_group && (
                      <span className="text-[11px] text-muted-foreground">· {ln.product_group}</span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-foreground flex-shrink-0">{SAR(ln.amount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {isMultiDivision && rows.some((r) => !r.division_id) && (
        <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
          <Icon name="TriangleAlert" size={12} className="mt-0.5 flex-shrink-0" />
          <span>
            This person is in {all.length} divisions. The flagged targets above predate
            per-division assignment and were never split, so they are counted whole
            against their primary division. Re-assign them to record the real numbers.
          </span>
        </p>
      )}
    </div>
  );
}
