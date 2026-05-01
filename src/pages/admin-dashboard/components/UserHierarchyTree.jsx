import React, { useState } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";

const UserNode = ({
  user,
  onToggleStatus,
  onViewDetails,
  level = 0,
  isLast = false,
  parentLines = [],
}) => {
  const [expanded, setExpanded] = useState(level < 2);
  const hasSubordinates = user.subordinates && user.subordinates.length > 0;

  const roleConfig = {
    admin: {
      color: "#4f46e5",
      icon: "Shield",
      label: "Administrator",
      level: 0,
    },
    director: {
      color: "#4338ca",
      icon: "Crown",
      label: "Director",
      level: 1,
    },
    head: {
      color: "#2563eb",
      icon: "UserCog",
      label: "Head",
      level: 2,
    },
    manager: {
      color: "#0d9488",
      icon: "Briefcase",
      label: "Manager",
      level: 3,
    },
    supervisor: {
      color: "#f59e0b",
      icon: "Users",
      label: "Supervisor",
      level: 4,
    },
    salesman: {
      color: "#dc2626",
      icon: "TrendingUp",
      label: "Salesman",
      level: 5,
    },
    unknown: {
      color: "",
      icon: "",
      label: "Unknown",
    },
  };

  const config = roleConfig[user.role] || roleConfig.unknown;

  return (
    <div className="relative">
      <div className="flex items-start gap-0">
        {/* Connection Lines */}
        {level > 0 && (
          <div className="flex-shrink-0 flex">
            {parentLines.map((showLine, idx) => (
              <div key={idx} className="w-8 h-full relative">
                {showLine && (
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
                )}
              </div>
            ))}
            <div className="w-8 h-12 relative">
              <div className="absolute left-4 top-0 bottom-1/2 w-px bg-gray-200" />
              <div className="absolute left-4 top-1/2 w-4 h-px bg-gray-200" />
              {!isLast && (
                <div className="absolute left-4 top-1/2 bottom-0 w-px bg-gray-200" />
              )}
            </div>
          </div>
        )}

        {/* Node Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {/* Expand/Collapse Button */}
            {hasSubordinates && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="mt-3 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                <Icon
                  name={expanded ? "ChevronDown" : "ChevronRight"}
                  size={14}
                />
              </button>
            )}

            {/* User Card */}
            <div
              onClick={() => onViewDetails(user)}
              className={`flex-1 min-w-0 flex items-center gap-3 px-4 py-3 rounded-lg bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer ${
                !user.is_active ? "opacity-50" : ""
              } ${!hasSubordinates ? "ml-8" : ""}`}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                  style={{ backgroundColor: config.color }}
                >
                  {(user.full_name || "U").substring(0, 2).toUpperCase()}
                </div>
                {user.is_active && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                )}
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h4 className="font-medium text-sm text-gray-900 truncate">
                    {user.full_name || "Unnamed User"}
                  </h4>
                  {!user.is_active && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium" style={{ color: config.color }}>
                    {config.label}
                  </span>
                  {hasSubordinates && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Icon name="Users" size={11} />
                        {user.subordinates.length} reports
                      </span>
                    </>
                  )}
                  {user.department && (
                    <>
                      <span>•</span>
                      <span>{user.department}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStatus(user.id, user.is_active);
                }}
                className="flex-shrink-0"
                title={user.is_active ? "Deactivate" : "Activate"}
              >
                <Icon name={user.is_active ? "UserX" : "UserCheck"} size={16} />
              </Button>
            </div>
          </div>

          {/* Subordinates */}
          {hasSubordinates && expanded && (
            <div className="mt-1">
              {user.subordinates.map((subordinate, idx) => (
                <UserNode
                  key={subordinate.id}
                  user={subordinate}
                  onToggleStatus={onToggleStatus}
                  onViewDetails={onViewDetails}
                  level={level + 1}
                  isLast={idx === user.subordinates.length - 1}
                  parentLines={[...parentLines, !isLast]}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const UserHierarchyTree = ({ data, onToggleStatus, onViewDetails }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Icon name="Users" size={24} className="text-gray-400" />
        </div>
        <p className="text-sm text-gray-500">
          No users found in the organization
        </p>
      </div>
    );
  }

  // Find root level users (those without a manager_id or whose manager is not in the tree)
  const userMap = new Map(data.map((u) => [u.id, u]));
  const rootUsers = data.filter((user) => {
    if (!user.manager_id) return true;
    return !userMap.has(user.manager_id);
  });

  return (
    <div className="space-y-1">
      {rootUsers.map((user, idx) => (
        <UserNode
          key={user.id}
          user={user}
          onToggleStatus={onToggleStatus}
          onViewDetails={onViewDetails}
          level={0}
          isLast={idx === rootUsers.length - 1}
          parentLines={[]}
        />
      ))}
    </div>
  );
};

export default UserHierarchyTree;
