import React, { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import Icon from "../../../components/AppIcon";
import Image from "../../../components/AppImage";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";
import { capitalize } from "utils/helper";

const TeamPerformance = ({ teamData = [], data = [], isLoading = false }) => {
  const { formatCurrency } = useCurrency();
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState("overview"); // overview, comparison, individual

  const COLORS = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload?.length) {
      const data = payload?.[0]?.payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-1">
            {data?.name}
          </p>
          {data?.value !== undefined && (
            <p className="text-sm text-gray-600">
              {t("dashboard.contribution")}: {data?.value}%
            </p>
          )}
          {data?.amount !== undefined && (
            <p className="text-sm text-green-600 font-medium">
              {formatCurrency(data?.amount || 0)}
            </p>
          )}
          {data?.deals !== undefined && (
            <p className="text-sm text-gray-600">
              {t("deals.title")}: {data?.deals}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const getPerformanceColor = (performance) => {
    if (performance >= 90) return "text-success";
    if (performance >= 70) return "text-warning";
    return "text-error";
  };

  const getPerformanceIcon = (performance) => {
    if (performance >= 90) return "TrendingUp";
    if (performance >= 70) return "Minus";
    return "TrendingDown";
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg p-6">
        <div className="w-32 h-6 bg-gray-200 rounded animate-pulse mb-4"></div>
        <div className="flex items-center justify-center h-48 mb-4">
          <div className="w-32 h-32 bg-gray-200 rounded-full animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[...Array(4)]?.map((_, index) => (
            <div key={index} className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="flex-1 space-y-2">
                <div className="w-3/4 h-4 bg-gray-200 rounded animate-pulse"></div>
                <div className="w-1/2 h-3 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Use either teamData or data prop
  const performanceData = teamData?.length > 0 ? teamData : data || [];

  // Prepare chart data from team performance
  const totalSales = performanceData?.reduce(
    (sum, member) => sum + (member?.wonAmount || member?.total || 0),
    0
  );

  const chartData = performanceData?.map((member, index) => ({
    name: member?.name || member?.full_name || "Unknown",
    value:
      totalSales > 0
        ? Math.round(
            ((member?.wonAmount || member?.total || 0) / totalSales) * 100
          )
        : 0,
    amount: member?.wonAmount || member?.total || 0,
    deals: member?.deals || member?.wonDeals || 0,
    winRate: member?.winRate || 0,
    color: COLORS?.[index % COLORS?.length],
  }));

  // Prepare comparison data for bar chart
  const comparisonData = performanceData?.map((member) => ({
    name: (member?.name || member?.full_name || "Unknown").split(" ")[0],
    Won: member?.wonDeals || member?.deals || 0,
    Active: member?.activeDeals || 0,
    Lost: member?.lostDeals || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {t("dashboard.teamPerformance")}
        </h3>
        <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode("overview")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "overview"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t("dashboard.overview")}
          </button>
          <button
            onClick={() => setViewMode("comparison")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "comparison"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t("dashboard.compare")}
          </button>
        </div>
      </div>

      {performanceData?.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Icon name="Users" size={48} className="text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {t("dashboard.noTeamPerformanceData")}
          </p>
        </div>
      ) : (
        <>
          {/* Overview Mode */}
          {viewMode === "overview" && (
            <div className="space-y-6">
              {/* Performance Donut Chart */}
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, value }) =>
                        value > 5 ? `${value}%` : ""
                      }
                    >
                      {chartData?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry?.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Team Members List */}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 sticky top-0 bg-white z-10 pb-2">
                  {t("dashboard.teamMembers")}
                </h4>
                {performanceData
                  ?.sort(
                    (a, b) =>
                      (b?.wonAmount || b?.total || 0) -
                      (a?.wonAmount || a?.total || 0)
                  )
                  ?.map((member, index) => {
                    const chartItem = chartData?.find(
                      (c) => c.name === (member?.name || member?.full_name)
                    );
                    return (
                      <div
                        key={member?.id || index}
                        className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                              {member?.avatar || member?.avatar_url ? (
                                <Image
                                  src={member?.avatar || member?.avatar_url}
                                  alt={member?.name || member?.full_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Icon
                                  name="User"
                                  size={20}
                                  className="text-gray-400"
                                />
                              )}
                            </div>
                            <div
                              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                              style={{ backgroundColor: chartItem?.color }}
                            ></div>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {member?.name ||
                                member?.full_name ||
                                t("common.unknown")}
                            </p>
                            <p className="text-xs text-gray-500">
                              {member?.role
                                ? capitalize(member.role)
                                : t("roles.salesRep")}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(
                                member?.wonAmount || member?.total || 0
                              )}
                            </p>
                            <p className="text-xs text-gray-500">
                              {member?.deals || member?.wonDeals || 0}{" "}
                              {t("deals.dealsWon")}
                            </p>
                          </div>
                          <div className="text-right min-w-[60px]">
                            <div
                              className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                                (member?.winRate || 0) >= 70
                                  ? "bg-green-100 text-green-700"
                                  : (member?.winRate || 0) >= 50
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              <Icon
                                name={
                                  (member?.winRate || 0) >= 70
                                    ? "TrendingUp"
                                    : (member?.winRate || 0) >= 50
                                    ? "Minus"
                                    : "TrendingDown"
                                }
                                size={12}
                              />
                              <span>{member?.winRate || 0}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Comparison Mode */}
          {viewMode === "comparison" && comparisonData?.length > 0 && (
            <div className="w-full h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={comparisonData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "0.5rem",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Won" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Active" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TeamPerformance;
