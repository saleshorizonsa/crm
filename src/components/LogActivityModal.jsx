import React, { useState, useEffect } from 'react';
import Icon from './AppIcon';
import { activityService } from '../services/supabaseService';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

export default function LogActivityModal({ isOpen, onClose, onSaved, dealId, contactId, contactName }) {
  const { user, company } = useAuth();
  const [form, setForm] = useState({
    activityType: 'visit', description: '', outcome: '',
    nextAction: '', nextActionDate: '', durationMinutes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm({ activityType: 'visit', description: '', outcome: '', nextAction: '', nextActionDate: '', durationMinutes: '' });
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  async function handleSave() {
    if (!form.description.trim()) { setError('Please add a description'); return; }
    setSaving(true);
    const { data, error: err } = await activityService.logActivity({
      companyId:       company.id,
      userId:          user.id,
      contactId,
      dealId,
      activityType:    form.activityType,
      description:     form.description,
      outcome:         form.outcome        || null,
      nextAction:      form.nextAction     || null,
      nextActionDate:  form.nextActionDate || null,
      durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes) : null,
    });
    setSaving(false);
    if (err) { setError('Failed to save: ' + (err.message || String(err))); return; }
    onSaved?.(data);
    onClose();
  }

  const outcomeColors = {
    positive:     { sel: 'bg-green-50 border-green-300 text-green-700', idle: 'border-gray-200 text-gray-600 hover:bg-gray-50' },
    neutral:      { sel: 'bg-gray-100 border-gray-300 text-gray-700',   idle: 'border-gray-200 text-gray-600 hover:bg-gray-50' },
    followup:     { sel: 'bg-amber-50 border-amber-300 text-amber-700', idle: 'border-gray-200 text-gray-600 hover:bg-gray-50' },
    not_interested: { sel: 'bg-red-50 border-red-300 text-red-700',     idle: 'border-gray-200 text-gray-600 hover:bg-gray-50' },
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Icon name="Activity" size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Log Activity</h2>
              {contactName && <p className="text-xs text-gray-400">{contactName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
            <Icon name="X" size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Activity type grid */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Activity Type</label>
            <div className="grid grid-cols-4 gap-2">
              {activityService.TYPES.map(type => (
                <button key={type.value} type="button" onClick={() => set('activityType', type.value)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-colors ${
                    form.activityType === type.value
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                  <Icon name={type.icon} size={16} />
                  {type.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Notes / Description *</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
              placeholder="What was discussed? What happened?"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl resize-none focus:outline-none focus:border-blue-400" />
          </div>

          {/* Outcome */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Outcome</label>
            <div className="flex gap-2 flex-wrap">
              {activityService.OUTCOMES.map(o => (
                <button key={o.value} type="button" onClick={() => set('outcome', form.outcome === o.value ? '' : o.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    form.outcome === o.value
                      ? (outcomeColors[o.value]?.sel || 'bg-gray-100 border-gray-300 text-gray-600')
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Duration (minutes)</label>
            <div className="flex gap-2 flex-wrap">
              {[15, 30, 60, 90].map(m => (
                <button key={m} type="button" onClick={() => set('durationMinutes', form.durationMinutes === String(m) ? '' : String(m))}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    form.durationMinutes === String(m) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                  {m} min
                </button>
              ))}
              <input type="number" min="1" value={form.durationMinutes} onChange={e => set('durationMinutes', e.target.value)}
                placeholder="Custom"
                className="w-20 text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-center focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* Next action + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Next Action</label>
              <input type="text" value={form.nextAction} onChange={e => set('nextAction', e.target.value)}
                placeholder="e.g. Send quote"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Follow-up Date</label>
              <input type="date" value={form.nextActionDate} onChange={e => set('nextActionDate', e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 rounded-xl hover:bg-gray-100">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            <Icon name="Save" size={14} />
            {saving ? 'Saving…' : 'Log Activity'}
          </button>
        </div>
      </div>
    </div>
  );
}
