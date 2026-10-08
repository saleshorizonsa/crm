import React, { useCallback, useMemo } from "react";
import SalesTargetTable from "components/SalesTargetTable";
import ProductTargetReport from "components/ProductTargetReport";
import { useCurrency } from "contexts/CurrencyContext";
import { achievedAmount } from "utils/planningCalculations";
import { useOwnTargets } from "hooks/useOwnTargets";

/**
 * THE "TARGETS" SECTION OF INSIGHTS — the two tables that answer "how am I
 * doing against what I was given?", for the viewer's own scope.
 *
 * Both tables and all three progress rules are the Dashboard's; the wiring is
 * hooks/useOwnTargets.js, shared so this screen cannot assemble them
 * differently. Nothing is computed here.
 *
 * Deal values are converted to the currency the page is showing, exactly as the
 * dashboards do: the RULE (final_amount ?? amount, over achievers, net of
 * credit notes) is untouched; only the presentation currency moves.
 */
export default function InsightsTargets({
  companyId, role, scopeIds = [], users = [], deals = [], range,
}) {
  const { formatCurrency, preferredCurrency, convertCurrency } = useCurrency();

  const amountOf = useCallback((deal) => {
    const amount = achievedAmount(deal);
    const dealCurrency = deal.currency || preferredCurrency;
    if (dealCurrency === preferredCurrency) return amount;
    return convertCurrency(amount, dealCurrency, preferredCurrency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredCurrency]);

  const people = useMemo(
    () => (users || []).filter((u) => scopeIds.includes(u.id)),
    [users, scopeIds],
  );

  const { targetRows, totalAchievedFor, productTargets, loading, error } = useOwnTargets({
    companyId,
    ownerIds: scopeIds,
    people,
    deals,
    range,
    amountOf,
  });

  const isTeam = role === "supervisor" || role === "manager";

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center" data-testid="insights-targets">
        <p className="text-sm font-semibold text-red-700 mb-1">Targets could not load</p>
        <p className="text-xs text-gray-500 font-mono">{error}</p>
      </div>
    );
  }

  return (
    <section className="space-y-6" data-testid="insights-targets">
      {loading && (
        <p className="text-xs text-gray-500">Loading targets…</p>
      )}

      {!loading && targetRows.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500">
            No targets cover this period.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            A target is shown here while the period it runs over overlaps the one
            selected above.
          </p>
        </div>
      )}

      {targetRows.length > 0 && (
        <SalesTargetTable
          title={isTeam ? "Team targets" : "Your assigned targets"}
          targets={targetRows}
          role={role}
          totalAchievedFor={totalAchievedFor}
        />
      )}

      {productTargets.length > 0 && (
        <ProductTargetReport
          title="Product-wise target vs achieved"
          productTargets={productTargets}
          formatCurrency={formatCurrency}
          showUser={isTeam}
          showPeriod
        />
      )}
    </section>
  );
}
