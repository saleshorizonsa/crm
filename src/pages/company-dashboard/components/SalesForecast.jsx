import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const SalesForecast = ({ deals = [], isLoading = false }) => {
  const { formatCurrency } = useCurrency();

  const calculateForecast = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Filter deals expected to close this month and next month
    const thisMonthDeals = deals.filter((deal) => {
      if (!deal.expected_close_date) return false;
      const closeDate = new Date(deal.expected_close_date);
      return (
        closeDate.getMonth() === currentMonth &&
        closeDate.getFullYear() === currentYear
      );
    });

    const nextMonthDeals = deals.filter((deal) => {
      if (!deal.expected_close_date) return false;
      const closeDate = new Date(deal.expected_close_date);
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      return (
        closeDate.getMonth() === nextMonth &&
        closeDate.getFullYear() === nextYear
      );
    });

    // Calculate forecast value (since we removed probability, use stage-based weighting)
    const calculateWeightedValue = (deals) => {
      return deals.reduce((total, deal) => {
        const amount = deal.amount || 0;
        // Stage-based probability weighting
        const stageWeight = {
          lead: 0.1,
          contact_made: 0.25,
          proposal_sent: 0.5,
          negotiation: 0.75,
          won: 1.0,
          lost: 0,
        };
        const weight = stageWeight[deal.stage] || 0.5;
        return total + amount * weight;
      }, 0);
    };

    return {
      thisMonth: {
        deals: thisMonthDeals.length,
        value: calculateWeightedValue(thisMonthDeals),
        totalValue: thisMonthDeals.reduce(
          (sum, deal) => sum + (deal.amount || 0),
          0
        ),
      },
      nextMonth: {
        deals: nextMonthDeals.length,
        value: calculateWeightedValue(nextMonthDeals),
        totalValue: nextMonthDeals.reduce(
          (sum, deal) => sum + (deal.amount || 0),
          0
        ),
      },
    };
  };

  const forecast = calculateForecast();

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
        <div className="w-32 h-6 bg-muted rounded skeleton mb-4"></div>
        <div className="space-y-4">
          <div className="w-full h-16 bg-muted rounded skeleton"></div>
          <div className="w-full h-16 bg-muted rounded skeleton"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-card-foreground">
          Sales Forecast
        </h3>
        <Icon name="TrendingUp" size={20} className="text-accent" />
      </div>

      <div className="space-y-6">
        {/* This Month */}
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-card-foreground">
              This Month
            </h4>
            <span className="text-xs text-muted-foreground">
              {forecast.thisMonth.deals} deals
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Weighted Forecast
              </span>
              <span className="text-sm font-semibold text-success">
                {formatCurrency(forecast.thisMonth.value)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Total Pipeline
              </span>
              <span className="text-sm text-card-foreground">
                {formatCurrency(forecast.thisMonth.totalValue)}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Confidence</span>
              <span>
                {forecast.thisMonth.totalValue > 0
                  ? Math.round(
                      (forecast.thisMonth.value /
                        forecast.thisMonth.totalValue) *
                        100
                    )
                  : 0}
                %
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-success rounded-full h-2 transition-all"
                style={{
                  width: `${
                    forecast.thisMonth.totalValue > 0
                      ? (forecast.thisMonth.value /
                          forecast.thisMonth.totalValue) *
                        100
                      : 0
                  }%`,
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Next Month */}
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-card-foreground">
              Next Month
            </h4>
            <span className="text-xs text-muted-foreground">
              {forecast.nextMonth.deals} deals
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Weighted Forecast
              </span>
              <span className="text-sm font-semibold text-primary">
                {formatCurrency(forecast.nextMonth.value)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Total Pipeline
              </span>
              <span className="text-sm text-card-foreground">
                {formatCurrency(forecast.nextMonth.totalValue)}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Confidence</span>
              <span>
                {forecast.nextMonth.totalValue > 0
                  ? Math.round(
                      (forecast.nextMonth.value /
                        forecast.nextMonth.totalValue) *
                        100
                    )
                  : 0}
                %
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary rounded-full h-2 transition-all"
                style={{
                  width: `${
                    forecast.nextMonth.totalValue > 0
                      ? (forecast.nextMonth.value /
                          forecast.nextMonth.totalValue) *
                        100
                      : 0
                  }%`,
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Growth Indicator */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-center space-x-2 text-sm">
          {forecast.nextMonth.value > forecast.thisMonth.value ? (
            <>
              <Icon name="TrendingUp" size={16} className="text-success" />
              <span className="text-success">
                +
                {Math.round(
                  ((forecast.nextMonth.value - forecast.thisMonth.value) /
                    forecast.thisMonth.value) *
                    100
                ) || 0}
                % growth expected
              </span>
            </>
          ) : (
            <>
              <Icon name="TrendingDown" size={16} className="text-warning" />
              <span className="text-warning">
                {Math.round(
                  ((forecast.nextMonth.value - forecast.thisMonth.value) /
                    forecast.thisMonth.value) *
                    100
                ) || 0}
                % decline expected
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesForecast;
