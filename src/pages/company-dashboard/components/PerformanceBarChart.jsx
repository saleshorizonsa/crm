import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";

const PerformanceBarChart = ({
  dealsData = [],
  targetsData = [],
  timePeriod = "month", // month, quarter, year
  year = new Date().getFullYear(),
  isLoading = false,
  totalSalesmen = 1,
  showAvg = true,
  employees = [],
}) => {
  const { formatCurrency, convertCurrency, preferredCurrency } = useCurrency();
  const { t } = useLanguage();

  // Default open so the director sees the breakdown on load
  const [showBreakdown, setShowBreakdown] = useState(true);

  // Active salesmen only (matches the totalSalesmen prop derivation)
  const salesmenList = useMemo(
    () =>
      (employees || []).filter(
        (e) => e.role === "salesman" && e.is_active !== false,
      ),
    [employees],
  );

  // Helper to convert deal amount to user's preferred currency
  const getConvertedAmount = (deal) => {
    const amount = parseFloat(deal.amount) || 0;
    const dealCurrency = deal.currency || preferredCurrency;
    if (dealCurrency === preferredCurrency) return amount;
    return convertCurrency(amount, dealCurrency, preferredCurrency);
  };

  // Generate time period labels
  const getTimePeriodLabels = () => {
    if (timePeriod === "month") {
      return [
        { key: "Jan", label: "Jan", month: 0 },
        { key: "Feb", label: "Feb", month: 1 },
        { key: "Mar", label: "Mar", month: 2 },
        { key: "Apr", label: "Apr", month: 3 },
        { key: "May", label: "May", month: 4 },
        { key: "Jun", label: "Jun", month: 5 },
        { key: "Jul", label: "Jul", month: 6 },
        { key: "Aug", label: "Aug", month: 7 },
        { key: "Sep", label: "Sep", month: 8 },
        { key: "Oct", label: "Oct", month: 9 },
        { key: "Nov", label: "Nov", month: 10 },
        { key: "Dec", label: "Dec", month: 11 },
      ];
    } else if (timePeriod === "quarter") {
      return [
        { key: "Q1", label: "Q1", quarters: [0, 1, 2] },
        { key: "Q2", label: "Q2", quarters: [3, 4, 5] },
        { key: "Q3", label: "Q3", quarters: [6, 7, 8] },
        { key: "Q4", label: "Q4", quarters: [9, 10, 11] },
      ];
    } else {
      // Year view - show last 5 years
      const currentYear = new Date().getFullYear();
      return Array.from({ length: 5 }, (_, i) => ({
        key: `${currentYear - 4 + i}`,
        label: `${currentYear - 4 + i}`,
        year: currentYear - 4 + i,
      }));
    }
  };

  // Process data based on time period
  const chartData = useMemo(() => {
    const periods = getTimePeriodLabels();

    return periods.map((period) => {
      let revenue = 0;
      let target = 0;
      let deals = 0;
      // Unique salesmen who won a deal in THIS period — used as the avg divisor
      const activeOwners = new Set();

      // Calculate revenue from deals
      dealsData.forEach((deal) => {
        const dealDate = new Date(deal.closed_at || deal.created_at);
        const dealYear = dealDate.getFullYear();
        const dealMonth = dealDate.getMonth();

        const countDeal = () => {
          revenue += getConvertedAmount(deal);
          deals += 1;
          if (deal.owner_id) activeOwners.add(deal.owner_id);
        };

        if (
          timePeriod === "month" &&
          dealYear === year &&
          dealMonth === period.month
        ) {
          if (deal.stage === "won") {
            countDeal();
          }
        } else if (
          timePeriod === "quarter" &&
          dealYear === year &&
          period.quarters.includes(dealMonth)
        ) {
          if (deal.stage === "won") {
            countDeal();
          }
        } else if (timePeriod === "year" && dealYear === period.year) {
          if (deal.stage === "won") {
            countDeal();
          }
        }
      });

      // Calculate targets - only consider monthly targets
      targetsData
        .filter((t) => (t.period_type || "monthly") === "monthly")
        .forEach((t) => {
          const targetStart = new Date(t.period_start);
          const targetYear = targetStart.getFullYear();
          const targetMonth = targetStart.getMonth();

          if (
            timePeriod === "month" &&
            targetYear === year &&
            targetMonth === period.month
          ) {
            target += parseFloat(t.target_amount) || 0;
          } else if (
            timePeriod === "quarter" &&
            targetYear === year &&
            period.quarters.includes(targetMonth)
          ) {
            target += parseFloat(t.target_amount) || 0;
          } else if (timePeriod === "year" && targetYear === period.year) {
            target += parseFloat(t.target_amount) || 0;
          }
        });

      return {
        name: period.label,
        revenue,
        target,
        deals,
        // Avg for THIS period based on who was actually active that period
        avg: activeOwners.size > 0 ? revenue / activeOwners.size : 0,
        achievement: target > 0 ? Math.round((revenue / target) * 100) : 0,
      };
    });
  }, [dealsData, targetsData, timePeriod, year]);

  // Per-salesman revenue breakdown for the displayed range.
  // Includes every active salesman (zeros for non-performers) and counts
  // only the salesmen who actually won a deal as "active".
  const { salesmenBreakdown, activeSalesmenCount } = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const inRange = (deal) => {
      const dealDate = new Date(deal.closed_at || deal.created_at);
      const dealYear = dealDate.getFullYear();
      if (timePeriod === "year") {
        return dealYear >= currentYear - 4 && dealYear <= currentYear;
      }
      return dealYear === year;
    };

    const revenueMap = {};
    const dealCountMap = {};
    const activeIds = new Set();

    dealsData.forEach((deal) => {
      if (deal.stage !== "won" || !deal.owner_id || !inRange(deal)) return;
      const val = getConvertedAmount(deal);
      revenueMap[deal.owner_id] = (revenueMap[deal.owner_id] || 0) + val;
      dealCountMap[deal.owner_id] = (dealCountMap[deal.owner_id] || 0) + 1;
      activeIds.add(deal.owner_id);
    });

    const breakdown = salesmenList
      .map((s) => ({
        id: s.id,
        name: s.full_name || s.email,
        revenue: revenueMap[s.id] || 0,
        dealCount: dealCountMap[s.id] || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return { salesmenBreakdown: breakdown, activeSalesmenCount: activeIds.size };
  }, [dealsData, salesmenList, timePeriod, year, preferredCurrency]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);
    const totalTarget = chartData.reduce((sum, d) => sum + d.target, 0);
    const totalDeals = chartData.reduce((sum, d) => sum + d.deals, 0);
    const avgAchievement =
      totalTarget > 0 ? Math.round((totalRevenue / totalTarget) * 100) : 0;
    const remainingRevenue = Math.max(0, totalTarget - totalRevenue);
    // Avg is over salesmen who actually won a deal, not the whole headcount
    const avgPerSalesman =
      activeSalesmenCount > 0 ? totalRevenue / activeSalesmenCount : 0;
    const proRatedTargetPerSalesman =
      activeSalesmenCount > 0 ? totalTarget / activeSalesmenCount : 0;
    const avgSalesmanAchievement =
      proRatedTargetPerSalesman > 0
        ? (avgPerSalesman / proRatedTargetPerSalesman) * 100
        : 0;

    return {
      totalRevenue,
      totalTarget,
      totalDeals,
      avgAchievement,
      remainingRevenue,
      avgPerSalesman,
      avgSalesmanAchievement,
    };
  }, [chartData, activeSalesmenCount]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-sm text-green-600">
              <span className="font-medium">Revenue:</span>{" "}
              {formatCurrency(data.revenue)}
            </p>
            <p className="text-sm text-blue-600">
              <span className="font-medium">Target:</span>{" "}
              {formatCurrency(data.target)}
            </p>
            {showAvg && (
              <p className="text-sm text-teal-600">
                <span className="font-medium">Avg / Salesman:</span>{" "}
                {formatCurrency(data.avg || 0)}
              </p>
            )}
            <p className="text-sm text-purple-600">
              <span className="font-medium">Deals Won:</span> {data.deals}
            </p>
            <p className="text-sm text-orange-600">
              <span className="font-medium">Achievement:</span>{" "}
              {data.achievement}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Icon name="BarChart2" size={20} color="white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {t("dashboard.performanceSummary") || "Performance Overview"}
            </h3>
            <p className="text-sm text-gray-500">
              {timePeriod === "month"
                ? `${t("dashboard.monthly") || "Monthly"} ${year}`
                : timePeriod === "quarter"
                  ? `${t("dashboard.quarterly") || "Quarterly"} ${year}`
                  : t("dashboard.yearly") || "Yearly"}{" "}
              {t("dashboard.performance") || "Performance"}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className={`grid ${showAvg ? "grid-cols-5" : "grid-cols-4"} gap-4 mb-6`}>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-xs text-green-600 mb-1">
            {t("dashboard.totalRevenue") || "Total Revenue"}
          </div>
          <div className="text-lg font-bold text-green-700">
            {formatCurrency(summaryStats.totalRevenue)}
          </div>
        </div>
        {showAvg && (
          <div className="bg-teal-50 rounded-lg p-3 text-center">
            <div className="text-xs text-teal-600 mb-1">Avg per Salesman</div>
            <div className="text-lg font-bold text-teal-700">
              {formatCurrency(summaryStats.avgPerSalesman)}
            </div>
            <div className="text-xs text-teal-500 mt-1">
              {activeSalesmenCount} active of {totalSalesmen} salesmen
            </div>
          </div>
        )}
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-xs text-blue-600 mb-1">
            {t("common.target") || "Total Target"}
          </div>
          <div className="text-lg font-bold text-blue-700">
            {formatCurrency(summaryStats.totalTarget)}
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-xs text-purple-600 mb-1">
            {t("dashboard.dealsClosed") || "Deals Won"}
          </div>
          <div className="text-lg font-bold text-purple-700">
            {summaryStats.totalDeals}
          </div>
        </div>
        <div className="bg-red-500 rounded-lg p-3 text-center">
          <div className="text-xs text-white mb-1">{"Remaining Revenue"}</div>
          <div className="text-lg font-bold text-white">
            {formatCurrency(summaryStats.remainingRevenue)}
          </div>
        </div>
      </div>

      {/* Salesman Revenue Breakdown — consolidated view only */}
      {showAvg && salesmenBreakdown.length > 0 && (
        <div className="mb-6">
          {/* Collapsible header */}
          <button
            onClick={() => setShowBreakdown((b) => !b)}
            className="flex items-center justify-between w-full px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors mb-2"
          >
            <div className="flex items-center gap-2">
              <Icon name="Users" size={15} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-900">
                Salesman Revenue Breakdown
              </span>
              <span className="text-xs text-gray-400">
                ({activeSalesmenCount} active · {salesmenBreakdown.length} total)
              </span>
            </div>
            <Icon
              name={showBreakdown ? "ChevronUp" : "ChevronDown"}
              size={15}
              className="text-gray-400"
            />
          </button>

          {showBreakdown && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-400 border-b border-gray-200">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Salesman</div>
                <div className="col-span-2 text-center">Deals</div>
                <div className="col-span-3">Revenue</div>
                <div className="col-span-2 text-right">% of Total</div>
              </div>

              {/* Salesman rows */}
              {salesmenBreakdown.map((s, idx) => {
                const pct =
                  summaryStats.totalRevenue > 0
                    ? (s.revenue / summaryStats.totalRevenue) * 100
                    : 0;
                const isActive = s.revenue > 0;

                return (
                  <div
                    key={s.id}
                    className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-100 last:border-0 items-center transition-colors hover:bg-gray-50 ${
                      !isActive ? "opacity-50" : ""
                    }`}
                  >
                    {/* Rank */}
                    <div className="col-span-1 text-xs font-bold text-gray-400">
                      {isActive ? `#${idx + 1}` : "—"}
                    </div>

                    {/* Name + avatar */}
                    <div className="col-span-4 flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          isActive
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {s.name?.charAt(0).toUpperCase()}
                      </div>
                      <span
                        className={`text-sm truncate ${
                          isActive
                            ? "text-gray-900 font-medium"
                            : "text-gray-400"
                        }`}
                      >
                        {s.name}
                      </span>
                      {!isActive && (
                        <span className="text-xs text-red-400 flex-shrink-0">
                          0 deals
                        </span>
                      )}
                    </div>

                    {/* Deal count */}
                    <div className="col-span-2 text-center">
                      <span
                        className={`text-sm font-medium ${
                          isActive ? "text-gray-900" : "text-gray-400"
                        }`}
                      >
                        {s.dealCount}
                      </span>
                    </div>

                    {/* Revenue + bar */}
                    <div className="col-span-3">
                      <div
                        className="text-sm font-medium tabular-nums mb-1"
                        style={{ color: isActive ? "#0D9488" : "#9CA3AF" }}
                      >
                        {formatCurrency(s.revenue)}
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            background: isActive ? "#0D9488" : "#E5E7EB",
                          }}
                        />
                      </div>
                    </div>

                    {/* % of total */}
                    <div
                      className="col-span-2 text-right text-sm font-medium"
                      style={{
                        color: isActive
                          ? pct >= 20
                            ? "#059669"
                            : pct >= 10
                              ? "#D97706"
                              : "#6B7280"
                          : "#9CA3AF",
                      }}
                    >
                      {isActive ? `${pct.toFixed(1)}%` : "—"}
                    </div>
                  </div>
                );
              })}

              {/* Summary footer */}
              <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-t-2 border-gray-200 text-sm font-semibold">
                <div className="col-span-1"></div>
                <div className="col-span-4 text-gray-900">Total</div>
                <div className="col-span-2 text-center text-gray-900">
                  {salesmenBreakdown.reduce((sum, r) => sum + r.dealCount, 0)}
                </div>
                <div className="col-span-3 tabular-nums" style={{ color: "#0D9488" }}>
                  {formatCurrency(summaryStats.totalRevenue)}
                </div>
                <div className="col-span-2 text-right text-gray-900">
                  {summaryStats.totalRevenue > 0 ? "100%" : "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#6b7280" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#6b7280" }}
              tickFormatter={(value) => {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                return value;
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value) => (
                <span className="text-sm text-gray-600">
                  {value === "revenue"
                    ? t("dashboard.totalRevenue") || "Revenue"
                    : value === "target"
                      ? t("common.target") || "Target"
                      : value === "avg"
                        ? "Avg / Salesman"
                        : value}
                </span>
              )}
            />
            <Bar
              dataKey="revenue"
              name="revenue"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="target"
              name="target"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            {showAvg && (
              <Bar
                dataKey="avg"
                name="avg"
                fill="#0D9488"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Achievement Indicator */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {t("dashboard.targetAchievement") || "Overall Achievement"}
          </span>
          <span
            className={`text-sm font-bold ${summaryStats.avgAchievement >= 100 ? "text-green-600" : summaryStats.avgAchievement >= 80 ? "text-orange-600" : "text-red-600"}`}
          >
            {summaryStats.avgAchievement}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              summaryStats.avgAchievement >= 100
                ? "bg-green-500"
                : summaryStats.avgAchievement >= 80
                  ? "bg-orange-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${Math.min(summaryStats.avgAchievement, 100)}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Avg Achievement per Salesman */}
      {showAvg && <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">
            Avg Achievement per Salesman
          </span>
          <span
            className="text-sm font-bold"
            style={{
              color:
                summaryStats.avgSalesmanAchievement >= 100
                  ? "#059669"
                  : summaryStats.avgSalesmanAchievement >= 50
                    ? "#D97706"
                    : "#DC2626",
            }}
          >
            {summaryStats.avgSalesmanAchievement.toFixed(1)}%
          </span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(summaryStats.avgSalesmanAchievement, 100)}%`,
              background: "#0D9488",
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>}
    </div>
  );
};

export default PerformanceBarChart;
