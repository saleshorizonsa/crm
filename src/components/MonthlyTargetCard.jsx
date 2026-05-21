import React from "react";
import { useCurrency } from "../contexts/CurrencyContext";

export default function MonthlyTargetCard({
  monthlyTarget,
  periodLabel,
  loading = false,
}) {
  const { formatCurrency } = useCurrency();

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border-tertiary p-5 animate-pulse">
        <div className="h-4 bg-background-secondary rounded w-32 mb-4" />
        <div className="h-8 bg-background-secondary rounded w-48 mb-3" />
        <div className="h-2 bg-background-secondary rounded w-full mb-2" />
        <div className="h-4 bg-background-secondary rounded w-40" />
      </div>
    );
  }

  if (!monthlyTarget) {
    return (
      <div className="bg-white rounded-xl border border-border-tertiary p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {periodLabel} Target
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">Monthly</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
            Monthly
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <p className="text-sm text-text-tertiary">
            No monthly target assigned
          </p>
          <p className="text-xs text-text-tertiary mt-1">for {periodLabel}</p>
        </div>
      </div>
    );
  }

  const { amount, achieved, remaining, attainment, assignedBy } = monthlyTarget;

  const barColor =
    attainment >= 80 ? "bg-green-500" :
    attainment >= 50 ? "bg-blue-500" :
                       "bg-red-400";

  const pctColor =
    attainment >= 80 ? "text-green-600" :
    attainment >= 50 ? "text-blue-600" :
                       "text-red-600";

  const pctBg =
    attainment >= 80 ? "bg-green-50" :
    attainment >= 50 ? "bg-blue-50" :
                       "bg-red-50";

  return (
    <div className="bg-white rounded-xl border border-border-tertiary p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {periodLabel} Target
          </h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Assigned by {assignedBy}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
            Monthly
          </span>
          <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${pctBg} ${pctColor}`}>
            {attainment}%
          </span>
        </div>
      </div>

      {/* Target amount */}
      <div className="mb-3">
        <p className="text-xs text-text-tertiary mb-1">Target</p>
        <p className="text-2xl font-semibold text-text-primary">
          {formatCurrency(amount)}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-background-secondary rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${attainment}%` }}
        />
      </div>

      {/* Achieved and Remaining */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs text-text-tertiary mb-1">Achieved</p>
          <p className="text-sm font-semibold text-green-600">
            {formatCurrency(achieved)}
          </p>
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-xs text-text-tertiary mb-1">Remaining</p>
          <p className="text-sm font-semibold text-red-600">
            {formatCurrency(remaining)}
          </p>
        </div>
      </div>
    </div>
  );
}
