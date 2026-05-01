import React from "react";
import { useCurrency } from "../../../contexts/CurrencyContext";
import Icon from "../../../components/AppIcon";

const SupervisorExecutiveMetrics = ({
  metrics,
  teamData,
  salesTargets,
  upcomingTasks,
  isLoading,
}) => {
  const { formatCurrency } = useCurrency();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Calculate team metrics
  const totalTeamRevenue =
    teamData?.reduce((sum, member) => sum + (member.totalValue || 0), 0) || 0;
  const totalTeamDeals =
    teamData?.reduce((sum, member) => sum + (member.dealsCount || 0), 0) || 0;
  const wonDeals =
    teamData?.reduce((sum, member) => sum + (member.wonDeals || 0), 0) || 0;
  const avgConversionRate =
    teamData?.length > 0
      ? (
          teamData.reduce(
            (sum, member) => sum + (parseFloat(member.conversionRate) || 0),
            0
          ) / teamData.length
        ).toFixed(1)
      : 0;

  // Calculate target progress
  const currentTargetAmount =
    salesTargets?.reduce((sum, target) => {
      const now = new Date();
      const targetStart = new Date(target.period_start);
      const targetEnd = new Date(target.period_end);

      if (now >= targetStart && now <= targetEnd) {
        return sum + (parseFloat(target.target_amount) || 0);
      }
      return sum;
    }, 0) || 0;

  const targetAchievementRate =
    currentTargetAmount > 0
      ? ((totalTeamRevenue / currentTargetAmount) * 100).toFixed(1)
      : 0;

  // Calculate salesman count
  const salesmanCount =
    teamData?.filter((member) => !member.isSupervisor).length || 0;

  // Calculate active tasks
  const activeTaskCount = upcomingTasks?.length || 0;

  const metricCards = [
    {
      title: "Team Revenue",
      value: formatCurrency(totalTeamRevenue),
      subValue: `Target: ${formatCurrency(currentTargetAmount)}`,
      change: `${targetAchievementRate}% of target`,
      trend:
        targetAchievementRate >= 80
          ? "up"
          : targetAchievementRate >= 50
          ? "neutral"
          : "down",
      icon: "💰",
      bgColor: "bg-green-50",
      textColor: "text-green-600",
      borderColor: "border-green-200",
    },
    {
      title: "Team Performance",
      value: `${wonDeals}/${totalTeamDeals}`,
      subValue: `${avgConversionRate}% avg conversion`,
      change: totalTeamDeals > 0 ? `${wonDeals} deals won` : "No deals yet",
      trend:
        avgConversionRate >= 20
          ? "up"
          : avgConversionRate >= 10
          ? "neutral"
          : "down",
      icon: "📊",
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
      borderColor: "border-blue-200",
    },
    {
      title: "Sales Team",
      value: salesmanCount,
      subValue: `${salesmanCount} active salesmen`,
      change: salesmanCount > 0 ? "Team ready" : "Add salesmen",
      trend:
        salesmanCount >= 3 ? "up" : salesmanCount >= 1 ? "neutral" : "down",
      icon: "👥",
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
      borderColor: "border-purple-200",
    },
    {
      title: "Active Tasks",
      value: activeTaskCount,
      subValue: "Pending completion",
      change: activeTaskCount <= 5 ? "Manageable load" : "High workload",
      trend:
        activeTaskCount <= 5
          ? "up"
          : activeTaskCount <= 10
          ? "neutral"
          : "down",
      icon: "✅",
      bgColor: "bg-orange-50",
      textColor: "text-orange-600",
      borderColor: "border-orange-200",
    },
  ];

  const getTrendIcon = (trend) => {
    switch (trend) {
      case "up":
        return <Icon name="trending-up" className="w-4 h-4 text-green-500" />;
      case "down":
        return <Icon name="trending-down" className="w-4 h-4 text-red-500" />;
      default:
        return <Icon name="minus" className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTrendColor = (trend) => {
    switch (trend) {
      case "up":
        return "text-green-600";
      case "down":
        return "text-red-600";
      default:
        return "text-gray-500";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {metricCards.map((card, index) => (
        <div
          key={index}
          className={`bg-white rounded-lg shadow-sm border ${card.borderColor} p-6 hover:shadow-md transition-shadow`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <span className="text-xl">{card.icon}</span>
            </div>
            {getTrendIcon(card.trend)}
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-medium text-gray-500">{card.title}</h3>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500">{card.subValue}</p>
            <div
              className={`flex items-center text-xs ${getTrendColor(
                card.trend
              )}`}
            >
              <span>{card.change}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SupervisorExecutiveMetrics;
