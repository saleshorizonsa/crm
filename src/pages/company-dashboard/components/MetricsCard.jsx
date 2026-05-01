import React from "react";
import Icon from "../../../components/AppIcon";

const MetricsCard = ({
  title,
  value,
  change,
  changeType,
  icon,
  currency = "USD",
  isLoading = false,
  trend,
  iconColor,
  iconBgColor,
  subtitle,
  onClick,
}) => {
  const formatValue = (val) => {
    if (typeof val === "number") {
      return val?.toLocaleString("en-US", {
        style: currency ? "currency" : "decimal",
        currency: currency,
        minimumFractionDigits: currency ? 2 : 0,
        maximumFractionDigits: currency ? 2 : 0,
      });
    }
    return val;
  };

  const getChangeColor = () => {
    if (changeType === "positive") return "text-success";
    if (changeType === "negative") return "text-error";
    if (trend === "up" || (typeof trend === "number" && trend > 0))
      return "text-success";
    if (trend === "down" || (typeof trend === "number" && trend < 0))
      return "text-error";
    return "text-muted-foreground";
  };

  const getChangeIcon = () => {
    if (changeType === "positive") return "TrendingUp";
    if (changeType === "negative") return "TrendingDown";
    if (trend === "up" || (typeof trend === "number" && trend > 0))
      return "TrendingUp";
    if (trend === "down" || (typeof trend === "number" && trend < 0))
      return "TrendingDown";
    return "Minus";
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="w-24 h-4 bg-muted rounded skeleton"></div>
          <div className="w-8 h-8 bg-muted rounded skeleton"></div>
        </div>
        <div className="w-32 h-8 bg-muted rounded skeleton mb-2"></div>
        <div className="w-20 h-4 bg-muted rounded skeleton"></div>
      </div>
    );
  }

  return (
    <div
      className={`bg-card border border-border rounded-lg p-6 enterprise-shadow hover:enterprise-shadow-md transition-enterprise ${
        onClick
          ? "cursor-pointer hover:border-blue-300 hover:ring-1 hover:ring-blue-100"
          : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            iconBgColor || "bg-primary/10"
          }`}
        >
          <Icon
            name={icon}
            size={16}
            className={iconColor}
            color={iconColor ? undefined : "var(--color-primary)"}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-2xl font-bold text-card-foreground">
          {formatValue(value)}
        </p>

        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}

        {(change || trend) && (
          <div
            className={`flex items-center space-x-1 text-sm ${getChangeColor()}`}
          >
            <Icon name={getChangeIcon()} size={14} />
            {typeof change === "string" ? (
              <span>{change}</span>
            ) : (
              <>
                <span>{Math.abs(change || trend)}%</span>
                <span className="text-muted-foreground">vs last month</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricsCard;
