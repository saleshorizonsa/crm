import { computeAchieved, targetPerPerson } from 'utils/planningCalculations';
import { bucketsFor } from 'utils/achievedSeries';

// The Director dashboard's Performance Summary, as a pure function.
//
// Moved out of PerformanceBarChart.jsx so the numbers-check page can ask for
// exactly the figures that card shows — its Total Revenue and Total Target —
// instead of recomputing them a second way, which is how every one of these
// figures came to disagree with the KPI strip in the first place.
//
// The arithmetic is unchanged by the move: revenue is Achieved over each
// bucket's own window net of that bucket's returns (the shared rule), and the
// target is targetPerPerson over the active monthly rows that fall in the
// bucket and belong to someone whose revenue counts.

/**
 * One row per month / quarter / year of `year`.
 *
 * @param {object[]} p.allDeals       every deal in scope (unfiltered by date)
 * @param {string[]} p.contributorIds whose deals and targets count (achieverIdsFrom)
 * @param {object[]} p.returns        credit notes, any window
 * @param {object[]} p.targetsData    sales_targets rows (ALL of them; bucketed here)
 * @param {'month'|'quarter'|'year'} p.timePeriod
 * @param {number}   p.year           the SELECTED year, never new Date()
 * @param {function} [p.amountOf]     value of one deal (a currency converter wraps it)
 * @param {number}   [p.yearsBack]    how many years the 'year' view spans
 */
export function performanceBars({
  allDeals = [], contributorIds = null, returns = [], targetsData = [],
  timePeriod = 'month', year, amountOf, yearsBack = 5,
}) {
  const periods = bucketsFor(timePeriod, year, yearsBack);
  const targetScopeIds = Array.isArray(contributorIds) ? new Set(contributorIds) : null;

  const rows = periods.map((period) => {
    const bucket = computeAchieved({
      deals: allDeals,
      contributorIds,
      start: period.start,
      end: period.end,
      ...(amountOf ? { amountOf } : {}),
      returns,
    });
    // Unique owners who actually invoiced in THIS bucket — the avg divisor.
    const activeOwners = new Set(bucket.deals.map((d) => d.owner_id).filter(Boolean));

    // The row's month is SLICED from its yyyy-MM-dd string, never parsed:
    // new Date('2026-01-01') is UTC midnight, which in any zone behind UTC is
    // 31 December — the wrong bucket, and in January the wrong year.
    const bucketRows = (targetsData || []).filter((t) => {
      if ((t.period_type || 'monthly') !== 'monthly') return false;
      if ((t.status || 'active') !== 'active') return false;
      if (targetScopeIds && !targetScopeIds.has(t.assigned_to)) return false;
      const ymd = String(t.period_start || '');
      const rowYear = Number(ymd.slice(0, 4));
      const rowMonth = Number(ymd.slice(5, 7)) - 1;
      if (timePeriod === 'month') return rowYear === period.year && rowMonth === period.month;
      if (timePeriod === 'quarter') return rowYear === period.year && period.months.includes(rowMonth);
      return rowYear === period.year;
    });
    const target = Object.values(targetPerPerson(bucketRows)).reduce((s, v) => s + v, 0);

    return {
      name: period.label,
      revenue: bucket.total,
      target,
      deals: bucket.count,
      avg: activeOwners.size > 0 ? bucket.total / activeOwners.size : 0,
      achievement: target > 0 ? Math.round((bucket.total / target) * 100) : 0,
    };
  });

  return { periods, rows };
}

/** The card's headline figures, summed over the bars it draws. */
export function performanceTotals(rows) {
  const totalRevenue = (rows || []).reduce((sum, d) => sum + d.revenue, 0);
  const totalTarget = (rows || []).reduce((sum, d) => sum + d.target, 0);
  const totalDeals = (rows || []).reduce((sum, d) => sum + d.deals, 0);
  return {
    totalRevenue,
    totalTarget,
    totalDeals,
    avgAchievement: totalTarget > 0 ? Math.round((totalRevenue / totalTarget) * 100) : 0,
  };
}
