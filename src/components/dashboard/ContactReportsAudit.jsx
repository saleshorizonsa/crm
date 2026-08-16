import React, { useState, useEffect, useCallback } from 'react';
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
export default function ContactReportsAudit({ companyId, ownerIds = null, reviewerId }) {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

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
    setLoading(false);
  }, [companyId, ownerIds]);

  useEffect(() => { if (open) fetchReports(); }, [open, fetchReports]);

  const flagForAudit = async (id) => {
    await supabase
      .from('contact_reports')
      .update({ is_audited: true, audited_by: reviewerId, audited_at: new Date().toISOString() })
      .eq('id', id);
    fetchReports();
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—');

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Icon name="FileText" size={16} className="text-blue-600" />
          </div>
          <span className="text-sm font-semibold text-gray-900">Contact Reports — Audit</span>
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={16} className="text-gray-400" />
      </button>

      {open && (
        <div className="px-5 pb-4">
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
                  </div>
                  {r.is_audited ? (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1 flex-shrink-0">
                      <Icon name="CheckCircle" size={12} /> Audited
                    </span>
                  ) : (
                    <button
                      onClick={() => flagForAudit(r.id)}
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
