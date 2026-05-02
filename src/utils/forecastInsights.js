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
  if (!value || value === 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
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
 */
export function generatePrediction(forecast, deals = [], targetAmount = 0) {
  const openDeals   = deals.filter((d) => OPEN_STAGES.has(d.stage));
  const wonDeals    = deals.filter((d) => d.stage === "won");
  const lostDeals   = deals.filter((d) => d.stage === "lost");
  const closedCount = wonDeals.length + lostDeals.length;

  const historicalWinRate = closedCount > 0
    ? Math.round((wonDeals.length / closedCount) * 1000) / 10
    : 25;

  // Predicted revenue: committed + open deals × blended probability
  // Blend: 40% stage weight + 60% historical win rate
  const predictedOpen = openDeals.reduce((s, d) => {
    const stageProb = STAGE_WEIGHTS[d.stage] ?? 0.10;
    const winProb   = historicalWinRate / 100;
    return s + (d.amount || 0) * (stageProb * 0.4 + winProb * 0.6);
  }, 0);
  const predictedRevenue = Math.round((forecast.committed + predictedOpen) * 100) / 100;

  // Confidence score (30–92%) based on committed ratio and pipeline spread
  const commitRatio = targetAmount > 0
    ? Math.min(forecast.committed / targetAmount, 1)
    : Math.min(forecast.committed / Math.max(forecast.bestCase, 1), 1);
  const spreadRatio = Math.min(deals.length / 10, 1);
  const rawConf     = commitRatio * 0.6 + spreadRatio * 0.4;
  const confidence  = Math.max(30, Math.min(92, Math.round(30 + rawConf * 62)));

  // Predicted closes: late-stage open deals
  const lateStageOpen = openDeals.filter(
    (d) => d.stage === "negotiation" || d.stage === "proposal_sent",
  );
  const predictedCloses = lateStageOpen.length;

  // Top 3 late-stage high-value deals
  const topDeals = [...lateStageOpen]
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 3);

  // Natural-language narrative
  const attainmentPct = targetAmount > 0
    ? Math.round((predictedRevenue / targetAmount) * 100)
    : null;

  let narrative;
  if (attainmentPct === null) {
    narrative = `Based on current pipeline momentum, you are tracking toward ${formatK(predictedRevenue)} in revenue.`;
    if (topDeals.length > 0) {
      const topVal = topDeals.reduce((s, d) => s + (d.amount || 0), 0);
      narrative += ` ${topDeals.length} late-stage deal${topDeals.length > 1 ? "s" : ""} worth ${formatK(topVal)} represent your highest closing priority.`;
    }
  } else if (attainmentPct >= 100) {
    narrative = `On current trajectory you are likely to achieve ${attainmentPct}% of target (${formatK(predictedRevenue)}). A strong committed base provides high confidence.`;
  } else if (attainmentPct >= 75) {
    const gap = formatK(targetAmount - predictedRevenue);
    narrative = `You are tracking at ${attainmentPct}% of target. To close the ${gap} gap, focus on advancing ${predictedCloses > 0 ? `${predictedCloses} late-stage deal${predictedCloses > 1 ? "s" : ""}` : "open opportunities"}.`;
  } else if (attainmentPct >= 50) {
    narrative = `At ${attainmentPct}% of target, significant pipeline acceleration is needed. Prioritize late-stage deals and consider pulling in opportunities from next period.`;
  } else {
    const gap = formatK(targetAmount - predictedRevenue);
    narrative = `Current trajectory suggests ${attainmentPct}% attainment. Aggressive pipeline building or target revision may be required to close the ${gap} gap.`;
  }

  return {
    predictedRevenue,
    confidence,
    historicalWinRate,
    predictedCloses,
    topDeals,
    narrative,
    attainmentPct,
  };
}
