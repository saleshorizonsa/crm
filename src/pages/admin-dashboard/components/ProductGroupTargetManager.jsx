import React, { useState, useEffect, useCallback } from 'react';
import Icon from '../../../components/AppIcon';
import { supabase } from '../../../lib/supabase';
import { useMaterialGroups } from '../../../hooks/useMaterialGroups';
import { useAuth } from '../../../contexts/AuthContext';
import { achievedByProductGroup } from '../../../utils/productGroupAchievement';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const monthStartOf = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const monthEndOf = (d = new Date()) => {
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
};

// Assign a target to a PRODUCT GROUP for one salesman, for the current month.
//
// A product-group target IS a sales_targets row: target_type 'by_products' with
// the group in product_group. It stands on its own and ADDS to whatever else
// the salesman carries that month, which is what utils/planningCalculations.js
// sums into Target.
//
// It used to live in product_group_targets, hanging off whichever monthly
// sales_target row happened to be found first for that owner. That table is
// no longer read or written (it holds no rows). Two problems went with it: the
// parent row was picked arbitrarily when a person had more than one, and a
// salesman with no base target could not be given a group target at all.
// Neither applies now that the row is standalone.
//
// Distinct from the existing by_products UI for individual products, which
// targets specific SKUs through product_targets.
//
// The group list comes from the material_groups table, not from DISTINCT
// products.material_group: that column is free-text in places and yields 45
// values for this company, mostly voltages and part numbers, while omitting
// curated groups such as PVC COMPO and RESIN that no product carries yet.
export default function ProductGroupTargetManager({ companyId }) {
  const { groups, loading: groupsLoading } = useMaterialGroups(companyId);
  const { user } = useAuth();

  const [salesmen, setSalesmen] = useState([]);   // [{ id, full_name, role }]
  const [ownerId, setOwnerId] = useState('');
  const [rows, setRows] = useState([]);
  const [achieved, setAchieved] = useState({});
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ product_group: '', target_amount: '', notes: '' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = monthStartOf();
  const end = monthEndOf();
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Every active contributor. No base-target prerequisite: a group target is
  // its own row.
  const loadSalesmen = useCallback(async () => {
    if (!companyId) { setSalesmen([]); return; }
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, role')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in('role', ['salesman', 'supervisor'])
      .order('full_name');

    setSalesmen(users || []);
  }, [companyId]);

  useEffect(() => { loadSalesmen(); }, [loadSalesmen]);

  const selected = salesmen.find((s) => s.id === ownerId) || null;

  const loadRows = useCallback(async () => {
    if (!selected?.id) { setRows([]); setAchieved({}); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('sales_targets')
        .select('id, product_group, target_amount, currency, notes')
        .eq('company_id', companyId)
        .eq('assigned_to', selected.id)
        .eq('status', 'active')
        .eq('period_type', 'monthly')
        .eq('target_type', 'by_products')
        .not('product_group', 'is', null)
        .lte('period_start', end)
        .gte('period_end', start)
        .order('product_group');
      setRows(data || []);
      setAchieved(await achievedByProductGroup({ companyId, ownerIds: [selected.id], start, end }));
    } finally {
      setLoading(false);
    }
  }, [selected?.id, companyId, start, end]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const resetForm = () => { setForm({ product_group: '', target_amount: '', notes: '' }); setEditing(null); setAdding(false); setError(''); };

  async function handleSave() {
    setError('');
    if (!form.product_group) { setError('Choose a product group.'); return; }
    if (!form.target_amount || parseFloat(form.target_amount) <= 0) { setError('Enter a target amount.'); return; }
    if (!selected?.id) { setError('Select a salesman.'); return; }
    // One target per group per salesman-month; editing an existing row is fine.
    const clash = rows.find((r) => r.product_group === form.product_group && r.id !== editing?.id);
    if (clash) { setError(`${form.product_group} already has a target for ${monthLabel}.`); return; }

    setBusy(true);
    try {
      const amount = parseFloat(form.target_amount);
      const notes = form.notes?.trim() || null;
      let e;
      if (editing) {
        // Only the amount/notes/group are editable; the row's identity as this
        // salesman's by_products target for this month does not change.
        ({ error: e } = await supabase
          .from('sales_targets')
          .update({
            product_group: form.product_group,
            target_amount: amount,
            notes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id));
      } else {
        ({ error: e } = await supabase.from('sales_targets').insert({
          company_id: companyId,
          assigned_to: selected.id,
          assigned_by: user?.id || null,
          target_type: 'by_products',
          product_group: form.product_group,
          target_amount: amount,
          period_type: 'monthly',
          period_start: start,
          period_end: end,
          status: 'active',
          notes,
        }));
      }
      if (e) throw e;
      resetForm();
      await loadRows();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete the ${row.product_group} target?`)) return;
    // A group target is a whole sales_targets row, so deleting it removes the
    // commitment entirely and Target drops by that amount.
    const { error: e } = await supabase.from('sales_targets').delete().eq('id', row.id);
    if (e) { setError(e.message); return; }
    loadRows();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Icon name="Package" size={15} className="text-indigo-600" />
            Product Group Targets
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{monthLabel} · a deal counts fully toward every group it contains</p>
        </div>
        <select
          value={ownerId}
          onChange={(e) => { setOwnerId(e.target.value); resetForm(); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[200px]"
        >
          <option value="">Select a salesman…</option>
          {salesmen.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </div>

      {!ownerId ? (
        <p className="text-sm text-gray-400 py-6 text-center">Select a salesman to view or set their product group targets.</p>
      ) : (
        <>
          {loading ? (
            <div className="py-6 text-center"><Icon name="LoaderCircle" size={18} className="animate-spin text-gray-400 mx-auto" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No product group targets set for {monthLabel}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2">Product Group</th>
                    <th className="pb-2 text-right">Target</th>
                    <th className="pb-2 text-right">Achieved</th>
                    <th className="pb-2 text-right">Deficit</th>
                    <th className="pb-2 text-right">Attainment</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const t = parseFloat(r.target_amount) || 0;
                    const a = achieved[r.product_group] || 0;
                    const pct = t > 0 ? (a / t) * 100 : 0;
                    return (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="py-2 font-medium text-gray-900">{r.product_group}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(t)}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(a)}</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">{fmt(Math.max(0, t - a))}</td>
                        <td className={`py-2 text-right tabular-nums font-medium ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-blue-600' : 'text-amber-600'}`}>
                          {pct.toFixed(1)}%
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => { setEditing(r); setAdding(true); setForm({ product_group: r.product_group, target_amount: String(r.target_amount ?? ''), notes: r.notes || '' }); }}
                            className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(r)}
                            className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded-lg ml-1"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!adding ? (
            <button
              onClick={() => { setAdding(true); setEditing(null); setForm({ product_group: '', target_amount: '', notes: '' }); }}
              className="mt-3 text-xs px-3 py-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1"
            >
              <Icon name="Plus" size={12} /> Add Product Group Target
            </button>
          ) : (
            <div className="mt-3 p-3 border border-gray-200 rounded-xl bg-gray-50 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={form.product_group}
                  onChange={(e) => setForm((f) => ({ ...f, product_group: e.target.value }))}
                  disabled={groupsLoading}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">{groupsLoading ? 'Loading groups…' : 'Product group…'}</option>
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <input
                  type="number"
                  min="1"
                  value={form.target_amount}
                  onChange={(e) => setForm((f) => ({ ...f, target_amount: e.target.value }))}
                  placeholder="Target amount"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white tabular-nums"
                />
              </div>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notes (optional)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={resetForm} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-white">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={busy}
                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Add target'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
