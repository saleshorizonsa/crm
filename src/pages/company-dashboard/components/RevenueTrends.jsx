import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const RevenueTrends = ({ deals = [], isLoading = false }) => {
  const { formatCurrency } = useCurrency();

  const generateTrendsData = () => {
    const now = new Date();
    const months = [];

    // Generate last 6 months of data
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });

      // Filter deals for this month
      const monthDeals = deals.filter((deal) => {
        const dealDate = new Date(deal.created_at);
        return (
          dealDate.getMonth() === date.getMonth() &&
          dealDate.getFullYear() === date.getFullYear()
        );
      });

      const wonDeals = monthDeals.filter((deal) => deal.stage === "won");

      months.push({
        month: monthName,
        revenue: wonDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0),
        pipeline: monthDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0),
        deals: monthDeals.length,
        wonDeals: wonDeals.length,
        conversion:
          monthDeals.length > 0
            ? Math.round((wonDeals.length / monthDeals.length) * 100)
            : 0,
      });
    }

    return months;
  };

  const trendsData = generateTrendsData();

  const totalRevenue = trendsData.reduce(
    (sum, month) => sum + month.revenue,
    0
  );
  const totalDeals = trendsData.reduce((sum, month) => sum + month.deals, 0);
  const avgConversion =
    trendsData.length > 0
      ? Math.round(
          trendsData.reduce((sum, month) => sum + month.conversion, 0) /
            trendsData.length
        )
      : 0;

  // Calculate growth rate
  const lastMonth = trendsData[trendsData.length - 1];
  const previousMonth = trendsData[trendsData.length - 2];
  const growthRate =
    previousMonth?.revenue > 0
      ? Math.round(
          ((lastMonth?.revenue - previousMonth?.revenue) /
            previousMonth?.revenue) *
            100
        )
      : 0;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-enterprise-md">
          <p className="text-sm font-medium text-popover-foreground mb-2">
            {label}
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-success">Revenue:</span>
              <span className="font-medium">
                {formatCurrency(data.revenue)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-primary">Pipeline:</span>
              <span className="font-medium">
                {formatCurrency(data.pipeline)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Deals:</span>
              <span>
                {data.deals} ({data.wonDeals} won)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Conversion:</span>
              <span>{data.conversion}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
        <div className="w-32 h-6 bg-muted rounded skeleton mb-4"></div>
        <div className="w-full h-64 bg-muted rounded skeleton"></div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-card-foreground">
            Revenue Trends
          </h3>
          <p className="text-sm text-muted-foreground">
            6-month performance overview
          </p>
        </div>
        <Icon name="TrendingUp" size={20} className="text-accent" />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-success/10 rounded-lg">
          <div className="text-lg font-bold text-success">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs text-muted-foreground">Total Revenue</div>
        </div>
        <div className="text-center p-3 bg-primary/10 rounded-lg">
          <div className="text-lg font-bold text-primary">{totalDeals}</div>
          <div className="text-xs text-muted-foreground">Total Deals</div>
        </div>
        <div className="text-center p-3 bg-warning/10 rounded-lg">
          <div className="text-lg font-bold text-warning">{avgConversion}%</div>
          <div className="text-xs text-muted-foreground">Avg. Conversion</div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={trendsData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-success)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-success)"
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id="pipelineGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-primary)"
                  stopOpacity={0.2}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-primary)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              className="text-xs fill-muted-foreground"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              className="text-xs fill-muted-foreground"
              tickFormatter={(value) =>
                formatCurrency(value).replace(/\.\d+/, "")
              }
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Pipeline Area */}
            <Area
              type="monotone"
              dataKey="pipeline"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#pipelineGradient)"
              fillOpacity={0.6}
            />

            {/* Revenue Area */}
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-success)"
              strokeWidth={3}
              fill="url(#revenueGradient)"
              fillOpacity={0.8}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Growth Indicator */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center space-x-2 text-sm">
          {growthRate >= 0 ? (
            <>
              <Icon name="TrendingUp" size={16} className="text-success" />
              <span className="text-success font-medium">+{growthRate}%</span>
            </>
          ) : (
            <>
              <Icon name="TrendingDown" size={16} className="text-error" />
              <span className="text-error font-medium">{growthRate}%</span>
            </>
          )}
          <span className="text-muted-foreground">vs. last month</span>
        </div>

        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
          <div className="w-3 h-3 bg-success rounded-sm"></div>
          <span>Revenue</span>
          <div className="w-3 h-3 bg-primary rounded-sm ml-3"></div>
          <span>Pipeline</span>
        </div>
      </div>
    </div>
  );
};

export default RevenueTrends;
