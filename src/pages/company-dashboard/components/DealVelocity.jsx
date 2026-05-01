import React from "react";
import Icon from "../../../components/AppIcon";

const DealVelocity = ({ deals = [], isLoading = false }) => {
  const calculateVelocity = () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get deals created in last 30 days
    const recentDeals = deals.filter((deal) => {
      const createdDate = new Date(deal.created_at);
      return createdDate >= thirtyDaysAgo;
    });

    // Get deals won in last 30 days
    const wonDeals = deals.filter((deal) => {
      const updatedDate = new Date(deal.updated_at || deal.created_at);
      return deal.stage === "won" && updatedDate >= thirtyDaysAgo;
    });

    // Calculate average time to close for won deals
    const avgTimeToClose =
      wonDeals.length > 0
        ? wonDeals.reduce((sum, deal) => {
            const created = new Date(deal.created_at);
            const closed = new Date(deal.updated_at || deal.created_at);
            const daysToClose = Math.floor(
              (closed - created) / (1000 * 60 * 60 * 24)
            );
            return sum + daysToClose;
          }, 0) / wonDeals.length
        : 0;

    // Calculate stages and their average time
    const stageVelocity = {
      lead: { count: 0, avgDays: 0 },
      qualified: { count: 0, avgDays: 0 },
      proposal: { count: 0, avgDays: 0 },
      negotiation: { count: 0, avgDays: 0 },
      closed: { count: 0, avgDays: 0 },
    };

    deals.forEach((deal) => {
      if (stageVelocity[deal.stage]) {
        stageVelocity[deal.stage].count++;
        const daysSinceCreated = Math.floor(
          (now - new Date(deal.created_at)) / (1000 * 60 * 60 * 24)
        );
        stageVelocity[deal.stage].avgDays += daysSinceCreated;
      }
    });

    Object.keys(stageVelocity).forEach((stage) => {
      if (stageVelocity[stage].count > 0) {
        stageVelocity[stage].avgDays = Math.round(
          stageVelocity[stage].avgDays / stageVelocity[stage].count
        );
      }
    });

    return {
      newDeals: recentDeals.length,
      wonDeals: wonDeals.length,
      avgTimeToClose: Math.round(avgTimeToClose),
      stageVelocity,
      conversionRate:
        recentDeals.length > 0
          ? Math.round((wonDeals.length / recentDeals.length) * 100)
          : 0,
    };
  };

  const velocity = calculateVelocity();

  const getStageIcon = (stage) => {
    const icons = {
      lead: "UserPlus",
      qualified: "CheckCircle",
      proposal: "FileText",
      negotiation: "Handshake",
      closed: "Trophy",
    };
    return icons[stage] || "Circle";
  };

  const getStageColor = (stage) => {
    const colors = {
      lead: "text-blue-500",
      qualified: "text-green-500",
      proposal: "text-yellow-500",
      negotiation: "text-orange-500",
      closed: "text-purple-500",
    };
    return colors[stage] || "text-muted-foreground";
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
        <div className="w-32 h-6 bg-muted rounded skeleton mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-full h-12 bg-muted rounded skeleton"
            ></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-card-foreground">
          Deal Velocity
        </h3>
        <Icon name="Zap" size={20} className="text-accent" />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center p-3 bg-success/10 rounded-lg">
          <div className="text-2xl font-bold text-success">
            {velocity.newDeals}
          </div>
          <div className="text-xs text-muted-foreground">New Deals (30d)</div>
        </div>
        <div className="text-center p-3 bg-primary/10 rounded-lg">
          <div className="text-2xl font-bold text-primary">
            {velocity.avgTimeToClose}
          </div>
          <div className="text-xs text-muted-foreground">
            Avg. Days to Close
          </div>
        </div>
      </div>

      {/* Stage Breakdown */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-card-foreground mb-3">
          Pipeline Stages
        </h4>

        {Object.entries(velocity.stageVelocity).map(([stage, data]) => (
          <div
            key={stage}
            className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <Icon
                name={getStageIcon(stage)}
                size={16}
                className={getStageColor(stage)}
              />
              <div>
                <span className="text-sm font-medium text-card-foreground capitalize">
                  {stage}
                </span>
                <div className="text-xs text-muted-foreground">
                  {data.count} deals
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-medium text-card-foreground">
                {data.avgDays} days
              </div>
              <div className="text-xs text-muted-foreground">avg. age</div>
            </div>
          </div>
        ))}
      </div>

      {/* Conversion Rate */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Conversion Rate (30d)
          </span>
          <div className="flex items-center space-x-2">
            <span className="text-lg font-semibold text-card-foreground">
              {velocity.conversionRate}%
            </span>
            {velocity.conversionRate >= 20 ? (
              <Icon name="TrendingUp" size={16} className="text-success" />
            ) : (
              <Icon name="TrendingDown" size={16} className="text-warning" />
            )}
          </div>
        </div>

        <div className="mt-2 w-full bg-muted rounded-full h-2">
          <div
            className="bg-gradient-to-r from-primary to-success rounded-full h-2 transition-all"
            style={{ width: `${Math.min(velocity.conversionRate, 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default DealVelocity;
