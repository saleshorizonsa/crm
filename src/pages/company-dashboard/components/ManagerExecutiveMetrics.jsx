import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useAuth } from "../../../contexts/AuthContext";
import { companyService } from "../../../services/supabaseService";

const ManagerExecutiveMetrics = ({
  metrics,
  teamData,
  salesTargets,
  subordinates,
  deals,
  onAssignTarget,
  onViewPerformance,
}) => {
  const { formatCurrency } = useCurrency();
  const { company, userProfile } = useAuth();
  const [trendData, setTrendData] = useState({
    revenueChange: 0,
    dealsChange: 0,
    winRateChange: 0,
    conversionChange: 0,
  });

  useEffect(() => {
    if (company?.id && userProfile?.id) {
      loadTrendData();
    }
  }, [company, userProfile, deals]);

  const loadTrendData = async () => {
    try {
      const [revenueResult, dealsResult, winRateResult] = await Promise.all([
        companyService.calculateTrendChange(company.id, null, "revenue", 30),
        companyService.calculateTrendChange(company.id, null, "deals", 30),
        companyService.calculateTrendChange(company.id, null, "winRate", 30),
      ]);

      setTrendData({
        revenueChange: revenueResult.change || 0,
        dealsChange: dealsResult.change || 0,
        winRateChange: winRateResult.change || 0,
        conversionChange: winRateResult.change || 0,
      });
    } catch (error) {
      console.error("Error loading trend data:", error);
    }
  };

  const formatPercent = (value) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  const getChangeColor = (change) => {
    if (change > 0) return "text-green-600";
    if (change < 0) return "text-red-600";
    return "text-gray-600";
  };

  const getChangeIcon = (change) => {
    if (change > 0) return "trending-up";
    if (change < 0) return "trending-down";
    return "minus";
  };

  const calculateManagerMetrics = () => {
    // Team revenue calculation
    const totalTeamRevenue =
      teamData?.reduce((sum, member) => sum + (member.totalValue || 0), 0) || 0;

    // Pipeline calculations
    const activeDeals =
      deals?.filter((deal) => !["won", "lost"].includes(deal.stage)) || [];

    const activePipeline = activeDeals.reduce(
      (sum, deal) => sum + parseFloat(deal.amount || 0),
      0
    );

    const wonDeals = deals?.filter((deal) => deal.stage === "won") || [];
    const winRate =
      deals?.length > 0 ? (wonDeals.length / deals.length) * 100 : 0;

    // Team performance
    const avgTeamConversion =
      teamData?.length > 0
        ? teamData.reduce(
            (sum, member) => sum + parseFloat(member.conversionRate || 0),
            0
          ) / teamData.length
        : 0;

    // Target metrics
    const totalTargetAmount =
      salesTargets?.reduce(
        (sum, target) => sum + parseFloat(target.target_amount || 0),
        0
      ) || 0;

    const totalProgressAmount =
      salesTargets?.reduce(
        (sum, target) => sum + parseFloat(target.progress_amount || 0),
        0
      ) || 0;

    const targetAchievement =
      totalTargetAmount > 0
        ? (totalProgressAmount / totalTargetAmount) * 100
        : 0;

    // Calculate performance change based on target achievement
    const performanceChange =
      targetAchievement > 70
        ? Math.abs(trendData.revenueChange)
        : -Math.abs(trendData.revenueChange);

    return {
      totalRevenue: totalTeamRevenue,
      revenueChange: trendData.revenueChange,
      activePipeline,
      pipelineChange: trendData.revenueChange * 1.5, // Pipeline typically changes faster
      winRate,
      winRateChange: trendData.winRateChange,
      teamPerformance: avgTeamConversion,
      performanceChange,
      dealsWon: wonDeals.length,
      dealsChange: trendData.dealsChange,
      conversionRate: avgTeamConversion,
      conversionChange: trendData.conversionChange,
      targetAchievement,
      teamSize: subordinates?.length || 0,
    };
  };

  const managerMetrics = calculateManagerMetrics();

  const metricCards = [
    {
      title: "Team Revenue",
      value: formatCurrency(managerMetrics.totalRevenue),
      change: managerMetrics.revenueChange,
      icon: "dollar-sign",
      color: "bg-green-500",
    },
    {
      title: "Active Pipeline",
      value: formatCurrency(managerMetrics.activePipeline),
      change: managerMetrics.pipelineChange,
      icon: "trending-up",
      color: "bg-blue-500",
    },
    {
      title: "Team Win Rate",
      value: formatPercent(managerMetrics.winRate),
      change: managerMetrics.winRateChange,
      icon: "target",
      color: "bg-purple-500",
    },
    {
      title: "Target Achievement",
      value: formatPercent(managerMetrics.targetAchievement),
      change: managerMetrics.performanceChange,
      icon: "users",
      color: "bg-orange-500",
    },
  ];

  // Performance alerts matching Director Dashboard style
  const getPerformanceAlerts = () => {
    const alerts = [];

    if (managerMetrics.targetAchievement < 70 && salesTargets?.length > 0) {
      alerts.push({
        type: "warning",
        title: "Team Target Performance Below Expected",
        description: `Only ${managerMetrics.targetAchievement.toFixed(
          1
        )}% of team targets achieved`,
        action: () => onViewPerformance("targets"),
        actionLabel: "Review Targets",
      });
    }

    const membersWithoutTargets =
      subordinates?.filter(
        (member) =>
          !salesTargets?.some((target) => target.assigned_to === member.id)
      ) || [];

    if (membersWithoutTargets.length > 0) {
      alerts.push({
        type: "info",
        title: "Unassigned Sales Targets",
        description: `${membersWithoutTargets.length} team member(s) need sales targets`,
        action: () => onAssignTarget(),
        actionLabel: "Assign Targets",
      });
    }

    const lowPerformers =
      teamData?.filter(
        (member) =>
          !member.isManager && parseFloat(member.conversionRate || 0) < 15
      ) || [];

    if (lowPerformers.length > 0) {
      alerts.push({
        type: "warning",
        title: "Low Performance Alert",
        description: `${lowPerformers.length} team member(s) have conversion rates below 15%`,
        action: () => onViewPerformance("low-performers"),
        actionLabel: "View Team",
      });
    }

    return alerts;
  };

  const alerts = getPerformanceAlerts();

  return (
    <div className="space-y-6">
      {/* Executive Metrics Cards - matching Director Dashboard style */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricCards.map((card, index) => (
          <div
            key={index}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className={`${card.color} p-3 rounded-lg mr-4`}>
                  <Icon name={card.icon} className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {card.value}
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <Icon
                  name={getChangeIcon(card.change)}
                  className={`w-4 h-4 mr-1 ${getChangeColor(card.change)}`}
                />
                <span
                  className={`text-sm font-medium ${getChangeColor(
                    card.change
                  )}`}
                >
                  {Math.abs(card.change).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Team Size</p>
              <p className="text-3xl font-bold text-gray-900">
                {managerMetrics.teamSize}
              </p>
              <p className="text-sm text-gray-500">Active team members</p>
            </div>
            <div className="bg-indigo-500 p-3 rounded-lg">
              <Icon name="users" className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Deals Won</p>
              <p className="text-3xl font-bold text-gray-900">
                {managerMetrics.dealsWon}
              </p>
              <p className="text-sm text-green-600">
                +{managerMetrics.dealsChange} this month
              </p>
            </div>
            <div className="bg-green-500 p-3 rounded-lg">
              <Icon name="check-circle" className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Avg Conversion
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {formatPercent(managerMetrics.conversionRate)}
              </p>
              <p
                className={`text-sm ${getChangeColor(
                  managerMetrics.conversionChange
                )}`}
              >
                {managerMetrics.conversionChange > 0 ? "+" : ""}
                {managerMetrics.conversionChange.toFixed(1)}% change
              </p>
            </div>
            <div className="bg-yellow-500 p-3 rounded-lg">
              <Icon name="percentage" className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Actionable Insights - matching Director Dashboard alerts */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Icon
              name="alert-circle"
              className="w-5 h-5 text-orange-500 mr-2"
            />
            Actionable Insights
          </h3>
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-4 rounded-lg border-l-4 ${
                  alert.type === "warning"
                    ? "bg-yellow-50 border-yellow-400"
                    : alert.type === "error"
                    ? "bg-red-50 border-red-400"
                    : "bg-blue-50 border-blue-400"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon
                    name={
                      alert.type === "warning"
                        ? "alert-triangle"
                        : alert.type === "error"
                        ? "x-circle"
                        : "info"
                    }
                    className={`w-5 h-5 ${
                      alert.type === "warning"
                        ? "text-yellow-600"
                        : alert.type === "error"
                        ? "text-red-600"
                        : "text-blue-600"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-gray-900">{alert.title}</p>
                    <p className="text-sm text-gray-600">{alert.description}</p>
                  </div>
                </div>
                <button
                  onClick={alert.action}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    alert.type === "warning"
                      ? "text-yellow-800 bg-yellow-100 hover:bg-yellow-200"
                      : alert.type === "error"
                      ? "text-red-800 bg-red-100 hover:bg-red-200"
                      : "text-blue-800 bg-blue-100 hover:bg-blue-200"
                  }`}
                >
                  {alert.actionLabel}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerExecutiveMetrics;
