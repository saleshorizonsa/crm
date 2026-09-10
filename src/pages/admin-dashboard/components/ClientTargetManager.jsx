import React, { useState, useEffect, useCallback } from 'react';
import Icon from '../../../components/AppIcon';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import ContactSearchInput from '../../../components/ui/ContactSearchInput';
import { achievedByClient } from '../../../utils/clientTargetAchievement';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const monthStartOf = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const monthEndOf = (d = new Date()) => {
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
};

const contactLabel = (c) =>
  c?.company_name || `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || 'Unnamed';

// Assign a target to a specific CLIENT for one salesman, for the current month.
//
// ── Why client targets are NOT hung off the salesman's total_value row ──
// A client target is a row in client_targets, which reaches Target through its
// parent sales_targets row. utils/planningCalculations.js treats a row with
// children as a HEADER: its value is max(own amount, children sum), because
// children are that row broken down per client. Attaching client targets to
// the total_value row would therefore make them REPLACE the base target rather
// than add to it — a 100,000 value target plus a 200,000 client target would
// read 200,000, not 300,000.
//
// So client targets hang off their OWN by_clients container row for that
// salesman-month, kept separate from the total_value row. Both rows then sum:
//   total_value 100,000  +  by_clients container (children 200,000)  =  300,000
// which is the additive model the director specified.
//
// The container's target_amount is kept at max(current, children sum) so the
// figure is right even for a consumer that reads the row WITHOUT embedding its
// children — and so an existing partially-allocated row (a 288,147 target with
// 276,090 spread over clients) is never rewritten downward.
export default function ClientTargetManager({ companyId }) {
  const { user } = useAuth();

  const [salesmen, setSalesmen] = useState([]);
  const [ownerId, setOwnerId] = useState('');
  const [contacts, setContacts] = useState([]);
  const [rows, setRows] = useState([]);
  const [achieved, setAchieved] = useState({});
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ contact_id: '', contact: null, target_amount: '', notes: '' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = monthStartOf();
  const end = monthEndOf();
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const selected = salesmen.find((s) => s.id === ownerId) || null;

  // ── Salesmen ──────────────────────────────────────────────────────────────
  const loadSalesmen = useCallback(async () => {
    if (!companyId) { setSalesmen([]); return; }
    const { data } = await supabase
      .from('users')
      .select('id, full_name, role')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in('role', ['salesman', 'supervisor'])
      .order('full_name');
    setSalesmen(data || []);
  }, [companyId]);

  useEffect(() => { loadSalesmen(); }, [loadSalesmen]);

  // ── The selected salesman's own clients ───────────────────────────────────
  // contacts.company_id is NULL throughout this database; a contact belongs to
  // a company through its owner. Scoping by owner is also the right question:
  // you set a client target for a client that salesman actually owns.
  const loadContacts = useCallback(async () => {
    if (!ownerId) { setContacts([]); return; }
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name, phone, mobile')
      .eq('owner_id', ownerId)
      .order('company_name');
    setContacts(data || []);
  }, [ownerId]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // ── Existing client targets for this salesman-month ───────────────────────
  const loadRows = useCallback(async () => {
    if (!ownerId) { setRows([]); setAchieved({}); return; }
    setLoading(true);
    try {
      const { data: parents } = await supabase
        .from('sales_targets')
        .select('id')
        .eq('company_id', companyId)
        .eq('assigned_to', ownerId)
        .eq('status', 'active')
        .eq('period_type', 'monthly')
        .lte('period_start', end)
        .gte('period_end', start);
      const parentIds = (parents || []).map((p) => p.id);

      let list = [];
      if (parentIds.length) {
        const { data } = await supabase
          .from('client_targets')
          .select('id, contact_id, target_amount, notes, sales_target_id, contact:contact_id(id, first_name, last_name, company_name)')
          .in('sales_target_id', parentIds);
        list = data || [];
      }
      setRows(list.sort((a, b) => (b.target_amount || 0) - (a.target_amount || 0)));
      setAchieved(await achievedByClient({ companyId, ownerIds: [ownerId], start, end }));
    } finally {
      setLoading(false);
    }
  }, [companyId, ownerId, start, end]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const resetForm = () => {
    setForm({ contact_id: '', contact: null, target_amount: '', notes: '' });
    setEditing(null); setAdding(false); setError('');
  };

  // Find (or create) the by_clients container row these targets hang off.
  async function containerRowId() {
    const { data: existing } = await supabase
      .from('sales_targets')
      .select('id, target_amount')
      .eq('company_id', companyId)
      .eq('assigned_to', ownerId)
      .eq('status', 'active')
      .eq('period_type', 'monthly')
      .eq('target_type', 'by_clients')
      .lte('period_start', end)
      .gte('period_end', start)
      .limit(1);
    if (existing?.length) return existing[0].id;

    const { data: created, error: e } = await supabase
      .from('sales_targets')
      .insert({
        company_id: companyId,
        assigned_to: ownerId,
        assigned_by: user?.id || null,
        target_type: 'by_clients',
        target_amount: 0,      // re-synced from the children below
        period_type: 'monthly',
        period_start: start,
        period_end: end,
        status: 'active',
        notes: 'Container for per-client targets',
      })
      .select('id')
      .single();
    if (e) throw e;
    return created.id;
  }

  // Keep the container's own amount at least equal to its children, so a
  // consumer reading the row without its children still sees the right number.
  // Never lowers an existing figure — a partial allocation must not shrink a
  // target that was agreed at a higher number.
  async function syncContainer(parentId) {
    const { data: kids } = await supabase
      .from('client_targets')
      .select('target_amount')
      .eq('sales_target_id', parentId);
    const sum = (kids || []).reduce((s, k) => s + (parseFloat(k.target_amount) || 0), 0);
    const { data: parent } = await supabase
      .from('sales_targets')
      .select('target_amount')
      .eq('id', parentId)
      .single();
    const own = parseFloat(parent?.target_amount) || 0;
    if (sum > own) {
      await supabase
        .from('sales_targets')
        .update({ target_amount: sum, updated_at: new Date().toISOString() })
        .eq('id', parentId);
    }
  }

  async function handleSave() {
    setError('');
    if (!ownerId) { setError('Select a salesman.'); return; }
    if (!form.contact_id) { setError('Choose a client.'); return; }
    if (!form.target_amount || parseFloat(form.target_amount) <= 0) { setError('Enter a target amount.'); return; }
    const clash = rows.find((r) => r.contact_id === form.contact_id && r.id !== editing?.id);
    if (clash) {
      setError(`${contactLabel(clash.contact)} already has a target for ${monthLabel}.`);
      return;
    }

    setBusy(true);
    try {
      const amount = parseFloat(form.target_amount);
      const notes = form.notes?.trim() || null;
      let parentId;
      if (editing) {
        parentId = editing.sales_target_id;
        const { error: e } = await supabase
          .from('client_targets')
          .update({
            contact_id: form.contact_id,
            target_amount: amount,
            notes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id);
        if (e) throw e;
      } else {
        parentId = await containerRowId();
        const { error: e } = await supabase.from('client_targets').insert({
          sales_target_id: parentId,
          contact_id: form.contact_id,
          target_amount: amount,
          notes,
        });
        if (e) throw e;
      }
      await syncContainer(parentId);
      resetForm();
      await loadRows();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete the ${contactLabel(row.contact)} target?`)) return;
    const { error: e } = await supabase.from('client_targets').delete().eq('id', row.id);
    if (e) { setError(e.message); return; }
    await loadRows();
  }

  const totalTarget = rows.reduce((s, r) => s + (parseFloat(r.target_amount) || 0), 0);
  const totalAchieved = rows.reduce((s, r) => s + (achieved[r.contact_id] || 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Icon name="Users" size={15} className="text-emerald-600" />
            Client Targets
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {monthLabel} · adds to the salesman&apos;s total target
          </p>
        </div>
        <select
          value={ownerId}
          onChange={(e) => { setOwnerId(e.target.value); resetForm(); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[200px]"
        >
          <option value="">Select a salesman…</option>
          {salesmen.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>

      {!ownerId ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          Select a salesman to view or set their client targets.
        </p>
      ) : (
        <>
          {loading ? (
            <div className="py-6 text-center">
              <Icon name="LoaderCircle" size={18} className="animate-spin text-gray-400 mx-auto" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No client targets set for {monthLabel}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left font-medium py-2">Client</th>
                    <th className="text-right font-medium py-2">Target</th>
                    <th className="text-right font-medium py-2">Achieved</th>
                    <th className="text-right font-medium py-2">Attainment</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const t = parseFloat(r.target_amount) || 0;
                    const a = achieved[r.contact_id] || 0;
                    const pct = t > 0 ? (a / t) * 100 : 0;
                    return (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="py-2 pr-3 text-gray-900">{contactLabel(r.contact)}</td>
                        <td className="py-2 text-right tabular-nums text-gray-900">{fmt(t)}</td>
                        <td className="py-2 text-right tabular-nums text-gray-600">{fmt(a)}</td>
                        <td className={`py-2 text-right tabular-nums font-medium ${pct >= 100 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {pct.toFixed(0)}%
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(r);
                              setAdding(true);
                              setForm({
                                contact_id: r.contact_id,
                                contact: r.contact,
                                target_amount: String(r.target_amount ?? ''),
                                notes: r.notes || '',
                              });
                            }}
                            className="p-1 text-gray-400 hover:text-indigo-600"
                            aria-label="Edit"
                          >
                            <Icon name="Pencil" size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            aria-label="Delete"
                          >
                            <Icon name="Trash2" size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="text-sm font-semibold text-gray-900">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right tabular-nums">{fmt(totalTarget)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(totalAchieved)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {totalTarget > 0 ? `${((totalAchieved / totalTarget) * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {adding ? (
            <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
              <ContactSearchInput
                contacts={contacts}
                value={form.contact_id}
                onChange={(c) => setForm((f) => ({ ...f, contact_id: c?.id || '', contact: c }))}
                label="Client"
                placeholder={contacts.length ? 'Search this salesman’s clients…' : 'No clients owned by this salesman'}
              />
              <div className="flex flex-wrap gap-3">
                <label className="flex-1 min-w-[140px]">
                  <span className="block text-xs text-gray-500 mb-1">Target amount</span>
                  <input
                    type="number"
                    min="0"
                    value={form.target_amount}
                    onChange={(e) => setForm((f) => ({ ...f, target_amount: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                    placeholder="0"
                  />
                </label>
                <label className="flex-[2] min-w-[180px]">
                  <span className="block text-xs text-gray-500 mb-1">Notes (optional)</span>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Add target'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setAdding(true); setError(''); }}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              <Icon name="Plus" size={15} />
              Add Client Target
            </button>
          )}
        </>
      )}
    </div>
  );
}
