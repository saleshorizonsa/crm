import { dealInDivision } from 'utils/divisionMembership';
import {
  CONTRIBUTOR_ROLES,
  isAchievedOnly,
  targetPerPerson,
  winRateFromDeals,
  sumPlannedByOwner,
  computeRequiredRaw,
  computeCoverage,
  computeAchieved,
  wonNotInvoicedExceptions,
} from 'utils/planningCalculations';

// Pure logic behind the Insights page (/insights). Kept out of the
// component so the page and the verification audit run the same code.
//
// Every figure goes through utils/planningCalculations.js, so a division's
// numbers follow the same rules as Planning, the dashboards and the Coverage
// Console: contributors only (salesmen and supervisors), monthly active target
// rows, 3-month win rate, invoiced achievement for the current month, next
// month's pending future orders as carry-in.
//
// Levels: Company -> Division (supervisor card) -> Team -> Member -> Deal.

export const DIVISION_PAGE_ROLES = ['director', 'manager'];

// Who is LISTED as a division member. Directors and viewers carry no division,
// targets or deals, so listing them is noise. Listing is all this controls:
// totals are computed over the whole scope, and the contributor rule inside
// calcDivisionMetrics decides whose numbers count.
export const MEMBER_ROLES = ['salesman', 'supervisor', 'manager'];

export const UNASSIGNED = 'unassigned';

/**
 * The user ids this viewer may see. Director = whole company; manager = his own
 * supervisor_id subtree including himself — the same rule as the Coverage Console.
 * `users` must be the company's ACTIVE users.
 */
export function scopeUserIds({ users, viewerId, role }) {
  const list = users || [];
  if (role === 'director') return list.map((u) => u.id);
  if (role !== 'manager' || !viewerId) return [];

  // supervisor_id, not reports_to: it is the only hierarchy column anything
  // writes, and the one the dashboards and every RLS function already use.
  // reports_to is a stale one-time backfill — see utils/teamHierarchy.js.
  const childrenOf = new Map();
  list.forEach((u) => {
    if (!u.supervisor_id) return;
    if (!childrenOf.has(u.supervisor_id)) childrenOf.set(u.supervisor_id, []);
    childrenOf.get(u.supervisor_id).push(u.id);
  });
  const out = [viewerId];
  const queue = [viewerId];
  const seen = new Set(queue); // guards against a cyclic supervisor_id chain
  while (queue.length) {
    for (const child of childrenOf.get(queue.shift()) || []) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}

/**
 * Partition the scope into the company's divisions (in sort order) plus a final
 * Unassigned group. Every scoped user lands in exactly one group, so additive
 * figures across the groups always add up to the company total. A user whose
 * sales_division_id points at a division this company doesn't have counts as
 * Unassigned rather than disappearing.
 */
export function groupByDivision({ users, divisions, scopeIds, additionalByUser = {} }) {
  const scope = new Set(scopeIds || []);
  const inScope = (users || []).filter((u) => scope.has(u.id));
  const known = new Set((divisions || []).map((d) => d.id));

  // Membership, not a single column: a person appears under EVERY division
  // they belong to, primary plus any additional. With no additional rows this
  // reduces to the old `u.sales_division_id === d.id` exactly.
  // Their revenue is NOT duplicated — deals are attributed by
  // deals.division_id, which belongs to one division (see calcDivisionMetrics).
  const memberDivisions = (u) => {
    const extra = (additionalByUser[u.id] || []).filter((id) => known.has(id));
    return [...new Set([u.sales_division_id, ...extra].filter((id) => id && known.has(id)))];
  };

  const groups = (divisions || []).map((d) => ({
    id: d.id,
    name: d.name,
    userIds: inScope.filter((u) => memberDivisions(u).includes(d.id)).map((u) => u.id),
  }));
  groups.push({
    id: UNASSIGNED,
    name: 'Unassigned',
    // Unassigned now means "in no KNOWN division by either route" — a user
    // whose only division came from the join table is no longer stranded here.
    userIds: inScope.filter((u) => memberDivisions(u).length === 0).map((u) => u.id),
  });
  return groups;
}

/** Users of a group who are listed as members (see MEMBER_ROLES), by name. */
export function listedMembers({ users, userIds }) {
  const ids = new Set(userIds || []);
  return (users || [])
    .filter((u) => ids.has(u.id) && MEMBER_ROLES.includes(u.role))
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
}

/**
 * How a division opens.
 *   mode 'supervisor'  one card per supervisor; each card's team is the
 *                      supervisor plus the people under them in this division
 *   mode 'team'        no supervisor but members exist — straight to the team list
 *   mode 'empty'       nobody in the division
 * Unassigned is not a real division, so it always opens as a team list.
 *
 * Team membership: with ONE supervisor in the division, the team is the whole
 * division (every member belongs to it, whatever reports_to says). With several,
 * each supervisor's team is them plus the division members who report to them;
 * anyone reporting to none of them is returned in `unattached` so they are
 * still shown, never silently dropped.
 */
export function divisionView({ group, users }) {
  const members = listedMembers({ users, userIds: group?.userIds });
  if (!group || group.id === UNASSIGNED) {
    return { mode: members.length ? 'team' : 'empty', supervisors: [], members, unattached: [] };
  }
  const supervisors = members.filter((u) => u.role === 'supervisor');
  if (!supervisors.length) {
    return { mode: members.length ? 'team' : 'empty', supervisors: [], members, unattached: [] };
  }
  if (supervisors.length === 1) {
    return {
      mode: 'supervisor',
      supervisors: [{ user: supervisors[0], teamIds: [...group.userIds] }],
      members,
      unattached: [],
    };
  }
  const supIds = new Set(supervisors.map((s) => s.id));
  const cards = supervisors.map((s) => ({
    user: s,
    teamIds: [s.id, ...group.userIds.filter((id) => !supIds.has(id) && (users || []).find((u) => u.id === id)?.supervisor_id === s.id)],
  }));
  const covered = new Set(cards.flatMap((c) => c.teamIds));
  const unattached = members.filter((u) => !covered.has(u.id));
  return { mode: 'supervisor', supervisors: cards, members, unattached };
}

/**
 * The team list: the supervisor pinned FIRST (so their own deals stay
 * reachable), then everyone else in the team by name.
 */
export function teamRows({ users, teamIds, supervisorId }) {
  const listed = listedMembers({ users, userIds: teamIds });
  const pinned = supervisorId ? listed.filter((u) => u.id === supervisorId) : [];
  const rest = listed.filter((u) => u.id !== supervisorId);
  return [...pinned, ...rest];
}

/**
 * Figures for one set of users.
 *
 * `data` is one fetch for the whole company:
 *   users         active company users
 *   deals         company deals, lost excluded
 *   targets       active monthly target rows overlapping the month (client_targets embedded)
 *   deals3m       deals created in the 3 completed months, for win rate
 *   opps          open opportunities expected this month
 *   futureOrders  pending future orders expected NEXT month (carry-in)
 *   monthStart / monthEnd  yyyy-MM-dd
 */
export function calcDivisionMetrics(userIds, data) {
  const { users, targets, deals3m, opps, futureOrders, monthStart, monthEnd } = data;
  // A deal counts toward the division on the DEAL, not toward every division
  // its owner belongs to — otherwise a person in two divisions would have the
  // same revenue counted twice and the divisions would out-total the company.
  // data.divisionId absent = no filter, which is the company-level view and
  // exactly what every caller did before multi-division.
  const inThisDivision = dealInDivision(data.divisionId);
  const deals = (data.deals || []).filter(inThisDivision);
  // Sales returns over the window, scoped by the SAME predicate: a return
  // belongs to its DEAL's division, not to every division its owner is a
  // member of. Without this a credit note is subtracted once per division the
  // owner belongs to. Defaulted to [] so a caller that supplies none behaves
  // exactly as before.
  const returns = (data.returns || []).filter(inThisDivision);
  const now = data.now || new Date();
  // Period-shape flags, defaulted so a caller that omits them (the verification
  // harness) behaves exactly as before. Pacing only means something for the
  // current month in progress; target-derived figures mean nothing for All Time.
  const isCurrentMonth = data.isCurrentMonth !== false;
  const isAllTime = data.isAllTime === true;
  const scope = new Set(userIds || []);
  const contributorIds = (users || [])
    .filter((u) => scope.has(u.id) && CONTRIBUTOR_ROLES.includes(u.role))
    .map((u) => u.id);
  const isContributor = new Set(contributorIds);
  // Target counts over the same people as Achieved below: contributors plus any
  // flagged manager who sells himself. Without this a division carried by a
  // flagged manager — Export, in the case this was built for — showed Achieved
  // against a target of 0. Only monthly rows reach here (the page's query filters
  // period_type), so a manager's yearly allocation cannot appear.
  const isAchiever = new Set([
    ...contributorIds,
    ...(users || []).filter((u) => scope.has(u.id) && isAchievedOnly(u)).map((u) => u.id),
  ]);

  // MONTHLY rows only. A yearly row is a whole year's allocation, so summing one
  // into a month would be wrong whoever holds it. Excludes explicit YEARLY rows
  // rather than requiring 'monthly', so a caller whose query omits period_type
  // still gets its target counted instead of silently receiving 0.
  const monthlyTargetRows = (targets || []).filter((t) => t.period_type !== 'yearly');
  const target = Object.values(
    targetPerPerson(monthlyTargetRows.filter((t) => isAchiever.has(t.assigned_to))),
  ).reduce((sum, v) => sum + v, 0);

  // A group with no deals in the window borrows the company contributors' rate,
  // as the Coverage Console does, rather than reading 0%.
  const divisionDeals3m = (deals3m || []).filter(inThisDivision);
  const mine = winRateFromDeals({ deals: divisionDeals3m, ownerIds: contributorIds });
  const companyContributorIds = (users || [])
    .filter((u) => CONTRIBUTOR_ROLES.includes(u.role))
    .map((u) => u.id);
  const winRateBorrowed = mine.total === 0;
  const winRatePct = winRateBorrowed
    ? winRateFromDeals({ deals: divisionDeals3m, ownerIds: companyContributorIds }).winRatePct
    : mine.winRatePct;

  // The shared rule (utils/planningCalculations.js) rather than a local copy of
  // it, so Achieved here nets off sales returns exactly as every other screen
  // does. `returns` rows are dated by return_date, so a return of an older
  // invoice still lands in the month it happened.
  const achievedSplit = computeAchieved({
    deals,
    contributorIds: [...isAchiever],
    start: monthStart,
    end: monthEnd,
    returns,
    // Only the company-level view nets unmatched returns; a division or a
    // person must never absorb one (data.includeUnattributedReturns is set
    // only by the page's company-level call).
    includeUnattributed: data.includeUnattributedReturns === true,
  });
  const achieved = achievedSplit.total;
  const achievedGross = achievedSplit.grossTotal;
  const returnsTotal = achievedSplit.returnsTotal;

  // Everyone in `isAchiever` counts in full, including a contributor-flagged
  // manager whose only target row is yearly: his yearly allocation never enters
  // the monthly Target above, so pace and attainment can read past 100%
  // (business decision, 2026-09-28).
  const deficit = Math.max(0, target - achieved);

  const openDeals = (deals || []).filter(
    (d) => isContributor.has(d.owner_id) && !['won', 'lost'].includes(d.stage),
  );
  const pipeline = openDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

  // Plan and funnel are measured over the SAME people as Target and Achieved —
  // contributors plus any flagged manager — so a flagged manager's own plan and
  // deals net off the requirement his own target created.
  const achieverIds = [...isAchiever];
  const planned = sumPlannedByOwner({ rows: opps, ownerIds: achieverIds }).total;
  // Open funnel dated into THIS month, raw. Distinct from `pipeline` above,
  // which is every open deal regardless of date and feeds the coverage rail.
  const monthFunnel = (deals || [])
    .filter(
      (d) => isAchiever.has(d.owner_id)
        && !['won', 'lost'].includes(d.stage)
        && d.expected_close_date >= monthStart
        && d.expected_close_date <= monthEnd,
    )
    .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  // Shown for visibility only — NOT netted off the requirement any more. It is
  // NEXT month's commitment, and subtracting it understated what still had to be
  // built this month. Planning never did it; Planning is the standard.
  const carryIn = sumPlannedByOwner({ rows: futureOrders, ownerIds: achieverIds }).total;
  // Required pipeline is measured over what is STILL MISSING (deficit), not over
  // the untouched target: once a month's target is achieved, "new pipeline
  // needed" must read zero rather than keep demanding pipeline against a number
  // that revenue can never reduce. Same basis as planningPageSummary.js and the
  // Coverage Console.
  const requiredRaw = computeRequiredRaw({ target: deficit, winRatePct });
  // required − (plan + funnel), no carry-in: the same shape as
  // planningPageSummary.js, so Insights, the Coverage Console and Planning
  // produce one number instead of three defensible ones.
  const monthCoverage = planned + monthFunnel;
  const required = requiredRaw;
  const plannedGap = Math.max(0, requiredRaw - monthCoverage);

  const { weightedFunnel, weightedPlanning, coverage } = computeCoverage({
    invoiced: achieved,
    openDeals,
    planned,
    winRatePct,
  });

  // Pacing, exactly as the Coverage Console derives it: achieved share of target
  // against the share of the month elapsed, with a 15-point tolerance.
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const elapsed = dayOfMonth / totalDays;
  const pace = achieved / Math.max(target, 1);

  return {
    target,
    achieved,
    achievedGross,
    returnsTotal,
    deficit,
    // Pacing divides by the share of the MONTH elapsed, so outside the current
    // month it is null and the UI hides the verdict instead of guessing one.
    pace: isCurrentMonth ? pace : null,
    elapsed: isCurrentMonth ? elapsed : null,
    dayOfMonth: isCurrentMonth ? dayOfMonth : null,
    totalDays: isCurrentMonth ? totalDays : null,
    isCurrentMonth,
    isAllTime,
    coverageOk: coverage >= target,
    pacingOk: isCurrentMonth ? pace >= elapsed - 0.15 : null,
    winRatePct,
    winRateBorrowed,
    planned,
    monthFunnel,
    monthCoverage,
    carryIn,
    requiredRaw,
    required,
    plannedGap,
    pipeline,
    coverage,
    weightedFunnel,
    weightedPlanning,
    covRatio: target > 0 ? coverage / target : 0,
    contributorIds,
  };
}

/**
 * Row status, the Coverage Console's rule: ok = coverage AND pacing pass,
 * bad = both fail, risk = one fails. 'none' when there is no target to judge.
 */
export function healthOf(m) {
  if (!m || m.target <= 0) return 'none';
  // Outside the current month pacing is null, so the verdict degrades to
  // COVERAGE ONLY rather than treating "no pacing verdict" as a failure, which
  // would have turned every past month amber.
  if (m.pacingOk === null) return m.coverageOk ? 'ok' : 'bad';
  if (m.coverageOk && m.pacingOk) return 'ok';
  if (!m.coverageOk && !m.pacingOk) return 'bad';
  return 'risk';
}

// ── Exceptions ──────────────────────────────────────────────────────────────
// Copied from the Coverage Console's buildExceptions (coverage-console/index.jsx):
// unreviewed salesman_flags and unresolved escalation_logs for the people in
// view, critical first, then newest first.
const FLAG_TITLES = {
  bounce_back_2nd: '2nd Bounce-Back',
  plan_missed_deadline: 'Plan Not Submitted',
  forecast_mismatch: 'Forecast Variance',
};

const ESCALATION_TITLES = {
  bounce_back_2nd: 'Escalation: 2nd Bounce',
  mid_month_target_change: 'Target Changed',
  forecast_mismatch: 'Forecast Mismatch',
};

export function buildExceptions(userIds, data) {
  const ids = new Set(userIds || []);
  const exs = [];
  // Won, not yet invoiced, stuck 7+ days — visibility only, never touches
  // Achieved. See wonNotInvoicedExceptions in utils/planningCalculations.js.
  exs.push(...wonNotInvoicedExceptions({ deals: data.deals, ownerIds: userIds, now: data.now }));
  (data.flags || [])
    .filter((f) => ids.has(f.owner_id))
    .forEach((f) => {
      exs.push({
        sev: f.flag_type === 'bounce_back_2nd' ? 'critical' : 'warning',
        type: f.flag_type,
        title: FLAG_TITLES[f.flag_type] || f.flag_type,
        ownerId: f.owner_id,
        dealId: f.details?.deal_id || null,
        createdAt: f.flagged_at,
      });
    });
  (data.escalations || [])
    .filter((e) => ids.has(e.triggered_for))
    .forEach((e) => {
      exs.push({
        sev: 'critical',
        type: e.trigger_type,
        title: ESCALATION_TITLES[e.trigger_type] || e.trigger_type,
        ownerId: e.triggered_for,
        dealId: e.deal_id || null,
        createdAt: e.created_at,
      });
    });
  return exs.sort((a, b) => {
    if (a.sev !== b.sev) return a.sev === 'critical' ? -1 : 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}
