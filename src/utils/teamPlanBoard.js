import { supabase } from 'lib/supabase';
import {
  probePlanDivisionColumn, fetchPlanDivisions, fetchDivisionNames, planUnitsFor, perDivisionStatusText,
} from 'utils/planDivisions';
import { isSelfApproved, SELF_APPROVED } from 'utils/planSelfApproval';
import { computePlanningPageSummary } from 'utils/planningPageSummary';
import {
  planItemFlags, isConvertedWithDeal, isConvertedDealMissing,
} from 'utils/planningDrill';

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

  // plan_month is always yyyy-MM-01. A malformed key matches no row, and
  // "no row" reads as "not submitted" — which is how the Planning page showed
  // every October plan as unsubmitted while four were approved
  // ('2026-10-01-01'). Fail loudly instead of answering wrongly.
  if (!/^\d{4}-\d{2}-01$/.test(String(monthKey || ''))) {
    throw new Error(`buildTeamPlanBoard: monthKey must be yyyy-MM-01, got ${JSON.stringify(monthKey)}`);
  }

  const ids = people.map((u) => u.id);

  // Plan submissions for the month, for everybody at once.
  // Session 43: a person who plans per division has one row per division;
  // the board shows each division's status on their one line. Without the
  // column, exactly today's read.
  const hasDivision = await probePlanDivisionColumn();
  const { data: subs } = await supabase
    .from('plan_submissions')
    .select(hasDivision ? 'owner_id, approval_status, approved_by, is_submitted, plan_month, division_id' : 'owner_id, approval_status, approved_by, is_submitted, plan_month')
    .eq('company_id', companyId)
    .in('owner_id', ids)
    .eq('plan_month', monthKey);
  const subsOf = new Map();
  (subs || []).forEach((r) => { subsOf.set(r.owner_id, [...(subsOf.get(r.owner_id) || []), r]); });
  let planDivs = {};
  let divName = {};
  if (hasDivision) {
    const { data: divUsers } = await supabase.from('users').select('id, sales_division_id').in('id', ids);
    planDivs = (await fetchPlanDivisions({ companyId, users: divUsers || [] })).byUser;
    divName = await fetchDivisionNames(Object.values(planDivs).flat());
  }
  // Session 44: approved by its own owner reads "self-approved".
  const statusOfRow = (sub) => (!sub || !sub.is_submitted
    ? PLAN_STATUS.none
    : isSelfApproved(sub) ? SELF_APPROVED : PLAN_STATUS[sub.approval_status] || PLAN_STATUS.pending);
  const planStatusOf = (id) => {
    const units = planUnitsFor(planDivs[id] || null, subsOf.get(id));
    if (units.length === 1) return statusOfRow(units[0].row);
    return perDivisionStatusText(units.map((u) => ({ division: divName[u.divisionId] || 'division', status: statusOfRow(u.row) })));
  };

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
   *
   * CONVERTED MEANS isConvertedWithDeal, the rule Plan accuracy uses - status
   * converted AND the deal still there. `deal_id` is read for exactly that.
   * The ones whose deal has gone are counted separately as DEAL MISSING: they
   * are in no figure anywhere, so the column names them instead of absorbing
   * them into a number that would then disagree with the funnel.
   */
  const { data: worked } = await supabase
    .from('opportunities')
    .select('owner_id, planned_amount, status, deal_id')
    .eq('company_id', companyId)
    .in('owner_id', ids)
    .in('status', ['converted', 'moved_to_future'])
    .gte('expected_month', start)
    .lte('expected_month', end);
  const workedByOwner = new Map();
  (worked || []).forEach((r) => {
    if (!workedByOwner.has(r.owner_id)) {
      workedByOwner.set(r.owner_id, {
        convertedCount: 0,
        convertedValue: 0,
        movedCount: 0,
        movedValue: 0,
        dealMissingCount: 0,
        dealMissingValue: 0,
      });
    }
    const w = workedByOwner.get(r.owner_id);
    const amt = parseFloat(r.planned_amount) || 0;
    if (isConvertedWithDeal(r)) { w.convertedCount += 1; w.convertedValue += amt; }
    else if (isConvertedDealMissing(r)) { w.dealMissingCount += 1; w.dealMissingValue += amt; }
    else { w.movedCount += 1; w.movedValue += amt; }
  });
  const EMPTY_WORKED = {
    convertedCount: 0,
    convertedValue: 0,
    movedCount: 0,
    movedValue: 0,
    dealMissingCount: 0,
    dealMissingValue: 0,
  };

  const settled = await Promise.all(people.map(async (u) => {
    const sum = await computePlanningPageSummary({
      companyId, ownerIds: [u.id], start, end, productGroup,
    });
    const status = planStatusOf(u.id);

    const notConverted = (sum.drill?.planRows || []).filter(
      (o) => planItemFlags(o, flagCtx).includes('NOT CONVERTED'),
    ).length;

    const w = workedByOwner.get(u.id) || EMPTY_WORKED;

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
      // Marked converted with no deal behind it. In no figure on the page,
      // which is why it is named.
      dealMissingCount: w.dealMissingCount,
      dealMissingValue: w.dealMissingValue,
      /**
       * NOBODY PLANNED ANYTHING — open and converted both zero.
       *
       * The distinction the board got wrong: a plan of nothing and a plan that
       * has all been converted both showed Planned 0. Only the first is an
       * empty plan.
       *
       * Converted-WITH-A-DEAL, deliberately: a plan whose every item is marked
       * converted with the deal gone has nothing to show for itself anywhere,
       * and saying "no plan" next to the DEAL MISSING count is the honest
       * reading of it.
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
