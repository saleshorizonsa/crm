import React from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useAuth } from "../../../contexts/AuthContext";
import { useLanguage } from "../../../i18n";

const ExecutiveMetrics = ({
  metrics,
  selectedCompany,
  timePeriod = "quarter",
  onMetricClick,
}) => {
  const { formatCurrency } = useCurrency();
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Get first name from full name
  const firstName =
    userProfile?.full_name?.split(" ")[0] ||
    userProfile?.email?.split("@")[0] ||
    "";

  // Get period label for display
  const getPeriodLabel = () => {
    switch (timePeriod) {
      case "month":
        return t("dashboard.month").toLowerCase();
      case "year":
        return t("dashboard.year").toLowerCase();
      case "quarter":
      default:
        return t("dashboard.quarter").toLowerCase();
    }
  };

  const periodLabel = getPeriodLabel();

  const formatPercent = (value) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  const getChangeColor = (change) => {
    if (change > 0) return "text-green-600";
    if (change < 0) return "text-red-600";
    return "text-gray-600";
  };

  const getChangeIcon = (change) => {
    if (change > 0) return "TrendingUp";
    if (change < 0) return "TrendingDown";
    return "Minus";
  };

  const handleMetricClick = (metricType) => {
    // For all metrics, open insight modal
    if (onMetricClick) {
      onMetricClick(metricType);
    }
  };

  const metricCards = [
    {
      title: t("dashboard.totalRevenue"),
      value: formatCurrency(metrics.totalRevenue),
      change: metrics.revenueChange,
      icon: "DollarSign",
      color: "bg-green-500",
      metricType: "totalRevenue",
      clickable: true,
    },
    {
      title: t("dashboard.activePipeline"),
      value: formatCurrency(metrics.activePipeline),
      change: metrics.pipelineChange,
      icon: "TrendingUp",
      color: "bg-blue-500",
      metricType: "activePipeline",
      clickable: true,
    },
    {
      title: t("dashboard.winRate"),
      value: formatPercent(metrics.winRate),
      change: metrics.winRateChange,
      icon: "Target",
      color: "bg-purple-500",
      metricType: "winRate",
      clickable: true,
    },
    {
      title: t("reports.teamPerformance"),
      value: metrics.teamPerformance || 0,
      change: metrics.performanceChange,
      icon: "Users",
      color: "bg-orange-500",
      metricType: "teamPerformance",
      clickable: true,
    },
    {
      title: t("dashboard.dealsClosed"),
      value: metrics.dealsWon || 0,
      change: metrics.dealsChange,
      icon: "CheckCircle",
      color: "bg-emerald-500",
      isCount: true,
      metricType: "dealsClosed",
      clickable: true,
    },
    {
      title: t("dashboard.conversionRate"),
      value: formatPercent(metrics.conversionRate),
      change: metrics.conversionChange,
      icon: "Zap",
      color: "bg-yellow-500",
      metricType: "conversionRate",
      clickable: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {t("dashboard.hello")}, {firstName}
          </h2>
        </div>
        <div className="flex items-center space-x-2">
          <div className="text-sm text-gray-500">
            {t("dashboard.lastUpdated")}:
          </div>
          <div className="text-sm font-medium text-gray-900">
            {new Date().toLocaleTimeString()}
          </div>
          <Icon name="RefreshCw" size={16} className="text-gray-400" />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {metricCards.map((metric, index) => (
          <div
            key={index}
            onClick={() =>
              metric.clickable && handleMetricClick(metric.metricType)
            }
            className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all ${
              metric.clickable
                ? "cursor-pointer hover:border-blue-300 hover:ring-1 hover:ring-blue-100"
                : ""
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className={`w-10 h-10 rounded-lg ${metric.color} flex items-center justify-center`}
              >
                <Icon name={metric.icon} size={20} color="white" />
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div
                    className={`flex items-center text-sm ${getChangeColor(
                      metric.change,
                    )}`}
                  >
                    <Icon
                      name={getChangeIcon(metric.change)}
                      size={14}
                      className="mr-1"
                    />
                    {metric.isCount
                      ? Math.abs(metric.change || 0)
                      : formatPercent(Math.abs(metric.change || 0))}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t("dashboard.vsLast")} {periodLabel}
                  </div>
                </div>
                {metric.clickable && (
                  <Icon
                    name="ChevronRight"
                    size={16}
                    className="text-gray-400"
                  />
                )}
              </div>
            </div>

            <div className="mb-2">
              <h3 className="text-sm font-medium text-gray-600 mb-1">
                {metric.title}
              </h3>
              <div className="text-2xl font-bold text-gray-900">
                {metric.value}
              </div>
            </div>

            {/* Progress bar for percentage metrics */}
            {(!metric.isCount &&
              metric.title.includes(t("deals.rate") || "Rate")) ||
            metric.title.includes(
              t("reports.teamPerformance") || "Performance",
            ) ? (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{t("dashboard.target")}: 100%</span>
                  <span>
                    {formatPercent((parseFloat(metric.value) / 100) * 100)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${metric.color} transition-all duration-500`}
                    style={{
                      width: `${Math.min(parseFloat(metric.value) || 0, 100)}%`,
                    }}
                  ></div>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Performance Summary */}
      {/* <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t("dashboard.performanceSummary")}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
            <Icon
              name="Calendar"
              size={32}
              className="mx-auto mb-2 text-green-600"
            />
            <div className="text-2xl font-bold text-green-900">
              {metrics.dealsThisMonth || 0}
            </div>
            <div className="text-sm text-green-700">
              {t("dashboard.dealsThisMonth")}
            </div>
          </div>

          <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
            <Icon
              name="Clock"
              size={32}
              className="mx-auto mb-2 text-purple-600"
            />
            <div className="text-2xl font-bold text-purple-900">
              {metrics.avgDealCycle || 0} {t("time.days")}
            </div>
            <div className="text-sm text-purple-700">
              {t("dashboard.avgDealCycle")}
            </div>
          </div>

          <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
            <Icon
              name="TrendingUp"
              size={32}
              className="mx-auto mb-2 text-orange-600"
            />
            <div className="text-2xl font-bold text-orange-900">
              {formatPercent(metrics.growthRate)}
            </div>
            <div className="text-sm text-orange-700">
              {t("dashboard.growthRate")}
            </div>
          </div>
        </div>
      {/* </div> */}
    </div>
  );
};

export default ExecutiveMetrics;
