import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";
import ActivityModal from "./ActivityModal";

const ActivityFeed = ({
  activities = [],
  isLoading = false,
  title = "Recent Activity",
  companyId = null,
  users = [],
  currentUserId = null,
}) => {
  const { formatCurrency } = useCurrency();
  const { t } = useLanguage();
  const [showActivityModal, setShowActivityModal] = useState(false);

  const getActivityIcon = (type) => {
    const iconMap = {
      sale: "DollarSign",
      task: "CheckSquare",
      contact: "Users",
      meeting: "Calendar",
      call: "Phone",
      email: "Mail",
      deal: "Handshake",
      note: "FileText",
    };
    return iconMap?.[type] || "Activity";
  };

  const getActivityColor = (type) => {
    const colorMap = {
      sale: "text-success",
      task: "text-primary",
      contact: "text-accent",
      meeting: "text-warning",
      call: "text-secondary",
      email: "text-muted-foreground",
      deal: "text-success",
      note: "text-muted-foreground",
    };
    return colorMap?.[type] || "text-muted-foreground";
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return "Unknown time";

    const now = new Date();
    const time = new Date(timestamp);

    // Check if valid date
    if (isNaN(time.getTime())) return "Invalid date";

    const diffInMinutes = Math.floor((now - time) / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
        <div className="w-32 h-6 bg-muted rounded skeleton mb-4"></div>
        <div className="space-y-4">
          {[...Array(5)]?.map((_, index) => (
            <div key={index} className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-muted rounded-full skeleton"></div>
              <div className="flex-1 space-y-2">
                <div className="w-3/4 h-4 bg-muted rounded skeleton"></div>
                <div className="w-1/2 h-3 bg-muted rounded skeleton"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
        <button
          onClick={() => setShowActivityModal(true)}
          className="text-sm text-primary hover:text-primary/80 transition-enterprise"
        >
          {t("common.viewAll")}
        </button>
      </div>
      <div className="space-y-4 max-h-80 overflow-y-auto">
        {activities?.length === 0 ? (
          <div className="text-center py-8">
            <Icon
              name="Activity"
              size={32}
              className="text-muted-foreground mx-auto mb-2"
            />
            <p className="text-sm text-muted-foreground">
              {t("dashboard.noRecentActivity")}
            </p>
          </div>
        ) : (
          activities?.map((activity) => (
            <div
              key={activity?.id}
              className="flex items-start space-x-3 group"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  activity?.type === "sale"
                    ? "bg-success/10"
                    : activity?.type === "task"
                      ? "bg-primary/10"
                      : activity?.type === "contact"
                        ? "bg-accent/10"
                        : "bg-muted"
                }`}
              >
                <Icon
                  name={getActivityIcon(activity?.type)}
                  size={14}
                  className={getActivityColor(activity?.type)}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-card-foreground group-hover:text-primary transition-enterprise">
                      {activity?.description}
                    </p>
                    {activity?.user && (
                      <div className="flex items-center space-x-2 mt-1">
                        <div className="w-4 h-4 bg-primary/10 rounded-full flex items-center justify-center">
                          <Icon
                            name="User"
                            size={10}
                            color="var(--color-primary)"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {typeof activity?.user === "string"
                            ? activity?.user
                            : activity?.user?.full_name ||
                              activity?.user?.email ||
                              "Unknown User"}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {formatTimeAgo(activity?.timestamp || activity?.created_at)}
                  </span>
                </div>

                {activity?.metadata && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {activity?.metadata?.amount && (
                      <span className="font-medium text-success">
                        {formatCurrency(activity?.metadata?.amount)}
                      </span>
                    )}
                    {activity?.metadata?.client && (
                      <span> • {activity?.metadata?.client}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Activity Modal */}
      <ActivityModal
        isOpen={showActivityModal}
        onClose={() => setShowActivityModal(false)}
        companyId={companyId}
        currentUserId={currentUserId}
      />
    </div>
  );
};

export default ActivityFeed;
