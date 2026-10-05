import {
  computeAchieved,
  achieverIdsFrom,
  achievedAmount,
} from './planningCalculations';
import { isSelfAssignedTarget } from './selfTarget';
import { subtreeIdsOf } from './teamHierarchy';

// ONE definition of "how much of this target row has been achieved".
//
// Four dashboards each had their own, and all four were the same wrong one:
// stage = 'won' by closed_at at `amount`, counting the assignee plus his DIRECT
// supervisor_id children. That is not Achieved — it counts deals that were won
// but never invoiced, values them before the invoice, dates them by the day the
// deal closed rather than the day it was invoiced, ignores credit notes, and
// stops one level down the tree. For Mohamed Hussein's September row it read
// 89,634 where his Achieved was 94,279; for Amer's own supervisor card it added
// his whole team to a quota that is his alone.
//
// THE RULE (a business decision, already applied to the Manager "My Targets"
// tab and to plan submission):
//
//   • a row assigned to a salesman or a supervisor is a PERSONAL quota —
//     progress is that person's OWN Achieved inside the row's own period;
//   • a row assigned to a manager BY SOMEONE ELSE is his team allocation —
//     progress is the Achieved of his whole active subtree (supervisor_id,
//     recursive), restricted to the achiever scope (achieverIdsFrom), which is
//     what puts a flagged manager's own deals in and leaves a plain manager's
//     out;
//   • a SELF-target (assigned_by = assigned_to, see utils/selfTarget.js) is a
//     carve-out the person carries personally — his own Achieved, whatever his
//     is_contributor flag says.
//
// Achieved itself is never redefined here: computeAchieved from
// utils/planningCalculations.js is the only rule (won AND invoiced, by
// invoice_date in the window, final_amount ?? amount, net of returns dated in
// the same window).

/** Roles whose assigned row means "my team's number", not "my own". */
export const TEAM_ALLOCATION_ROLES = ['manager'];

const ymd = (v) => (v ? String(v).slice(0, 10) : '');

/**
 * The row's own window, as yyyy-MM-dd. A row with no period_end is treated as
 * a single day rather than as unbounded — an open-ended window would quietly
 * pull in every later invoice.
 */
export function targetRowPeriod(row) {
  const start = ymd(row?.period_start);
  const end = ymd(row?.period_end) || start;
  return start ? { start, end } : null;
}

/**
 * Whose deals count toward this row, and why.
 *
 * @param {object} row a sales_targets row (assigned_to, assigned_by)
 * @param {object[]} users company user rows; each needs id, role, is_active,
 *   is_contributor and supervisor_id. Passing only part of the company is fine
 *   (the Manager dashboard holds two levels) — the walk stays inside the list.
 * @returns {{ ids: string[], kind: 'personal'|'team' }}
 */
export function targetRowScope(row, { users = [] } = {}) {
  const assigneeId = row?.assigned_to;
  if (!assigneeId) return { ids: [], kind: 'personal' };

  const assignee = (users || []).find((u) => u?.id === assigneeId) || null;
  const role = assignee?.role || row?.assignee?.role || null;
  const isTeamAllocation = !isSelfAssignedTarget(row) && TEAM_ALLOCATION_ROLES.includes(role);

  if (isTeamAllocation) {
    // The subtree walk and the achiever filter are both shared code: nothing
    // about who counts is decided here.
    const subtree = subtreeIdsOf({ users, rootId: assigneeId });
    const members = [assignee, ...subtree.map((id) => users.find((u) => u?.id === id))].filter(Boolean);
    return { ids: achieverIdsFrom(members), kind: 'team' };
  }

  // A personal quota is personal: his own deals, whatever his contributor flag
  // says — the same choice the Manager tab makes for a self-target. An INACTIVE
  // assignee contributes nothing, which is what keeps Osman, Ahmad, Hazim,
  // Mueataz and the three "Export —" shells out of every total.
  if (assignee && assignee.is_active === false) return { ids: [], kind: 'personal' };
  return { ids: [assigneeId], kind: 'personal' };
}

/**
 * Achieved for ONE target row, over that row's own period.
 *
 * @param {object} row
 * @param {object} ctx
 * @param {object[]} ctx.deals    deal rows already in hand
 * @param {object[]} [ctx.returns] credit notes already in hand (see targetRowsWindow)
 * @param {object[]} ctx.users    company user rows (see targetRowScope)
 * @param {function} [ctx.amountOf] value of one deal; defaults to achievedAmount.
 *   A screen showing a converted currency passes a converter around it — the
 *   RULE does not change, only the unit.
 * @returns {number} net Achieved, which CAN be negative in a month whose
 *   credit notes exceed its invoices. Floor it at the display, not here.
 */
export function targetRowProgress(row, { deals = [], returns = [], users = [], amountOf = achievedAmount } = {}) {
  const period = targetRowPeriod(row);
  if (!period) return 0;
  const { ids } = targetRowScope(row, { users });
  if (!ids.length) return 0;
  return computeAchieved({
    deals,
    contributorIds: ids,
    start: period.start,
    end: period.end,
    amountOf,
    returns,
  }).total;
}

/** The same, stamped onto each row as `calculated_progress`. */
export function withTargetRowProgress(rows, ctx) {
  return (rows || []).map((row) => ({ ...row, calculated_progress: targetRowProgress(row, ctx) }));
}

/**
 * The widest window a set of rows covers, so returns are read ONCE instead of
 * once per row. computeAchieved narrows them per row by the same scope and
 * window it counts invoices over, so a January credit note cannot reduce an
 * October row.
 */
export function targetRowsWindow(rows) {
  const days = (rows || [])
    .flatMap((row) => [ymd(row?.period_start), ymd(row?.period_end)])
    .filter(Boolean)
    .sort();
  return days.length ? { start: days[0], end: days[days.length - 1] } : null;
}

/**
 * Everyone the rows in a table cover, each ONCE.
 *
 * This is what a table total must be computed over. Summing row progress
 * double-counts a person who holds several rows — and people do: a total_value
 * row plus a by_products row plus a by_clients row in the same month is three
 * rows, one person, one set of invoices. The old "Total Achieved" multiplied
 * his revenue by his row count.
 */
export function distinctPeopleScope(rows, { users = [] } = {}) {
  const ids = new Set();
  (rows || []).forEach((row) => {
    targetRowScope(row, { users }).ids.forEach((id) => ids.add(id));
  });
  return [...ids];
}

/**
 * Achieved over the DISTINCT people a set of rows covers, for one window —
 * the honest table total.
 */
export function achievedForRows(rows, { deals = [], returns = [], users = [], start, end, amountOf = achievedAmount } = {}) {
  const ids = distinctPeopleScope(rows, { users });
  if (!ids.length || !start) return 0;
  return computeAchieved({
    deals, contributorIds: ids, start, end, amountOf, returns,
  }).total;
}
