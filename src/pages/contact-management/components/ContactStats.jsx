import React from "react";
import Icon from "../../../components/AppIcon";

const ContactStats = ({ stats }) => {
  // If stats are being loaded or not available, show loading state
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
      title: "Total Clients",
      value: stats.total || 0,
      icon: "Users",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Active",
      value: stats.byStatus?.active || 0,
      icon: "CheckCircle",
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Inactive",
      value: stats.byStatus?.inactive || 0,
      icon: "XCircle",
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      title: "Recent Activity",
      value: stats.recentActivity || 0,
      icon: "Activity",
      color: "text-blue-600",
      bgColor: "bg-blue-100",
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
                {stat.value.toLocaleString()}
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

export default ContactStats;
