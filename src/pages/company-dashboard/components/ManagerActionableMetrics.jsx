import React from "react";
import { useCurrency } from "../../../contexts/CurrencyContext";
import Icon from "../../../components/AppIcon";

const ManagerActionableMetrics = ({
  metrics,
  teamData,
  salesTargets,
  subordinates,
  onAssignTarget,
  onViewPerformance,
}) => {
  const { formatCurrency } = useCurrency();

  const calculateTeamMetrics = () => {
    if (!teamData || !salesTargets) return {};

    const totalTeamRevenue = teamData.reduce(
      (sum, member) => sum + (member.totalValue || 0),
      0
    );
    const totalTargetAmount = salesTargets.reduce(
      (sum, target) => sum + parseFloat(target.target_amount || 0),
      0
    );
    const totalProgressAmount = salesTargets.reduce(
      (sum, target) => sum + parseFloat(target.progress_amount || 0),
      0
    );

    const targetAchievement =
      totalTargetAmount > 0
        ? (totalProgressAmount / totalTargetAmount) * 100
        : 0;
    const activePipeline = teamData.reduce(
      (sum, member) => sum + (member.dealsCount || 0),
      0
    );

    return {
      totalTeamRevenue,
      totalTargetAmount,
      totalProgressAmount,
      targetAchievement,
      activePipeline,
      avgConversion:
        teamData.length > 0
          ? teamData.reduce(
              (sum, member) => sum + parseFloat(member.conversionRate || 0),
              0
            ) / teamData.length
          : 0,
    };
  };

  const teamMetrics = calculateTeamMetrics();

  const getPerformanceAlerts = () => {
    const alerts = [];

    // Low performers
    const lowPerformers =
      teamData?.filter(
        (member) =>
          !member.isManager && parseFloat(member.conversionRate || 0) < 20
      ) || [];

    if (lowPerformers.length > 0) {
      alerts.push({
        type: "warning",
        title: `${lowPerformers.length} team member(s) need attention`,
        description: "Low conversion rates detected",
        action: () => onViewPerformance("low-performers"),
        actionLabel: "Review Performance",
      });
    }

    // Unassigned targets
    const membersWithoutTargets =
      subordinates?.filter(
        (member) =>
          !salesTargets?.some((target) => target.assigned_to === member.id)
      ) || [];

    if (membersWithoutTargets.length > 0) {
      alerts.push({
        type: "info",
        title: `${membersWithoutTargets.length} member(s) without targets`,
        description: "Assign sales targets to improve performance tracking",
        action: () => onAssignTarget(),
        actionLabel: "Assign Targets",
      });
    }

    // Target achievement below 70%
    if (
      teamMetrics.targetAchievement < 70 &&
      teamMetrics.totalTargetAmount > 0
    ) {
      alerts.push({
        type: "warning",
        title: "Team target achievement below expectation",
        description: `Only ${teamMetrics.targetAchievement.toFixed(
          1
        )}% of targets achieved`,
        action: () => onViewPerformance("targets"),
        actionLabel: "View Details",
      });
    }

    return alerts;
  };

  const alerts = getPerformanceAlerts();

  return (
    <div className="space-y-6">
      {/* Key Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Team Revenue</p>
              <p className="text-2xl font-bold">
                {formatCurrency(teamMetrics.totalTeamRevenue)}
              </p>
              <p className="text-blue-100 text-xs mt-1">This quarter</p>
            </div>
            <Icon name="trending-up" className="w-8 h-8 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Target Achievement</p>
              <p className="text-2xl font-bold">
                {teamMetrics.targetAchievement.toFixed(1)}%
              </p>
              <p className="text-green-100 text-xs mt-1">
                {formatCurrency(teamMetrics.totalProgressAmount)} /{" "}
                {formatCurrency(teamMetrics.totalTargetAmount)}
              </p>
            </div>
            <Icon name="target" className="w-8 h-8 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 rounded-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Active Pipeline</p>
              <p className="text-2xl font-bold">{teamMetrics.activePipeline}</p>
              <p className="text-purple-100 text-xs mt-1">
                Total deals in progress
              </p>
            </div>
            <Icon name="pipeline" className="w-8 h-8 text-purple-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 rounded-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm">Avg. Conversion</p>
              <p className="text-2xl font-bold">
                {teamMetrics.avgConversion.toFixed(1)}%
              </p>
              <p className="text-orange-100 text-xs mt-1">Team average</p>
            </div>
            <Icon name="percentage" className="w-8 h-8 text-orange-200" />
          </div>
        </div>
      </div>

      {/* Performance Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Performance Alerts
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
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
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

export default ManagerActionableMetrics;
