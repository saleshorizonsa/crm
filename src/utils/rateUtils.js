import { isImportedDeal } from 'utils/importedDeals';

/**
 * Win rate, loss rate and close rate from a deals array.
 *
 * winRate  = won / (won + lost)  — only meaningful for closed deals
 * lossRate = lost / (won + lost) — winRate + lossRate always = 100%
 * closeRate = (won + lost) / total — pipeline maturity metric
 *
 * Never divides by open deals. Returns 0 (not NaN) when no closed deals exist.
 *
 * IMPORTED HISTORY IS DROPPED FIRST (CEO decision, 2026-10-05, see
 * utils/importedDeals.js): loaded-in invoices are all won and never lost, so
 * they pushed all three of these rates towards 100%. The caller must have
 * selected invoice_number — and is_imported once the migration is applied — or
 * every row looks like one somebody worked.
 */
export function calculateRates(allDeals = []) {
  const deals  = (allDeals || []).filter(d => !isImportedDeal(d));
  const won    = deals.filter(d => d.stage === 'won').length;
  const lost   = deals.filter(d => d.stage === 'lost').length;
  const closed = won + lost;
  const total  = deals.length;

  return {
    winRate:   closed > 0 ? Math.round(won   / closed * 100) : 0,
    lossRate:  closed > 0 ? Math.round(lost  / closed * 100) : 0,
    closeRate: total  > 0 ? Math.round(closed / total * 100) : 0,
    won,
    lost,
    closed,
    total,
    // How many rows were set aside, so a screen can explain the difference
    // rather than leaving the drop unaccounted for.
    importedExcluded: (allDeals || []).length - deals.length,
  };
}
