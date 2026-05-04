import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../../contexts/CurrencyContext";

// Map supervisor chart stage keys → DB stage keys
const toDbStage = (key) => ({ qualified: "contact_made", proposal: "proposal_sent" }[key] ?? key);

const SupervisorPipelineChart = ({ deals, teamData, isLoading }) => {
  const { formatCurrency, convertCurrency, preferredCurrency } = useCurrency();
  const navigate = useNavigate();

  // Helper to convert deal amount to user's preferred currency
  const getConvertedAmount = (deal) => {
    const amount = parseFloat(deal.amount) || 0;
    const dealCurrency = deal.currency || preferredCurrency;
    if (dealCurrency === preferredCurrency) return amount;
    return convertCurrency(amount, dealCurrency, preferredCurrency);
  };

  const pipelineData = useMemo(() => {
    if (!deals || !Array.isArray(deals)) return [];

    const stages = [
      { key: "lead", name: "Lead", color: "bg-gray-400" },
      { key: "qualified", name: "Qualified", color: "bg-blue-400" },
      { key: "proposal", name: "Proposal", color: "bg-yellow-400" },
      { key: "negotiation", name: "Negotiation", color: "bg-orange-400" },
      { key: "won", name: "Won", color: "bg-green-400" },
      { key: "lost", name: "Lost", color: "bg-red-400" },
    ];

    return stages.map((stage) => {
      const stageDeals = deals.filter((deal) => deal.stage === stage.key);
      const stageValue = stageDeals.reduce(
        (sum, deal) => sum + getConvertedAmount(deal),
        0
      );

      return {
        ...stage,
        count: stageDeals.length,
        value: stageValue,
        deals: stageDeals,
      };
    });
  }, [deals]);

  const totalPipelineValue = pipelineData.reduce(
    (sum, stage) => sum + stage.value,
    0
  );
  const totalDeals = pipelineData.reduce((sum, stage) => sum + stage.count, 0);

  const conversionRates = useMemo(() => {
    if (!deals || deals.length === 0) return {};

    const totalLeads = deals.filter((d) => d.stage === "lead").length;
    const qualified = deals.filter((d) =>
      ["qualified", "proposal", "negotiation", "won"].includes(d.stage)
    ).length;
    const proposals = deals.filter((d) =>
      ["proposal", "negotiation", "won"].includes(d.stage)
    ).length;
    const negotiations = deals.filter((d) =>
      ["negotiation", "won"].includes(d.stage)
    ).length;
    const won = deals.filter((d) => d.stage === "won").length;

    return {
      leadToQualified:
        totalLeads > 0 ? ((qualified / totalLeads) * 100).toFixed(1) : 0,
      qualifiedToProposal:
        qualified > 0 ? ((proposals / qualified) * 100).toFixed(1) : 0,
      proposalToNegotiation:
        proposals > 0 ? ((negotiations / proposals) * 100).toFixed(1) : 0,
      negotiationToWon:
        negotiations > 0 ? ((won / negotiations) * 100).toFixed(1) : 0,
      overallConversion:
        totalLeads > 0 ? ((won / totalLeads) * 100).toFixed(1) : 0,
    };
  }, [deals]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="w-16 h-8 bg-gray-200 rounded"></div>
                <div className="flex-1 h-4 bg-gray-200 rounded"></div>
                <div className="w-20 h-4 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Sales Pipeline</h3>
        <div className="text-right">
          <div className="text-sm text-gray-500">Total Pipeline</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatCurrency(totalPipelineValue)}
          </div>
        </div>
      </div>

      {/* Pipeline Stages */}
      <div className="space-y-4 mb-6">
        {pipelineData.map((stage, index) => {
          const percentage =
            totalPipelineValue > 0
              ? (stage.value / totalPipelineValue) * 100
              : 0;

          return (
            <div
              key={stage.key}
              className="relative cursor-pointer hover:bg-gray-50 rounded-lg transition-colors -mx-2 px-2 group"
              onClick={() => navigate(`/sales-pipeline?stage=${toDbStage(stage.key)}`, { state: { activeStage: toDbStage(stage.key) } })}
              title={`View ${stage.name} deals`}
            >
              <div className="flex items-center justify-between text-sm mb-2">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded ${stage.color}`}></div>
                  <span className="font-medium text-gray-700">
                    {stage.name}
                  </span>
                  <span className="text-gray-500">({stage.count})</span>
                </div>
                <div className="text-gray-900 font-medium">
                  {formatCurrency(stage.value)}
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${stage.color}`}
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {percentage.toFixed(1)}% of pipeline
              </div>
            </div>
          );
        })}
      </div>

      {/* Pipeline Analytics */}
      <div className="border-t pt-6">
        <h4 className="text-sm font-medium text-gray-900 mb-4">
          Conversion Analytics
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Lead → Qualified</span>
              <span className="font-medium">
                {conversionRates.leadToQualified}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Qualified → Proposal</span>
              <span className="font-medium">
                {conversionRates.qualifiedToProposal}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Proposal → Negotiation</span>
              <span className="font-medium">
                {conversionRates.proposalToNegotiation}%
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Negotiation → Won</span>
              <span className="font-medium">
                {conversionRates.negotiationToWon}%
              </span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-900 font-medium">
                Overall Conversion
              </span>
              <span className="font-bold text-green-600">
                {conversionRates.overallConversion}%
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {totalDeals} total deals in pipeline
            </div>
          </div>
        </div>
      </div>

      {/* Team Pipeline Breakdown */}
      {teamData && teamData.length > 0 && (
        <div className="border-t pt-6 mt-6">
          <h4 className="text-sm font-medium text-gray-900 mb-4">
            Team Pipeline Breakdown
          </h4>
          <div className="space-y-2">
            {teamData
              .filter((member) => member.dealsCount > 0)
              .sort((a, b) => b.totalValue - a.totalValue)
              .slice(0, 5)
              .map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded"
                >
                  <div className="flex items-center space-x-2">
                    <div className="text-sm font-medium text-gray-900">
                      {member.name}
                      {member.isSupervisor && (
                        <span className="text-green-600 ml-1">(You)</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {member.dealsCount} deals
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(member.totalValue)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.conversionRate}% conv.
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SupervisorPipelineChart;
