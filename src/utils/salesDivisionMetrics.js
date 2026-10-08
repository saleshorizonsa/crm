import {
  dealInDivision,
  rowInDivision,
  primaryDivisionByUser,
} from 'utils/divisionMembership';
import { partitionOpenFunnel } from 'utils/openFunnel';
// activeIdsFrom comes from the leaf module directly: planningCalculations
// re-exports the older achiever-scope names but not this one, and a leaf
// import cannot create the cycle that re-export list exists to avoid.
import { activeIdsFrom } from 'utils/achieverScope';
import {
  CONTRIBUTOR_ROLES,
  isAchievedOnly,
  wonNotInvoicedList,
  targetPerPerson,
  winRateFromDeals,
  sumPlannedByOwner,
  computeRequiredRaw,
  computeCoverage,
  computeAchieved,
  achieverIdsFrom,
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

// Who may open Insights. Supervisors and salesmen were added 2026-10-07 (CEO
// decision) and see a NARROWED page, not a filtered copy of the company one:
// scopeUserIds below returns a supervisor his own team and a salesman only
// himself, the page's queries are filtered to that scope in the database, and
// nobody else's name is fetched. The route and the nav read this one list.
export const DIVISION_PAGE_ROLES = [
  'director', 'manager', 'supervisor', 'salesman', 'head', 'admin',
];

/**
 * Roles whose Insights scope is the WHOLE COMPANY.
 *
 * head and admin joined on 2026-10-07 when Insights became the landing page
 * for everyone: without them in here scopeUserIds returned [] and they would
 * have landed on an empty page. They are the same three roles the rest of the
 * app already treats as company-wide — reassignmentService's
 * COMPANY_WIDE_ROLES and salesReturnsReportService's ALL_RETURNS_ROLES are
 * both exactly this list.
 */
export const COMPANY_SCOPE_ROLES = ['director', 'head', 'admin'];

/**
 * Who may open the Coverage Console (CEO decision 2026-10-07).
 *
 * Insights is enough for supervisors and salesmen: it answers the same coverage
 * question, narrowed to their own scope, and it is where they land. The Console
 * is the roll-up across teams, so it stops at manager.
 *
 * The rule REVERSED on that date. The Console was built as a supervisor's tool
 * and the menu hid it from directors and managers — the two roles that now keep
 * it — so a role list spelled out at a call site would not just drift, it would
 * be backwards. The route guard and both menus read this constant, the same way
 * they read DIVISION_PAGE_ROLES.
 */
export const COVERAGE_CONSOLE_ROLES = ['manager', 'director', 'head', 'admin'];

/**
 * Who still has a Dashboard (CEO decision 2026-10-07).
 *
 * For a salesman and a supervisor, Insights replaced it: the banners that tell
 * them to act, their hot leads, their activity feed and their target tables all
 * moved there first, and only then was this list narrowed. The order mattered —
 * taking the page away before moving its contents would have cost them features
 * for as long as the gap lasted.
 *
 * Read by the route guard, both menus and the Insights page, which renders the
 * moved panels for exactly the roles NOT in here. One list, so a role can never
 * be left with neither the Dashboard nor its replacement.
 */
export const DASHBOARD_ROLES = ['manager', 'director', 'head', 'admin'];

/**
 * Who gets /targets, where a supervisor assigns targets to his salesmen.
 *
 * Supervisors only, for now. Managers assign through
 * ManagerSalesTargetAssignment on a Dashboard they keep, so sending them here
 * as well would give them two places instead of one.
 */
export const TARGETS_PAGE_ROLES = ['supervisor'];

/**
 * Who sees the Contact Reports audit on Insights.
 *
 * Everyone who reviews somebody else's work — so everyone with a team, which
 * is everyone except a salesman. It only ever showed on the SUPERVISOR's
 * dashboard; moving it to Insights hands it to managers and above as well,
 * scoped to their own team the same way, which they never had and costs
 * nothing: the component already takes `ownerIds` and fetches only when
 * somebody opens it.
 *
 * A salesman is excluded on purpose. The panel exists to audit a team's
 * reports, and his own are what it would be auditing.
 */
export const CONTACT_AUDIT_ROLES = ['supervisor', 'manager', 'director', 'head', 'admin'];

// Who is LISTED as a division member. Directors and viewers carry no division,
// targets or deals, so listing them is noise. Listing is all this controls:
// totals are computed over the whole scope, and the contributor rule inside
// calcDivisionMetrics decides whose numbers count.
export const MEMBER_ROLES = ['salesman', 'supervisor', 'manager'];

export const UNASSIGNED = 'unassigned';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dateParts = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
const lastDayOf = (y, m) => new Date(y, m, 0).getDate();

/**
 * What span the Target figure actually covers, for the label beside it.
 *
 * Target here is CUMULATIVE over the selected period — the sum of the monthly
 * target of every month the window touches — because Achieved on this page is
 * cumulative over the same window, so the two compare like for like. That is the
 * opposite of Planning, where the card is about one planned month.
 *
 * Two things were impossible to tell from a row labelled only "Target":
 *   how many months are in it — This Year reads 12,808,589.56 for Kamal, which is
 *     ten monthly targets and not a monthly figure gone wrong;
 *   that an INCOMPLETE month still contributes its WHOLE target. A monthly row is
 *     matched when it overlaps the window, so Oct 1–Oct 15 carries all of
 *     October. The selector's own "This Month" caps at today, which on the 1st of
 *     the month is a one-day window against a full month's target — the case this
 *     reads worst without a label.
 *
 * Parsed from the yyyy-MM-dd strings rather than through Date, so a timezone
 * behind UTC cannot roll the month back a day (and so a month, on the 1st).
 *
 * @returns {string} 'October 2026' | 'October 2026 · full month' |
 *                   'Jan–Oct 2026 · 10 months' | 'Nov 2025–Oct 2026 · 12 months'
 */
export function targetSpanLabel(start, end) {
  const a = dateParts(start);
  const b = dateParts(end);
  if (!a || !b) return '';
  const months = (b.y - a.y) * 12 + (b.m - a.m) + 1;
  if (months <= 1) {
    const wholeMonth = a.d === 1 && b.d === lastDayOf(a.y, a.m);
    return `${MONTHS_LONG[a.m - 1]} ${a.y}${wholeMonth ? '' : ' · full month'}`;
  }
  const from = a.y === b.y ? MONTHS_SHORT[a.m - 1] : `${MONTHS_SHORT[a.m - 1]} ${a.y}`;
  return `${from}–${MONTHS_SHORT[b.m - 1]} ${b.y} · ${months} months`;
}

/**
 * The user ids this viewer may see. Director = whole company; manager = his own
 * supervisor_id subtree including himself — the same rule as the Coverage Console.
 * `users` must be the company's ACTIVE users.
 */
/**
 * THE NAME OF THE covRatio FIGURE, and the formula spelled out.
 *
 * It was called "Coverage" on the Coverage Console and "Weighted coverage" on
 * the divisions panel — two names for one number, neither of which said what
 * the number means. "Expected % of target" does: it is a FORECAST of the share
 * of the target that will be invoiced, where both old names read as though it
 * measured how much pipeline exists. Exported from here, where covRatio is
 * computed, and imported by every screen that shows it, so the two cannot
 * drift apart again.
 */
export const EXPECTED_PCT_LABEL = 'Expected % of target';
export const EXPECTED_PCT_TOOLTIP =
  'If open deals close at their stage probability and plan items convert at the'
  + " team's conversion rate, this is the share of the target expected to be"
  + ' invoiced: (invoiced + open deals at forecast + plan × conversion) ÷ target.';

/**
 * A DIVISION needs this many deals in the 3-month window before its own
 * conversion rate is used. Below it, the company achiever rate stands in.
 *
 * WHY. A division is a handful of people, and a conversion rate over six deals
 * is noise presented as a measurement: Export reads 100% off six won Al BADAH
 * deals, and computeRequiredRaw divides the remaining target by exactly that
 * number. One loss would move the rate 17 points and the plan with it. The
 * company rate over ~143 deals fits the division less well and estimates it far
 * better, and the screen says which one it is showing, with the division's own
 * sample size, so nobody plans against six deals without knowing.
 *
 * DIVISIONS ONLY. Person-level rates on Planning are untouched: they have their
 * own documented fallback chain, and a salesman with four deals is a different
 * question from a division with four.
 */
export const DIVISION_MIN_SAMPLE = 10;

/**
 * THE PACING TOLERANCE, in share-of-target points.
 *
 * A scope is "on pace" when the share of its target it has achieved is within
 * this much of the share of the month that has elapsed. Fifteen points, the
 * Coverage Console's own figure, exported here because session 13's weekly
 * pacing asks the same question week by week and a second 0.15 written
 * somewhere else would be a second rule waiting to drift.
 */
export const PACING_TOLERANCE = 0.15;

/** The Conversion (3m) label, saying so when the rate is not this group's own. */
export function conversionLabel(m) {
  if (!m?.winRateBorrowed) return 'Conversion (3m)';
  return `Conversion (3m) — company rate (n=${m.winRateSampleN ?? 0})`;
}

/** The same thing at length, for a tooltip. */
export function borrowedNote(m) {
  const n = m?.winRateSampleN ?? 0;
  return `This division closed ${n} deal${n === 1 ? '' : 's'} in the 3-month `
    + `window — fewer than ${DIVISION_MIN_SAMPLE}, too few to measure a rate `
    + 'from — so the company achiever rate is shown and used instead.';
}

export function scopeUserIds({ users, viewerId, role }) {
  const list = users || [];
  // DIRECTOR = company scope: everyone, active or not (CEO decision
  // 2026-10-07). This is what makes the panel's company total equal the KPI
  // strip's, and what keeps the divisions summing to it — a departed person's
  // deals land in whichever division their rows carry, or in Unassigned.
  if (COMPANY_SCOPE_ROLES.includes(role)) return list.map((u) => u.id);
  if (!viewerId) return [];

  // SALESMAN: himself, full stop. Not his division, not his team, not a total
  // he is part of — CEO decision 2026-10-07. Returned before the walk so there
  // is no path by which a colleague's id can enter his scope, and because the
  // page derives every query filter from this array, that is also what the
  // DATABASE is asked for.
  if (role === 'salesman') return [viewerId];

  // SUPERVISOR: himself and everyone under him, any depth — the same walk as a
  // manager, and deliberately the same code. In a division with two
  // supervisors he gets his own team and not the other's, because the walk
  // starts at him rather than at the division.
  if (role !== 'manager' && role !== 'supervisor') return [];

  // supervisor_id, not reports_to: it is the only hierarchy column anything
  // writes, and the one the dashboards and every RLS function already use.
  // reports_to is a stale one-time backfill — see utils/teamHierarchy.js.
  // A MANAGER's scope is a TEAM figure and stays ACTIVE-ONLY — the other half
  // of the same decision. Said here explicitly because the page's user read is
  // no longer pre-filtered, so this walk is now the only thing enforcing it.
  const childrenOf = new Map();
  list.forEach((u) => {
    if (!u.supervisor_id || u.is_active === false) return;
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
/**
 * The PEOPLE ROWS of a division or a team.
 *
 * ACTIVE ONLY, always. The company TOTAL includes people who have left, so
 * their revenue and targets are in the figures — but a list of people to click
 * into is a list of people who are here. Without this filter, widening the
 * page's user read to serve the totals would have put four departed salesmen
 * and a departed supervisor into the panel's team lists.
 */
export function listedMembers({ users, userIds }) {
  const ids = new Set(userIds || []);
  return (users || [])
    .filter((u) => ids.has(u.id) && u.is_active !== false && MEMBER_ROLES.includes(u.role))
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
  // contributorIds stays for the WIN RATE, which is a property of the people who
  // close deals for a living and deliberately not of a flagged manager's handful.
  // Target counts over the same people as Achieved below: contributors plus any
  // flagged manager who sells himself. Without this a division carried by a
  // flagged manager — Export, in the case this was built for — showed Achieved
  // against a target of 0. Only monthly rows reach here (the page's query filters
  // period_type), so a manager's yearly allocation cannot appear.
  const isAchiever = new Set([
    ...contributorIds,
    ...(users || []).filter((u) => scope.has(u.id) && isAchievedOnly(u)).map((u) => u.id),
  ]);
  // FORWARD-LOOKING FIGURES ARE ACTIVE-ONLY (CEO decision 2026-10-07): a
  // departed person's open plan, funnel and future orders will not convert, so
  // counting them overstates coverage. isAchiever above has no is_active test —
  // deliberately, because Target and Achieved are history and include whoever
  // was there — so the forward set is derived from it here.
  const forwardIds = activeIdsFrom([...isAchiever], users);
  const isForward = new Set(forwardIds);

  // ── ATTRIBUTION BY DIVISION, not per person ──────────────────────────────
  //
  // Deals have always been filtered by deals.division_id. Target rows, plan
  // items and future orders were filtered only by WHOSE they were, so a person
  // in two divisions had their whole target and whole plan counted in BOTH.
  // Mohamed Kamal is in Export and PVC Compound, and the October panel summed
  // to 5.75M of target against a company target of 3.70M. Business decision
  // 2026-10-06 (option 2): attribute them by division, like deals.
  //
  // A row with no division_id falls back to its owner's PRIMARY division,
  // which is exactly what per-person attribution meant for anyone in a single
  // division — so no single-division figure moves, and a row created before
  // migrations/division_attribution.sql is applied still lands somewhere
  // instead of vanishing.
  const primaryByUser = primaryDivisionByUser(users);
  const targetInDivision = rowInDivision(data.divisionId, {
    primaryByUser, ownerKey: 'assigned_to',
  });
  const planInDivision = rowInDivision(data.divisionId, { primaryByUser });

  // MONTHLY rows only. A yearly row is a whole year's allocation, so summing one
  // into a month would be wrong whoever holds it. Excludes explicit YEARLY rows
  // rather than requiring 'monthly', so a caller whose query omits period_type
  // still gets its target counted instead of silently receiving 0.
  const monthlyTargetRows = (targets || [])
    .filter((t) => t.period_type !== 'yearly')
    .filter(targetInDivision);
  const targetPer = targetPerPerson(
    monthlyTargetRows.filter((t) => isAchiever.has(t.assigned_to)),
  );
  const target = Object.values(targetPer).reduce((sum, v) => sum + v, 0);

  // A group with no deals in the window borrows the COMPANY rate rather than
  // reading 0%.
  //
  // THE FALLBACK USED TO BORROW NOTHING. It re-ran winRateFromDeals over
  // `divisionDeals3m` — the SAME division-filtered list that was empty in the
  // first place — so a division with no deals got 0.0%, not a borrowed rate.
  // Then two things compounded on that zero: computeRequiredRaw reads 0 as "no
  // rate at all, assume 50%" and demanded target x 2 (2.92M of new pipeline for
  // PVC Compound), while computeCoverage weighted the same funnel and plan by
  // 0 and reported 0% coverage. One screen, two opposite readings of the same
  // missing number. It now borrows the company achiever rate over ALL company
  // deals in the window, and `winRateBorrowed` tells the panel to say
  // "company rate" rather than presenting it as the division's own.
  //
  // Over the ACHIEVERS (decision D4, 2026-10-05 — see utils/winRate3m.js): the
  // same people as Target and Achieved above, so a division carried by a
  // flagged manager measures a rate from his own deals instead of borrowing.
  // achieverIdsFrom() for the company list also drops inactive users, which a
  // bare role filter did not.
  const divisionDeals3m = (deals3m || []).filter(inThisDivision);
  const mine = winRateFromDeals({ deals: divisionDeals3m, ownerIds: [...isAchiever] });
  const companyAchieverIds = achieverIdsFrom(users);
  // DIVISION_MIN_SAMPLE applies only when a DIVISION is being measured. A
  // company-level or team-level call keeps the old condition — borrow only with
  // no deals at all — because the threshold was reasoned about for divisions and
  // nothing else, and the company's own rate is what would be borrowed anyway.
  const minSample = data.divisionId ? DIVISION_MIN_SAMPLE : 1;
  const winRateBorrowed = mine.total < minSample;
  const winRatePct = winRateBorrowed
    ? winRateFromDeals({ deals: deals3m || [], ownerIds: companyAchieverIds }).winRatePct
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
  });
  const achieved = achievedSplit.total;
  const achievedGross = achievedSplit.grossTotal;
  const returnsTotal = achievedSplit.returnsTotal;

  // Everyone in `isAchiever` counts in full, including a contributor-flagged
  // manager whose only target row is yearly: his yearly allocation never enters
  // the monthly Target above, so pace and attainment can read past 100%
  // (business decision, 2026-09-28).
  const deficit = Math.max(0, target - achieved);

  // isAchiever, not isContributor. Target, Achieved, Planned and the funnel below
  // are all measured over achievers, and this was the one figure that was not —
  // so a flagged manager's own open deals vanished from the coverage rail and from
  // `coverage` while his target and revenue were counted in full. For Kamal that
  // is 308,750 of his own pipeline, the same defect that had supervisor Diba
  // reading In Funnel 0.00 against 1,510,602.80 of his own deals.
  const openDeals = (deals || []).filter(
    (d) => isForward.has(d.owner_id) && !['won', 'lost'].includes(d.stage),
  );
  const pipeline = openDeals.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

  // Plan and funnel are measured over the SAME people as Target and Achieved —
  // contributors plus any flagged manager — so a flagged manager's own plan and
  // deals net off the requirement his own target created.
  const achieverIds = [...isAchiever];
  // planInDivision as well as the owner scope: a plan item belongs to ONE
  // division now (its own division_id, or its owner's primary), so a
  // multi-division person's plan is no longer counted in every division they
  // belong to. Kamal's October plan was 1,179,250 in BOTH Export and PVC
  // Compound before this.
  const divisionOpps = (opps || []).filter(planInDivision);
  const planned = sumPlannedByOwner({ rows: divisionOpps, ownerIds: forwardIds }).total;
  // Open funnel for the window, raw — THE shared definition
  // (utils/openFunnel.js), not a local re-derivation. The inline version this
  // replaced required an expected_close_date and so silently dropped every
  // undated open deal: 13 worth 123,540.34 for JASCO PVC, which is why Insights
  // read 3,168,939.08 where Planning and the KPI strip read 3,292,479.42 for the
  // same people and the same month. Undated work is work somebody has not dated,
  // not work that does not exist; see INCLUDE_UNDATED.
  //
  // Distinct from `pipeline` above, which is every open deal regardless of date
  // and feeds the coverage rail. These rows — not `pipeline` — are what
  // computeCoverage weights below.
  const funnelSplit = partitionOpenFunnel({ rows: openDeals, start: monthStart, end: monthEnd });
  const monthFunnel = funnelSplit.total;
  // Shown for visibility only — NOT netted off the requirement any more. It is
  // NEXT month's commitment, and subtracting it understated what still had to be
  // built this month. Planning never did it; Planning is the standard.
  // Same attribution. future_orders.division_id is added by
  // migrations/division_attribution.sql; until that is applied every row falls
  // back to its owner's primary division, which is what this screen already
  // did for anyone in a single division.
  const divisionFutureOrders = (futureOrders || []).filter(planInDivision);
  const carryIn = sumPlannedByOwner({ rows: divisionFutureOrders, ownerIds: forwardIds }).total;
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

  // COVERAGE — the shared rule over the funnel dated INTO THE PERIOD
  // (funnelSplit.rows), which is what the Coverage Console and the KPI strip
  // weight. This used to pass `openDeals` — every open deal, any date — so
  // Insights answered a different question from the other two screens and
  // reported 2,812,660 where they reported 1,548,955 for JASCO PVC in
  // September 2026, on the same company, month and people. Found by
  // /numbers-check on 2026-10-05.
  //
  // Coverage asks "will THIS period's target be covered?", so weighting a deal
  // due in another period was simply the wrong input. `pipeline` above is still
  // every open deal — that figure feeds the coverage rail, which is about the
  // whole book, not about this month's target.
  const { weightedFunnel, weightedPlanning, coverage } = computeCoverage({
    invoiced: achieved,
    openDeals: funnelSplit.rows,
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
    // The span the Target above covers, for the label beside it. Carried on the
    // metrics rather than threaded as a prop because it is derived from the same
    // window the figure is, and must never disagree with it.
    targetSpan: targetSpanLabel(monthStart, monthEnd),
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
    pacingOk: isCurrentMonth ? pace >= elapsed - PACING_TOLERANCE : null,
    winRatePct,
    winRateBorrowed,
    // The DIVISION's own deal count in the window — the n in "company rate
    // (n=6)". Reported whether or not the rate was borrowed, so a reader can
    // also see how thin a rate that WAS used is.
    winRateSampleN: mine.total,
    planned,
    monthFunnel,
    // How much of monthFunnel carries no close date, so a screen can disclose it
    // rather than let the figure read as "all due in this period".
    monthFunnelUndated: funnelSplit.undated,
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
    // ── THE ROWS BEHIND EACH RAIL FIGURE ──────────────────────────────────
    //
    // Carried out of here rather than re-derived by the drill-down, so a
    // segment's breakdown cannot disagree with the segment: the panel groups
    // exactly the rows that were summed, and "L1 total = rail value" holds by
    // construction instead of by a second implementation agreeing.
    //
    // perPerson maps come from computeAchieved, which already produced them.
    drill: {
      winRatePct,
      // Invoiced, net of returns: the counted deals and the credit notes that
      // were subtracted, with both per-person maps.
      invoicedRows: achievedSplit.deals || [],
      invoicedPerPerson: achievedSplit.perPerson || {},
      returnRows: achievedSplit.returnRows || [],
      returnsPerPerson: achievedSplit.returnsPerPerson || {},
      // The funnel rows computeCoverage weighted — dated INTO the period plus
      // the undated, which is what partitionOpenFunnel decided.
      funnelRows: funnelSplit.rows || [],
      // The open plan items behind Planned, already narrowed to active owners.
      planRows: divisionOpps.filter((o) => isForward.has(o.owner_id)),
      // Won but not yet invoiced: NOT part of coverage (decision 2026-10-07),
      // carried so the rail can show it as a fourth, non-coverage part.
      wonNotInvoicedRows: wonNotInvoicedList({
        deals: data.deals || [], ownerIds: forwardIds, now,
      }).filter(inThisDivision),
      // Per-person target and achieved, for the Shortfall level.
      targetPerPerson: targetPer,
      forwardIds,
      achieverIds,
    },
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
