import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

// ── Win-rate arc (SVG semicircle gauge) ───────────────────────────────────────

const WinRateGauge = ({ value }) => {
  const R   = 40;
  const cx  = 56;
  const cy  = 56;
  const circumference = Math.PI * R; // half-circle arc

  // The arc goes from 180° (left) to 0° (right) — a top semicircle
  // We use a full circle path clipped to the top half
  const arcLength = (value / 100) * circumference;

  // Win-rate bands, matching the Win Rate insight in forecastInsights.js.
  // (The old 70/50 confidence bands would paint every realistic win rate red.)
  const color =
    value >= 40 ? "#10b981" : // emerald — strong close performance
    value >= 25 ? "#f59e0b" : // amber   — around industry average
                  "#ef4444";  // red     — below average

  return (
    <div className="flex flex-col items-center">
      <svg width="112" height="64" viewBox="0 0 112 64" fill="none" aria-hidden>
        {/* Track */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="-mt-4 text-center">
        <p className="text-2xl font-bold tabular-nums" style={{ color }}>
          {value.toFixed(1)}%
        </p>
        <p className="text-xs text-muted-foreground">Win Rate</p>
      </div>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const AIPredictionCard = ({ prediction }) => {
  const { formatCurrency } = useCurrency();

  if (!prediction) return null;

  const {
    predictedRevenue,
    confidence,
    winRateBasis = "none",
    predictedCloses,
    topDeals,
    narrative,
    attainmentPct,
    targetAmount = 0,
    openDealsCount = 0,
    expectedFromPipeline = 0,
  } = prediction;

  const attainmentColor =
    attainmentPct === null ? "text-muted-foreground" :
    attainmentPct >= 100   ? "text-emerald-600" :
    attainmentPct >= 75    ? "text-blue-600"    :
    attainmentPct >= 50    ? "text-amber-600"   :
                             "text-red-600";

  // Says where the number came from instead of grading it. The old label put a
  // subjective read ("Moderate confidence") on a score that measured nothing.
  // "Company Avg" is the borrowed floor for a scope with no record of its own.
  const winRateLabel = {
    own:     "3-Month Average",
    company: "Company Avg Win Rate",
    period:  "Selected period only",
    none:    "No history available",
  }[winRateBasis];

  // Whether the predicted revenue clears the (summed) target
  const aboveTarget = targetAmount > 0 && predictedRevenue >= targetAmount;
  const targetDelta = Math.abs(predictedRevenue - targetAmount);

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
          <Icon name="Sparkles" size={16} className="text-violet-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">AI Prediction</h3>
          <p className="text-xs text-muted-foreground">
            Based on {openDealsCount} open deal{openDealsCount !== 1 ? "s" : ""} · historical win rates
          </p>
        </div>
      </div>

      {/* Win-rate gauge + predicted revenue */}
      <div className="flex flex-col items-center gap-1">
        <WinRateGauge value={confidence} />
        <p className="text-xs text-muted-foreground -mt-1 mb-1">{winRateLabel}</p>
        <p className="text-2xl font-bold text-card-foreground tabular-nums mt-1">
          {formatCurrency(predictedRevenue)}
        </p>
        <p className="text-xs text-muted-foreground">Predicted Revenue</p>
        {attainmentPct !== null && (
          <span className={`text-sm font-semibold ${attainmentColor}`}>
            {attainmentPct}% of target
          </span>
        )}
        {targetAmount > 0 && (
          <span
            className="text-xs font-medium mt-0.5"
            style={{ color: aboveTarget ? "#059669" : "#DC2626" }}
          >
            {aboveTarget
              ? `✓ Above target by ${formatCurrency(targetDelta)}`
              : `${formatCurrency(targetDelta)} below target`}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        {/* The win rate now drives the gauge above, so this tile shows the
            revenue that rate implies rather than repeating the same number. */}
        <div className="bg-muted/40 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-card-foreground tabular-nums">
            {formatCurrency(expectedFromPipeline)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Expected from Pipeline</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-card-foreground tabular-nums">
            {predictedCloses}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Predicted Closes</p>
        </div>
      </div>

      {/* Narrative */}
      <div className="p-3 rounded-lg bg-violet-50 border border-violet-100">
        <div className="flex items-start gap-2">
          <Icon name="MessageSquare" size={14} className="text-violet-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-violet-900 leading-relaxed">{narrative}</p>
        </div>
      </div>

      {/* Top deals */}
      {topDeals.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
            Top Deals
          </p>
          <div className="space-y-2">
            {topDeals.map((deal, i) => (
              <div
                key={deal.id ?? i}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-card-foreground truncate">
                      {deal.title || deal.name || `Deal #${deal.id?.slice?.(0, 6)}`}
                    </p>
                    {deal.company_name && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {deal.company_name}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-semibold tabular-nums text-card-foreground flex-shrink-0">
                  {formatCurrency(deal.amount || 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed">
        Win rate is measured from deals created in the last 3 completed months.
        Predictions blend it with stage weights. Actual results may vary.
      </p>
    </div>
  );
};

export default AIPredictionCard;
