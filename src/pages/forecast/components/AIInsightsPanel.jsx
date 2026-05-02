import React from "react";
import Icon from "../../../components/AppIcon";

const COLOR_MAP = {
  emerald: {
    bg:     "bg-emerald-50",
    border: "border-emerald-200",
    badge:  "bg-emerald-100 text-emerald-700",
    icon:   "text-emerald-600",
    value:  "text-emerald-700",
  },
  blue: {
    bg:     "bg-blue-50",
    border: "border-blue-200",
    badge:  "bg-blue-100 text-blue-700",
    icon:   "text-blue-600",
    value:  "text-blue-700",
  },
  amber: {
    bg:     "bg-amber-50",
    border: "border-amber-200",
    badge:  "bg-amber-100 text-amber-700",
    icon:   "text-amber-600",
    value:  "text-amber-700",
  },
  red: {
    bg:     "bg-red-50",
    border: "border-red-200",
    badge:  "bg-red-100 text-red-700",
    icon:   "text-red-600",
    value:  "text-red-700",
  },
};

const STATUS_LABELS = {
  excellent: "Excellent",
  good:      "Good",
  warning:   "Warning",
  danger:    "At Risk",
  neutral:   "Info",
};

const AIInsightsPanel = ({ insights = [] }) => {
  if (!insights.length) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
          <Icon name="Lightbulb" size={16} className="text-violet-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Pipeline Insights</h3>
          <p className="text-xs text-muted-foreground">Automated health analysis</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {insights.map((insight) => {
          const c = COLOR_MAP[insight.color] ?? COLOR_MAP.blue;
          return (
            <div
              key={insight.id}
              className={`rounded-lg p-4 border ${c.bg} ${c.border}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Icon name={insight.icon} size={15} className={c.icon} />
                  <span className="text-xs font-semibold text-card-foreground">
                    {insight.title}
                  </span>
                </div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${c.badge}`}>
                  {STATUS_LABELS[insight.status] ?? insight.status}
                </span>
              </div>

              {insight.value && insight.value !== "—" && (
                <p className={`text-lg font-bold tabular-nums mb-1 ${c.value}`}>
                  {insight.value}
                </p>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed">
                {insight.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AIInsightsPanel;
