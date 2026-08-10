import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from 'lib/supabase';
import Icon from 'components/AppIcon';

// Bulk-create Opportunities from customers selected in Customer Master.
// Each selected customer becomes one row with a SAR planned-amount input; rows
// whose contact already has an Opportunity are flagged and excluded by default.
//
// props:
//   customers      – selected contact rows [{ id, company_name, first_name, last_name, owner_id, customer_type }]
//   companyId      – active company id
//   currentUserId  – the acting user (created_by, and owner fallback)
//   onClose()      – dismiss without saving
//   onDone()       – called after a successful save (parent clears + refetches)
export default function AddToOpportunitiesModal({ customers = [], companyId, currentUserId, onClose, onDone }) {
  const [existingIds, setExistingIds] = useState(null); // null = still loading
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const displayName = (c) =>
    c.company_name?.trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(' ').trim() ||
    'Unnamed customer';

  // Which of the selected customers already have an Opportunity (matched by contact_id).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = customers.map((c) => c.id).filter(Boolean);
      if (ids.length === 0) { setExistingIds(new Set()); return; }
      const { data } = await supabase
        .from('opportunities')
        .select('contact_id')
        .eq('company_id', companyId)
        .in('contact_id', ids);
      if (cancelled) return;
      setExistingIds(new Set((data || []).map((o) => o.contact_id).filter(Boolean)));
    })();
    return () => { cancelled = true; };
  }, [customers, companyId]);

  // Build the editable rows once we know which are already in Opportunities.
  useEffect(() => {
    if (existingIds === null) return;
    setRows(
      customers.map((c) => ({
        id: c.id,
        name: displayName(c),
        ownerId: c.owner_id || currentUserId,
        already: existingIds.has(c.id),
        include: !existingIds.has(c.id), // duplicates start unchecked
        amount: '',
      })),
    );
  }, [existingIds, customers, currentUserId]);

  const setRow = (id, patch) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const included = rows.filter((r) => r.include);
  const missingAmount = included.some((r) => !(parseFloat(r.amount) > 0));
  const canSave = included.length > 0 && !missingAmount && !saving;

  const alreadyCount = useMemo(() => rows.filter((r) => r.already).length, [rows]);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const payload = included.map((r) => ({
        customer_name:  r.name,
        customer_type:  'existing',
        contact_id:     r.id,
        planned_amount: parseFloat(r.amount) || 0,
        company_id:     companyId,
        owner_id:       r.ownerId || currentUserId,
        created_by:     currentUserId,
      }));
      const { error: insErr } = await supabase.from('opportunities').insert(payload);
      if (insErr) throw insErr;
      onDone?.(included.length);
    } catch (err) {
      console.error('addToOpportunities:', err);
      setError(err.message || 'Could not create opportunities.');
    } finally {
      setSaving(false);
    }
  }

  const loading = existingIds === null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-semibold text-foreground">Add to Opportunities</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {customers.length} customer{customers.length === 1 ? '' : 's'} selected
              {alreadyCount > 0 && ` · ${alreadyCount} already in Opportunities`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          >
            <Icon name="X" size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Rows */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Icon name="Loader2" size={24} className="animate-spin" />
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  r.include ? 'border-border bg-background' : 'border-border/60 bg-muted/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => setRow(r.id, { include: e.target.checked })}
                  className="rounded border-border shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                  {r.already && (
                    <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                      <Icon name="AlertTriangle" size={10} />
                      Already in Opportunities
                    </span>
                  )}
                </div>
                <div className="relative w-32 shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    SAR
                  </span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    value={r.amount}
                    disabled={!r.include}
                    onChange={(e) => setRow(r.id, { amount: e.target.value })}
                    className="w-full text-sm text-right pl-10 pr-2.5 py-1.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {!loading && missingAmount && included.length > 0 && (
            <p className="text-xs text-muted-foreground">Enter a SAR amount for every selected customer.</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <Icon name="Loader2" size={14} className="animate-spin" />
              ) : (
                <Icon name="Plus" size={14} />
              )}
              Create {included.length || ''} Opportunit{included.length === 1 ? 'y' : 'ies'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
