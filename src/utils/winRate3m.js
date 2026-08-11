import { supabase } from 'lib/supabase';

// Win rate over the last 3 COMPLETED calendar months (the current month is
// excluded). e.g. run in August → the window is 1 May .. 31 July.
//
//   winRate3m = won deals ÷ TOTAL deals CREATED in the window × 100
//
// Note the denominator is *all deals created* in the window (not just closed
// deals) — this matches the agreed 3-month definition and is intentionally
// different from the current-month card figure (won ÷ closed).
//
// Scope is always company-scoped. Pass `ownerIds` to restrict to a team
// (manager/supervisor) or to a single salesman (`[userId]`); omit / pass null
// for the whole company (director). An empty ownerIds array means "nobody in
// scope" and returns zeros rather than silently widening to the whole company.
export async function fetchWinRate3m({ companyId, ownerIds = null }) {
  const empty = { winRate3m: 0, won3m: 0, total3m: 0 };
  if (!companyId) return empty;
  if (Array.isArray(ownerIds) && ownerIds.length === 0) return empty;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);        // first day, 3 months ago
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);  // last day of the previous month

  let query = supabase
    .from('deals')
    .select('id, stage, created_at, owner_id')
    .eq('company_id', companyId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (Array.isArray(ownerIds)) query = query.in('owner_id', ownerIds);

  const { data, error } = await query;
  if (error) {
    console.error('fetchWinRate3m:', error);
    return empty;
  }

  const total3m = (data || []).length;
  const won3m = (data || []).filter((d) => d.stage === 'won').length;
  const winRate3m = total3m > 0 ? (won3m / total3m) * 100 : 0;
  return { winRate3m, won3m, total3m };
}
