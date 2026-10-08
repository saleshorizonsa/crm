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

  /**
   * WHAT HAPPENED TO THE REST OF THE PLAN — converted, and moved on.
   *
   * "Planned" is open items only, which is the right formula: a converted item
   * is a deal now, and counting it again as plan would double it. But the board
   * read as though Mohamed Hussein had never planned — 0 against a required
   * 693,096 — when in fact he had converted 29 of his October items, worth
   * 299,155, and moved 8 more to a later month. The best worker on the team
   * looked like the worst.
   *
   * So the board SHOWS them, in their own column, and they enter no figure:
   * not Planning coverage, not Required plan, not the Planned gap. They are
   * already counted once, as deals, in the Funnel and in Achieved.
   */
  const { data: worked } = await supabase
    .from('opportunities')
    .select('owner_id, planned_amount, status')
    .eq('company_id', companyId)
    .in('owner_id', ids)
    .in('status', ['converted', 'moved_to_future'])
    .gte('expected_month', start)
    .lte('expected_month', end);
  const workedByOwner = new Map();
  (worked || []).forEach((r) => {
    if (!workedByOwner.has(r.owner_id)) {
      workedByOwner.set(r.owner_id, {
        convertedCount: 0, convertedValue: 0, movedCount: 0, movedValue: 0,
      });
    }
    const w = workedByOwner.get(r.owner_id);
    const amt = parseFloat(r.planned_amount) || 0;
    if (r.status === 'converted') { w.convertedCount += 1; w.convertedValue += amt; }
    else { w.movedCount += 1; w.movedValue += amt; }
  });

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

    const w = workedByOwner.get(u.id)
      || { convertedCount: 0, convertedValue: 0, movedCount: 0, movedValue: 0 };

    return {
      id: u.id,
      name: u.full_name || u.email || 'Unknown',
      role: u.role,
      planStatus: status,
      target: sum.target,
      requiredPlan: sum.requiredPlan,
      planned: sum.plannedOpen,
      // DISPLAY ONLY. Nothing below this line enters a figure above it.
      convertedCount: w.convertedCount,
      convertedValue: w.convertedValue,
      movedCount: w.movedCount,
      movedValue: w.movedValue,
      /**
       * NOBODY PLANNED ANYTHING — open and converted both zero.
       *
       * The distinction the board got wrong: a plan of nothing and a plan that
       * has all been converted both showed Planned 0. Only the first is an
       * empty plan.
       */
      emptyPlan: (sum.plannedOpen || 0) === 0 && w.convertedCount === 0,
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
