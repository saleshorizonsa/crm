// Sales returns for a dashboard card: this month's total, how many lines, and
// the move against last month.
//
// PURELY INFORMATIONAL. Returns already reduce Achieved everywhere (see the
// Achieved rule in planningCalculations.js); this only surfaces the figure that
// is already netted in, so nothing here feeds a target, a gap or a coverage
// number.
//
// The role scoping is the same one every other figure uses this session:
//   salesman              — their own deals only
//   supervisor / manager  — themselves plus their whole downline
//   director / admin/head — the company
// A return belongs to whoever owns the DEAL it was matched to. An unmatched
// return has no owner and so appears in nobody's card, which is the same reason
// it reduces nobody's Achieved.

import { supabase } from 'lib/supabase';
import { monthBounds } from 'utils/planningCalculations';
import { fetchTeamHierarchy } from 'utils/teamHierarchy';

const DIRECTOR_ROLES = ['director', 'admin', 'head'];
const TEAM_ROLES = ['manager', 'supervisor'];

export const EMPTY_RETURNS_SUMMARY = {
  total: 0, count: 0, prevTotal: 0, changePct: null, direction: 'flat', scope: 'none',
};

/** First and last day of the month before the one `d` falls in. */
function previousMonthBounds(d = new Date()) {
  return monthBounds(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

/**
 * Whose returns this person may see. `null` means no owner filter at all
 * (company-wide), which is how the rest of the app expresses that scope.
 */
export async function resolveReturnsScope({ companyId, userId, role }) {
  if (DIRECTOR_ROLES.includes(role)) return null;
  if (TEAM_ROLES.includes(role)) {
    const team = await fetchTeamHierarchy({ companyId, userId, role });
    return [userId, ...(team || []).map((m) => m.id)].filter(Boolean);
  }
  // Salesman, viewer, anyone else: only their own.
  return [userId].filter(Boolean);
}

async function sumReturns({ companyId, ownerIds, start, end }) {
  let q = supabase
    .from('deal_returns')
    .select('return_amount, deals!inner(owner_id)')
    .eq('company_id', companyId)
    .gte('return_date', start)
    .lte('return_date', end);
  if (Array.isArray(ownerIds)) {
    if (!ownerIds.length) return { total: 0, count: 0 };
    q = q.in('deals.owner_id', ownerIds);
  }
  const { data, error } = await q;
  if (error) {
    // A dashboard card must not take the page down with it, and must not show a
    // confident 0 either — the caller gets null and renders nothing.
    console.error('returnsSummary:', error);
    return null;
  }
  return {
    total: (data || []).reduce((s, r) => s + Math.abs(parseFloat(r.return_amount) || 0), 0),
    count: (data || []).length,
  };
}

/**
 * This month's returns and the change on last month, scoped by role.
 *
 * @returns {object|null} null when it could not be read, so the card can be
 *          hidden rather than showing a zero that looks like "no returns".
 */
export async function fetchReturnsSummary({ companyId, userId, role, now = new Date() }) {
  if (!companyId || !userId) return EMPTY_RETURNS_SUMMARY;
  const ownerIds = await resolveReturnsScope({ companyId, userId, role });
  const thisMonth = monthBounds(now);
  const lastMonth = previousMonthBounds(now);

  const [cur, prev] = await Promise.all([
    sumReturns({ companyId, ownerIds, start: thisMonth.startDate, end: thisMonth.endDate }),
    sumReturns({ companyId, ownerIds, start: lastMonth.startDate, end: lastMonth.endDate }),
  ]);
  if (!cur || !prev) return null;

  // No percentage from a zero base — "+100%" off nothing is noise. The card
  // shows the absolute figure instead in that case.
  const changePct = prev.total > 0
    ? ((cur.total - prev.total) / prev.total) * 100
    : null;

  return {
    total: cur.total,
    count: cur.count,
    prevTotal: prev.total,
    changePct,
    // Returns going UP is bad news, which is why the card colours an increase
    // red rather than green (see the dashboards' changeType).
    direction: cur.total > prev.total ? 'up' : cur.total < prev.total ? 'down' : 'flat',
    scope: ownerIds === null ? 'company' : (ownerIds.length > 1 ? 'team' : 'self'),
  };
}
