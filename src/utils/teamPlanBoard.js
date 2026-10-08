import { supabase } from 'lib/supabase';
import { computePlanningPageSummary } from 'utils/planningPageSummary';
import { planItemFlags } from 'utils/planningDrill';

/**
 * ONE ROW PER PERSON IN SCOPE — the team's plans, side by side.
 *
 * A supervisor had to filter to each salesman in turn and read the five cards
 * five times to find out who had not planned. This answers it in one table.
 *
 * EVERY FIGURE IS computePlanningPageSummary'S, called once per person. Not a
 * cheaper aggregate: the totals row has to equal the viewer's own cards to the
 * riyal, and the only way to guarantee that is for both to come out of the same
 * function. It costs one summary per person — about eight reads each — which is
 * why the rows load in parallel and the board is only built for the roles that
 * have a team.
 *
 * Plan status comes from plan_submissions, the same table the submit flow and
 * the approval queue read.
 */

const PLAN_STATUS = {
  none: 'not submitted',
  pending: 'submitted',
  approved: 'approved',
  rejected: 'rejected',
};

/** Days left in the period, counted from `now`, floor 0. */
export function daysLeft(end, now = new Date()) {
  const last = new Date(`${end}T23:59:59`);
  return Math.max(0, Math.ceil((last - now) / 86400000));
}

/**
 * @param {string}   companyId
 * @param {object[]} people     the users in scope (already narrowed by the page)
 * @param {string}   start      yyyy-MM-dd
 * @param {string}   end        yyyy-MM-dd
 * @param {string}   monthKey   yyyy-MM-01, the plan month for submissions
 * @param {string}   productGroup
 * @param {object}   flagCtx    for the not-converted count
 */
export async function buildTeamPlanBoard({
  companyId, people, start, end, monthKey, productGroup = null, flagCtx = {},
}) {
  if (!companyId || !people?.length) return { rows: [], totals: null };

  const ids = people.map((u) => u.id);

  // Plan submissions for the month, for everybody at once.
  const { data: subs } = await supabase
    .from('plan_submissions')
    .select('owner_id, approval_status, is_submitted, plan_month')
    .eq('company_id', companyId)
    .in('owner_id', ids)
    .eq('plan_month', monthKey);
  const subByOwner = new Map();
  (subs || []).forEach((r) => { subByOwner.set(r.owner_id, r); });

  const settled = await Promise.all(people.map(async (u) => {
    const sum = await computePlanningPageSummary({
      companyId, ownerIds: [u.id], start, end, productGroup,
    });
    const sub = subByOwner.get(u.id);
    const status = !sub || !sub.is_submitted
      ? PLAN_STATUS.none
      : PLAN_STATUS[sub.approval_status] || PLAN_STATUS.pending;

    const notConverted = (sum.drill?.planRows || []).filter(
      (o) => planItemFlags(o, flagCtx).includes('NOT CONVERTED'),
    ).length;

    return {
      id: u.id,
      name: u.full_name || u.email || 'Unknown',
      role: u.role,
      planStatus: status,
      target: sum.target,
      requiredPlan: sum.requiredPlan,
      planned: sum.plannedOpen,
      funnel: sum.openFunnel,
      coveragePct: sum.coveragePct,
      plannedGap: sum.plannedGap,
      notConverted,
      daysLeft: daysLeft(end, flagCtx.now || new Date()),
      partialFailure: !!sum.partialFailure,
    };
  }));

  // Sorted by what needs attention: the biggest gap first, then the ones who
  // have not submitted.
  const rows = settled.sort((a, b) => (b.plannedGap - a.plannedGap)
    || (a.planStatus === PLAN_STATUS.none ? -1 : 1));

  return { rows, statuses: PLAN_STATUS };
}

export { PLAN_STATUS };
