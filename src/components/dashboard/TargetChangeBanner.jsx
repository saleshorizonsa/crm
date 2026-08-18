import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from 'lib/supabase';

const fmtSAR = (n) => new Intl.NumberFormat('en-SA', { maximumFractionDigits: 0 }).format(Number(n) || 0);

// Blue banner shown to a salesman whose monthly target was changed this month.
// Reads the latest unread 'target_changed' notification and shows the new target
// + recalculated Required Plan; "Dismiss" marks it read.
export default function TargetChangeBanner({ userId, companyId }) {
  const [notif, setNotif] = useState(null);

  const fetchNotif = useCallback(async () => {
    if (!userId || !companyId) { setNotif(null); return; }
    const { data } = await supabase
      .from('notifications')
      .select('id, message, metadata, created_at')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('type', 'target_changed')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const now = new Date();
    if (
      data &&
      new Date(data.created_at).getMonth() === now.getMonth() &&
      new Date(data.created_at).getFullYear() === now.getFullYear()
    ) {
      setNotif(data);
    } else {
      setNotif(null);
    }
  }, [userId, companyId]);

  useEffect(() => { fetchNotif(); }, [fetchNotif]);

  const dismiss = async () => {
    if (!notif) return;
    await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
    setNotif(null);
  };

  if (!notif) return null;
  const meta = notif.metadata || {};

  return (
    <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-4">
      <span className="text-xl flex-shrink-0">📊</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-800">Your Target Was Updated This Month</p>
        <p className="text-xs text-blue-600 mt-0.5">
          {meta.new_amount != null
            ? `New target: ${fmtSAR(meta.new_amount)} SAR · Required Plan: ${fmtSAR(meta.required_plan)} SAR`
            : notif.message}
        </p>
      </div>
      <button
        onClick={dismiss}
        className="text-xs px-3 py-1.5 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex-shrink-0"
      >
        Dismiss
      </button>
    </div>
  );
}
