import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ContactSearchInput from '../ui/ContactSearchInput';
import { X, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';

const fmtSAR = (n) => new Intl.NumberFormat('en-SA', { maximumFractionDigits: 0 }).format(Number(n) || 0);

// Mandatory replacement opportunity, shown before a deal is removed from the
// current-month pipeline (marked Lost or moved to Future Orders). Creating the
// replacement keeps the coverage math accurate. `onSaved(opp)` runs the actual
// removal; `onClose` cancels it entirely (the deal stays in the Funnel). The
// opportunity is tagged is_replacement + replaces_deal_id for traceability.
export default function ReplacementModal({ removedDeal, removalType, onClose, onSaved }) {
  const { user, company } = useAuth();
  const [form, setForm] = useState({ contact_id: null, customer_name: '', planned_amount: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.customer_name.trim()) e.customer_name = 'Select a customer';
    if (!form.planned_amount || parseFloat(form.planned_amount) <= 0) e.planned_amount = 'Enter a planned amount';
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      const now = new Date();
      const expectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const { data: opp, error } = await supabase
        .from('opportunities')
        .insert({
          company_id: company?.id,
          owner_id: removedDeal.owner_id || user?.id,
          created_by: user?.id,
          contact_id: form.contact_id || null,
          customer_name: form.customer_name.trim(),
          customer_type: 'existing',
          planned_amount: parseFloat(form.planned_amount),
          expected_month: expectedMonth,
          status: 'open',
          is_replacement: true,
          replaces_deal_id: removedDeal.id,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      onSaved?.(opp);
    } catch (err) {
      console.error('Replacement:', err);
    } finally {
      setSaving(false);
    }
  };

  const removedName = removedDeal.title || removedDeal.contact_name || removedDeal.contact?.company_name || 'this deal';

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black bg-opacity-50 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden pointer-events-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-amber-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-amber-800 flex items-center gap-2">
                  <RefreshCw size={16} /> Add Replacement Opportunity
                </h2>
                <p className="text-xs text-amber-600 mt-0.5">Required before completing removal</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-amber-100 transition-colors">
                <X size={16} className="text-amber-700" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-800 mb-1">Coverage Rule</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Removing <strong>{removedName}</strong> ({fmtSAR(removedDeal.amount)} SAR)
                  {removalType === 'future_orders' ? ' to Future Orders' : ' as Lost'} requires a
                  replacement to keep your coverage on track.
                </p>
              </div>
            </div>

            <div>
              <ContactSearchInput
                label="Replacement Customer"
                value={form.contact_id}
                onChange={(contact) => {
                  setForm((f) => ({
                    ...f,
                    contact_id: contact?.id || null,
                    customer_name: contact?.company_name
                      || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim()
                      || '',
                  }));
                  setErrors((e) => ({ ...e, customer_name: null }));
                }}
                required
              />
              {errors.customer_name && <p className="text-xs text-red-500 mt-1">{errors.customer_name}</p>}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Planned Amount (SAR) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">SAR</span>
                <input
                  type="number"
                  value={form.planned_amount}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, planned_amount: e.target.value }));
                    setErrors((er) => ({ ...er, planned_amount: null }));
                  }}
                  placeholder="0"
                  min="1"
                  className={`w-full pl-12 pr-3 py-2.5 border rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${errors.planned_amount ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
              </div>
              {errors.planned_amount && <p className="text-xs text-red-500 mt-1">{errors.planned_amount}</p>}
              <p className="text-xs text-gray-400 mt-1">Removed deal: {fmtSAR(removedDeal.amount)} SAR — any amount is acceptable</p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <ArrowRight size={14} />
              Add Replacement
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
