import React from "react";
import Icon from "../../../components/AppIcon";

const STAT_CARDS = [
  { key: "total",          label: "Total Leads",      icon: "Users",      color: "text-blue-600",  bg: "bg-blue-50"  },
  { key: "hot",            label: "Hot Leads",         icon: "TrendingUp", color: "text-red-600",   bg: "bg-red-50"   },
  { key: "thisMonth",      label: "Added This Month",  icon: "Calendar",   color: "text-purple-600",bg: "bg-purple-50"},
  { key: "conversionRate", label: "Conversion Rate",   icon: "CheckCircle",color: "text-green-600", bg: "bg-green-50" },
];

const LeadStats = ({ stats }) => {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
            <div className="h-7 bg-gray-200 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  const values = {
    total:          stats.total,
    hot:            stats.byGrade?.hot ?? 0,
    thisMonth:      stats.thisMonth,
    conversionRate: `${stats.conversionRate ?? 0}%`,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {STAT_CARDS.map((card) => (
        <div key={card.key} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.bg}`}>
              <Icon name={card.icon} size={16} className={card.color} />
            </div>
            <span className="text-sm text-gray-500">{card.label}</span>
          </div>
          <p className={`text-2xl font-bold ${card.color}`}>{values[card.key] ?? 0}</p>
        </div>
      ))}
    </div>
  );
};

export default LeadStats;
