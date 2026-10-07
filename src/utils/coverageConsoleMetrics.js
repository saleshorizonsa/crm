// THE Coverage Console's per-node metrics — moved OUT of the page component,
// unchanged, so the numbers-check page can ask for exactly the figures that
// screen shows instead of recomputing them a second way (which is how the
// screens drifted apart in the first place).
//
// It was already a pure function of (userIds, data): every value it reads is
// either a local const or destructured from `data`. Nothing about the
// arithmetic changed in the move — the page now imports it and calls it with
// the same arguments.
//
// `data` carries one fetch for the whole tree:
//   deals, users, targets, deals3m, opps, futureOrders, returns,
//   monthStart, monthEnd, now, isCurrentMonth, isAllTime
// and the same shape is what utils/numbersCheck.js assembles.
import {
  CONTRIBUTOR_ROLES,
  isAchievedOnly,
  achieverIdsFrom,
  computeAchieved,
  targetPerPerson,
  winRateFromDeals,
  computeCoverage,
  sumPlannedByOwner,
  computeRequiredRaw,
} from 'utils/planningCalculations';
import { partitionOpenFunnel } from 'utils/openFunnel';
// The ACTIVE subset, for the forward-looking figures (CEO decision
// 2026-10-07). Imported from the leaf module: planningCalculations does not
// re-export this one.
import { activeIdsFrom } from 'utils/achieverScope';
export function calcCoverageMetrics(userIds, data) {
  if (!data || !userIds?.length) return null;

  const {
    deals,
    users,
    targets,
    deals3m,
    opps,
    futureOrders,
    monthStart,
    monthEnd,
    now,
  } = data;
  // Sales returns in the window; [] keeps a caller that omits them (the
  // verification harness) on the pre-returns behaviour.
  const returns = data.returns || [];
  // Period-shape flags. Default true/false keeps calcMetrics usable from a
  // caller that does not supply them (the verification harness does not).
  const isCurrentMonth = data.isCurrentMonth !== false;
  const isAllTime = data.isAllTime === true;

  const totalDays = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const elapsed = now.getDate() / totalDays;

  // Every KPI below is measured over CONTRIBUTORS (salesmen + supervisors),
  // never over the raw id set. A manager carries no monthly quota — counting
  // his deals while ignoring his (non-existent) target skewed the team's win
  // rate, and his future orders offset a target he never contributed to.
  // Same rule as utils/planningCalculations.js, so the console, Planning and
  // the dashboards now agree.
  const contributorIds = userIds.filter((id) => {
    const u = (users || []).find((x) => x.id === id);
    return u && CONTRIBUTOR_ROLES.includes(u.role);
  });
  // FORWARD-LOOKING FIGURES ARE ACTIVE-ONLY at every scope (CEO decision
  // 2026-10-07): the open funnel, Planned and Carry-In below count only owners
  // who are still here, because a departed person's open plan will not convert
  // and counting it overstates coverage. Target and Achieved keep the full
  // scope — they are history.
  //
  // /numbers-check caught this screen reading 2,444,012 of Planned against the
  // reference's 2,424,512: Ahmad Sulaiman Moamina's 4 open October plan items.
  const forwardIds = activeIdsFrom(contributorIds, users);

  // ── TARGET ── shared per-person rule: total_value when present, else the
  // by_clients rows, never both, and by_products never counts. The old filter
  // kept total_value rows ONLY, which dropped anyone who recorded their month
  // as by_clients entirely.
  //
  // Counted over the same people as INVOICED below — contributors plus any
  // flagged manager — so a flagged manager's own monthly target is not missing
  // from the target his invoiced revenue is measured against. Only monthly rows
  // are fetched, so a yearly allocation cannot enter this sum.
  // ONE achiever set for this node, declared before the first thing that needs
  // it. There were two identical copies of this list — one here for Target and
  // one further down for Achieved — and the conversion rate below used neither.
  const achieverIds = [
    ...contributorIds,
    ...userIds.filter((id) => isAchievedOnly((users || []).find((x) => x.id === id))),
  ];
  // MONTHLY rows only. The query now also returns yearly rows (to identify
  // annually-measured managers below); summing them here would put a whole
  // year's allocation into a month.
  const monthlyTargetRows = (targets || []).filter(
    (t) => t.period_type !== "yearly"
  );
  const targetPer = targetPerPerson(
    monthlyTargetRows.filter((t) => achieverIds.includes(t.assigned_to))
  );
  const target = Object.values(targetPer).reduce((sum, v) => sum + v, 0);

  // ── WIN RATE ── trailing 3 months over contributors; a node with no deals
  // in the window borrows the company's contributor rate rather than the
  // hardcoded 0.472 that used to sit here.
  // Over the ACHIEVERS, not contributor roles (decision D4, 2026-10-05 — see utils/winRate3m.js) — the same people whose
  // Target and Achieved are counted just above. achieverIdsFrom() for the
  // company list rather than a local role filter, which also drops INACTIVE
  // users from the borrowed rate; every other scope in the app is active-only.
  const companyAchieverIds = achieverIdsFrom(users);
  const mine = winRateFromDeals({ deals: deals3m, ownerIds: achieverIds });
  const companyWide = winRateFromDeals({
    deals: deals3m,
    ownerIds: companyAchieverIds,
  });
  const winRatePct = mine.total > 0 ? mine.winRatePct : companyWide.winRatePct;
  const winRate = winRatePct / 100; // this file weights in fractions

  // ── INVOICED (achieved) ── over achieverIds, declared once near the top.
  // The shared rule rather than a local copy, so Achieved here nets off sales
  // returns like everywhere else. invoicedDeals stays the GROSS list, because
  // the drill-downs below list actual invoices; only the total is net.
  const achievedSplit = computeAchieved({
    deals,
    contributorIds: achieverIds,
    start: monthStart,
    end: monthEnd,
    returns,
  });
  const invoicedDeals = achievedSplit.deals;
  const invoiced = achievedSplit.total;
  const invoicedGross = achievedSplit.grossTotal;
  const returnsTotal = achievedSplit.returnsTotal;

  // ── FUNNEL ──
  const openDeals = (deals || []).filter(
    (d) =>
      forwardIds.includes(d.owner_id) &&
      !["won", "lost"].includes(d.stage)
  );
  const funnel = openDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

  // ── PLANNING ──
  // Over contributors PLUS any flagged achieved-only manager, the scope Target
  // and Achieved already share here. Contributors-only was missed by the
  // contributor-parity pass and left a flagged manager's own plan out of the
  // one number measured against his own target.
  // Planned and Carry-In are measured over the ACHIEVERS here (a flagged
  // manager's own plan nets off his own target), so they need the active
  // subset of that list rather than of the contributors.
  const forwardAchieverIds = activeIdsFrom(achieverIds, users);
  const planningSum = sumPlannedByOwner({
    rows: opps,
    ownerIds: forwardAchieverIds,
  });
  const planning = planningSum.total;

  // Open funnel for THIS MONTH, through the SHARED partition
  // (utils/openFunnel.js partitionOpenFunnel) rather than a local date
  // filter. The local filter dropped every deal with no
  // expected_close_date — 13 deals worth 123,540.34 for JASCO PVC, about 6%
  // of the funnel — so this screen's funnel disagreed with Planning's and
  // the KPI strip's for the same person and month. INCLUDE_UNDATED is the
  // one place that rule now lives.
  const openInScope = (deals || []).filter(
    (d) => achieverIds.includes(d.owner_id) && !["won", "lost"].includes(d.stage)
  );
  const monthSplit = partitionOpenFunnel({
    rows: openInScope, start: monthStart, end: monthEnd,
  });
  const monthFunnelDeals = monthSplit.rows;
  const monthFunnel = monthSplit.total;

  // ── COVERAGE ── the shared rule (planningCalculations.js computeCoverage),
  // not a third local copy of the same arithmetic: achieved + weighted funnel
  // (forecast_amount when set, else amount × rate) + planned × rate. The
  // funnel half is the CURRENT MONTH's open deals from the shared partition
  // above, which is what the KPI strip and Insights weight too.
  const coverageSplit = computeCoverage({
    invoiced,
    openDeals: monthFunnelDeals,
    planned: planning,
    winRatePct,
  });
  const coverage = coverageSplit.coverage;

  // ── REQUIRED PLAN ── shared rule: with no win rate at all, assume 50%
  // (target x 2). This used to return 0, which reported "no plan needed"
  // for a team that simply had no closed deals yet.
  //
  // Measured over what is STILL MISSING (target - invoiced, floor 0), not over
  // the untouched original target. Dividing the raw target meant the figure
  // never fell as revenue landed: on 2026-09-28 JASCO PVC had invoiced
  // 1,499,724.53 against a 1,481,075.00 target - the month was made - and this
  // still demanded 952,885.34 of fresh pipeline, while Planning correctly read
  // 0.00. Same basis as planningPageSummary.js now.
  const remainingTarget = Math.max(0, target - invoiced);
  const requiredPlan = computeRequiredRaw({ target: remainingTarget, winRatePct });

  // ── CARRY-IN ── next month's committed orders. Shown for visibility only:
  // it is NO LONGER subtracted from the pipeline requirement. Netting a
  // NEXT-month commitment off THIS month's requirement understated what still
  // had to be built, and it was the last thing making this screen disagree
  // with Planning. Planning never did it; Planning is the standard.
  const future = sumPlannedByOwner({
    rows: futureOrders,
    ownerIds: forwardAchieverIds,
  }).total;

  // ── NEW PIPELINE NEEDED ── required, less what this month already covers:
  // the open plan plus the open funnel dated into this month, both raw. Same
  // shape as planningPageSummary.js, so the two screens produce the same
  // number rather than two defensible ones.
  const monthCoverage = planning + monthFunnel;
  const plannedGap = Math.max(0, requiredPlan - monthCoverage);

  return {
    target,
    invoiced,
    invoicedGross,
    returnsTotal,
    remainingTarget,
    funnel,
    weightedFunnel: coverageSplit.weightedFunnel,
    planning,
    weightedPlanning: coverageSplit.weightedPlanning,
    coverage,
    winRate,
    requiredPlan,
    monthFunnel,
    monthCoverage,
    future,
    plannedGap,
    openDeals,
    invoicedDeals,
    contributorIds,
    coverageOk: coverage >= target,
    // Pacing divides achievement by the share of the MONTH elapsed, so it is
    // meaningless for a past, future or multi-month period: "day 28 of 30"
    // says nothing about a finished quarter. null, not a substitute figure —
    // the rails and the row status check for it and hide rather than guess.
    pacingOk: isCurrentMonth
      ? invoiced / Math.max(target, 1) >= elapsed - 0.15
      : null,
    pace: isCurrentMonth ? invoiced / Math.max(target, 1) : null,
    elapsed: isCurrentMonth ? elapsed : null,
    totalDays: isCurrentMonth ? totalDays : null,
    dayOfMonth: isCurrentMonth ? now.getDate() : null,
    isCurrentMonth,
    // All Time compares an Achieved spanning everything with a Target that
    // only exists for the months that have rows. Target-derived figures are
    // suppressed rather than shown as a false ratio.
    isAllTime,
  };
}
