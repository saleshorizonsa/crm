import { supabase } from 'lib/supabase';
import {
  isImportedDeal,
  isSameDayOrder,
  queryDealsWithImportFlag,
} from 'utils/importedDeals';

// CONVERSION over the last 3 COMPLETED calendar months (the current month is
// excluded). e.g. run in August → the window is 1 May .. 31 July.
//
//   conversion = won deals ÷ TOTAL deals CREATED in the window × 100
//
// The denominator is *all deals created* in the window, not just closed ones —
// this is the agreed 3-month definition and is deliberately different from the
// "win rate" shown on a card (won ÷ (won + lost)). It is the figure Required
// Plan divides by, which is why it is named for what it measures: how much of
// what you start, you finish.
//
// IMPORTED HISTORY IS EXCLUDED (CEO decision, 2026-10-05 — see
// utils/importedDeals.js). Loaded-in invoices can only ever be "won", so they
// inflated this rate — company 74.2% where the real figure is 62.7% — and an
// inflated rate UNDERSTATES Required Plan, because Required Plan is
// target ÷ rate.
//
// Scope is always company-scoped. Pass `ownerIds` to restrict to a team
// (manager/supervisor) or to a single salesman (`[userId]`); omit / pass null
// for the whole company (director). An empty ownerIds array means "nobody in
// scope" and returns zeros rather than silently widening to the whole company.
export async function fetchWinRate3m({ companyId, ownerIds = null }) {
  const empty = {
    winRate3m: 0, won3m: 0, total3m: 0,
    pipelineConversion3m: 0, pipelineWon3m: 0, pipelineTotal3m: 0,
    importedExcluded: 0,
  };
  if (!companyId) return empty;
  if (Array.isArray(ownerIds) && ownerIds.length === 0) return empty;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);        // first day, 3 months ago
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);  // last day of the previous month

  // closed_at is read for the information-only figure below; invoice_number and
  // is_imported are what isImportedDeal needs. is_imported is asked for and
  // retried without when the column is not there yet (see the migration).
  const { data, error } = await queryDealsWithImportFlag((select) => {
    let query = supabase
      .from('deals')
      .select(select)
      .eq('company_id', companyId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());
    if (Array.isArray(ownerIds)) query = query.in('owner_id', ownerIds);
    return query;
  }, 'id, stage, created_at, closed_at, owner_id, invoice_number');

  if (error) {
    console.error('fetchWinRate3m:', error);
    return empty;
  }

  const all = data || [];
  const worked = all.filter((d) => !isImportedDeal(d));

  const total3m = worked.length;
  const won3m = worked.filter((d) => d.stage === 'won').length;
  const winRate3m = total3m > 0 ? (won3m / total3m) * 100 : 0;

  // ── PIPELINE CONVERSION — INFORMATION ONLY (CEO decision D2) ──────────────
  // The same window and scope, minus orders that were created and won inside a
  // day: a real sale, but one logged after the fact, so counting it measures
  // data entry rather than selling. Dropped from BOTH halves of the ratio.
  //
  // Nothing calculates with this. Required Plan, the KPI strip's deficit and
  // every coverage figure stay on winRate3m above.
  const pipeline = worked.filter((d) => !isSameDayOrder(d));
  const pipelineTotal3m = pipeline.length;
  const pipelineWon3m = pipeline.filter((d) => d.stage === 'won').length;
  const pipelineConversion3m = pipelineTotal3m > 0
    ? (pipelineWon3m / pipelineTotal3m) * 100
    : 0;

  return {
    winRate3m, won3m, total3m,
    pipelineConversion3m, pipelineWon3m, pipelineTotal3m,
    // So a screen can say how much history was set aside rather than leaving
    // the drop in the rate unexplained.
    importedExcluded: all.length - worked.length,
  };
}
