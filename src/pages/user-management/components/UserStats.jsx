import React from "react";
import Icon from "../../../components/AppIcon";

const UserStats = ({ users, isLoading }) => {
  const calculateStats = () => {
    if (!users || users.length === 0) {
      return {
        total: 0,
        active: 0,
        inactive: 0,
        admins: 0,
        managers: 0,
        agents: 0,
      };
    }

    return {
      total: users.length,
      active: users.filter((user) => user.is_active).length,
      inactive: users.filter((user) => !user.is_active).length,
      admins: users.filter((user) => user.role === "admin").length,
      managers: users.filter((user) => user.role === "manager").length,
      agents: users.filter((user) => user.role === "agent").length,
    };
  };

  const stats = calculateStats();

  const statCards = [
    {
      title: "Total Users",
      value: stats.total,
      icon: "Users",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Active Users",
      value: stats.active,
      icon: "UserCheck",
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Inactive Users",
      value: stats.inactive,
      icon: "UserX",
      color: "text-error",
      bgColor: "bg-error/10",
    },
    {
      title: "Admins",
      value: stats.admins,
      icon: "Shield",
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Managers",
      value: stats.managers,
      icon: "Crown",
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: "Agents",
      value: stats.agents,
      icon: "User",
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className="bg-card border border-border rounded-lg p-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="w-16 h-4 bg-muted rounded skeleton"></div>
                <div className="w-8 h-6 bg-muted rounded skeleton"></div>
              </div>
              <div className="w-10 h-10 bg-muted rounded-full skeleton"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
      {statCards.map((stat, index) => (
        <div
          key={index}
          className="bg-card border border-border rounded-lg p-4 hover:shadow-lg transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {stat.title}
              </p>
              <p className="text-2xl font-bold text-card-foreground">
                {stat.value}
              </p>
            </div>
            <div
              className={`w-10 h-10 ${stat.bgColor} rounded-full flex items-center justify-center`}
            >
              <Icon name={stat.icon} size={20} className={stat.color} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default UserStats;
