import { supabase } from 'lib/supabase';

// Weighted-forecast fields for a deal, computed at write time.
//
//   forecast_probability = the company's probability for the deal's stage
//   forecast_amount      = amount × probability ÷ 100
//
// This used to happen only in backfillForecasts(), which runs on
// DirectorDashboard mount for director/admin/head. A deal created by a salesman
// therefore kept forecast_amount = null until a director next logged in, so the
// forecast totals silently under-counted every new deal. Computing it here, on
// the create/update path, means the column is correct the moment the deal is
// written. backfillForecasts stays as a repair tool for historical rows.

// stage → probability, per company. The map is small and changes rarely, so it
// is cached for the session; deal writes happen far more often than a company
// edits its probabilities.
const cache = new Map();

export function clearForecastProbabilityCache(companyId) {
  if (companyId) cache.delete(companyId); else cache.clear();
}

async function probabilityMap(companyId) {
  if (!companyId) return null;
  if (cache.has(companyId)) return cache.get(companyId);

  const { data, error } = await supabase
    .from('stage_probabilities')
    .select('stage, probability')
    .eq('company_id', companyId);
  if (error) {
    console.error('forecastCalc (probabilities):', error);
    return null; // caller leaves the fields alone rather than writing a wrong value
  }
  const map = {};
  (data || []).forEach((p) => { map[p.stage] = Number(p.probability) || 0; });
  if (!Object.keys(map).length) return null;

  cache.set(companyId, map);
  return map;
}

// Returns { forecast_probability, forecast_amount } for a deal, or null when the
// forecast cannot be determined (no company, unknown stage, probabilities not
// configured). Returning null — rather than zeros — keeps a deal's existing
// forecast intact instead of overwriting it with a value we did not compute.
export async function forecastFieldsFor({ companyId, stage, amount }) {
  if (!companyId || !stage) return null;
  const map = await probabilityMap(companyId);
  if (!map) return null;

  const p = map[stage];
  if (p == null) return null; // stage not configured — leave as-is

  const amt = parseFloat(amount) || 0;
  return {
    forecast_probability: p,
    // Matches backfillForecasts exactly: amount × p/100, rounded to 2 decimals.
    forecast_amount: Math.round(amt * p) / 100,
  };
}
