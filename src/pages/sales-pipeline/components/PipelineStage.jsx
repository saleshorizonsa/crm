import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import DealCard from "./DealCard";
import { useCurrency } from "../../../contexts/CurrencyContext";

const PipelineStage = ({
  stage,
  deals = [],
  onDealUpdate,
  onDealClick,
  onStageUpdate,
  onDragOver,
  onDrop,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { formatCurrency, preferredCurrency } = useCurrency();

  const getStageColor = (stageId) => {
    const map = {
      lead: "bg-slate-500",
      contact_made: "bg-blue-500",
      proposal_sent: "bg-yellow-500",
      negotiation: "bg-orange-500",
      won: "bg-green-500",
      lost: "bg-red-500",
    };
    return map[stageId] || "bg-gray-400";
  };

  const totalValue = deals.reduce((sum, d) => {
    const convertedAmount = d?.amount || 0;
    return sum + convertedAmount;
  }, 0);

  // Stage-based weighting for weighted value calculation
  const stageWeights = {
    lead: 0.1,
    contact_made: 0.25,
    proposal_sent: 0.5,
    negotiation: 0.75,
    won: 1.0,
    lost: 0,
  };

  const weightedValue = deals.reduce((sum, d) => {
    const convertedAmount = d?.amount || 0;
    const weight = stageWeights[d?.stage] || 0;
    return sum + convertedAmount * weight;
  }, 0);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add("bg-gray-50");
        onDragOver?.(stage.id);
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove("bg-gray-50");
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("bg-gray-50");
        const dealId = e.dataTransfer.getData("text/plain");
        onDrop?.(dealId, stage.id);
      }}
      className="flex flex-col bg-white border border-gray-200 rounded-xl shadow-sm w-[300px] flex-shrink-0 transition-all duration-200 hover:shadow-md"
    >
      {/* Stage Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl">
        <div className="flex items-center gap-3">
          <span
            className={`w-3 h-3 rounded-full ${getStageColor(stage?.name)}`}
          ></span>
          <div>
            <h3 className="text-sm font-semibold text-gray-800 capitalize">
              {stage?.name?.replace("_", " ")}
            </h3>
            <p className="text-xs text-gray-500">
              {deals.length} deal{deals.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 hover:bg-gray-100"
            onClick={() => setIsCollapsed((p) => !p)}
          >
            <Icon
              name={isCollapsed ? "ChevronDown" : "ChevronUp"}
              size={12}
              className="text-gray-600"
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 hover:bg-gray-100"
            onClick={() => onStageUpdate?.(stage.id)}
          >
            <Icon name="Settings" size={12} className="text-gray-600" />
          </Button>
        </div>
      </div>

      {/* Stage Summary */}
      {!isCollapsed && (
        <div className="px-4 py-2 border-b border-gray-100 text-xs bg-white">
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500">Total Value</span>
            <span className="font-medium text-gray-800">
              {formatCurrency(totalValue, preferredCurrency)}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500">Weighted</span>
            <span className="font-semibold text-blue-600">
              {formatCurrency(weightedValue, preferredCurrency)}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500">Avg. Deal</span>
            <span className="font-medium text-gray-800">
              {deals.length
                ? formatCurrency(totalValue / deals.length, preferredCurrency)
                : formatCurrency(0, preferredCurrency)}
            </span>
          </div>
        </div>
      )}

      {/* Deal Cards */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-white scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          {deals.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 text-gray-400">
              <Icon name="Inbox" size={32} className="mb-2" />
              <p className="text-sm mb-1">No deals in this stage</p>
            </div>
          ) : (
            deals.map((deal) => (
              <div
                key={deal.id}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("text/plain", deal.id)
                }
                className="cursor-grab active:cursor-grabbing"
              >
                <DealCard
                  deal={deal}
                  onDealClick={onDealClick}
                  onDealUpdate={onDealUpdate}
                />
              </div>
            ))
          )}
        </div>
      )}

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-3 border-t border-gray-100 bg-gray-50 rounded-b-xl"></div>
      )}
    </div>
  );
};

export default PipelineStage;
