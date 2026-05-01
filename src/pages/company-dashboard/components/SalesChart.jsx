import React, { useState, useMemo } from "react";
import { ResponsiveFunnel } from "@nivo/funnel";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveBar } from "@nivo/bar";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";

const STAGE_ORDER = [
  "lead",
  "contact_made",
  "proposal_sent",
  "negotiation",
  "won",
];

const STAGE_COLORS = {
  lead: "#3b82f6",
  contact_made: "#6366f1",
  proposal_sent: "#8b5cf6",
  negotiation: "#f59e0b",
  won: "#10b981",
};

const SalesChart = ({
  type: initialType = "pipeline",
  title,
  pipelineData = [],
  isLoading = false,
  showTypeSelector = true,
  readOnly = false,
}) => {
  const { formatCurrency } = useCurrency();
  const { t } = useLanguage();

  // Two top-level tabs only: Overview | Pipeline
  // (the old "funnel" / "distribution" map onto the new "pipeline" tab)
  const [activeView, setActiveView] = useState(
    initialType === "overview" ? "overview" : "pipeline"
  );

  // Chart variant inside the Pipeline tab
  const [chartType, setChartType] = useState("funnel"); // funnel | pyramid | donut | bar

  // Build stage data once; views derive their shape from this.
  const stageData = useMemo(() => {
    if (!pipelineData || pipelineData.length === 0) return [];

    const stageLabels = {
      lead: t("deals.stages.leads"),
      contact_made: t("deals.stages.qualified") || "Qualified",
      proposal_sent: t("deals.stages.proposals"),
      negotiation: t("deals.stages.negotiations"),
      won: t("deals.stages.wonDeals"),
    };

    const counts = STAGE_ORDER.map(
      (stage) => pipelineData.find((p) => p.stage === stage)?.count || 0
    );
    const amounts = STAGE_ORDER.map(
      (stage) => pipelineData.find((p) => p.stage === stage)?.totalValue || 0
    );

    // Cumulative ("reached this stage or beyond") so funnel/pyramid is monotonic.
    const cumulativeCounts = counts.map((_, idx) =>
      counts.slice(idx).reduce((sum, c) => sum + c, 0)
    );
    const cumulativeAmounts = amounts.map((_, idx) =>
      amounts.slice(idx).reduce((sum, a) => sum + a, 0)
    );

    return STAGE_ORDER.map((stage, idx) => ({
      id: stage,
      stage,
      label: stageLabels[stage] || stage,
      value: cumulativeCounts[idx],
      currentCount: counts[idx],
      amount: cumulativeAmounts[idx],
      color: STAGE_COLORS[stage] || "#3b82f6",
    })).filter((d) => d.value > 0);
  }, [pipelineData, t]);

  const conversionMetrics = useMemo(() => {
    if (!pipelineData || pipelineData.length === 0) return null;

    const get = (s) => pipelineData.find((p) => p.stage === s)?.count || 0;
    const totalLeads = get("lead");
    const totalContacted = get("contact_made");
    const totalProposals = get("proposal_sent");
    const totalNegotiations = get("negotiation");
    const totalWon = get("won");
    const totalLost = get("lost");

    const totalDeals =
      totalLeads +
      totalContacted +
      totalProposals +
      totalNegotiations +
      totalWon +
      totalLost;

    const reachedContact =
      totalContacted + totalProposals + totalNegotiations + totalWon;
    const reachedProposal = totalProposals + totalNegotiations + totalWon;
    const reachedNegotiation = totalNegotiations + totalWon;
    const reachedWon = totalWon;

    const totalPastLead = totalLeads + reachedContact;
    const totalPastContact = totalContacted + reachedProposal;
    const totalPastProposal = totalProposals + reachedNegotiation;
    const totalPastNegotiation = totalNegotiations + reachedWon;

    return {
      leadToContact:
        totalPastLead > 0 ? (reachedContact / totalPastLead) * 100 : 0,
      contactToProposal:
        totalPastContact > 0 ? (reachedProposal / totalPastContact) * 100 : 0,
      proposalToNegotiation:
        totalPastProposal > 0
          ? (reachedNegotiation / totalPastProposal) * 100
          : 0,
      negotiationToWin:
        totalPastNegotiation > 0
          ? (reachedWon / totalPastNegotiation) * 100
          : 0,
      overallWinRate: totalDeals > 0 ? (totalWon / totalDeals) * 100 : 0,
      overallLossRate: totalDeals > 0 ? (totalLost / totalDeals) * 100 : 0,
    };
  }, [pipelineData]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="w-32 h-6 bg-gray-200 rounded animate-pulse"></div>
          <div className="w-24 h-4 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="flex-1 min-h-[20rem] bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  const hasData = stageData.length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header: title + segmented tabs (matches TeamPerformance card) */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {showTypeSelector && !readOnly && (
          <div className="flex items-center gap-2">
            {activeView === "pipeline" && hasData && (
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
                className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={t("dashboard.chartType")}
              >
                <option value="funnel">
                  {t("dashboard.chartTypeFunnel")}
                </option>
                <option value="pyramid">
                  {t("dashboard.chartTypePyramid")}
                </option>
                <option value="donut">{t("dashboard.chartTypeDonut")}</option>
                <option value="bar">{t("dashboard.chartTypeBar")}</option>
              </select>
            )}
            <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveView("overview")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeView === "overview"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t("dashboard.overview")}
              </button>
              <button
                onClick={() => setActiveView("pipeline")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeView === "pipeline"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t("dashboard.pipeline")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-[24rem]">
        {activeView === "overview" && !conversionMetrics && (
          <EmptyState
            icon="BarChart2"
            label={t("dashboard.noSalesData") || "No sales data available"}
            sublabel={
              t("dashboard.createDealsToSeeMetrics") ||
              "Create deals to see performance metrics"
            }
          />
        )}

        {activeView === "overview" && conversionMetrics && (
          <OverviewView metrics={conversionMetrics} t={t} />
        )}

        {activeView === "pipeline" && !hasData && (
          <EmptyState
            icon="Filter"
            label={
              t("dashboard.noPipelineData") ||
              t("dashboard.noFunnelData") ||
              "No pipeline data available"
            }
          />
        )}

        {activeView === "pipeline" && hasData && (
          <PipelineView
            data={stageData}
            chartType={chartType}
            formatCurrency={formatCurrency}
          />
        )}
      </div>
    </div>
  );
};

const EmptyState = ({ icon, label, sublabel }) => (
  <div className="w-full h-full min-h-[20rem] flex items-center justify-center bg-gray-50 rounded-lg">
    <div className="text-center">
      <Icon name={icon} size={48} className="text-gray-400 mx-auto mb-4" />
      <p className="text-gray-500">{label}</p>
      {sublabel && <p className="text-sm text-gray-400 mt-1">{sublabel}</p>}
    </div>
  </div>
);

const OverviewView = ({ metrics, t }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-blue-600 font-medium">
            {t("dashboard.overallWinRate")}
          </span>
          <Icon name="TrendingUp" size={16} className="text-blue-600" />
        </div>
        <p className="text-2xl font-bold text-blue-900 mt-2">
          {metrics.overallWinRate.toFixed(1)}%
        </p>
      </div>
      <div className="bg-red-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-red-600 font-medium">
            {t("deals.lossRate")}
          </span>
          <Icon name="TrendingDown" size={16} className="text-red-600" />
        </div>
        <p className="text-2xl font-bold text-red-900 mt-2">
          {metrics.overallLossRate.toFixed(1)}%
        </p>
      </div>
      <div className="bg-green-50 rounded-lg p-4 col-span-2 lg:col-span-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-green-600 font-medium">
            {t("dashboard.closeRate")}
          </span>
          <Icon name="Target" size={16} className="text-green-600" />
        </div>
        <p className="text-2xl font-bold text-green-900 mt-2">
          {metrics.negotiationToWin.toFixed(1)}%
        </p>
      </div>
    </div>

    <div className="bg-gray-50 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">
        {t("dashboard.stageConversionRates")}
      </h4>
      <div className="space-y-3">
        {[
          {
            label: t("deals.leadToContact"),
            value: metrics.leadToContact,
            color: "blue",
          },
          {
            label: t("deals.contactToProposal"),
            value: metrics.contactToProposal,
            color: "indigo",
          },
          {
            label: t("deals.proposalToNegotiation"),
            value: metrics.proposalToNegotiation,
            color: "purple",
          },
          {
            label: t("deals.negotiationToWon"),
            value: metrics.negotiationToWin,
            color: "green",
          },
        ].map((metric, idx) => (
          <div key={idx}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-600">{metric.label}</span>
              <span className="text-sm font-semibold text-gray-900">
                {metric.value.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`bg-${metric.color}-500 h-2 rounded-full transition-all duration-500`}
                style={{ width: `${Math.min(metric.value, 100)}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/**
 * PipelineView
 * Renders the selected chart variant. All variants share the same data shape
 * derived in the parent so switching is instant and the legend stays consistent.
 */
const PipelineView = ({ data, chartType, formatCurrency }) => {
  return (
    <div className="w-full h-full min-h-[24rem]">
      <div className="w-full h-[24rem]">
        {chartType === "funnel" && (
          <FunnelChart
            data={data}
            reverse={false}
            formatCurrency={formatCurrency}
          />
        )}
        {chartType === "pyramid" && (
          <FunnelChart
            data={data}
            reverse={true}
            formatCurrency={formatCurrency}
          />
        )}
        {chartType === "donut" && (
          <DonutChart data={data} formatCurrency={formatCurrency} />
        )}
        {chartType === "bar" && (
          <BarChartView data={data} formatCurrency={formatCurrency} />
        )}
      </div>
    </div>
  );
};

const FunnelChart = ({ data, reverse, formatCurrency }) => {
  // Use synthetic widths for geometry so the silhouette is always clean.
  //
  // - Funnel: widths decrease top → bottom (wide top, narrow bottom).
  //     Stage order: Leads (top) → Won (bottom).
  //     Wide blue Leads on top, narrow green Won on bottom.
  // - Pyramid: widths increase top → bottom (narrow apex, wide base).
  //     Stage order reversed: Won (top) → Leads (bottom).
  //     Narrow green Won on top, wide blue Leads at the base.
  // Each band keeps its own stage color via `colors={(d) => d.color}`.
  //
  // Nivo's built-in label layer only renders `formattedValue` (a function of
  // the numeric value), so we replace it with a custom layer that reads the
  // real stage label and count from each part's datum.
  const ordered = reverse ? [...data].reverse() : data;
  const n = ordered.length;
  const maxW = 100;
  const minW = 20;
  const step = n > 1 ? (maxW - minW) / (n - 1) : 0;

  const topRealCount = ordered[0]?.value || 0;

  const nivoData = ordered.map((d, idx) => {
    // Funnel: width shrinks as idx grows (maxW → minW).
    // Pyramid: width grows as idx grows (minW → maxW).
    const width = reverse
      ? Math.max(minW + step * idx, minW)
      : Math.max(maxW - step * idx, minW);
    return {
      id: d.id,
      value: width,
      label: d.label,
      realCount: d.value,
      realAmount: d.amount,
      color: d.color,
      pctOfTop: topRealCount > 0 ? (d.value / topRealCount) * 100 : 0,
    };
  });

  const CustomLabelsLayer = ({ parts }) => (
    <g>
      {parts.map((part) => (
        <g key={part.data.id} transform={`translate(${part.x}, ${part.y})`}>
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            fontSize="14"
            fontWeight="700"
            style={{ pointerEvents: "none" }}
            y={-8}
          >
            {part.data.label}
          </text>
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            fontSize="13"
            fontWeight="500"
            opacity="0.95"
            style={{ pointerEvents: "none" }}
            y={10}
          >
            {part.data.realCount} deals
          </text>
        </g>
      ))}
    </g>
  );

  return (
    <ResponsiveFunnel
      data={nivoData}
      margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
      direction="vertical"
      interpolation="linear"
      shapeBlending={0.25}
      colors={(d) => d.color}
      borderWidth={2}
      enableBeforeSeparators={false}
      enableAfterSeparators={false}
      currentPartSizeExtension={6}
      currentBorderWidth={3}
      motionConfig="gentle"
      isInteractive={true}
      enableLabel={false}
      layers={["separators", "parts", CustomLabelsLayer, "annotations"]}
      tooltip={({ part }) => (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-1">
            {part?.data?.label}
          </p>
          <p className="text-sm text-gray-600">
            Deals: {part?.data?.realCount}
          </p>
          {part?.data?.realAmount !== undefined && (
            <p className="text-sm text-gray-600">
              Value: {formatCurrency(part.data.realAmount)}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {part?.data?.pctOfTop?.toFixed(1)}% of top stage
          </p>
        </div>
      )}
    />
  );
};

const DonutChart = ({ data, formatCurrency }) => {
  const nivoData = data.map((d) => ({
    id: d.label,
    label: d.label,
    value: d.value,
    amount: d.amount,
    color: d.color,
  }));

  return (
    <ResponsivePie
      data={nivoData}
      margin={{ top: 30, right: 80, bottom: 60, left: 80 }}
      innerRadius={0.6}
      padAngle={1}
      cornerRadius={3}
      activeOuterRadiusOffset={8}
      colors={({ data: d }) => d.color}
      borderWidth={1}
      borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
      arcLinkLabelsSkipAngle={10}
      arcLinkLabelsTextColor="#374151"
      arcLinkLabelsThickness={2}
      arcLinkLabelsColor={{ from: "color" }}
      arcLabelsSkipAngle={10}
      arcLabelsTextColor="#ffffff"
      tooltip={({ datum }) => (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-1">
            {datum.label}
          </p>
          <p className="text-sm text-gray-600">Deals: {datum.value}</p>
          {datum.data.amount !== undefined && (
            <p className="text-sm text-gray-600">
              Value: {formatCurrency(datum.data.amount)}
            </p>
          )}
        </div>
      )}
      legends={[
        {
          anchor: "bottom",
          direction: "row",
          translateY: 50,
          itemWidth: 90,
          itemHeight: 18,
          itemTextColor: "#6b7280",
          symbolSize: 12,
          symbolShape: "circle",
        },
      ]}
    />
  );
};

const BarChartView = ({ data, formatCurrency }) => {
  const nivoData = data.map((d) => ({
    stage: d.label,
    deals: d.value,
    amount: d.amount,
    color: d.color,
  }));

  return (
    <ResponsiveBar
      data={nivoData}
      keys={["deals"]}
      indexBy="stage"
      layout="horizontal"
      margin={{ top: 20, right: 30, bottom: 50, left: 110 }}
      padding={0.3}
      colors={({ data: d }) => d.color}
      borderRadius={4}
      axisLeft={{ tickSize: 0, tickPadding: 10 }}
      axisBottom={{ tickSize: 5, tickPadding: 5 }}
      labelSkipWidth={20}
      labelTextColor="#ffffff"
      tooltip={({ value, indexValue, data: d }) => (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-1">
            {indexValue}
          </p>
          <p className="text-sm text-gray-600">Deals: {value}</p>
          {d.amount !== undefined && (
            <p className="text-sm text-gray-600">
              Value: {formatCurrency(d.amount)}
            </p>
          )}
        </div>
      )}
      animate={true}
      motionConfig="gentle"
    />
  );
};

export default SalesChart;
