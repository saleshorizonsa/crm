import { useState, useEffect } from 'react';
import { useAuth } from 'contexts/AuthContext';
import { fetchReturnsSummary } from 'utils/returnsSummary';

// This month's sales returns for whoever is looking, ready for a dashboard tile.
//
// Each dashboard draws its own tile in its own style — the manager's coloured
// blocks, the supervisor's and salesman's centred tiles, the director's
// MetricsCard — but they ALL take the number from here, so the role scoping
// (self / downline / company) cannot drift between them. That scoping lives in
// utils/returnsSummary.js and is the same one Target, Achieved and the gap
// chain already use.
//
// Returns already reduce Achieved everywhere; this only surfaces the figure.
export default function useReturnsSummary({ userId, role, companyId, now } = {}) {
  const { user, userProfile, company } = useAuth();
  const ownerId = userId || user?.id;
  const ownerRole = role || userProfile?.role;
  const cid = companyId || company?.id;

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!cid || !ownerId) { setLoading(false); return undefined; }
    setLoading(true);
    (async () => {
      const s = await fetchReturnsSummary({
        companyId: cid, userId: ownerId, role: ownerRole, now: now || new Date(),
      });
      if (!cancelled) { setSummary(s); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [cid, ownerId, ownerRole, now]);

  // `summary` is null when the read failed — a tile should render nothing
  // rather than a confident 0, which would read as "no returns this month".
  return { summary, loading };
}

/**
 * The sub-line under the amount: how many lines, and the move on last month.
 * Shared so the wording is identical on all four dashboards.
 */
export function returnsSubline(summary) {
  if (!summary) return '';
  const { count, changePct, prevTotal, total } = summary;
  const lines = count === 0 ? 'no returns' : `${count} line${count === 1 ? '' : 's'}`;
  if (changePct !== null) {
    return `${lines} · ${changePct > 0 ? '+' : ''}${changePct.toFixed(0)}% vs last month`;
  }
  if (prevTotal === 0 && total > 0) return `${lines} · none last month`;
  return lines;
}
