import React from "react";
import Icon from "../../../components/AppIcon";

const TaskStats = ({ stats }) => {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-lg p-4 animate-pulse"
          >
            <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-muted rounded w-1/3 mb-2"></div>
            <div className="h-3 bg-muted rounded w-2/3"></div>
          </div>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Tasks",
      value: stats.total || 0,
      icon: "CheckSquare",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Pending",
      value: stats.byStatus?.pending || 0,
      icon: "Clock",
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      title: "In Progress",
      value: stats.byStatus?.in_progress || 0,
      icon: "PlayCircle",
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Completed",
      value: stats.byStatus?.completed || 0,
      icon: "CheckCircle2",
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {statCards.map((stat, index) => (
        <div
          key={index}
          className="bg-card border border-border rounded-lg p-4 transition-enterprise hover:shadow-enterprise-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
              <p className="text-2xl font-semibold text-card-foreground">
                {stat.value}
              </p>
            </div>
            <div
              className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}
            >
              <Icon name={stat.icon} size={24} className={stat.color} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TaskStats;
