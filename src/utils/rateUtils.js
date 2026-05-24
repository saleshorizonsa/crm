/**
 * Calculates win rate, loss rate, and close rate from a deals array.
 *
 * winRate  = won / (won + lost)  — only meaningful for closed deals
 * lossRate = lost / (won + lost) — winRate + lossRate always = 100%
 * closeRate = (won + lost) / total — pipeline maturity metric
 *
 * Never divides by open deals. Returns 0 (not NaN) when no closed deals exist.
 */
export function calculateRates(deals = []) {
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
  };
}
