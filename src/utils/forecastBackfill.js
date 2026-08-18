import { supabase } from '../lib/supabase';

// Backfill the weighted-forecast columns on deals that don't have them yet:
//   forecast_probability = the company's probability for the deal's stage
//                          (from stage_probabilities)
//   forecast_amount      = amount × probability ÷ 100
//
// Idempotent and safe to call on every load — it only touches deals whose
// forecast_amount is still null, and returns early when there are none.
export async function backfillForecasts(companyId) {
  if (!companyId) return { updated: 0 };

  // 1. Stage → probability map for this company.
  const { data: probs, error: pErr } = await supabase
    .from('stage_probabilities')
    .select('stage, probability')
    .eq('company_id', companyId);
  if (pErr) { console.error('backfillForecasts (probabilities):', pErr); return { updated: 0 }; }
  const probMap = {};
  (probs || []).forEach((p) => { probMap[p.stage] = Number(p.probability) || 0; });
  if (!Object.keys(probMap).length) return { updated: 0 };

  // 2. Deals still missing a forecast.
  const { data: deals, error: dErr } = await supabase
    .from('deals')
    .select('id, stage, amount')
    .eq('company_id', companyId)
    .is('forecast_amount', null);
  if (dErr) { console.error('backfillForecasts (deals):', dErr); return { updated: 0 }; }
  if (!deals?.length) return { updated: 0 };

  // 3. Compute + write each deal's forecast, in small concurrent batches.
  const now = new Date().toISOString();
  let updated = 0;
  const CHUNK = 10;
  for (let i = 0; i < deals.length; i += CHUNK) {
    const results = await Promise.all(
      deals.slice(i, i + CHUNK).map(async (d) => {
        const p = probMap[d.stage];
        if (p == null) return false; // unknown stage → leave as-is
        const amt = parseFloat(d.amount) || 0;
        const forecast = Math.round(amt * p) / 100; // amount × p/100, to 2 decimals
        const { error } = await supabase
          .from('deals')
          .update({ forecast_probability: p, forecast_amount: forecast, updated_at: now })
          .eq('id', d.id);
        return !error;
      }),
    );
    updated += results.filter(Boolean).length;
  }
  return { updated };
}
