import React from "react";
import Icon from "../../../components/AppIcon";
import { useLanguage } from "../../../i18n";

const ActionableDashboard = ({ actionItems = [], onActionClick }) => {
  // Ensure actionItems is always an array
  const items = actionItems || [];
  const { t } = useLanguage();

  const priorityConfig = {
    high: { color: "bg-red-100 text-red-800", icon: "AlertTriangle" },
    medium: { color: "bg-yellow-100 text-yellow-800", icon: "Clock" },
    low: { color: "bg-blue-100 text-blue-800", icon: "Info" },
  };

  const actionTypeConfig = {
    review_deal: { icon: "FileText", color: "text-blue-600" },
    approve_target: { icon: "Target", color: "text-green-600" },
    team_meeting: { icon: "Users", color: "text-purple-600" },
    budget_review: { icon: "DollarSign", color: "text-orange-600" },
    performance_review: { icon: "TrendingUp", color: "text-indigo-600" },
    urgent_follow_up: { icon: "Phone", color: "text-red-600" },
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0)
      return `${days} ${t(days > 1 ? "time.daysAgo" : "time.dayAgo")}`;
    if (hours > 0)
      return `${hours} ${t(hours > 1 ? "time.hoursAgo" : "time.hourAgo")}`;
    return t("time.justNow");
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {t("dashboard.actionItems")}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {items.filter((item) => item.priority === "high").length}{" "}
            {t("dashboard.highPriorityItemsRequiringAttention")}
          </p>
        </div>
        <Icon name="AlertCircle" size={24} className="text-orange-500" />
      </div>

      <div className="space-y-3">
        {items.slice(0, 8).map((item, index) => {
          const priority =
            priorityConfig[item.priority] || priorityConfig.medium;
          const actionType =
            actionTypeConfig[item.type] || actionTypeConfig.review_deal;

          return (
            <div
              key={index}
              onClick={() => onActionClick(item)}
              className="flex items-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${actionType.color} bg-gray-100 mr-3`}
              >
                <Icon name={actionType.icon} size={16} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="font-medium text-gray-900 truncate">
                    {item.title}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.color}`}
                  >
                    {item.priority}
                  </span>
                </div>

                <p className="text-sm text-gray-600 truncate mb-1">
                  {item.description}
                </p>

                <div className="flex items-center text-xs text-gray-500 space-x-3">
                  <span>{item.company}</span>
                  <span>•</span>
                  <span>{formatTimeAgo(item.created_at)}</span>
                  {item.assignee && (
                    <>
                      <span>•</span>
                      <span>{item.assignee}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {item.dueDate && (
                  <div className="text-xs text-gray-500">
                    {t("tasks.due")}:{" "}
                    {new Date(item.dueDate).toLocaleDateString()}
                  </div>
                )}
                <Icon name="ChevronRight" size={16} className="text-gray-400" />
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 8 && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <button className="w-full text-center text-sm text-blue-600 hover:text-blue-800 font-medium">
            {t("common.viewAll")} {items.length}{" "}
            {t("dashboard.actionItems").toLowerCase()}
          </button>
        </div>
      )}

      {/* Quick action summary */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-3 gap-4">
          {["high", "medium", "low"].map((priority) => {
            const count = items.filter(
              (item) => item.priority === priority
            ).length;
            const config = priorityConfig[priority];

            return (
              <div key={priority} className="text-center">
                <div
                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.color}`}
                >
                  <Icon name={config.icon} size={12} className="mr-1" />
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ActionableDashboard;
