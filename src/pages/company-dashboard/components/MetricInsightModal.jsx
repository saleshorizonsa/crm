import React, { useMemo } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";

const MetricInsightModal = ({
  isOpen,
  onClose,
  metricType,
  metrics = {},
  teamData = [],
  dealsData = [],
}) => {
  const { formatCurrency, convertCurrency, preferredCurrency } = useCurrency();
  const { t } = useLanguage();

  // Helper to convert deal amount to user's preferred currency
  const getConvertedAmount = (deal) => {
    const amount = parseFloat(deal.amount) || 0;
    const dealCurrency = deal.currency || preferredCurrency;
    if (dealCurrency === preferredCurrency) return amount;
    return convertCurrency(amount, dealCurrency, preferredCurrency);
  };

  const formatPercent = (value) => `${(value || 0).toFixed(1)}%`;

  const ROLE_LABELS = {
    director: "Director",
    manager: "Manager",
    supervisor: "Supervisor",
    salesman: "Salesman",
  };

  // Get owner info from deal
  const getOwnerInfo = (deal) => {
    const owner = teamData.find((m) => m.id === deal.owner_id);
    return owner
      ? {
          name: owner.name || owner.full_name,
          role: ROLE_LABELS[owner.role] || owner.role,
        }
      : {
          name: deal.owner?.full_name || "Unassigned",
          role: "",
        };
  };

  // Calculate all metrics from deals
  const calculated = useMemo(() => {
    const wonDeals = dealsData.filter((d) => d.stage === "won");
    const lostDeals = dealsData.filter((d) => d.stage === "lost");
    const activeDeals = dealsData.filter(
      (d) => !["won", "lost"].includes(d.stage),
    );
    const closedDeals = [...wonDeals, ...lostDeals];

    const totalRevenue = wonDeals.reduce(
      (sum, d) => sum + getConvertedAmount(d),
      0,
    );
    const pipelineValue = activeDeals.reduce(
      (sum, d) => sum + getConvertedAmount(d),
      0,
    );
    const winRate =
      closedDeals.length > 0 ? (wonDeals.length / closedDeals.length) * 100 : 0;
    const conversionRate =
      dealsData.length > 0 ? (wonDeals.length / dealsData.length) * 100 : 0;

    // Get contributors (team members with deals)
    const contributorMap = new Map();

    dealsData.forEach((deal) => {
      const owner = teamData.find((m) => m.id === deal.owner_id);
      if (!owner) return;

      const key = owner.id;
      if (!contributorMap.has(key)) {
        contributorMap.set(key, {
          id: owner.id,
          name: owner.name || owner.full_name,
          role: ROLE_LABELS[owner.role] || owner.role,
          revenue: 0,
          wonDeals: 0,
          lostDeals: 0,
          activeDeals: 0,
          totalDeals: 0,
        });
      }

      const contributor = contributorMap.get(key);
      contributor.totalDeals++;

      if (deal.stage === "won") {
        contributor.wonDeals++;
        contributor.revenue += getConvertedAmount(deal);
      } else if (deal.stage === "lost") {
        contributor.lostDeals++;
      } else {
        contributor.activeDeals++;
      }
    });

    const contributors = Array.from(contributorMap.values());

    return {
      totalRevenue,
      pipelineValue,
      winRate,
      conversionRate,
      wonDealsCount: wonDeals.length,
      lostDealsCount: lostDeals.length,
      activeDealsCount: activeDeals.length,
      closedDealsCount: closedDeals.length,
      totalDealsCount: dealsData.length,
      wonDeals,
      activeDeals,
      closedDeals,
      contributors,
    };
  }, [dealsData, teamData]);

  // Early return AFTER all hooks
  if (!isOpen) return null;

  // Modal config based on metric type
  const getModalConfig = () => {
    switch (metricType) {
      case "totalRevenue":
        return {
          title: t("dashboard.totalRevenue") || "Total Revenue",
          icon: "DollarSign",
          color: "green",
          mainValue: formatCurrency(calculated.totalRevenue),
          subtitle: `From ${calculated.wonDealsCount} won deals`,
          contributors: calculated.contributors
            .filter((c) => c.revenue > 0)
            .sort((a, b) => b.revenue - a.revenue),
          renderContribution: (c) => formatCurrency(c.revenue),
          renderDetail: (c) => `${c.wonDeals} won deals`,
        };

      case "activePipeline":
        return {
          title: t("dashboard.activePipeline") || "Active Pipeline",
          icon: "TrendingUp",
          color: "blue",
          mainValue: formatCurrency(calculated.pipelineValue),
          subtitle: `${calculated.activeDealsCount} active opportunities`,
          contributors: calculated.contributors
            .filter((c) => c.activeDeals > 0)
            .sort((a, b) => b.activeDeals - a.activeDeals),
          renderContribution: (c) => `${c.activeDeals} deals`,
          renderDetail: (c) => `in pipeline`,
        };

      case "winRate":
        return {
          title: t("dashboard.winRate") || "Win Rate",
          icon: "Target",
          color: "purple",
          mainValue: formatPercent(calculated.winRate),
          subtitle: `${calculated.wonDealsCount} won / ${calculated.closedDealsCount} closed`,
          contributors: calculated.contributors
            .filter((c) => c.wonDeals > 0 || c.lostDeals > 0)
            .map((c) => ({
              ...c,
              winRate:
                c.wonDeals + c.lostDeals > 0
                  ? (c.wonDeals / (c.wonDeals + c.lostDeals)) * 100
                  : 0,
            }))
            .sort((a, b) => b.winRate - a.winRate),
          renderContribution: (c) => formatPercent(c.winRate),
          renderDetail: (c) => `${c.wonDeals}W / ${c.lostDeals}L`,
        };

      case "teamPerformance":
        return {
          title: t("reports.teamPerformance") || "Team Performance",
          icon: "Users",
          color: "orange",
          mainValue: `${calculated.contributors.length}`,
          subtitle: `Team members with deals`,
          contributors: calculated.contributors
            .filter((c) => c.totalDeals > 0)
            .sort((a, b) => b.revenue - a.revenue),
          renderContribution: (c) => formatCurrency(c.revenue),
          renderDetail: (c) => `${c.totalDeals} deals`,
        };

      case "dealsClosed":
        return {
          title: t("dashboard.dealsClosed") || "Deals Closed",
          icon: "CheckCircle",
          color: "emerald",
          mainValue: `${calculated.closedDealsCount}`,
          subtitle: `${calculated.wonDealsCount} won • ${calculated.lostDealsCount} lost`,
          contributors: calculated.contributors
            .filter((c) => c.wonDeals > 0 || c.lostDeals > 0)
            .sort(
              (a, b) => b.wonDeals + b.lostDeals - (a.wonDeals + a.lostDeals),
            ),
          renderContribution: (c) => `${c.wonDeals + c.lostDeals} closed`,
          renderDetail: (c) => `${c.wonDeals}W / ${c.lostDeals}L`,
        };

      case "conversionRate":
        return {
          title: t("dashboard.conversionRate") || "Conversion Rate",
          icon: "Zap",
          color: "yellow",
          mainValue: formatPercent(calculated.conversionRate),
          subtitle: `${calculated.wonDealsCount} won / ${calculated.totalDealsCount} total`,
          contributors: calculated.contributors
            .filter((c) => c.totalDeals > 0)
            .map((c) => ({
              ...c,
              conversionRate:
                c.totalDeals > 0 ? (c.wonDeals / c.totalDeals) * 100 : 0,
            }))
            .sort((a, b) => b.conversionRate - a.conversionRate),
          renderContribution: (c) => formatPercent(c.conversionRate),
          renderDetail: (c) => `${c.wonDeals} / ${c.totalDeals} deals`,
        };

      default:
        return {
          title: "Insights",
          icon: "BarChart2",
          color: "gray",
          mainValue: "-",
          subtitle: "",
          contributors: [],
          renderContribution: () => "",
          renderDetail: () => "",
        };
    }
  };

  const config = getModalConfig();
  const bgColor = `bg-${config.color}-50`;
  const textColor = `text-${config.color}-600`;
  const borderColor = `border-${config.color}-100`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose}></div>

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className={`${bgColor} ${borderColor} border-b px-5 py-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg bg-white/60 flex items-center justify-center`}
                >
                  <Icon name={config.icon} size={20} className={textColor} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {config.title}
                  </h3>
                  <p className="text-xs text-gray-500">{config.subtitle}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg"
              >
                <Icon name="X" size={18} />
              </button>
            </div>

            {/* Main Value */}
            <div className={`mt-3 text-3xl font-bold ${textColor}`}>
              {config.mainValue}
            </div>
          </div>

          {/* Contributors List */}
          <div className="px-5 py-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Contributors
            </h4>

            {config.contributors.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {config.contributors.map((contributor, index) => (
                  <div
                    key={contributor.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {contributor.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {contributor.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {contributor.role}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${textColor}`}>
                        {config.renderContribution(contributor)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {config.renderDetail(contributor)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                No contributors found
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.close") || "Close"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricInsightModal;
