import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AutoTerm } from "components/dictionary/Term";
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';

const RESPONSE_BADGE = {
  positive: 'bg-green-100 text-green-700',
  neutral: 'bg-amber-100 text-amber-700',
  negative: 'bg-red-100 text-red-700',
};
const TYPE_ICON = { call: 'Phone', visit: 'MapPin', whatsapp: 'MessageCircle', email: 'Mail' };

// Collapsible "Contact Reports" audit section for managers/supervisors/directors.
// Lists the team's recent contact reports and lets the reviewer flag any for
// audit. `ownerIds` scopes it: null = whole company (director); array = team.
//
// Session 40: marking a report audited takes an optional note
// (contact_reports.audit_notes), shown on the Sales Monitor's Visit sheet.
// defaultOpen: open and scrolled to, e.g. from the Sales Monitor's "Visit
// reports not audited" (/insights#contact-audit).
//
// audit_notes is written and read APART from everything else: if the column
// is missing the audit itself still saves and the panel says the note was not
// kept, and the list still loads.
export default function ContactReportsAudit({ companyId, ownerIds = null, reviewerId, defaultOpen = false }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noteFor, setNoteFor] = useState(null);   // the report being marked audited
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState({});         // id → saved note
  const [noteWarning, setNoteWarning] = useState('');
  const box = useRef(null);
  useEffect(() => {
    if (defaultOpen) { setOpen(true); box.current?.scrollIntoView?.({ block: 'start' }); }
  }, [defaultOpen]);

  const fetchReports = useCallback(async () => {
    if (!companyId) { setReports([]); return; }
    setLoading(true);
    let q = supabase
      .from('contact_reports')
      .select('id, contact_type, contact_date, customer_response, next_action, follow_up_date, is_audited, created_at, deal:deals!deal_id(title), owner:users!owner_id(full_name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (Array.isArray(ownerIds)) {
      if (!ownerIds.length) { setReports([]); setLoading(false); return; }
      q = q.in('owner_id', ownerIds);
    }
    const { data } = await q;
    setReports(data || []);
    // The notes, in their own request (see above).
    const ids = (data || []).filter((r) => r.is_audited).map((r) => r.id);
    if (ids.length) {
      const { data: n, error } = await supabase.from('contact_reports').select('id, audit_notes').in('id', ids);
      if (!error) setNotes(Object.fromEntries((n || []).filter((r) => r.audit_notes).map((r) => [r.id, r.audit_notes])));
    }
    setLoading(false);
  }, [companyId, ownerIds]);

  useEffect(() => { if (open) fetchReports(); }, [open, fetchReports]);

  const flagForAudit = async (id, text = '') => {
    await supabase
      .from('contact_reports')
      .update({ is_audited: true, audited_by: reviewerId, audited_at: new Date().toISOString() })
      .eq('id', id);
    const t = String(text || '').trim();
    setNoteWarning('');
    if (t) {
      const { error } = await supabase.from('contact_reports').update({ audit_notes: t }).eq('id', id);
      if (error) setNoteWarning('Marked audited, but the note could not be saved (contact_reports.audit_notes was not accepted).');
    }
    setNoteFor(null);
    setNote('');
    fetchReports();
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—');

  return (
    <div ref={box} className="bg-white rounded-xl border border-gray-200 mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Icon name="FileText" size={16} className="text-blue-600" />
          </div>
          <span className="text-sm font-semibold text-gray-900"><AutoTerm>Contact Reports — Audit</AutoTerm></span>
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={16} className="text-gray-400" />
      </button>

      {open && (
        <div className="px-5 pb-4">
          {noteWarning && <p className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="audit-note-warning">{noteWarning}</p>}
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : reports.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No contact reports yet.</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                    <Icon name={TYPE_ICON[r.contact_type] || 'Phone'} size={14} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.deal?.title || 'Deal'}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${RESPONSE_BADGE[r.customer_response] || 'bg-gray-100 text-gray-600'}`}>
                        {r.customer_response}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {r.owner?.full_name || 'Unknown'} · {fmtDate(r.contact_date)} · {r.next_action}
                    </p>
                    {notes[r.id] && <p className="text-xs text-gray-700 mt-0.5" data-testid="audit-note">Note: {notes[r.id]}</p>}
                    {noteFor === r.id && (
                      <div className="mt-2 flex flex-col sm:flex-row gap-2" data-testid="audit-note-form">
                        <input
                          type="text"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Audit note (optional)"
                          aria-label="Audit note"
                          data-testid="audit-note-input"
                          className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1.5"
                        />
                        <div className="flex gap-2">
                          <button type="button" data-testid="audit-note-save" onClick={() => flagForAudit(r.id, note)}
                            className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700">Mark audited</button>
                          <button type="button" onClick={() => { setNoteFor(null); setNote(''); }}
                            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {r.is_audited ? (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1 flex-shrink-0">
                      <Icon name="CheckCircle" size={12} /> Audited
                    </span>
                  ) : (
                    <button
                      data-testid="audit-flag"
                      onClick={() => { setNoteFor(r.id); setNote(''); }}
                      className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors flex-shrink-0"
                    >
                      Flag for Audit
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
