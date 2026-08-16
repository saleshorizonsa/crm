import React, { useState, useEffect, useCallback } from 'react';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';

// Red alert for salesmen flagged with a 2nd lead bounce-back this month.
// `ownerIds` scopes it: null = whole company (director); an array = team
// (manager/supervisor). "Mark Reviewed" clears the flag.
export default function BounceBackAlert({ companyId, ownerIds = null, reviewerId }) {
  const [flags, setFlags] = useState([]);

  const fetchFlags = useCallback(async () => {
    if (!companyId) { setFlags([]); return; }
    const n = new Date();
    const flagMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
    let q = supabase
      .from('salesman_flags')
      .select('id, flag_month, details, flagged_at, reviewed, owner:users!owner_id(id, full_name, role)')
      .eq('company_id', companyId)
      .eq('flag_type', 'bounce_back_2nd')
      .eq('flag_month', flagMonth)
      .eq('reviewed', false)
      .order('flagged_at', { ascending: false });
    if (Array.isArray(ownerIds)) {
      if (!ownerIds.length) { setFlags([]); return; }
      q = q.in('owner_id', ownerIds);
    }
    const { data } = await q;
    setFlags(data || []);
  }, [companyId, ownerIds]);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  const markReviewed = async (id) => {
    await supabase
      .from('salesman_flags')
      .update({ reviewed: true, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    fetchFlags();
  };

  if (!flags.length) return null;

  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="AlertTriangle" size={15} className="text-red-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-red-800">
          🚨 {flags.length} Salesman{flags.length > 1 ? 's' : ''} — 2nd Bounce-Back Alert
        </p>
      </div>
      <div className="space-y-2">
        {flags.map((flag) => (
          <div key={flag.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{flag.owner?.full_name || 'Unknown'}</p>
              <p className="text-xs text-red-600 mt-0.5">
                {flag.details?.bounce_count || 2} leads bounced back this month — intervention required
              </p>
            </div>
            <button
              onClick={() => markReviewed(flag.id)}
              className="text-xs px-3 py-1.5 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0 ml-3"
            >
              Mark Reviewed
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
