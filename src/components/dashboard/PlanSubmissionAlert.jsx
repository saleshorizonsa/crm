import React, { useState, useEffect, useCallback } from 'react';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';

// Red alert listing team members who missed the plan-submission deadline (the
// 25th) for the current month. `ownerIds` scopes it: null = whole company
// (director); an array = that team (manager/supervisor). "Mark Reviewed" clears
// the alert by stamping the rows reviewed.
export default function PlanSubmissionAlert({ companyId, ownerIds = null, reviewerId }) {
  const [missed, setMissed] = useState([]);

  const fetchMissed = useCallback(async () => {
    if (!companyId) { setMissed([]); return; }
    const n = new Date();
    const planMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
    let q = supabase
      .from('plan_submissions')
      .select('id, plan_month, flagged, owner:users!owner_id(id, full_name, role)')
      .eq('company_id', companyId)
      .eq('plan_month', planMonth)
      .eq('flagged', true)
      .eq('is_submitted', false)
      .eq('reviewed', false);
    if (Array.isArray(ownerIds)) {
      if (!ownerIds.length) { setMissed([]); return; }
      q = q.in('owner_id', ownerIds);
    }
    const { data } = await q;
    setMissed(data || []);
  }, [companyId, ownerIds]);

  useEffect(() => { fetchMissed(); }, [fetchMissed]);

  const markReviewed = async () => {
    const ids = missed.map((p) => p.id);
    if (!ids.length) return;
    await supabase
      .from('plan_submissions')
      .update({ reviewed: true, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
      .in('id', ids);
    fetchMissed();
  };

  if (!missed.length) return null;

  return (
    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
      <Icon name="Flag" size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-800">
          🚩 {missed.length} Salesman{missed.length > 1 ? 's have' : ' has'} not submitted their plan
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {missed.map((p) => (
            <span key={p.id} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg font-medium">
              {p.owner?.full_name || 'Unknown'}
            </span>
          ))}
        </div>
        <p className="text-xs text-red-600 mt-2">
          Deadline was the 25th — please interview before the month starts.
        </p>
      </div>
      <button
        onClick={markReviewed}
        className="text-xs px-3 py-1.5 border border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0"
      >
        Mark Reviewed
      </button>
    </div>
  );
}
