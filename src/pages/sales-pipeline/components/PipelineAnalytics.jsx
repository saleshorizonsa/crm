import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useAuth } from "../../../contexts/AuthContext";
import FunnelChart from "./FunnelChart";

const PipelineAnalytics = ({ deals, onStageFilter }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [collapseToggle, setCollapseToggle] = useState(false);
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { company } = useAuth();

  // Calculate metrics
  const getTotalPipelineValue = () => {
    return deals?.reduce((sum, deal) => {
      const convertedAmount = deal?.amount;
      return sum + convertedAmount;
    }, 0);
  };

  // Stage-based weighting for weighted pipeline value
  const stageWeights = {
    lead: 0.1,
    contact_made: 0.25,
    proposal_sent: 0.5,
    negotiation: 0.75,
    won: 1.0,
    lost: 0,
  };

  const getWeightedPipelineValue = () => {
    return deals?.reduce((sum, deal) => {
      const convertedAmount = deal?.amount;
      const weight = stageWeights[deal?.stage] || 0;
      return sum + convertedAmount * weight;
    }, 0);
  };

  const getConversionRate = () => {
    const wonDeals = deals?.filter((d) => d?.stage === "won")?.length || 0;
    const lostDeals = deals?.filter((d) => d?.stage === "lost")?.length || 0;
    const totalClosed = wonDeals + lostDeals;
    return totalClosed > 0 ? (wonDeals / totalClosed) * 100 : 0;
  };

  const getAverageDealSize = () => {
    return deals?.length > 0 ? getTotalPipelineValue() / deals?.length : 0;
  };

  const getWonDeals = () => {
    return deals?.filter((d) => d?.stage === "won")?.length || 0;
  };

  const getTotalDeals = () => {
    return deals?.length || 0;
  };

  const getAverageDealCycle = () => {
    const wonDeals = deals?.filter((d) => d?.stage === "won");
    if (!wonDeals || wonDeals.length === 0) return 0;

    const totalDays = wonDeals.reduce((sum, deal) => {
      if (deal.created_at && deal.expected_close_date) {
        const created = new Date(deal.created_at);
        const closed = new Date(deal.expected_close_date);
        const days = Math.floor((closed - created) / (1000 * 60 * 60 * 24));
        return sum + days;
      }
      return sum;
    }, 0);

    return Math.round(totalDays / wonDeals.length);
  };

  // Chart data
  const stageData = [
    {
      name: "Lead",
      deals: deals?.filter((d) => d?.stage === "lead")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "lead")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
    },
    {
      name: "Qualified",
      deals: deals?.filter((d) => d?.stage === "contact_made")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "contact_made")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
    },
    {
      name: "Proposal",
      deals: deals?.filter((d) => d?.stage === "proposal_sent")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "proposal_sent")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
    },
    {
      name: "Negotiation",
      deals: deals?.filter((d) => d?.stage === "negotiation")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "negotiation")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
    },
    {
      name: "Won",
      deals: deals?.filter((d) => d?.stage === "won")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "won")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
    },
  ];

  // Funnel data - only active stages (excluding lost)
  const funnelData = [
    {
      stage: "Lead",
      stageKey: "lead",
      count: deals?.filter((d) => d?.stage === "lead")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "lead")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
      fill: "#64748b",
    },
    {
      stage: "Qualified",
      stageKey: "contact_made",
      count: deals?.filter((d) => d?.stage === "contact_made")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "contact_made")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
      fill: "#3b82f6",
    },
    {
      stage: "Proposal",
      stageKey: "proposal_sent",
      count: deals?.filter((d) => d?.stage === "proposal_sent")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "proposal_sent")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
      fill: "#f59e0b",
    },
    {
      stage: "Negotiation",
      stageKey: "negotiation",
      count: deals?.filter((d) => d?.stage === "negotiation")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "negotiation")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
      fill: "#f97316",
    },
    {
      stage: "Won",
      stageKey: "won",
      count: deals?.filter((d) => d?.stage === "won")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "won")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
      fill: "#10b981",
    },
  ];

  const priorityData = [
    {
      name: "High",
      value: deals?.filter((d) => d?.priority === "high")?.length || 0,
      color: "#dc2626",
    },
    {
      name: "Medium",
      value: deals?.filter((d) => d?.priority === "medium")?.length || 0,
      color: "#d97706",
    },
    {
      name: "Low",
      value: deals?.filter((d) => d?.priority === "low")?.length || 0,
      color: "#059669",
    },
  ].filter((item) => item.value > 0);

  const tabs = [
    { id: "overview", label: "Overview", icon: "BarChart3" },
    { id: "funnel", label: "Funnel", icon: "Filter" },
    { id: "trends", label: "Trends", icon: "TrendingUp" },
    { id: "forecast", label: "Forecast", icon: "Calendar" },
  ];

  if (collapseToggle) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Icon name="BarChart3" size={20} className="text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-card-foreground">
                Funnel Analytics
              </h3>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapseToggle((prev) => !prev)}
          >
            <Icon name="ChevronDown" size={16} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center space-x-3">
          <Icon name="BarChart3" size={20} className="text-primary" />
          <h3 className="text-lg font-semibold text-card-foreground">
            Funnel Analytics
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapseToggle((prev) => !prev)}
        >
          <Icon name="ChevronUp" size={16} />
        </Button>
      </div>
      {/* Tabs */}
      <div className="flex items-center space-x-1 p-4 border-b border-border">
        {tabs?.map((tab) => (
          <Button
            key={tab?.id}
            variant={activeTab === tab?.id ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab?.id)}
            iconName={tab?.icon}
            iconPosition="left"
          >
            {tab?.label}
          </Button>
        ))}
      </div>
      {/* Content */}
      <div className="p-4">
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="DollarSign" size={16} className="text-primary" />
                  <span className="text-xs text-muted-foreground">
                    Total Funnel
                  </span>
                </div>
                <p className="text-lg font-bold text-card-foreground">
                  {formatCurrency(getTotalPipelineValue(), preferredCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {getTotalDeals()} deals
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="TrendingUp" size={16} className="text-success" />
                  <span className="text-xs text-muted-foreground">
                    Weighted Value
                  </span>
                </div>
                <p className="text-lg font-bold text-success">
                  {formatCurrency(
                    getWeightedPipelineValue(),
                    preferredCurrency,
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Stage-weighted
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="Award" size={16} className="text-warning" />
                  <span className="text-xs text-muted-foreground">
                    Avg. Deal Size
                  </span>
                </div>
                <p className="text-lg font-bold text-warning">
                  {formatCurrency(getAverageDealSize(), preferredCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Per deal</p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="Clock" size={16} className="text-accent" />
                  <span className="text-xs text-muted-foreground">
                    Avg. Cycle
                  </span>
                </div>
                <p className="text-lg font-bold text-accent">
                  {getAverageDealCycle()} days
                </p>
                <p className="text-xs text-muted-foreground mt-1">To close</p>
              </div>
            </div>

            {/* Stage Distribution Chart */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-3">
                Funnel Value by Stage
              </h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                    />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) =>
                        formatCurrency(value, preferredCurrency).replace(
                          /\.00$/,
                          "",
                        )
                      }
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        name === "deals"
                          ? `${value} deals`
                          : formatCurrency(value, preferredCurrency),
                        name === "deals" ? "Count" : "Value",
                      ]}
                    />
                    <Bar
                      dataKey="value"
                      fill="var(--color-primary)"
                      name="value"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Deal Count by Stage */}
            <div className="grid grid-cols-5 gap-3">
              {stageData.map((stage, idx) => (
                <div
                  key={idx}
                  className="bg-muted/30 rounded-lg p-3 text-center"
                >
                  <p className="text-2xl font-bold text-card-foreground">
                    {stage.deals}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stage.name}
                  </p>
                  <p className="text-xs text-primary font-medium mt-1">
                    {formatCurrency(stage.value, preferredCurrency)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "funnel" && (
          <div className="space-y-6">
            {/* Multi-type funnel chart */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-1">
                Sales Funnel — Deal Progression
              </h4>
              <p className="text-xs text-muted-foreground mb-4">
                Switch between visualization styles using the buttons below
              </p>
              <FunnelChart funnelData={funnelData} showSwitcher onStageClick={onStageFilter} />
              {onStageFilter && (
                <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1">
                  <Icon name="MousePointerClick" size={11} />
                  Click any stage to jump to that view in the pipeline above
                </p>
              )}
            </div>

            {/* Funnel Metrics */}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border">
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="Users" size={16} className="text-primary" />
                  <span className="text-xs text-muted-foreground">
                    Top of Funnel
                  </span>
                </div>
                <p className="text-lg font-bold text-card-foreground">
                  {funnelData[0]?.count || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Leads entered
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="Target" size={16} className="text-success" />
                  <span className="text-xs text-muted-foreground">
                    Lead → Won
                  </span>
                </div>
                <p className="text-lg font-bold text-success">
                  {funnelData[0]?.count > 0
                    ? ((funnelData[4]?.count / funnelData[0]?.count) * 100).toFixed(1)
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Conversion rate
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="TrendingUp" size={16} className="text-warning" />
                  <span className="text-xs text-muted-foreground">
                    Win Rate
                  </span>
                </div>
                <p className="text-lg font-bold text-warning">
                  {getTotalDeals() > 0
                    ? ((getWonDeals() / getTotalDeals()) * 100).toFixed(1)
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">Overall</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "trends" && (
          <div className="space-y-6">
            {/* Priority Distribution */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-3">
                Deal Priority Distribution
              </h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={priorityData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {priorityData?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry?.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} deals`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Priority Breakdown */}
            <div className="grid grid-cols-3 gap-4">
              {priorityData?.map((item) => (
                <div key={item?.name} className="bg-muted/30 rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item?.color }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {item?.name} Priority
                    </span>
                  </div>
                  <p className="text-lg font-bold text-card-foreground">
                    {item?.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">deals</p>
                </div>
              ))}
            </div>

            {/* Stage Velocity Chart */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-3">
                Funnel Stage Values
              </h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stageData}>
                    <defs>
                      <linearGradient
                        id="colorValue"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-primary)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-primary)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                    />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) =>
                        formatCurrency(value, preferredCurrency).replace(
                          /\.00$/,
                          "",
                        )
                      }
                    />
                    <Tooltip
                      formatter={(value) => [
                        formatCurrency(value, preferredCurrency),
                        "Value",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-primary)"
                      fillOpacity={1}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === "forecast" && (
          <div className="space-y-6">
            {/* No Forecast Message */}
            <div className="bg-muted/30 border border-border rounded-lg p-8 text-center">
              <Icon
                name="TrendingUp"
                size={48}
                className="mx-auto mb-4 text-muted-foreground opacity-50"
              />
              <h4 className="text-lg font-semibold text-card-foreground mb-2">
                Forecast Data Not Available
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Revenue forecasting requires historical data and trend analysis.
                Keep closing deals and check back soon!
              </p>
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-background px-3 py-2 rounded-md">
                <Icon name="Info" size={14} />
                <span>
                  Forecast will be available once you have sufficient deal
                  history
                </span>
              </div>
            </div>

            {/* Current Funnel Summary */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-3">
                Current Funnel Snapshot
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Icon
                      name="DollarSign"
                      size={16}
                      className="text-primary"
                    />
                    <span className="text-xs text-muted-foreground">
                      Active Funnel
                    </span>
                  </div>
                  <p className="text-xl font-bold text-card-foreground">
                    {formatCurrency(getTotalPipelineValue(), preferredCurrency)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total value
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Icon name="Target" size={16} className="text-success" />
                    <span className="text-xs text-muted-foreground">
                      Expected Close
                    </span>
                  </div>
                  <p className="text-xl font-bold text-success">
                    {formatCurrency(
                      getWeightedPipelineValue(),
                      preferredCurrency,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Weighted by stage
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Icon name="Award" size={16} className="text-warning" />
                    <span className="text-xs text-muted-foreground">
                      Won This Period
                    </span>
                  </div>
                  <p className="text-xl font-bold text-warning">
                    {getWonDeals()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Closed deals
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PipelineAnalytics;
