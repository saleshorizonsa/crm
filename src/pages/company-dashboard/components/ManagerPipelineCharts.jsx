import React from "react";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line,
  LineChart,
} from "recharts";

const ManagerPipelineCharts = ({
  teamData,
  deals,
  salesTargets,
  subordinates,
}) => {
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { t } = useLanguage();

  // Pipeline stage distribution
  const getPipelineStageData = () => {
    const stages = [
      "lead",
      "qualified",
      "proposal",
      "negotiation",
      "won",
      "lost",
    ];
    const stageColors = {
      lead: "#8B5CF6",
      qualified: "#06B6D4",
      proposal: "#F59E0B",
      negotiation: "#EF4444",
      won: "#10B981",
      lost: "#6B7280",
    };

    return stages.map((stage) => {
      const stageDeals = deals?.filter((deal) => deal.stage === stage) || [];
      const totalValue = stageDeals.reduce(
        (sum, deal) => sum + parseFloat(deal.amount || 0),
        0
      );

      return {
        stage: stage.charAt(0).toUpperCase() + stage.slice(1),
        count: stageDeals.length,
        value: totalValue,
        color: stageColors[stage],
      };
    });
  };

  // Team performance comparison
  const getTeamPerformanceData = () => {
    return (
      teamData?.map((member) => ({
        name: member.name.split(" ")[0] || "Unknown",
        deals: member.dealsCount || 0,
        revenue: member.totalValue || 0,
        conversion: parseFloat(member.conversionRate || 0),
        target:
          salesTargets?.find((t) => t.assigned_to === member.id)
            ?.target_amount || 0,
        achieved:
          salesTargets?.find((t) => t.assigned_to === member.id)
            ?.progress_amount || 0,
      })) || []
    );
  };

  // Monthly trend data
  const getMonthlyTrendData = () => {
    // Generate last 6 months data
    const months = [];
    const currentDate = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i,
        1
      );
      const monthName = date.toLocaleDateString("en-US", { month: "short" });

      // Filter deals for this month
      const monthDeals =
        deals?.filter((deal) => {
          const dealDate = new Date(deal.created_at);
          return (
            dealDate.getMonth() === date.getMonth() &&
            dealDate.getFullYear() === date.getFullYear()
          );
        }) || [];

      const wonDeals = monthDeals.filter((deal) => deal.stage === "won");

      months.push({
        month: monthName,
        deals: monthDeals.length,
        revenue: wonDeals.reduce(
          (sum, deal) => sum + parseFloat(deal.amount || 0),
          0
        ),
        conversion:
          monthDeals.length > 0
            ? (wonDeals.length / monthDeals.length) * 100
            : 0,
      });
    }

    return months;
  };

  const pipelineData = getPipelineStageData();
  const teamPerformanceData = getTeamPerformanceData();
  const monthlyTrendData = getMonthlyTrendData();

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}:{" "}
              {["revenue", "target", "achieved"].includes(entry.dataKey)
                ? formatCurrency(entry.value)
                : entry.dataKey === "conversion"
                ? `${entry.value.toFixed(1)}%`
                : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Pipeline Distribution */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t("dashboard.pipelineDistribution")}
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              {t("dashboard.byDealCount")}
            </h4>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pipelineData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="count"
                  label={({ stage, count }) =>
                    count > 0 ? `${stage}: ${count}` : ""
                  }
                >
                  {pipelineData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">{t("pipeline.byValue")}</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name={t("dashboard.revenueCol")} fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Team Performance Comparison */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t("dashboard.teamPerformanceVsTargets")}
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={teamPerformanceData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis
              yAxisId="left"
              tickFormatter={(value) => formatCurrency(value)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar yAxisId="left" dataKey="target" name={t("dashboard.targetLabel")} fill="#E5E7EB" />
            <Bar
              yAxisId="left"
              dataKey="revenue"
              name={t("dashboard.achievedRevenue")}
              fill="#10B981"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conversion"
              name={t("dashboard.conversionRate")}
              stroke="#F59E0B"
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Trend */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t("dashboard.sixMonthTrend")}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={monthlyTrendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis
              yAxisId="left"
              tickFormatter={(value) => formatCurrency(value)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="revenue"
              name={t("dashboard.revenueCol")}
              fill="#3B82F6"
            />
            <Bar
              yAxisId="left"
              dataKey="deals"
              name={t("dashboard.totalDeals")}
              fill="#8B5CF6"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conversion"
              name={t("dashboard.conversionRate")}
              stroke="#EF4444"
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 rounded-lg text-white">
          <h4 className="text-sm font-medium text-indigo-100">
            {t("dashboard.pipelineHealth")}
          </h4>
          <p className="text-2xl font-bold mt-2">
            {pipelineData
              .filter((stage) =>
                ["Lead", "Qualified", "Proposal"].includes(stage.stage)
              )
              .reduce((sum, stage) => sum + stage.count, 0)}
          </p>
          <p className="text-indigo-100 text-sm">{t("dashboard.activeOpportunities")}</p>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 rounded-lg text-white">
          <h4 className="text-sm font-medium text-green-100">{t("dashboard.winRate")}</h4>
          <p className="text-2xl font-bold mt-2">
            {deals?.length > 0
              ? (
                  (deals.filter((d) => d.stage === "won").length /
                    deals.length) *
                  100
                ).toFixed(1)
              : 0}
            %
          </p>
          <p className="text-green-100 text-sm">{t("dashboard.overallConversion")}</p>
        </div>

        <div className="bg-gradient-to-r from-orange-500 to-red-600 p-6 rounded-lg text-white">
          <h4 className="text-sm font-medium text-orange-100">{t("deals.avgDealSize")}</h4>
          <p className="text-2xl font-bold mt-2">
            {formatCurrency(
              deals?.length > 0
                ? deals.reduce(
                    (sum, deal) => sum + parseFloat(deal.amount || 0),
                    0
                  ) / deals.length
                : 0,
              preferredCurrency
            )}
          </p>
          <p className="text-orange-100 text-sm">{t("dashboard.perOpportunity")}</p>
        </div>
      </div>
    </div>
  );
};

export default ManagerPipelineCharts;
