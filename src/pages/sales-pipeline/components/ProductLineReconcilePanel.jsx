import React, { useRef, useState } from 'react';
import Icon from '../../../components/AppIcon';
import { supabase } from '../../../lib/supabase';

// The one way a saved deal's product lines change, at every stage.
//
// It knows nothing about stages or about Won: give it a deal id, its lines and a
// callback, and it edits qty/rate a line at a time, writing each straight to
// deal_products so a reconciliation survives even if the deal save later fails.
// The caller decides what unlocks it (a reason), whether the running total is
// compared against anything (the Won Final Value flow passes that value), and
// what to do with each change — updating its own copy of the lines and writing
// the audit row.
//
// Built from the Won-stage Quantity Increase panel; lifted out unchanged in
// behaviour so every stage now gets the same gate instead of free inline edits.

const halala = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const lineQty = (p) => parseFloat(p?.uom_value ?? p?.quantity ?? 0) || 0;
const linePrice = (p) => parseFloat(p?.unit_price ?? 0) || 0;
const lineTotalOf = (p) => parseFloat(p?.line_total) || lineQty(p) * linePrice(p);

export default function ProductLineReconcilePanel({
  dealId,
  lines = [],
  /** Number to show the running total against (e.g. the entered Final Value). Null = just the total. */
  compareTo = null,
  compareLabel = 'Final Value',
  /** Called after a line is persisted: (updatedLines, { item, before, after, oldTotal, newTotal, label }) */
  onLineSaved,
  onError,
  formatCurrency,
  currency,
  /** Ids of lines already changed in this session, for the "Updated" markers. */
  changedIds = [],
  disabled = false,
}) {
  const [edits, setEdits] = useState({}); // line id -> { quantity, price }
  const [savingId, setSavingId] = useState(null);
  // What the lines looked like when this panel opened — "changed" means changed here.
  const baselineRef = useRef(null);
  if (!baselineRef.current && lines.length > 0) {
    baselineRef.current = Object.fromEntries(
      lines.map((p) => [p.id, { qty: halala(lineQty(p)), price: halala(linePrice(p)) }]),
    );
  }

  const linesTotal = lines.reduce((sum, p) => sum + lineTotalOf(p), 0);

  const saveLine = async (item) => {
    const edit = edits[item.id] || {};
    const qty = parseFloat(edit.quantity ?? lineQty(item)) || 0;
    const price = parseFloat(edit.price ?? linePrice(item)) || 0;
    if (qty <= 0 || price <= 0) return;
    setSavingId(item.id);
    const lineTotal = qty * price;
    const { error } = await supabase
      .from('deal_products')
      .update({ uom_value: qty, quantity: qty, unit_price: price, line_total: lineTotal, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    setSavingId(null);
    if (error) {
      onError?.(`Could not update that product line: ${error.message}`);
      return;
    }
    const updated = lines.map((p) =>
      p.id === item.id ? { ...p, uom_value: qty, quantity: qty, unit_price: price, line_total: lineTotal } : p,
    );
    const was = baselineRef.current?.[item.id];
    setEdits((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
    onLineSaved?.(updated, {
      item,
      label: item.product?.material || item.product_name || 'line',
      before: was ? `qty ${was.qty}, rate ${was.price}` : `qty ${lineQty(item)}, rate ${linePrice(item)}`,
      after: `qty ${qty}, rate ${price}`,
      oldTotal: lines.reduce((s, p) => s + lineTotalOf(p), 0),
      newTotal: updated.reduce((s, p) => s + lineTotalOf(p), 0),
    });
  };

  if (lines.length === 0) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon name="Info" size={11} />
        No product lines on this deal — nothing to reconcile.
      </p>
    );
  }

  return (
    <div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {lines.map((item) => {
          const edit = edits[item.id] || {};
          const qtyVal = edit.quantity ?? String(lineQty(item) || '');
          const priceVal = edit.price ?? String(linePrice(item) || '');
          const draftTotal = (parseFloat(qtyVal) || 0) * (parseFloat(priceVal) || 0);
          const isDirty =
            halala(qtyVal) !== halala(lineQty(item)) || halala(priceVal) !== halala(linePrice(item));
          const isChanged = changedIds.includes(item.id);
          return (
            <div key={item.id} className="flex items-center gap-2 p-2 bg-card rounded-lg border border-border text-xs">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-card-foreground truncate block">
                  {item.product?.material || item.product_name || 'Product'}
                </span>
                {isChanged && <span className="text-[10px] font-semibold text-green-700">Updated</span>}
              </div>
              <input
                type="number" min="0" step="0.01" value={qtyVal} disabled={disabled}
                onChange={(e) => setEdits((p) => ({ ...p, [item.id]: { ...edit, quantity: e.target.value } }))}
                className="w-20 px-2 py-1 border border-border rounded-lg text-right tabular-nums focus:outline-none focus:border-primary disabled:opacity-50"
                title={(item.uom_type || 'QTY').toUpperCase()}
              />
              <input
                type="number" min="0" step="0.01" value={priceVal} disabled={disabled}
                onChange={(e) => setEdits((p) => ({ ...p, [item.id]: { ...edit, price: e.target.value } }))}
                className="w-24 px-2 py-1 border border-border rounded-lg text-right tabular-nums focus:outline-none focus:border-primary disabled:opacity-50"
                title="Rate"
              />
              <span className="w-24 text-right font-semibold text-primary tabular-nums">
                {formatCurrency(draftTotal, currency)}
              </span>
              <button
                type="button"
                disabled={disabled || !isDirty || savingId === item.id}
                onClick={() => saveLine(item)}
                className={`px-2 py-1 rounded-lg border text-[11px] font-medium ${
                  isDirty && !disabled
                    ? 'border-green-300 text-green-700 hover:bg-green-50'
                    : 'border-border text-muted-foreground opacity-50 cursor-not-allowed'
                }`}
              >
                {savingId === item.id ? 'Saving…' : 'Save line'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Running total — informational. Freight and rounding make small gaps
          legitimate, so this never blocks a save. */}
      <div className="flex items-center justify-between gap-3 mt-3 pt-2 border-t border-border/60 text-xs">
        <span className="text-muted-foreground">
          Product lines:{' '}
          <span className="font-semibold text-card-foreground tabular-nums">{formatCurrency(linesTotal, currency)}</span>
          {compareTo != null && (
            <>
              <span className="mx-2">vs</span>
              {compareLabel}:{' '}
              <span className="font-semibold text-card-foreground tabular-nums">{formatCurrency(compareTo, currency)}</span>
            </>
          )}
        </span>
        {compareTo != null && (() => {
          const diff = linesTotal - compareTo;
          const close = Math.abs(diff) < Math.max(1, compareTo * 0.01);
          return (
            <span className={`font-semibold tabular-nums ${close ? 'text-green-600' : 'text-amber-600'}`}>
              {diff === 0 ? 'Match' : `${diff > 0 ? '+' : ''}${formatCurrency(diff, currency)}`}
            </span>
          );
        })()}
      </div>
    </div>
  );
}
