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
import { supabase } from "../../../lib/supabase";
import FunnelChart from "./FunnelChart";
import { useLanguage } from "../../../i18n";
import { groupDealsByMaterialGroup } from "../../../utils/dealGroupUtils";

const LOST_CODE_LABELS = {
  PRICE_HIGH:        "Price too high",
  PRICE_COMPETITOR:  "Competitor offered lower price",
  BUDGET_CUT:        "Customer budget cut or frozen",
  CREDIT_TERMS:      "Better credit terms elsewhere",
  LOCAL_COMPETITOR:  "Lost to local competitor",
  IMPORT_COMPETITOR: "Lost to cheaper imported product",
  EXISTING_SUPPLIER: "Customer stayed with existing supplier",
  SPEC_MISMATCH:     "Specification did not match",
  STOCK_DELAY:       "Stock unavailable or lead time too long",
  MOQ_HIGH:          "Minimum order quantity too high",
  QUALITY_CONCERN:   "Quality concern raised",
  PROJECT_CANCELLED: "Project cancelled or postponed",
  NO_RESPONSE:       "Customer went silent",
  DECISION_CHANGE:   "Decision maker changed",
  CUSTOMER_CLOSED:   "Customer closed or restructured",
  QUOTE_EXPIRED:     "Quote expired before decision",
  LC_TERMS:          "LC payment terms not accepted",
  MARGIN_LOW:        "Margin too low to proceed",
  WITHDREW_OFFER:    "We withdrew the offer",
  CAPACITY:          "Capacity not available",
};

const PipelineAnalytics = ({ deals, onStageFilter }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [collapseToggle, setCollapseToggle] = useState(false);
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { company, userProfile } = useAuth();
  const { t } = useLanguage();
  const canSeeLostReasons = userProfile?.role !== "salesman";
  const [lostChartData, setLostChartData] = useState([]);

  // Fetch lost deal reason distribution directly (separate from the deals prop)
  useEffect(() => {
    if (!company?.id) return;
    const fetchLostReasons = async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("lost_reason_code, amount")
        .eq("company_id", company.id)
        .eq("stage", "lost")
        .not("lost_reason_code", "is", null);

      if (error || !data) return;

      // Aggregate by code
      const agg = {};
      data.forEach(({ lost_reason_code, amount }) => {
        if (!agg[lost_reason_code]) agg[lost_reason_code] = { count: 0, value: 0 };
        agg[lost_reason_code].count += 1;
        agg[lost_reason_code].value += parseFloat(amount || 0);
      });

      const chart = Object.entries(agg)
        .map(([code, { count, value }]) => ({
          code,
          label: LOST_CODE_LABELS[code] || code,
          count,
          value,
        }))
        .sort((a, b) => b.count - a.count);

      setLostChartData(chart);
    };
    fetchLostReasons();
  }, [company?.id]);

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
      name: t("deals.lead"),
      deals: deals?.filter((d) => d?.stage === "lead")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "lead")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
    },
    {
      name: t("deals.qualified"),
      deals: deals?.filter((d) => d?.stage === "contact_made")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "contact_made")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
    },
    {
      name: t("deals.proposal"),
      deals: deals?.filter((d) => d?.stage === "proposal_sent")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "proposal_sent")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
    },
    {
      name: t("deals.negotiation"),
      deals: deals?.filter((d) => d?.stage === "negotiation")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "negotiation")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
    },
    {
      name: t("deals.won"),
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
      stage: t("deals.lead"),
      stageKey: "lead",
      count: deals?.filter((d) => d?.stage === "lead")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "lead")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
      fill: "#64748b",
    },
    {
      stage: t("deals.qualified"),
      stageKey: "contact_made",
      count: deals?.filter((d) => d?.stage === "contact_made")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "contact_made")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
      fill: "#3b82f6",
    },
    {
      stage: t("deals.proposal"),
      stageKey: "proposal_sent",
      count: deals?.filter((d) => d?.stage === "proposal_sent")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "proposal_sent")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
      fill: "#f59e0b",
    },
    {
      stage: t("deals.negotiation"),
      stageKey: "negotiation",
      count: deals?.filter((d) => d?.stage === "negotiation")?.length || 0,
      value:
        deals
          ?.filter((d) => d?.stage === "negotiation")
          ?.reduce((sum, d) => sum + (d?.amount || 0), 0) || 0,
      fill: "#f97316",
    },
    {
      stage: t("deals.won"),
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
      name: t("dashboard.high"),
      value: deals?.filter((d) => d?.priority === "high")?.length || 0,
      color: "#dc2626",
    },
    {
      name: t("dashboard.medium"),
      value: deals?.filter((d) => d?.priority === "medium")?.length || 0,
      color: "#d97706",
    },
    {
      name: t("dashboard.low"),
      value: deals?.filter((d) => d?.priority === "low")?.length || 0,
      color: "#059669",
    },
  ].filter((item) => item.value > 0);

  const tabs = [
    { id: "overview",  label: t("dashboard.overview"),    icon: "BarChart3"  },
    { id: "funnel",    label: t("dashboard.funnel"),       icon: "Filter"     },
    { id: "trends",    label: t("pipeline.trends"),       icon: "TrendingUp" },
    { id: "forecast",  label: t("nav.forecast"),     icon: "Calendar"   },
    ...(canSeeLostReasons ? [{ id: "lost", label: t("pipeline.lostReasons"), icon: "XCircle" }] : []),
  ];

  if (collapseToggle) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Icon name="BarChart3" size={20} className="text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-card-foreground">
                {t("pipeline.funnelAnalytics")}
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
            {t("pipeline.funnelAnalytics")}
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
                    {t("pipeline.totalFunnel")}
                  </span>
                </div>
                <p className="text-lg font-bold text-card-foreground">
                  {formatCurrency(getTotalPipelineValue(), preferredCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {getTotalDeals()} {t("pipeline.deals")}
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="TrendingUp" size={16} className="text-success" />
                  <span className="text-xs text-muted-foreground">
                    {t("pipeline.weightedValue")}
                  </span>
                </div>
                <p className="text-lg font-bold text-success">
                  {formatCurrency(
                    getWeightedPipelineValue(),
                    preferredCurrency,
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("pipeline.stageWeighted")}
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="Award" size={16} className="text-warning" />
                  <span className="text-xs text-muted-foreground">
                    {t("pipeline.avgDeal")}
                  </span>
                </div>
                <p className="text-lg font-bold text-warning">
                  {formatCurrency(getAverageDealSize(), preferredCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("pipeline.perDeal")}</p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="Clock" size={16} className="text-accent" />
                  <span className="text-xs text-muted-foreground">
                    {t("pipeline.avgCycle")}
                  </span>
                </div>
                <p className="text-lg font-bold text-accent">
                  {getAverageDealCycle()} days
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("pipeline.toClose")}</p>
              </div>
            </div>

            {/* Stage Distribution Chart */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-3">
                {t("pipeline.funnelValueByStage")}
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

            {/* Material Group Breakdown */}
            {(() => {
              const grouped = groupDealsByMaterialGroup(deals || []);
              const stats = Object.entries(grouped)
                .map(([group, groupDeals]) => ({
                  group,
                  count: groupDeals.length,
                  totalValue: groupDeals.reduce((s, d) => s + parseFloat(d.amount || 0), 0),
                }))
                .sort((a, b) => {
                  if (a.group === 'No Products') return 1;
                  if (b.group === 'No Products') return -1;
                  return b.totalValue - a.totalValue;
                });
              if (stats.length === 0) return null;
              const maxVal = stats.filter(s => s.group !== 'No Products')[0]?.totalValue || stats[0]?.totalValue || 1;
              return (
                <div>
                  <h4 className="text-sm font-semibold text-card-foreground mb-3 flex items-center gap-2">
                    <Icon name="Layers" size={14} className="text-muted-foreground" />
                    Pipeline by Material Group
                  </h4>
                  <div className="space-y-2">
                    {stats.map(({ group, count, totalValue }) => {
                      const pct = maxVal > 0 ? Math.round((totalValue / maxVal) * 100) : 0;
                      return (
                        <div key={group} className="flex items-center gap-3">
                          <div className="w-36 text-xs text-muted-foreground truncate flex-shrink-0">
                            {group}
                          </div>
                          <div className="flex-1 bg-muted/40 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="w-6 text-right text-xs text-muted-foreground flex-shrink-0">
                            {count}
                          </div>
                          <div className="w-28 text-right text-xs font-medium text-card-foreground flex-shrink-0">
                            {formatCurrency(totalValue, preferredCurrency)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "funnel" && (
          <div className="space-y-6">
            {/* Multi-type funnel chart */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-1">
                {t("pipeline.salesFunnelTitle")}
              </h4>
              <p className="text-xs text-muted-foreground mb-4">
                {t("pipeline.switchVisualization")}
              </p>
              <FunnelChart funnelData={funnelData} showSwitcher onStageClick={onStageFilter} />
              {onStageFilter && (
                <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1">
                  <Icon name="MousePointerClick" size={11} />
                  {t("pipeline.clickStageToFilter")}
                </p>
              )}
            </div>

            {/* Funnel Metrics */}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border">
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="Users" size={16} className="text-primary" />
                  <span className="text-xs text-muted-foreground">
                    {t("pipeline.topOfFunnel")}
                  </span>
                </div>
                <p className="text-lg font-bold text-card-foreground">
                  {funnelData[0]?.count || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("pipeline.leadsEntered")}
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="Target" size={16} className="text-success" />
                  <span className="text-xs text-muted-foreground">
                    {t("deals.leadToContact")}
                  </span>
                </div>
                <p className="text-lg font-bold text-success">
                  {funnelData[0]?.count > 0
                    ? ((funnelData[4]?.count / funnelData[0]?.count) * 100).toFixed(1)
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("dashboard.conversionRate")}
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon name="TrendingUp" size={16} className="text-warning" />
                  <span className="text-xs text-muted-foreground">
                    {t("deals.winRate")}
                  </span>
                </div>
                <p className="text-lg font-bold text-warning">
                  {getConversionRate().toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("pipeline.overall")}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "trends" && (
          <div className="space-y-6">
            {/* Priority Distribution */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-3">
                {t("pipeline.dealPriorityDistribution")}
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
                      {item?.name} {t("tasks.priority")}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-card-foreground">
                    {item?.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{t("pipeline.deals")}</p>
                </div>
              ))}
            </div>

            {/* Stage Velocity Chart */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-3">
                {t("pipeline.funnelStageValues")}
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

        {activeTab === "lost" && (
          <div className="space-y-6">
            {lostChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Icon name="XCircle" size={48} className="text-muted-foreground opacity-30 mb-3" />
                <p className="text-base font-medium text-card-foreground">{t("pipeline.noLostData")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("pipeline.noLostDataDesc")}
                </p>
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon name="XCircle" size={15} className="text-red-500" />
                      <span className="text-xs text-red-700">{t("pipeline.totalLost")}</span>
                    </div>
                    <p className="text-xl font-bold text-red-700">
                      {lostChartData.reduce((s, r) => s + r.count, 0)}
                    </p>
                    <p className="text-xs text-red-500 mt-1">{t("pipeline.deals")}</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon name="DollarSign" size={15} className="text-red-500" />
                      <span className="text-xs text-red-700">{t("pipeline.lostValue")}</span>
                    </div>
                    <p className="text-xl font-bold text-red-700">
                      {formatCurrency(lostChartData.reduce((s, r) => s + r.value, 0), preferredCurrency)}
                    </p>
                    <p className="text-xs text-red-500 mt-1">{t("common.total")}</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon name="AlertCircle" size={15} className="text-red-500" />
                      <span className="text-xs text-red-700">{t("pipeline.topReason")}</span>
                    </div>
                    <p className="text-sm font-bold text-red-700 leading-tight">
                      {lostChartData[0]?.label || "—"}
                    </p>
                    <p className="text-xs text-red-500 mt-1">{lostChartData[0]?.count} {t("pipeline.deals")}</p>
                  </div>
                </div>

                {/* Horizontal bar chart — count */}
                <div>
                  <h4 className="text-sm font-semibold text-card-foreground mb-3">
                    {t("pipeline.whyDealsLost")}
                  </h4>
                  <div style={{ height: Math.max(200, lostChartData.length * 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={lostChartData}
                        layout="vertical"
                        margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={200}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip
                          formatter={(value) => [`${value} deal${value !== 1 ? "s" : ""}`, "Count"]}
                        />
                        <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Lost value by reason */}
                <div>
                  <h4 className="text-sm font-semibold text-card-foreground mb-3">
                    {t("pipeline.totalLostValueByReason")}
                  </h4>
                  <div className="space-y-2">
                    {lostChartData.map((row) => {
                      const maxVal = lostChartData[0]?.value || 1;
                      const pct = Math.round((row.value / maxVal) * 100);
                      return (
                        <div key={row.code} className="flex items-center gap-3 text-sm">
                          <div className="w-44 text-xs text-muted-foreground truncate flex-shrink-0">
                            {row.label}
                          </div>
                          <div className="flex-1 bg-red-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-red-500 h-2 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="w-28 text-right text-xs font-medium text-red-700 flex-shrink-0">
                            {formatCurrency(row.value, preferredCurrency)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
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
                {t("pipeline.forecastNotAvailable")}
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                {t("pipeline.forecastDesc")}
              </p>
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-background px-3 py-2 rounded-md">
                <Icon name="Info" size={14} />
                <span>
                  {t("pipeline.forecastNote")}
                </span>
              </div>
            </div>

            {/* Current Funnel Summary */}
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-3">
                {t("pipeline.currentFunnelSnapshot")}
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
                      {t("pipeline.activeFunnel")}
                    </span>
                  </div>
                  <p className="text-xl font-bold text-card-foreground">
                    {formatCurrency(getTotalPipelineValue(), preferredCurrency)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("pipeline.totalValue")}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Icon name="Target" size={16} className="text-success" />
                    <span className="text-xs text-muted-foreground">
                      {t("deals.forecastedClose")}
                    </span>
                  </div>
                  <p className="text-xl font-bold text-success">
                    {formatCurrency(
                      getWeightedPipelineValue(),
                      preferredCurrency,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("pipeline.weightedByStage")}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Icon name="Award" size={16} className="text-warning" />
                    <span className="text-xs text-muted-foreground">
                      {t("pipeline.wonThisPeriod")}
                    </span>
                  </div>
                  <p className="text-xl font-bold text-warning">
                    {getWonDeals()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("dashboard.closedDeals")}
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
