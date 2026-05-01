import React from "react";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";

const SupervisorQuickActions = ({
  userProfile,
  company,
  onAddSalesman,
  onAssignTargets,
  onViewReports,
  onScheduleCoaching,
  onManageActivities,
  onUpdatePipeline,
  salesmenCount = 0,
  activeTasksCount = 0,
  availableBudget = 0,
}) => {
  const quickActions = [
    {
      title: "Add New Salesman",
      description: "Recruit and onboard new team members",
      icon: "user-plus",
      color: "bg-blue-500 hover:bg-blue-600",
      textColor: "text-white",
      onClick: onAddSalesman,
      disabled: false,
      badge: null,
    },
    {
      title: "Assign Sales Targets",
      description: "Allocate targets to your salesmen",
      icon: "target",
      color: "bg-green-500 hover:bg-green-600",
      textColor: "text-white",
      onClick: onAssignTargets,
      disabled: availableBudget <= 0,
      badge: availableBudget > 0 ? "Budget Available" : "No Budget",
    },
    {
      title: "Schedule Coaching",
      description: "Plan coaching sessions with team members",
      icon: "calendar",
      color: "bg-purple-500 hover:bg-purple-600",
      textColor: "text-white",
      onClick: onScheduleCoaching,
      disabled: salesmenCount === 0,
      badge: salesmenCount > 0 ? `${salesmenCount} Salesmen` : "No Team",
    },
    {
      title: "View Performance Reports",
      description: "Analyze team and individual performance",
      icon: "chart-bar",
      color: "bg-orange-500 hover:bg-orange-600",
      textColor: "text-white",
      onClick: onViewReports,
      disabled: false,
      badge: null,
    },
    {
      title: "Manage Activities",
      description: "Track and assign team activities",
      icon: "clipboard-list",
      color: "bg-indigo-500 hover:bg-indigo-600",
      textColor: "text-white",
      onClick: onManageActivities,
      disabled: false,
      badge: activeTasksCount > 0 ? `${activeTasksCount} Active` : null,
    },
    {
      title: "Update Pipeline",
      description: "Review and update deal progress",
      icon: "trending-up",
      color: "bg-teal-500 hover:bg-teal-600",
      textColor: "text-white",
      onClick: onUpdatePipeline,
      disabled: false,
      badge: null,
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
        <div className="text-sm text-gray-500">
          Supervisor: {userProfile?.full_name || userProfile?.email}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickActions.map((action, index) => (
          <div
            key={index}
            className={`relative rounded-lg p-4 transition-all duration-200 ${
              action.disabled
                ? "bg-gray-100 cursor-not-allowed opacity-60"
                : `${action.color} cursor-pointer transform hover:scale-105 hover:shadow-lg`
            }`}
            onClick={action.disabled ? undefined : action.onClick}
          >
            {/* Badge */}
            {action.badge && (
              <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-medium px-2 py-1 rounded-full">
                {action.badge}
              </div>
            )}

            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div
                  className={`flex items-center space-x-2 mb-2 ${
                    action.disabled ? "text-gray-500" : action.textColor
                  }`}
                >
                  <Icon name={action.icon} className="w-5 h-5" />
                  <h4 className="font-medium text-sm">{action.title}</h4>
                </div>
                <p
                  className={`text-xs ${
                    action.disabled
                      ? "text-gray-400"
                      : action.textColor + " opacity-90"
                  }`}
                >
                  {action.description}
                </p>
              </div>
            </div>

            {/* Disabled Overlay */}
            {action.disabled && (
              <div className="absolute inset-0 bg-gray-200 bg-opacity-50 rounded-lg flex items-center justify-center">
                <Icon name="lock" className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {salesmenCount}
            </div>
            <div className="text-xs text-gray-500">Team Members</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600">
              {activeTasksCount}
            </div>
            <div className="text-xs text-gray-500">Active Tasks</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {availableBudget > 0 ? "✓" : "✗"}
            </div>
            <div className="text-xs text-gray-500">Budget Status</div>
          </div>
        </div>
      </div>

      {/* Action Guidelines */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="text-sm font-medium text-blue-800 mb-2">
          💡 Supervisor Guidelines
        </h4>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• Regularly coach your salesmen to improve performance</li>
          <li>
            • Assign targets based on individual capabilities and market
            potential
          </li>
          <li>• Monitor pipeline progression and intervene when deals stall</li>
          <li>• Conduct weekly one-on-ones with each team member</li>
          <li>• Review and update activity plans based on performance data</li>
        </ul>
      </div>
    </div>
  );
};

export default SupervisorQuickActions;
