import React from "react";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";
import { useLanguage } from "../../../i18n";

const ManagerQuickActions = ({
  subordinates,
  salesTargets,
  onAssignTarget,
  onCreateDeal,
  onScheduleMeeting,
  onViewReports,
}) => {
  const { t } = useLanguage();
  const getQuickStats = () => {
    const membersWithoutTargets =
      subordinates?.filter(
        (member) =>
          !salesTargets?.some((target) => target.assigned_to === member.id)
      ) || [];

    const activeTargets =
      salesTargets?.filter((target) => target.status === "active") || [];

    return {
      membersWithoutTargets: membersWithoutTargets.length,
      activeTargets: activeTargets.length,
      totalTeamMembers: subordinates?.length || 0,
    };
  };

  const stats = getQuickStats();

  const quickActions = [
    {
      title: t("dashboard.assignSalesTargets"),
      description: `${stats.membersWithoutTargets} ${t("dashboard.membersNeedTargets").replace("{count}", "").trim()}`,
      icon: "target",
      color:
        stats.membersWithoutTargets > 0
          ? "bg-orange-500 hover:bg-orange-600"
          : "bg-gray-400",
      textColor: "text-white",
      action: onAssignTarget,
      disabled: stats.totalTeamMembers === 0,
      priority: stats.membersWithoutTargets > 0 ? "high" : "normal",
    },
    {
      title: t("dashboard.createNewDeal"),
      description: t("dashboard.addDealToPipeline"),
      icon: "plus-circle",
      color: "bg-green-500 hover:bg-green-600",
      textColor: "text-white",
      action: onCreateDeal,
      disabled: false,
      priority: "normal",
    },
    {
      title: t("dashboard.scheduleTeamMeeting"),
      description: t("dashboard.planReviewSession"),
      icon: "calendar",
      color: "bg-blue-500 hover:bg-blue-600",
      textColor: "text-white",
      action: onScheduleMeeting,
      disabled: stats.totalTeamMembers === 0,
      priority: "normal",
    },
    {
      title: t("dashboard.generateReports"),
      description: t("dashboard.exportReports"),
      icon: "file-text",
      color: "bg-purple-500 hover:bg-purple-600",
      textColor: "text-white",
      action: onViewReports,
      disabled: false,
      priority: "normal",
    },
    {
      title: t("dashboard.reviewTeamPerformance"),
      description: `${stats.activeTargets} ${t("dashboard.activeTargets")}`,
      icon: "bar-chart",
      color: "bg-indigo-500 hover:bg-indigo-600",
      textColor: "text-white",
      action: () => onViewReports("performance"),
      disabled: stats.activeTargets === 0,
      priority: stats.activeTargets > 3 ? "high" : "normal",
    },
    {
      title: t("dashboard.manageTeam"),
      description: t("dashboard.addModifyTeamMembers"),
      icon: "users",
      color: "bg-teal-500 hover:bg-teal-600",
      textColor: "text-white",
      action: () => console.log("Manage team clicked"),
      disabled: false,
      priority: "normal",
    },
  ];

  // Sort actions by priority
  const sortedActions = quickActions.sort((a, b) => {
    if (a.priority === "high" && b.priority !== "high") return -1;
    if (b.priority === "high" && a.priority !== "high") return 1;
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {t("dashboard.managerQuickActions")}
        </h3>
        <div className="text-sm text-gray-500">
          {stats.totalTeamMembers} {t("dashboard.teamMembers")} • {stats.activeTargets} {t("dashboard.activeTargets")}
        </div>
      </div>

      {/* Priority Actions Banner */}
      {stats.membersWithoutTargets > 0 && (
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-md">
          <div className="flex items-center">
            <Icon
              name="alert-triangle"
              className="w-5 h-5 text-orange-600 mr-3"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-800">
                {t("dashboard.actionRequired")}: {stats.membersWithoutTargets} {t("dashboard.membersWithoutTargets").replace("{count}", "").trim()}
              </p>
              <p className="text-sm text-orange-700 mt-1">
                {t("dashboard.assignTargetsImprove")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onAssignTarget}
              className="ml-4 text-orange-700 border-orange-300 hover:bg-orange-100"
            >
              {t("dashboard.assignNow")}
            </Button>
          </div>
        </div>
      )}

      {/* Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedActions.map((action, index) => (
          <div
            key={index}
            className={`relative p-6 rounded-lg border ${
              action.priority === "high"
                ? "border-orange-200 bg-orange-50"
                : "border-gray-200 bg-white"
            } hover:shadow-md transition-shadow duration-200`}
          >
            {action.priority === "high" && (
              <div className="absolute top-2 right-2">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  {t("dashboard.priorityLabel")}
                </span>
              </div>
            )}

            <div className="flex items-start space-x-4">
              <div
                className={`p-3 rounded-lg ${action.color} ${
                  action.disabled ? "opacity-50" : ""
                }`}
              >
                <Icon
                  name={action.icon}
                  className={`w-6 h-6 ${action.textColor}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  {action.title}
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  {action.description}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={action.action}
                  disabled={action.disabled}
                  className="w-full"
                >
                  {action.title.split(" ")[0]}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Team Overview Stats */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalTeamMembers}
            </p>
            <p className="text-sm text-gray-600">{t("dashboard.teamMembers")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-600">
              {stats.activeTargets}
            </p>
            <p className="text-sm text-gray-600">{t("dashboard.activeTargets")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">
              {stats.totalTeamMembers - stats.membersWithoutTargets}
            </p>
            <p className="text-sm text-gray-600">{t("dashboard.withTargets")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-orange-600">
              {stats.membersWithoutTargets}
            </p>
            <p className="text-sm text-gray-600">{t("dashboard.needTargets")}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagerQuickActions;
