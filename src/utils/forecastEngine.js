export const STAGE_WEIGHTS = {
  lead:          0.10,
  contact_made:  0.25,
  proposal_sent: 0.50,
  negotiation:   0.75,
  won:           1.00,
  lost:          0.00,
};

const STAGE_LABELS = {
  lead:          "Lead",
  contact_made:  "Contact Made",
  proposal_sent: "Proposal Sent",
  negotiation:   "Negotiation",
  won:           "Won",
  lost:          "Lost",
};

const OPEN_STAGES = new Set(["lead", "contact_made", "proposal_sent", "negotiation"]);

/**
 * Returns the Monday of the week containing `date`.
 */
function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

/**
 * buildForecast(deals, target)
 *
 * @param {Array}  deals   - deal objects from supabaseService (stage, amount, expected_close_date required)
 * @param {number} target  - revenue target for the period (0 = no target)
 *
 * @returns {{
 *   committed:  number,          // sum of won deals
 *   weighted:   number,          // committed + open deals × stage weight
 *   bestCase:   number,          // committed + all open deals at full value
 *   attainment: number,          // weighted / target × 100  (0 when target = 0)
 *   gap:        number,          // target − weighted  (negative = exceeded target)
 *   byStage:    Array,           // per-stage breakdown
 *   projection: Array,           // 12-week time-series for charting
 * }}
 */
export function buildForecast(deals = [], target = 0) {
  const wonDeals  = deals.filter((d) => d.stage === "won");
  const openDeals = deals.filter((d) => OPEN_STAGES.has(d.stage));

  // ── Top-level metrics ─────────────────────────────────────────────────────
  const committed = wonDeals.reduce((s, d) => s + (d.amount || 0), 0);

  const openWeighted = openDeals.reduce((s, d) => {
    const w = STAGE_WEIGHTS[d.stage] ?? 0;
    return s + (d.amount || 0) * w;
  }, 0);

  const openBestCase = openDeals.reduce((s, d) => s + (d.amount || 0), 0);

  const weighted  = committed + openWeighted;
  const bestCase  = committed + openBestCase;
  const attainment = target > 0 ? Math.round((weighted / target) * 1000) / 10 : 0;
  const gap        = target - weighted; // negative = exceeded target

  // ── By-stage breakdown ────────────────────────────────────────────────────
  const byStage = Object.keys(STAGE_WEIGHTS).map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    const total      = stageDeals.reduce((s, d) => s + (d.amount || 0), 0);
    const weight     = STAGE_WEIGHTS[stage];
    return {
      stage,
      label:    STAGE_LABELS[stage] ?? stage,
      weight,
      count:    stageDeals.length,
      total,
      weighted: Math.round(total * weight * 100) / 100,
    };
  });

  // ── 12-week projection ────────────────────────────────────────────────────
  // Each bucket: deals whose expected_close_date falls within that calendar week.
  // Cumulative values accumulate from week 1 forward (do not include pre-period won deals
  // so the consumer can choose whether to stack them as a baseline).
  const origin = weekStart(new Date());

  let cumCommitted = 0;
  let cumWeighted  = 0;
  let cumBestCase  = 0;

  const projection = Array.from({ length: 12 }, (_, i) => {
    const wStart = new Date(origin);
    wStart.setDate(origin.getDate() + i * 7);

    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 6);
    wEnd.setHours(23, 59, 59, 999);

    const bucket = deals.filter((d) => {
      if (!d.expected_close_date || d.stage === "lost") return false;
      const close = new Date(d.expected_close_date);
      return close >= wStart && close <= wEnd;
    });

    const wCommitted = bucket
      .filter((d) => d.stage === "won")
      .reduce((s, d) => s + (d.amount || 0), 0);

    const wWeighted = bucket.reduce((s, d) => {
      const w = STAGE_WEIGHTS[d.stage] ?? 0;
      return s + (d.amount || 0) * w;
    }, 0);

    const wBestCase = bucket.reduce((s, d) => s + (d.amount || 0), 0);

    cumCommitted += wCommitted;
    cumWeighted  += wWeighted;
    cumBestCase  += wBestCase;

    const label = wStart.toLocaleDateString("en-US", {
      month: "short",
      day:   "numeric",
    });

    return {
      week:      i + 1,
      label,
      startDate: wStart.toISOString().split("T")[0],
      endDate:   wEnd.toISOString().split("T")[0],
      committed: Math.round(wCommitted * 100) / 100,
      weighted:  Math.round(wWeighted  * 100) / 100,
      bestCase:  Math.round(wBestCase  * 100) / 100,
      cumulativeCommitted: Math.round(cumCommitted * 100) / 100,
      cumulativeWeighted:  Math.round(cumWeighted  * 100) / 100,
      cumulativeBestCase:  Math.round(cumBestCase  * 100) / 100,
      dealCount: bucket.length,
    };
  });

  return {
    committed:  Math.round(committed  * 100) / 100,
    weighted:   Math.round(weighted   * 100) / 100,
    bestCase:   Math.round(bestCase   * 100) / 100,
    attainment,
    gap:        Math.round(gap        * 100) / 100,
    byStage,
    projection,
  };
}
