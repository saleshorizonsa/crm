import React from "react";
import Icon from "../AppIcon";

const ChartTypeSelector = ({ selectedType, onTypeChange, className = "" }) => {
  const chartTypes = [
    { value: "bar", label: "Bar", icon: "BarChart3" },
    { value: "line", label: "Wave", icon: "TrendingUp" },
    { value: "pie", label: "Pie", icon: "PieChart" },
    { value: "donut", label: "Donut", icon: "Disc" },
  ];

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {chartTypes.map((type) => (
        <button
          key={type.value}
          onClick={() => onTypeChange(type.value)}
          className={`p-2 rounded transition-enterprise ${
            selectedType === type.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
          }`}
          title={type.label}
        >
          <Icon name={type.icon} size={16} />
        </button>
      ))}
    </div>
  );
};

export default ChartTypeSelector;
