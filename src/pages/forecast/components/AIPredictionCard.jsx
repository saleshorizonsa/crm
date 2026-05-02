import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

// ── Confidence arc (SVG semicircle gauge) ─────────────────────────────────────

const ConfidenceGauge = ({ value }) => {
  const R   = 40;
  const cx  = 56;
  const cy  = 56;
  const circumference = Math.PI * R; // half-circle arc

  // The arc goes from 180° (left) to 0° (right) — a top semicircle
  // We use a full circle path clipped to the top half
  const arcLength = (value / 100) * circumference;

  const color =
    value >= 70 ? "#10b981" : // emerald
    value >= 50 ? "#f59e0b" : // amber
                  "#ef4444";  // red

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
          {value}%
        </p>
        <p className="text-xs text-muted-foreground">Confidence</p>
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
    historicalWinRate,
    predictedCloses,
    topDeals,
    narrative,
    attainmentPct,
  } = prediction;

  const attainmentColor =
    attainmentPct === null ? "text-muted-foreground" :
    attainmentPct >= 100   ? "text-emerald-600" :
    attainmentPct >= 75    ? "text-blue-600"    :
    attainmentPct >= 50    ? "text-amber-600"   :
                             "text-red-600";

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
          <Icon name="Sparkles" size={16} className="text-violet-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">AI Prediction</h3>
          <p className="text-xs text-muted-foreground">Statistical forecast model</p>
        </div>
      </div>

      {/* Confidence gauge + predicted revenue */}
      <div className="flex flex-col items-center gap-1">
        <ConfidenceGauge value={confidence} />
        <p className="text-2xl font-bold text-card-foreground tabular-nums mt-1">
          {formatCurrency(predictedRevenue)}
        </p>
        <p className="text-xs text-muted-foreground">Predicted Revenue</p>
        {attainmentPct !== null && (
          <span className={`text-sm font-semibold ${attainmentColor}`}>
            {attainmentPct}% of target
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/40 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-card-foreground tabular-nums">
            {historicalWinRate}%
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Historical Win Rate</p>
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
            Top Opportunities
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
        Predictions use stage weights blended with your historical close rate.
        Actual results may vary.
      </p>
    </div>
  );
};

export default AIPredictionCard;
