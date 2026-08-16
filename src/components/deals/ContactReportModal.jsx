import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Phone, MapPin, MessageCircle, Mail, X, CheckCircle,
  Calendar, Clock, ArrowRight,
} from 'lucide-react';

const CONTACT_TYPES = [
  { id: 'call', label: 'Phone Call', icon: Phone },
  { id: 'visit', label: 'Visit', icon: MapPin },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'email', label: 'Email', icon: Mail },
];

const RESPONSES = [
  { id: 'positive', label: 'Positive', color: 'green' },
  { id: 'neutral', label: 'Neutral', color: 'amber' },
  { id: 'negative', label: 'Negative', color: 'red' },
];

const NEXT_ACTIONS = [
  'Send Proposal', 'Follow Up Call', 'Schedule Visit',
  'Awaiting Customer Decision', 'Send Quotation', 'Arrange Demo',
  'Escalate to Manager', 'Other',
];

const today = () => new Date().toISOString().split('T')[0];
const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Mandatory contact report. When `nextStage` is set the deal is advanced to that
// stage after the report saves (report-gated stage change); otherwise it's a
// standalone "Log Contact" entry.
export default function ContactReportModal({ deal, onClose, onSaved, nextStage = null }) {
  const { user, company } = useAuth();
  const [form, setForm] = useState({
    contact_type: '',
    contact_date: today(),
    duration_minutes: '',
    customer_response: '',
    next_action: '',
    follow_up_date: '',
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.contact_type) e.contact_type = 'Select contact type';
    if (!form.contact_date) e.contact_date = 'Select contact date';
    if (!form.duration_minutes || isNaN(form.duration_minutes)) e.duration_minutes = 'Enter duration in minutes';
    if (!form.customer_response) e.customer_response = 'Select customer response';
    if (!form.next_action) e.next_action = 'Select next action';
    if (!form.follow_up_date) e.follow_up_date = 'Select follow-up date';
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('contact_reports').insert({
        company_id: company?.id,
        deal_id: deal.id,
        owner_id: user?.id,
        contact_type: form.contact_type,
        contact_date: form.contact_date,
        duration_minutes: parseInt(form.duration_minutes, 10),
        customer_response: form.customer_response,
        next_action: form.next_action,
        follow_up_date: form.follow_up_date,
        notes: form.notes.trim() || null,
        is_audited: false,
        created_at: now,
      });
      if (error) throw error;

      // Report-gated stage change: advance only after the report is recorded.
      if (nextStage) {
        await supabase
          .from('deals')
          .update({ stage: nextStage, stage_changed_at: now, updated_at: now })
          .eq('id', deal.id);
      }

      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error('Contact report:', err);
    } finally {
      setSaving(false);
    }
  };

  const errText = (k) => errors[k] && <p className="text-xs text-red-500 mt-1">{errors[k]}</p>;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black bg-opacity-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden pointer-events-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0 bg-blue-50">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-blue-800">📋 Contact Report</h2>
              <p className="text-xs text-blue-600 mt-0.5 truncate max-w-72">
                {deal.title || deal.contact_name || deal.contact?.company_name || 'Deal'}
                {nextStage && (
                  <span className="ml-2 font-medium">→ Moving to <span className="capitalize">{titleCase(nextStage)}</span></span>
                )}
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors flex-shrink-0">
              <X size={16} className="text-blue-700" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>
            {nextStage && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                <ArrowRight size={13} className="flex-shrink-0" />
                A contact report is required before advancing this deal. Please fill all fields.
              </div>
            )}

            {/* Contact Type */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Contact Type *</label>
              <div className="grid grid-cols-4 gap-2">
                {CONTACT_TYPES.map((t) => {
                  const active = form.contact_type === t.id;
                  const TIcon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => set('contact_type', t.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors ${active ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}
                    >
                      <TIcon size={18} className={active ? 'text-blue-600' : 'text-gray-400'} />
                      <span className={`text-xs font-medium ${active ? 'text-blue-700' : 'text-gray-700'}`}>{t.label}</span>
                    </button>
                  );
                })}
              </div>
              {errText('contact_type')}
            </div>

            {/* Contact Date + Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Contact Date *</label>
                <input
                  type="date"
                  value={form.contact_date}
                  max={today()}
                  onChange={(e) => set('contact_date', e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${errors.contact_date ? 'border-red-400' : 'border-gray-300'}`}
                />
                {errText('contact_date')}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Duration (minutes) *</label>
                <div className="relative">
                  <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="number"
                    value={form.duration_minutes}
                    onChange={(e) => set('duration_minutes', e.target.value)}
                    placeholder="e.g. 30"
                    min="1"
                    className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${errors.duration_minutes ? 'border-red-400' : 'border-gray-300'}`}
                  />
                </div>
                {errText('duration_minutes')}
              </div>
            </div>

            {/* Customer Response */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Customer Response *</label>
              <div className="grid grid-cols-3 gap-2">
                {RESPONSES.map((r) => {
                  const active = form.customer_response === r.id;
                  const activeCls = r.color === 'green'
                    ? 'border-green-400 bg-green-50 text-green-700'
                    : r.color === 'amber'
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-red-400 bg-red-50 text-red-700';
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => set('customer_response', r.id)}
                      className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${active ? activeCls : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              {errText('customer_response')}
            </div>

            {/* Next Action */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">Next Action *</label>
              <select
                value={form.next_action}
                onChange={(e) => set('next_action', e.target.value)}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${errors.next_action ? 'border-red-400' : 'border-gray-300'}`}
              >
                <option value="">Select next action...</option>
                {NEXT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              {errText('next_action')}
            </div>

            {/* Follow-up Date */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">Follow-up Date *</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={form.follow_up_date}
                  min={today()}
                  onChange={(e) => set('follow_up_date', e.target.value)}
                  className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${errors.follow_up_date ? 'border-red-400' : 'border-gray-300'}`}
                />
              </div>
              {errText('follow_up_date')}
            </div>

            {/* Notes — optional */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                Notes<span className="text-gray-400 font-normal ml-1">(optional)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Additional notes about this contact..."
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <CheckCircle size={14} />
              {nextStage ? `Save & Move to ${titleCase(nextStage)}` : 'Save Report'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
