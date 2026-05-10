import { supabase } from "../lib/supabase";

export const DEFAULT_STAGE_WEIGHTS = {
  lead:          0.10,
  contact_made:  0.25,
  proposal_sent: 0.50,
  negotiation:   0.75,
  won:           1.00,
  lost:          0.00,
};

// Backward-compat alias
export const STAGE_WEIGHTS = DEFAULT_STAGE_WEIGHTS;

export const STAGE_ORDER = ["lead", "contact_made", "proposal_sent", "negotiation", "won", "lost"];

const STAGE_LABELS = {
  lead:          "Lead",
  contact_made:  "Contact Made",
  proposal_sent: "Proposal Sent",
  negotiation:   "Negotiation",
  won:           "Won",
  lost:          "Lost",
};

const OPEN_STAGES = new Set(["lead", "contact_made", "proposal_sent", "negotiation"]);
const MIN_SAMPLES = 5; // minimum closed deals per stage to use historical rate

// ── Historical win-rate calculation ──────────────────────────────────────────

/**
 * Calculate win rates per stage from deal_stage_history for a company.
 * Returns { lead: 0.32, contact_made: 0.51, ... } — only stages with
 * enough samples (MIN_SAMPLES). Stages below the threshold are omitted
 * so the caller can fall back to DEFAULT_STAGE_WEIGHTS for those.
 */
export async function calculateHistoricalWinRates(companyId, lookbackDays = 90) {
  if (!companyId) return { rates: {}, sampleCounts: {} };

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const sinceISO = since.toISOString();

  const [historyResult, dealsResult] = await Promise.all([
    supabase
      .from("deal_stage_history")
      .select("deal_id, stage")
      .eq("company_id", companyId)
      .gte("entered_at", sinceISO),
    supabase
      .from("deals")
      .select("id, stage")
      .eq("company_id", companyId)
      .in("stage", ["won", "lost"]),
  ]);

  if (historyResult.error || dealsResult.error) {
    return { rates: {}, sampleCounts: {} };
  }

  const wonIds = new Set(
    (dealsResult.data || []).filter((d) => d.stage === "won").map((d) => d.id)
  );

  // Per-stage: unique deal_ids that passed through, and which of those won
  const stageDeals = {}; // stage -> Set<deal_id>
  const stageWon   = {}; // stage -> Set<deal_id>

  for (const row of historyResult.data || []) {
    if (!OPEN_STAGES.has(row.stage)) continue;
    if (!stageDeals[row.stage]) {
      stageDeals[row.stage] = new Set();
      stageWon[row.stage]   = new Set();
    }
    stageDeals[row.stage].add(row.deal_id);
    if (wonIds.has(row.deal_id)) stageWon[row.stage].add(row.deal_id);
  }

  const rates        = {};
  const sampleCounts = {};

  for (const stage of OPEN_STAGES) {
    const total = stageDeals[stage]?.size ?? 0;
    const won   = stageWon[stage]?.size   ?? 0;
    sampleCounts[stage] = total;
    if (total >= MIN_SAMPLES) {
      rates[stage] = won / total;
    }
  }

  return { rates, sampleCounts };
}

/**
 * Calculate per-rep win rates from closed deals.
 * Returns { [userId]: winRate } — only reps with >= 3 closed deals.
 */
export async function getRepWinRates(companyId, lookbackDays = 90) {
  if (!companyId) return {};

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const { data, error } = await supabase
    .from("deals")
    .select("id, stage, owner_id, owner:users!owner_id(id, full_name)")
    .eq("company_id", companyId)
    .in("stage", ["won", "lost"])
    .gte("updated_at", since.toISOString());

  if (error || !data) return {};

  const repMap = {};
  for (const d of data) {
    if (!d.owner_id) continue;
    if (!repMap[d.owner_id]) repMap[d.owner_id] = { won: 0, total: 0, name: d.owner?.full_name || d.owner_id };
    repMap[d.owner_id].total++;
    if (d.stage === "won") repMap[d.owner_id].won++;
  }

  const rates = {};
  for (const [userId, { won, total, name }] of Object.entries(repMap)) {
    if (total >= 3) {
      rates[userId] = { rate: won / total, won, total, name };
    }
  }
  return rates;
}

/**
 * Fetch or recalculate win rates with a 24-hour cache in `company_win_rates`.
 * Returns { stageRates, repRates, sampleCounts, fromCache }.
 */
export async function getOrCalculateWinRates(companyId, forceRefresh = false) {
  if (!companyId) return { stageRates: {}, repRates: {}, sampleCounts: {}, fromCache: false };

  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from("company_win_rates")
      .select("stage_rates, rep_rates, sample_counts, calculated_at")
      .eq("company_id", companyId)
      .single();

    if (cached) {
      const ageMs = Date.now() - new Date(cached.calculated_at).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        return {
          stageRates:   cached.stage_rates   || {},
          repRates:     cached.rep_rates     || {},
          sampleCounts: cached.sample_counts || {},
          fromCache:    true,
        };
      }
    }
  }

  const [{ rates: stageRates, sampleCounts }, repRates] = await Promise.all([
    calculateHistoricalWinRates(companyId),
    getRepWinRates(companyId),
  ]);

  // Upsert cache (non-blocking — ignore failures)
  supabase
    .from("company_win_rates")
    .upsert(
      { company_id: companyId, stage_rates: stageRates, rep_rates: repRates, sample_counts: sampleCounts, calculated_at: new Date().toISOString() },
      { onConflict: "company_id" }
    )
    .then(() => {})
    .catch(() => {});

  return { stageRates, repRates, sampleCounts, fromCache: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function effectiveWeight(deal, historicalRates, repRates) {
  const stage = deal.stage;
  const defaultW = DEFAULT_STAGE_WEIGHTS[stage] ?? 0;
  if (!historicalRates || !(stage in historicalRates)) return { weight: defaultW, isHistorical: false };

  const stageRate = historicalRates[stage];
  const repEntry  = repRates?.[deal.owner_id];
  const repRate   = repEntry?.rate;

  const blended = repRate != null
    ? stageRate * 0.6 + repRate * 0.4
    : stageRate;

  return { weight: blended, isHistorical: true };
}

// ── Main forecast builder ─────────────────────────────────────────────────────

/**
 * buildForecast(deals, target, historicalRates?, repRates?)
 *
 * historicalRates: { [stage]: winRate }  — from getOrCalculateWinRates().stageRates
 * repRates:        { [userId]: { rate, won, total, name } } — from getOrCalculateWinRates().repRates
 *
 * When historicalRates is provided, open-deal weights use a 60/40 blend of
 * stage historical rate (60 %) and rep personal win rate (40 %).
 * Stages not present in historicalRates fall back to DEFAULT_STAGE_WEIGHTS.
 */
export function buildForecast(deals = [], target = 0, historicalRates = null, repRates = null) {
  const wonDeals  = deals.filter((d) => d.stage === "won");
  const openDeals = deals.filter((d) => OPEN_STAGES.has(d.stage));

  const committed = wonDeals.reduce((s, d) => s + (d.amount || 0), 0);

  const openWeighted = openDeals.reduce((s, d) => {
    const { weight } = effectiveWeight(d, historicalRates, repRates);
    return s + (d.amount || 0) * weight;
  }, 0);

  const openBestCase = openDeals.reduce((s, d) => s + (d.amount || 0), 0);

  const weighted   = committed + openWeighted;
  const bestCase   = committed + openBestCase;
  const attainment = target > 0 ? Math.round((weighted / target) * 1000) / 10 : 0;
  const gap        = target - weighted;

  const byStage = Object.keys(DEFAULT_STAGE_WEIGHTS).map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    const total      = stageDeals.reduce((s, d) => s + (d.amount || 0), 0);
    const isHist     = historicalRates != null && stage in historicalRates;
    const weight     = isHist ? historicalRates[stage] : DEFAULT_STAGE_WEIGHTS[stage];
    return {
      stage,
      label:        STAGE_LABELS[stage] ?? stage,
      weight,
      isHistorical: isHist,
      count:        stageDeals.length,
      total,
      weighted:     Math.round(total * weight * 100) / 100,
    };
  });

  // ── 12-week cumulative projection ──────────────────────────────────────────
  // Uses a stage-based smooth curve instead of date bucketing so that every deal
  // contributes regardless of whether it has an expected_close_date set.
  // cumulativeCommitted is a flat baseline (already-won revenue).
  // cumulativeWeighted / cumulativeBestCase grow linearly from committed to
  // their full totals, reaching them at week 12.
  const origin = weekStart(new Date());

  const projection = Array.from({ length: 12 }, (_, i) => {
    const wStart = new Date(origin);
    wStart.setDate(origin.getDate() + i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 6);
    wEnd.setHours(23, 59, 59, 999);

    // Linear progress: week 1 = 1/12, week 12 = 12/12
    const progress = (i + 1) / 12;
    const label    = wStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    return {
      week:                i + 1,
      label,
      startDate:           wStart.toISOString().split("T")[0],
      endDate:             wEnd.toISOString().split("T")[0],
      committed:           Math.round((openWeighted / 12) * 100) / 100,
      weighted:            Math.round((openWeighted / 12) * 100) / 100,
      bestCase:            Math.round((openBestCase / 12) * 100) / 100,
      cumulativeCommitted: Math.round(committed             * 100) / 100,
      cumulativeWeighted:  Math.round((committed + openWeighted * progress) * 100) / 100,
      cumulativeBestCase:  Math.round((committed + openBestCase * progress) * 100) / 100,
      dealCount:           openDeals.length,
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
