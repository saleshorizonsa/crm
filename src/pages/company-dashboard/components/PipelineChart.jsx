import React from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";

const PipelineChart = ({ pipelineData = [], selectedCompany }) => {
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Ensure pipelineData is always an array
  const data = pipelineData || [];

  const stageConfig = {
    lead: {
      label: t("deals.stages.lead"),
      color: "bg-blue-500",
      textColor: "text-blue-600",
    },
    contact_made: {
      label: t("dashboard.contactMade"),
      color: "bg-yellow-500",
      textColor: "text-yellow-600",
    },
    proposal_sent: {
      label: t("dashboard.proposalSent"),
      color: "bg-orange-500",
      textColor: "text-orange-600",
    },
    negotiation: {
      label: t("deals.stages.negotiation"),
      color: "bg-purple-500",
      textColor: "text-purple-600",
    },
    won: {
      label: t("deals.stages.won"),
      color: "bg-green-500",
      textColor: "text-green-600",
    },
    lost: {
      label: t("deals.stages.lost"),
      color: "bg-red-500",
      textColor: "text-red-600",
    },
  };

  const totalValue = data.reduce(
    (sum, stage) => sum + (stage?.totalValue || 0),
    0
  );
  const totalDeals = data.reduce((sum, stage) => sum + (stage?.count || 0), 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {t("nav.salesPipeline")}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {selectedCompany?.name || "Company"} •{" "}
            {totalDeals} {t("nav.deals").toLowerCase()} •{" "}
            {formatCurrency(totalValue)}
          </p>
        </div>
        <Icon name="TrendingUp" size={24} className="text-blue-600" />
      </div>

      <div className="space-y-4">
        {data.map((stage, index) => {
          const config = stageConfig[stage.stage] || stageConfig.lead;
          const percentage =
            totalValue > 0 ? (stage.totalValue / totalValue) * 100 : 0;

          return (
            <div
              key={stage.stage}
              className="relative cursor-pointer rounded-lg hover:bg-muted/40 transition-colors -mx-2 px-2 py-1 group"
              onClick={() => navigate(`/sales-pipeline?stage=${stage.stage}`)}
              title={`View ${config.label} deals in pipeline`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${config.color}`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {config.label}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({stage.count} {t("nav.deals").toLowerCase()})
                  </span>
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  {formatCurrency(stage.totalValue)}
                </div>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                <div
                  className={`h-2 rounded-full ${config.color} transition-all duration-500`}
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>

              <div className="flex justify-between text-xs text-gray-500">
                <span>
                  {percentage.toFixed(1)}% {t("dashboard.ofTotalValue")}
                </span>
                <span>
                  {t("dashboard.avg")}:{" "}
                  {formatCurrency(
                    stage.count > 0 ? stage.totalValue / stage.count : 0,
                    preferredCurrency
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground text-center opacity-60">
        Click any stage to open the pipeline filtered to that stage
      </p>

      {/* Pipeline velocity indicators */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs text-gray-500">
              {t("dashboard.winRate")}
            </div>
            <div className="text-lg font-semibold text-green-600">
              {totalDeals > 0
                ? (
                    ((data.find((s) => s.stage === "won")?.count || 0) /
                      totalDeals) *
                    100
                  ).toFixed(1)
                : 0}
              %
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">
              {t("deals.avgDealSize")}
            </div>
            <div className="text-lg font-semibold text-blue-600">
              {formatCurrency(
                totalDeals > 0 ? totalValue / totalDeals : 0,
                preferredCurrency
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">
              {t("dashboard.activePipeline")}
            </div>
            <div className="text-lg font-semibold text-purple-600">
              {formatCurrency(
                data
                  .filter((s) => !["won", "lost"].includes(s.stage))
                  .reduce((sum, s) => sum + (s?.totalValue || 0), 0),
                preferredCurrency
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PipelineChart;
