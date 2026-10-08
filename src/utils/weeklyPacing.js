import { supabase } from 'lib/supabase';
import { isAchievedDeal, achievedAmount, fetchMonthlyTargets, targetPerPerson } from 'utils/planningCalculations';
import { PACING_TOLERANCE } from 'utils/salesDivisionMetrics';

/**
 * WEEK BY WEEK THROUGH THE CURRENT MONTH — is this person keeping up?
 *
 * The month's pacing verdict says "behind" on the 28th, which is too late to
 * matter. This says it in week 2, by cutting the same comparison into weeks:
 *
 *   converted   cumulative value of plan items turned into deals by that week
 *   achieved    cumulative invoiced revenue by that week (the shared rule)
 *   pace line   target × days elapsed ÷ days in month, at the week's end
 *
 * THE VERDICT USES THE COVERAGE CONSOLE'S RULE, not a new one: the share of
 * target achieved against the share of the month elapsed, with
 * PACING_TOLERANCE (15 points) of slack — exported from salesDivisionMetrics
 * so there is one tolerance in the app.
 *
 *   on pace      within the tolerance of the line
 *   behind       within twice the tolerance
 *   far behind   worse than that
 *
 * ONLY FOR A MONTH IN PROGRESS. For a past or future month the pace line means
 * nothing and the verdict is null, exactly as the month-level one is.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const VERDICT = {
  onPace: 'on pace',
  behind: 'behind',
  farBehind: 'far behind',
  none: null,
};

/**
 * The calendar weeks of a month, as day-of-month boundaries.
 *
 * Weeks 1–4 are seven days each and week 5 is whatever is left (1 to 3 days,
 * or 0 in February). Deliberately NOT ISO weeks: a plan is a monthly artifact
 * and a week that straddles two months would put one month's revenue in the
 * other's first bar.
 */
export function weeksOf(monthStart) {
  const [y, m] = String(monthStart).split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const weeks = [];
  for (let i = 0; i < 5; i += 1) {
    const from = i * 7 + 1;
    if (from > days) break;
    const to = Math.min(from + 6, days);
    weeks.push({
      week: i + 1,
      fromDay: from,
      toDay: to,
      start: `${y}-${pad(m)}-${pad(from)}`,
      end: `${y}-${pad(m)}-${pad(to)}`,
    });
  }
  return { weeks, days };
}

/** on pace / behind / far behind, by the shared tolerance. */
export function verdictFor({ achieved, target, elapsedShare }) {
  if (!(target > 0) || elapsedShare == null) return VERDICT.none;
  const pace = achieved / target;
  if (pace >= elapsedShare - PACING_TOLERANCE) return VERDICT.onPace;
  if (pace >= elapsedShare - PACING_TOLERANCE * 2) return VERDICT.behind;
  return VERDICT.farBehind;
}

/**
 * @param {string}   companyId
 * @param {string[]} ownerIds
 * @param {string}   start  yyyy-MM-dd, first day of the month
 * @param {string}   end    yyyy-MM-dd, last day
 * @param {object[]} users
 * @param {Date}     now
 */
export async function computeWeeklyPacing({
  companyId, ownerIds, start, end, users = [], now = new Date(),
}) {
  const { weeks, days } = weeksOf(start);
  const empty = { weeks, people: [], totals: null, isCurrentMonth: false };
  if (!companyId || !ownerIds?.length) return empty;

  const today = ymd(now);
  const isCurrentMonth = today >= start && today <= end;

  const [convRes, achRes, targetRows] = await Promise.all([
    // Plan items converted during the month, dated by when they converted.
    supabase.from('opportunities')
      .select('id, owner_id, planned_amount, deal_id, converted_at, status')
      .eq('company_id', companyId)
      .in('owner_id', ownerIds)
      .not('converted_at', 'is', null)
      .gte('converted_at', `${start}T00:00:00`)
      .lte('converted_at', `${end}T23:59:59`),
    supabase.from('deals')
      .select('id, owner_id, stage, amount, final_amount, is_invoiced, invoice_date')
      .eq('company_id', companyId)
      .in('owner_id', ownerIds)
      .eq('stage', 'won')
      .eq('is_invoiced', true)
      .gte('invoice_date', start)
      .lte('invoice_date', end),
    // `contributorIds`, not `ownerIds`: the parameter is named for the rule it
    // applies. Passing the wrong key returns [] and every target reads 0,
    // which is what this did on its first run.
    fetchMonthlyTargets({ companyId, contributorIds: ownerIds, start, end }),
  ]);

  const conv = convRes.data || [];
  const invoiced = (achRes.data || []).filter((d) => isAchievedDeal(d, { start, end }));
  const targets = targetPerPerson(targetRows || []);

  const dayOf = (iso) => new Date(iso).getDate();

  const forIds = (ids) => {
    const target = ids.reduce((s, id) => s + num(targets[id]), 0);
    const myConv = conv.filter((o) => ids.includes(o.owner_id));
    const myInv = invoiced.filter((d) => ids.includes(d.owner_id));

    let cumConverted = 0;
    let cumAchieved = 0;
    const series = weeks.map((w) => {
      cumConverted += myConv
        .filter((o) => {
          const d = dayOf(o.converted_at);
          return d >= w.fromDay && d <= w.toDay;
        })
        .reduce((s, o) => s + num(o.planned_amount), 0);
      cumAchieved += myInv
        .filter((d) => {
          const day = Number(String(d.invoice_date).slice(8, 10));
          return day >= w.fromDay && day <= w.toDay;
        })
        .reduce((s, d) => s + achievedAmount(d), 0);

      // The line at the END of this week — the share of the month that has
      // gone by then.
      const elapsedShare = w.toDay / days;
      // A week that has not happened yet gets no bar and no verdict: drawing
      // the line past today would show everyone as far behind on the 3rd.
      const inPast = !isCurrentMonth ? true : w.fromDay <= now.getDate();
      const complete = !isCurrentMonth ? true : w.toDay <= now.getDate();
      return {
        week: w.week,
        label: `W${w.week}`,
        fromDay: w.fromDay,
        toDay: w.toDay,
        converted: inPast ? cumConverted : null,
        achieved: inPast ? cumAchieved : null,
        paceLine: target * elapsedShare,
        elapsedShare,
        inPast,
        complete,
        verdict: inPast && isCurrentMonth
          ? verdictFor({ achieved: cumAchieved, target, elapsedShare: Math.min(elapsedShare, now.getDate() / days) })
          : null,
      };
    });

    // The verdict now: measured at today, not at the end of the last week.
    const elapsedNow = isCurrentMonth ? now.getDate() / days : null;
    return {
      target,
      converted: cumConverted,
      achieved: cumAchieved,
      series,
      elapsedShare: elapsedNow,
      paceNow: target > 0 ? cumAchieved / target : null,
      verdict: isCurrentMonth
        ? verdictFor({ achieved: cumAchieved, target, elapsedShare: elapsedNow })
        : null,
    };
  };

  const nameOf = (id) => users.find((u) => u.id === id)?.full_name || 'Unknown';
  const people = ownerIds
    .map((id) => ({ id, name: nameOf(id), ...forIds([id]) }))
    .filter((p) => p.target > 0 || p.achieved > 0 || p.converted > 0)
    .sort((a, b) => (a.paceNow ?? 1) - (b.paceNow ?? 1));

  return {
    weeks,
    days,
    isCurrentMonth,
    people,
    totals: forIds(ownerIds),
  };
}

export { PACING_TOLERANCE };
