import {
  CONTRIBUTOR_ROLES,
  isAchievedOnly,
  targetPerPerson,
  winRateFromDeals,
  sumPlannedByOwner,
  computeRequiredRaw,
  computePlannedGap,
  computeCoverage,
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
 * reports_to subtree including himself — the same rule as the Coverage Console.
 * `users` must be the company's ACTIVE users.
 */
export function scopeUserIds({ users, viewerId, role }) {
  const list = users || [];
  if (role === 'director') return list.map((u) => u.id);
  if (role !== 'manager' || !viewerId) return [];

  const childrenOf = new Map();
  list.forEach((u) => {
    if (!u.reports_to) return;
    if (!childrenOf.has(u.reports_to)) childrenOf.set(u.reports_to, []);
    childrenOf.get(u.reports_to).push(u.id);
  });
  const out = [viewerId];
  const queue = [viewerId];
  const seen = new Set(queue); // guards against a cyclic reports_to chain
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
export function groupByDivision({ users, divisions, scopeIds }) {
  const scope = new Set(scopeIds || []);
  const inScope = (users || []).filter((u) => scope.has(u.id));
  const known = new Set((divisions || []).map((d) => d.id));
  const groups = (divisions || []).map((d) => ({
    id: d.id,
    name: d.name,
    userIds: inScope.filter((u) => u.sales_division_id === d.id).map((u) => u.id),
  }));
  groups.push({
    id: UNASSIGNED,
    name: 'Unassigned',
    userIds: inScope
      .filter((u) => !u.sales_division_id || !known.has(u.sales_division_id))
      .map((u) => u.id),
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
    teamIds: [s.id, ...group.userIds.filter((id) => !supIds.has(id) && (users || []).find((u) => u.id === id)?.reports_to === s.id)],
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
  const { users, deals, targets, deals3m, opps, futureOrders, monthStart, monthEnd } = data;
  const now = data.now || new Date();
  const scope = new Set(userIds || []);
  const contributorIds = (users || [])
    .filter((u) => scope.has(u.id) && CONTRIBUTOR_ROLES.includes(u.role))
    .map((u) => u.id);
  const isContributor = new Set(contributorIds);

  const target = Object.values(
    targetPerPerson((targets || []).filter((t) => isContributor.has(t.assigned_to))),
  ).reduce((sum, v) => sum + v, 0);

  // A group with no deals in the window borrows the company contributors' rate,
  // as the Coverage Console does, rather than reading 0%.
  const mine = winRateFromDeals({ deals: deals3m, ownerIds: contributorIds });
  const companyContributorIds = (users || [])
    .filter((u) => CONTRIBUTOR_ROLES.includes(u.role))
    .map((u) => u.id);
  const winRateBorrowed = mine.total === 0;
  const winRatePct = winRateBorrowed
    ? winRateFromDeals({ deals: deals3m, ownerIds: companyContributorIds }).winRatePct
    : mine.winRatePct;

  // Achieved alone also counts a flagged manager (users.is_contributor) in scope,
  // the same scope as utils/planningCalculations.js achieverIdsFrom.
  const isAchiever = new Set([
    ...contributorIds,
    ...(users || []).filter((u) => scope.has(u.id) && isAchievedOnly(u)).map((u) => u.id),
  ]);
  const achieved = (deals || [])
    .filter(
      (d) =>
        isAchiever.has(d.owner_id) &&
        d.stage === 'won' &&
        d.is_invoiced === true &&
        d.invoice_date >= monthStart &&
        d.invoice_date <= monthEnd,
    )
    .reduce((sum, d) => sum + (d.final_amount || d.amount || 0), 0);

  const deficit = Math.max(0, target - achieved);

  const openDeals = (deals || []).filter(
    (d) => isContributor.has(d.owner_id) && !['won', 'lost'].includes(d.stage),
  );
  const pipeline = openDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

  const planned = sumPlannedByOwner({ rows: opps, ownerIds: contributorIds }).total;
  const carryIn = sumPlannedByOwner({ rows: futureOrders, ownerIds: contributorIds }).total;
  const requiredRaw = computeRequiredRaw({ target, winRatePct });
  const { required, plannedGap } = computePlannedGap({ requiredRaw, carryIn, planned });

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
    deficit,
    pace,
    elapsed,
    dayOfMonth,
    totalDays,
    coverageOk: coverage >= target,
    pacingOk: pace >= elapsed - 0.15,
    winRatePct,
    winRateBorrowed,
    planned,
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
