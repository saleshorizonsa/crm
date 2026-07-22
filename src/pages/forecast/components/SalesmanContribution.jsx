import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

// Bar colours for the top ranks, greying out the tail.
const RANK_BAR = ["#2B4A7A", "#7C3AED", "#0D9488"];
const RANK_AVATAR = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-teal-100 text-teal-700",
];

/**
 * SalesmanContribution
 *
 * Props:
 *   contribution — [{ id, name, dealCount, totalValue, weightedValue, pct }]
 *                  pre-sorted by weightedValue desc (see ForecastPage memo).
 *
 * Shows each salesman's share of the weighted open pipeline so a director can
 * spot forecast concentration risk. Renders nothing when there's no data.
 */
const SalesmanContribution = ({ contribution = [] }) => {
  const { formatCurrency } = useCurrency();

  if (!contribution.length) return null;

  const topPct = contribution[0]?.pct || 0;
  const concentrated = topPct > 50;
  const totalWeighted = contribution.reduce((s, r) => s + r.weightedValue, 0);

  return (
    <div className="bg-card rounded-2xl border border-border p-6 enterprise-shadow">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">
            Salesman Forecast Contribution
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Weighted pipeline value per salesman · {contribution.length}{" "}
            salesm{contribution.length === 1 ? "an" : "en"} active
          </p>
        </div>

        {concentrated && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl flex-shrink-0">
            <Icon name="AlertTriangle" size={13} className="text-amber-500 flex-shrink-0" />
            <span className="text-xs text-amber-700 font-medium">
              {topPct.toFixed(0)}% concentrated in one salesman
            </span>
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="space-y-3">
        {contribution.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-3">
            {/* Rank */}
            <span className="text-xs font-bold text-muted-foreground w-4 flex-shrink-0">
              #{idx + 1}
            </span>

            {/* Avatar */}
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                RANK_AVATAR[idx] || "bg-gray-100 text-gray-600"
              }`}
            >
              {s.name?.charAt(0).toUpperCase() || "?"}
            </div>

            {/* Name + deal count */}
            <div className="w-36 flex-shrink-0 min-w-0">
              <p className="text-sm font-medium text-card-foreground truncate">
                {s.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.dealCount} deal{s.dealCount !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Progress bar */}
            <div className="flex-1">
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(s.pct, 100)}%`,
                    background: RANK_BAR[idx] || "#94A3B8",
                  }}
                />
              </div>
            </div>

            {/* Percentage */}
            <span className="text-sm font-semibold text-card-foreground tabular-nums w-12 text-right flex-shrink-0">
              {s.pct.toFixed(1)}%
            </span>

            {/* Weighted value */}
            <span className="text-xs text-muted-foreground tabular-nums w-24 text-right flex-shrink-0 hidden sm:block">
              {formatCurrency(s.weightedValue)}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${concentrated ? "bg-amber-500" : "bg-green-500"}`}
          />
          <span
            className={`text-xs font-medium ${concentrated ? "text-amber-600" : "text-green-600"}`}
          >
            {concentrated
              ? "Forecast risk — concentrated pipeline"
              : "Healthy distribution — no single salesman above 50%"}
          </span>
        </div>

        <span className="text-xs font-medium text-muted-foreground tabular-nums flex-shrink-0">
          Total: {formatCurrency(totalWeighted)}
        </span>
      </div>
    </div>
  );
};

export default SalesmanContribution;
