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

  const {
    amount, achieved, remaining, attainment, assignedBy,
    wonNotInvoiced, monthsInRange,
  } = monthlyTarget;

  // The chip said "Monthly" whatever the selected range, while the target below
  // it sums every month the range covers — so a quarter read as a monthly
  // target three times too big. It now names the period it is actually showing.
  const spanLabel = (monthsInRange || 1) > 1 ? periodLabel : 'Monthly';
  // The bar is capped; the percentage is not. Clamping the number itself is
  // what made every over-performing month read a flat 100%.
  const barWidth = Math.min(100, Math.max(0, attainment));
  const pendingInvoices = wonNotInvoiced || { count: 0, total: 0 };

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
            {spanLabel}
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
          style={{ width: `${barWidth}%` }}
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

      {/* Work that is won but not yet invoiced, so it is NOT in Achieved above.
          Without it, a month showing 0 achieved beside a full funnel looks like
          nothing happened — Mohamed Kamal's October reads 0 achieved with
          790,000 sitting between winning and invoicing. */}
      {pendingInvoices.total > 0 && (
        <p
          data-testid="won-not-invoiced"
          className="text-xs text-text-tertiary mt-3"
        >
          Won, not yet invoiced:{' '}
          <span className="font-medium text-text-primary">
            {formatCurrency(pendingInvoices.total)}
          </span>
          {pendingInvoices.count > 0 && (
            <span>
              {' '}({pendingInvoices.count} {pendingInvoices.count === 1 ? 'deal' : 'deals'})
            </span>
          )}
        </p>
      )}
    </div>
  );
}
