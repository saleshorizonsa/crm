/**
 * forecastInsights.js — pure functions, no Supabase
 *
 * generateInsights(forecast, deals, targetAmount) → Insight[]
 * generatePrediction(forecast, deals, targetAmount) → Prediction
 */

const OPEN_STAGES = new Set(["lead", "contact_made", "proposal_sent", "negotiation"]);

const STAGE_WEIGHTS = {
  lead:          0.10,
  contact_made:  0.25,
  proposal_sent: 0.50,
  negotiation:   0.75,
};

function formatK(value) {
  if (!value || value === 0) return "SAR 0";
  if (value >= 1_000_000) return `SAR ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `SAR ${Math.round(value / 1_000)}K`;
  return `SAR ${Math.round(value)}`;
}

/**
 * Returns 4 insight objects describing pipeline health.
 */
export function generateInsights(forecast, deals = [], targetAmount = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openDeals  = deals.filter((d) => OPEN_STAGES.has(d.stage));
  const wonDeals   = deals.filter((d) => d.stage === "won");
  const lostDeals  = deals.filter((d) => d.stage === "lost");
  const closedCount = wonDeals.length + lostDeals.length;

  // ── Pipeline Coverage ────────────────────────────────────────────────────
  const coverage = targetAmount > 0
    ? Math.round((forecast.bestCase / targetAmount) * 100)
    : null;

  const coverageInsight = {
    id:    "pipeline-coverage",
    title: "Pipeline Coverage",
    icon:  "BarChart2",
    value: coverage !== null ? `${coverage}%` : "—",
    ...(coverage === null
      ? { status: "neutral", color: "blue",   description: "No active target set for this period." }
      : coverage >= 300
        ? { status: "excellent", color: "emerald", description: `${coverage}% coverage — pipeline is well above target.` }
        : coverage >= 150
          ? { status: "good",    color: "blue",   description: `${coverage}% pipeline coverage vs target.` }
          : coverage >= 100
            ? { status: "warning", color: "amber", description: `${coverage}% coverage — barely over target, limited buffer.` }
            : { status: "danger",  color: "red",   description: `${coverage}% coverage — pipeline below target. At risk of missing quota.` }),
  };

  // ── Win Rate ─────────────────────────────────────────────────────────────
  const winRate = closedCount > 0
    ? Math.round((wonDeals.length / closedCount) * 100)
    : null;

  const winRateInsight = {
    id:    "win-rate",
    title: "Win Rate",
    icon:  "Target",
    value: winRate !== null ? `${winRate}%` : "—",
    ...(winRate === null
      ? { status: "neutral",   color: "blue",   description: "No closed deals in this period to calculate win rate." }
      : winRate >= 40
        ? { status: "excellent", color: "emerald", description: `${winRate}% win rate — strong close performance.` }
        : winRate >= 25
          ? { status: "good",    color: "blue",   description: `${winRate}% win rate — in-line with industry average.` }
          : winRate >= 15
            ? { status: "warning", color: "amber", description: `${winRate}% win rate — below average. Review qualifying criteria.` }
            : { status: "danger",  color: "red",   description: `${winRate}% win rate — significantly below average.` }),
  };

  // ── Overdue Deals ────────────────────────────────────────────────────────
  const overdueDeals = openDeals.filter((d) => {
    if (!d.expected_close_date) return false;
    return new Date(d.expected_close_date) < today;
  });
  const overdueValue = overdueDeals.reduce((s, d) => s + (d.amount || 0), 0);

  const overdueInsight = {
    id:    "overdue-deals",
    title: "Overdue Deals",
    icon:  "Clock",
    value: overdueDeals.length > 0 ? `${overdueDeals.length} deals` : "None",
    ...(overdueDeals.length === 0
      ? { status: "excellent", color: "emerald", description: "No overdue deals — close dates are on track." }
      : overdueDeals.length <= 2
        ? { status: "warning",  color: "amber", description: `${overdueDeals.length} overdue deal${overdueDeals.length > 1 ? "s" : ""} worth ${formatK(overdueValue)} need date updates.` }
        : { status: "danger",   color: "red",   description: `${overdueDeals.length} overdue deals worth ${formatK(overdueValue)} — requires immediate attention.` }),
  };

  // ── Late-Stage Concentration ──────────────────────────────────────────────
  const lateStageDeals = openDeals.filter(
    (d) => d.stage === "negotiation" || d.stage === "proposal_sent",
  );
  const lateStageValue    = lateStageDeals.reduce((s, d) => s + (d.amount || 0), 0);
  const openValue         = openDeals.reduce((s, d) => s + (d.amount || 0), 0);
  const lateConcentration = openValue > 0
    ? Math.round((lateStageValue / openValue) * 100)
    : 0;

  const lateStageInsight = {
    id:    "late-stage",
    title: "Late-Stage Deals",
    icon:  "Zap",
    value: lateStageDeals.length > 0 ? `${lateStageDeals.length} deals` : "None",
    ...(lateStageDeals.length === 0
      ? { status: "neutral",   color: "blue",   description: "No deals in proposal or negotiation stage." }
      : lateConcentration >= 60
        ? { status: "excellent", color: "emerald", description: `${lateConcentration}% of pipeline in late stages — strong closing signal.` }
        : lateConcentration >= 35
          ? { status: "good",    color: "blue",   description: `${lateStageDeals.length} deals in late stages worth ${formatK(lateStageValue)}.` }
          : { status: "warning", color: "amber", description: `Only ${lateConcentration}% in late stages — deals need to advance for quota confidence.` }),
  };

  return [coverageInsight, winRateInsight, overdueInsight, lateStageInsight];
}

/**
 * Returns a prediction object with revenue estimate, confidence, and narrative.
 *
 * `winRates` carries the REAL 3-month rolling win rates from computeWinRate3m()
 * in kpiStripData.js — the same numbers the dashboards' KPI strip shows:
 *   own     — the rate for whatever is on screen (the selected salesman when
 *             drilled in, otherwise the whole company). null = no history.
 *   company — the company-wide rate, used as the floor when `own` has none.
 * Both null means neither has loaded yet or the company has no history at all.
 */
export function generatePrediction(forecast, deals = [], targetAmount = 0, winRates = {}) {
  const openDeals   = deals.filter((d) => OPEN_STAGES.has(d.stage));
  const wonDeals    = deals.filter((d) => d.stage === "won");
  const lostDeals   = deals.filter((d) => d.stage === "lost");
  const closedCount = wonDeals.length + lostDeals.length;

  // ── Win rate ──────────────────────────────────────────────────────────────
  // Fallback ladder, mirroring resolveWinRate() in kpiStripData.js:
  //   1. own 3-month rate      — this salesman's (or the company's) real record
  //   2. company 3-month rate  — the floor for someone with no history of their
  //                              own, so a new rep is not forecast at 0%
  //   3. selected-period rate  — nothing in the 3-month window, but the period
  //                              in view has closed deals (e.g. a "This Year"
  //                              range holding deals older than the window)
  //   4. 0                     — only when there is genuinely no data anywhere
  //
  // Presence is decided by hasHistory upstream, never by "rate > 0": a rep who
  // created deals and won none has a measured 0% rate, which is real data and
  // must not silently borrow the company average.
  const rate = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const ownRate     = rate(winRates?.own);
  const companyRate = rate(winRates?.company);
  const periodRate  = closedCount > 0 ? (wonDeals.length / closedCount) * 100 : null;

  const winRateBasis =
    ownRate     !== null ? "own"     :
    companyRate !== null ? "company" :
    periodRate  !== null ? "period"  :
                           "none";

  const rawWinRate = ownRate ?? companyRate ?? periodRate ?? 0;
  const historicalWinRate = Math.round(rawWinRate * 10) / 10;

  // Predicted revenue: committed + open deals × blended probability
  // Blend: 40% stage weight + 60% historical win rate
  const predictedOpen = openDeals.reduce((s, d) => {
    const stageProb = STAGE_WEIGHTS[d.stage] ?? 0.10;
    const winProb   = historicalWinRate / 100;
    return s + (d.amount || 0) * (stageProb * 0.4 + winProb * 0.6);
  }, 0);
  const predictedRevenue = Math.round((forecast.committed + predictedOpen) * 100) / 100;

  // Confidence IS the historical win rate — the share of deals this company
  // actually closes. The old score was a synthetic blend of committed/target and
  // deal count clamped to 30–92%, which was not measuring anything real.
  const confidence = historicalWinRate;

  // Predicted closes: late-stage open deals
  const lateStageOpen = openDeals.filter(
    (d) => d.stage === "negotiation" || d.stage === "proposal_sent",
  );
  const predictedCloses = lateStageOpen.length;

  // Top 3 late-stage high-value deals
  const topDeals = [...lateStageOpen]
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 3);

  const attainmentPct = targetAmount > 0
    ? Math.round((predictedRevenue / targetAmount) * 100)
    : null;

  // ── Narrative ─────────────────────────────────────────────────────────────
  // Built from the actual pipeline numbers rather than picking a canned sentence
  // from an attainment if/else ladder. Every figure below is measured, not
  // adjectival: open deal count, open pipeline value, the real win rate, the
  // revenue that rate implies, and the stage-weighted forecast.
  const openValue = openDeals.reduce((s, d) => s + (d.amount || 0), 0);
  const expectedFromPipeline = openValue * (historicalWinRate / 100);

  const winRatePhrase = {
    own:     `the 3-month win rate of ${historicalWinRate.toFixed(1)}%`,
    company: `the company average win rate of ${historicalWinRate.toFixed(1)}% (no 3-month history of its own yet)`,
    period:  `this period's win rate of ${historicalWinRate.toFixed(1)}% (${wonDeals.length} of ${closedCount} closed)`,
    none:    "no closed-deal history yet",
  }[winRateBasis];

  let narrative = `Based on ${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"} worth ${formatK(openValue)}.`;

  if (winRateBasis === "none") {
    narrative += ` There is ${winRatePhrase}, so expected revenue cannot be projected from a close rate — the weighted forecast of ${formatK(forecast.weighted)} rests on stage probabilities alone.`;
  } else {
    narrative += ` At ${winRatePhrase}, expected revenue from that pipeline is ${formatK(expectedFromPipeline)}`;
    narrative += forecast.committed > 0
      ? `, on top of ${formatK(forecast.committed)} already won.`
      : `.`;
    narrative += ` Weighted forecast: ${formatK(forecast.weighted)}.`;
  }

  if (attainmentPct !== null) {
    narrative += ` That puts predicted revenue at ${attainmentPct}% of the ${formatK(targetAmount)} target.`;
  }

  return {
    predictedRevenue,
    confidence,
    winRateBasis,             // "own" | "company" | "period" | "none" — how to label it
    historicalWinRate,
    predictedCloses,
    topDeals,
    narrative,
    attainmentPct,
    targetAmount,             // raw target for above/below comparison
    openDealsCount: openDeals.length,
    openValue,
    expectedFromPipeline: Math.round(expectedFromPipeline * 100) / 100,
  };
}
