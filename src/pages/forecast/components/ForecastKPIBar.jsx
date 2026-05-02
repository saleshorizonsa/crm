import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const CARDS = [
  {
    key:       "committed",
    label:     "Committed",
    subtitle:  "Won deals",
    icon:      "CheckCircle",
    iconBg:    "bg-emerald-100",
    iconColor: "text-emerald-600",
    valColor:  "text-emerald-700",
    border:    "border-l-4 border-l-emerald-500",
  },
  {
    key:       "weighted",
    label:     "Weighted",
    subtitle:  "Probability adjusted",
    icon:      "TrendingUp",
    iconBg:    "bg-blue-100",
    iconColor: "text-blue-600",
    valColor:  "text-blue-700",
    border:    "border-l-4 border-l-blue-500",
  },
  {
    key:       "bestCase",
    label:     "Best Case",
    subtitle:  "All open deals close",
    icon:      "Star",
    iconBg:    "bg-amber-100",
    iconColor: "text-amber-600",
    valColor:  "text-amber-700",
    border:    "border-l-4 border-l-amber-400",
  },
];

const ForecastKPIBar = ({ forecast, targetAmount = 0 }) => {
  const { formatCurrency } = useCurrency();

  const attainmentColor =
    forecast.attainment >= 75 ? "text-emerald-600" :
    forecast.attainment >= 50 ? "text-amber-600"   :
                                "text-red-600";

  const attainmentBarColor =
    forecast.attainment >= 75 ? "bg-emerald-500" :
    forecast.attainment >= 50 ? "bg-amber-500"   :
                                "bg-red-500";

  const gapPositive = forecast.gap > 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {/* Committed / Weighted / Best Case */}
      {CARDS.map((c) => (
        <div
          key={c.key}
          className={`bg-card ${c.border} border border-border rounded-lg p-4 enterprise-shadow`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {c.label}
            </span>
            <span className={`w-7 h-7 rounded-md flex items-center justify-center ${c.iconBg}`}>
              <Icon name={c.icon} size={14} className={c.iconColor} />
            </span>
          </div>
          <p className={`text-xl font-bold tabular-nums ${c.valColor}`}>
            {formatCurrency(forecast[c.key])}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{c.subtitle}</p>
        </div>
      ))}

      {/* Target Attainment */}
      <div className="bg-card border-l-4 border-l-violet-500 border border-border rounded-lg p-4 enterprise-shadow">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Attainment
          </span>
          <span className="w-7 h-7 rounded-md flex items-center justify-center bg-violet-100">
            <Icon name="Percent" size={14} className="text-violet-600" />
          </span>
        </div>
        {targetAmount > 0 ? (
          <>
            <p className={`text-xl font-bold tabular-nums ${attainmentColor}`}>
              {forecast.attainment}%
            </p>
            <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-1.5 rounded-full ${attainmentBarColor} transition-all duration-500`}
                style={{ width: `${Math.min(forecast.attainment, 100)}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground mt-0.5">No target set</p>
          </>
        )}
      </div>

      {/* Gap to Target */}
      <div className={`bg-card border-l-4 ${gapPositive ? "border-l-red-400" : "border-l-emerald-500"} border border-border rounded-lg p-4 enterprise-shadow`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Gap to Target
          </span>
          <span className={`w-7 h-7 rounded-md flex items-center justify-center ${gapPositive ? "bg-red-100" : "bg-emerald-100"}`}>
            <Icon
              name={gapPositive ? "ArrowDownCircle" : "CheckCircle2"}
              size={14}
              className={gapPositive ? "text-red-600" : "text-emerald-600"}
            />
          </span>
        </div>
        {targetAmount > 0 ? (
          <>
            <p className={`text-xl font-bold tabular-nums ${gapPositive ? "text-red-600" : "text-emerald-600"}`}>
              {gapPositive ? formatCurrency(forecast.gap) : "Exceeded"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {gapPositive ? "remaining to target" : `+${formatCurrency(Math.abs(forecast.gap))}`}
            </p>
          </>
        ) : (
          <>
            <p className="text-xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground mt-0.5">No target set</p>
          </>
        )}
      </div>
    </div>
  );
};

export default ForecastKPIBar;
