import React from "react";
import { useCurrency } from "../../../contexts/CurrencyContext";
import Icon from "../../../components/AppIcon";

const ManagerSummaryCards = ({
  teamData,
  salesTargets,
  subordinates,
  deals,
  activities,
  upcomingTasks,
}) => {
  const { formatCurrency } = useCurrency();

  const calculateSummaryMetrics = () => {
    // Team revenue calculation
    const totalTeamRevenue =
      teamData?.reduce((sum, member) => sum + (member.totalValue || 0), 0) || 0;

    // Target calculations
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

    // Pipeline metrics
    const activeDeals =
      deals?.filter((deal) => !["won", "lost"].includes(deal.stage)) || [];

    const wonDeals = deals?.filter((deal) => deal.stage === "won") || [];

    const conversionRate =
      deals?.length > 0 ? (wonDeals.length / deals.length) * 100 : 0;

    // Team performance
    const avgTeamConversion =
      teamData?.length > 0
        ? teamData.reduce(
            (sum, member) => sum + parseFloat(member.conversionRate || 0),
            0
          ) / teamData.length
        : 0;

    // Activity metrics
    const recentActivities =
      activities?.filter((activity) => {
        const activityDate = new Date(activity.created_at);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return activityDate >= weekAgo;
      }) || [];

    // Task metrics
    const overdueTasks =
      upcomingTasks?.filter((task) => {
        const dueDate = new Date(task.due_date);
        return dueDate < new Date() && task.status !== "completed";
      }) || [];

    return {
      totalTeamRevenue,
      totalTargetAmount,
      totalProgressAmount,
      targetAchievement,
      activeDealsCount: activeDeals.length,
      activePipelineValue: activeDeals.reduce(
        (sum, deal) => sum + parseFloat(deal.amount || 0),
        0
      ),
      conversionRate,
      avgTeamConversion,
      recentActivitiesCount: recentActivities.length,
      overdueTasksCount: overdueTasks.length,
      teamSize: subordinates?.length || 0,
    };
  };

  const metrics = calculateSummaryMetrics();

  const summaryCards = [
    {
      title: "Team Revenue",
      value: formatCurrency(metrics.totalTeamRevenue),
      subtitle: "Total closed deals",
      icon: "trending-up",
      color: "bg-gradient-to-r from-green-500 to-emerald-600",
      textColor: "text-green-100",
      trend: metrics.totalTeamRevenue > 0 ? "positive" : "neutral",
    },
    {
      title: "Target Progress",
      value: `${metrics.targetAchievement.toFixed(1)}%`,
      subtitle: `${formatCurrency(
        metrics.totalProgressAmount
      )} / ${formatCurrency(metrics.totalTargetAmount)}`,
      icon: "target",
      color:
        metrics.targetAchievement >= 80
          ? "bg-gradient-to-r from-blue-500 to-blue-600"
          : metrics.targetAchievement >= 60
          ? "bg-gradient-to-r from-yellow-500 to-orange-500"
          : "bg-gradient-to-r from-red-500 to-red-600",
      textColor:
        metrics.targetAchievement >= 80
          ? "text-blue-100"
          : metrics.targetAchievement >= 60
          ? "text-yellow-100"
          : "text-red-100",
      trend:
        metrics.targetAchievement >= 70
          ? "positive"
          : metrics.targetAchievement >= 40
          ? "neutral"
          : "negative",
    },
    {
      title: "Active Pipeline",
      value: metrics.activeDealsCount.toString(),
      subtitle: formatCurrency(metrics.activePipelineValue),
      icon: "pipeline",
      color: "bg-gradient-to-r from-purple-500 to-indigo-600",
      textColor: "text-purple-100",
      trend: metrics.activeDealsCount > 5 ? "positive" : "neutral",
    },
    {
      title: "Team Performance",
      value: `${metrics.avgTeamConversion.toFixed(1)}%`,
      subtitle: `Avg conversion rate (${metrics.teamSize} members)`,
      icon: "users",
      color:
        metrics.avgTeamConversion >= 25
          ? "bg-gradient-to-r from-teal-500 to-cyan-600"
          : metrics.avgTeamConversion >= 15
          ? "bg-gradient-to-r from-yellow-500 to-orange-500"
          : "bg-gradient-to-r from-red-500 to-red-600",
      textColor:
        metrics.avgTeamConversion >= 25
          ? "text-teal-100"
          : metrics.avgTeamConversion >= 15
          ? "text-yellow-100"
          : "text-red-100",
      trend:
        metrics.avgTeamConversion >= 20
          ? "positive"
          : metrics.avgTeamConversion >= 10
          ? "neutral"
          : "negative",
    },
  ];

  const alertCards = [];

  // Add alert cards for important metrics
  if (metrics.overdueTasksCount > 0) {
    alertCards.push({
      title: "Overdue Tasks",
      value: metrics.overdueTasksCount.toString(),
      subtitle: "Need immediate attention",
      icon: "alert-triangle",
      color: "bg-gradient-to-r from-red-500 to-red-600",
      textColor: "text-red-100",
      isAlert: true,
    });
  }

  if (metrics.recentActivitiesCount === 0) {
    alertCards.push({
      title: "Low Activity",
      value: "0",
      subtitle: "No activities this week",
      icon: "activity",
      color: "bg-gradient-to-r from-gray-500 to-gray-600",
      textColor: "text-gray-100",
      isAlert: true,
    });
  }

  const allCards = [...summaryCards, ...alertCards];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {allCards.map((card, index) => (
        <div
          key={index}
          className={`${card.color} p-6 rounded-lg text-white shadow-lg hover:shadow-xl transition-shadow duration-200`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className={`${card.textColor} text-sm font-medium`}>
                {card.title}
              </p>
              <p className="text-2xl font-bold mt-1">{card.value}</p>
              <p className={`${card.textColor} text-xs mt-2`}>
                {card.subtitle}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <Icon name={card.icon} className={`w-8 h-8 ${card.textColor}`} />
              {card.trend && !card.isAlert && (
                <div className="mt-2">
                  {card.trend === "positive" && (
                    <Icon
                      name="trending-up"
                      className={`w-4 h-4 ${card.textColor}`}
                    />
                  )}
                  {card.trend === "negative" && (
                    <Icon
                      name="trending-down"
                      className={`w-4 h-4 ${card.textColor}`}
                    />
                  )}
                  {card.trend === "neutral" && (
                    <Icon
                      name="minus"
                      className={`w-4 h-4 ${card.textColor}`}
                    />
                  )}
                </div>
              )}
              {card.isAlert && (
                <div className="mt-2">
                  <Icon
                    name="alert-circle"
                    className={`w-4 h-4 ${card.textColor}`}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ManagerSummaryCards;
