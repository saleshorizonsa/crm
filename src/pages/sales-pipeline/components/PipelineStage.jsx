import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import DealCard from "./DealCard";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";
import { groupDealsByMaterialGroup, getDealOrigin } from "../../../utils/dealGroupUtils";

// ─── Grouped view component ───────────────────────────────────────────────────

function GroupedDealsList({ deals, onDealClick, onDealUpdate, activePeriodFrom }) {
  const grouped = groupDealsByMaterialGroup(deals);
  const groups  = Object.keys(grouped).sort((a, b) => {
    if (a === 'No Products') return 1;
    if (b === 'No Products') return -1;
    return a.localeCompare(b);
  });

  const [collapsedGroups, setCollapsedGroups] = useState({});

  function toggleGroup(group) {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  }

  return (
    <div className="space-y-2">
      {groups.map(group => {
        const groupDeals  = grouped[group];
        const isCollapsed = collapsedGroups[group];
        const groupTotal  = groupDeals.reduce(
          (s, d) => s + parseFloat(d.amount || 0), 0
        );

        return (
          <div key={group} className="rounded-lg overflow-hidden border border-gray-200">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon
                  name={isCollapsed ? 'ChevronRight' : 'ChevronDown'}
                  size={12}
                  className="text-gray-400 flex-shrink-0"
                />
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide truncate max-w-[120px]">
                  {group}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500 flex-shrink-0">
                  {groupDeals.length}
                </span>
              </div>
              <span className="text-xs font-medium text-gray-600 flex-shrink-0 ml-1">
                {groupTotal.toLocaleString('en-US', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })} SAR
              </span>
            </button>

            {/* Group deal cards */}
            {!isCollapsed && (
              <div className="p-2 space-y-2 bg-white">
                {groupDeals.map(deal => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('text/plain', deal.id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <DealCard
                      deal={deal}
                      onDealClick={onDealClick}
                      onDealUpdate={onDealUpdate}
                      showProductSummary={true}
                      periodFrom={activePeriodFrom}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Stage column ─────────────────────────────────────────────────────────────

const PipelineStage = ({
  stage,
  deals = [],
  onDealUpdate,
  onDealClick,
  onStageUpdate,
  onDragOver,
  onDrop,
  activePeriodFrom,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { t } = useLanguage();

  // Persist grouped-view preference per stage in localStorage
  const storageKey = `pipeline_group_${stage?.id || 'unknown'}`;
  const [groupByMaterial, setGroupByMaterial] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'true'; }
    catch { return false; }
  });

  function handleToggleGroup() {
    const newVal = !groupByMaterial;
    setGroupByMaterial(newVal);
    try { localStorage.setItem(storageKey, String(newVal)); }
    catch { /* storage unavailable */ }
  }

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
              {deals.length} {t("common.deals").toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Group-by-material toggle */}
          <button
            onClick={handleToggleGroup}
            title={groupByMaterial ? 'Show flat list' : 'Group by material'}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
              groupByMaterial
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            <Icon name="Layers" size={13} />
            {groupByMaterial && (
              <span className="text-xs font-medium">Grouped</span>
            )}
          </button>
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
            <span className="text-gray-500">{t("pipeline.totalValue")}</span>
            <span className="font-medium text-gray-800">
              {formatCurrency(totalValue, preferredCurrency)}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500">{t("pipeline.weighted")}</span>
            <span className="font-semibold text-blue-600">
              {formatCurrency(weightedValue, preferredCurrency)}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500">{t("pipeline.avgDeal")}</span>
            <span className="font-medium text-gray-800">
              {deals.length
                ? formatCurrency(totalValue / deals.length, preferredCurrency)
                : formatCurrency(0, preferredCurrency)}
            </span>
          </div>
          {/* Origin breakdown for contact_made (Qualified) stage */}
          {stage?.id === 'contact_made' && activePeriodFrom && deals.length > 0 && (() => {
            const newInStage   = deals.filter(d => getDealOrigin(d, activePeriodFrom) === 'new').length;
            const carryInStage = deals.length - newInStage;
            return (
              <div className="flex items-center justify-between mt-1.5 bg-gray-50 rounded-md px-2 py-1.5">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <span>✦</span><span>{newInStage} new</span>
                  </span>
                  <span className="flex items-center gap-1 text-amber-600 font-medium">
                    <span>↻</span><span>{carryInStage} carry</span>
                  </span>
                </div>
                <span className="text-gray-400">{deals.length} total</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Deal Cards — flat or grouped */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-white scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          {deals.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 text-gray-400">
              <Icon name="Inbox" size={32} className="mb-2" />
              <p className="text-sm mb-1">{t("deals.emptyPipeline")}</p>
            </div>
          ) : groupByMaterial ? (
            <GroupedDealsList
              deals={deals}
              onDealClick={onDealClick}
              onDealUpdate={onDealUpdate}
              activePeriodFrom={activePeriodFrom}
            />
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
                  periodFrom={activePeriodFrom}
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
