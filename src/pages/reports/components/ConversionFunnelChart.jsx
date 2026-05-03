import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const STAGES = [
  { key: "lead",          label: "Lead",        color: "bg-blue-500",   bar: "#3b82f6", light: "text-blue-700"   },
  { key: "contact_made",  label: "Qualified",   color: "bg-sky-500",    bar: "#0ea5e9", light: "text-sky-700"    },
  { key: "proposal_sent", label: "Proposal",    color: "bg-violet-500", bar: "#8b5cf6", light: "text-violet-700" },
  { key: "negotiation",   label: "Negotiation", color: "bg-amber-500",  bar: "#f59e0b", light: "text-amber-700"  },
  { key: "won",           label: "Won",         color: "bg-emerald-500",bar: "#10b981", light: "text-emerald-700"},
];

const ConversionFunnelChart = ({ deals = [] }) => {
  const { formatCurrency } = useCurrency();

  const stageCounts = STAGES.map((s) => {
    const sd = deals.filter((d) => d.stage === s.key);
    return {
      ...s,
      count: sd.length,
      value: sd.reduce((sum, d) => sum + (d.amount || 0), 0),
    };
  });

  const maxCount = Math.max(...stageCounts.map((s) => s.count), 1);

  // Overall lead-to-won
  const leadCount = stageCounts[0].count;
  const wonCount  = stageCounts[4].count;
  const overallRate = leadCount > 0 ? Math.round((wonCount / leadCount) * 100) : 0;

  // Lost deals
  const lostCount = deals.filter((d) => d.stage === "lost").length;

  return (
    <div className="bg-card border border-border rounded-lg enterprise-shadow p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Conversion Funnel</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Stage-by-stage pipeline progression</p>
        </div>
        <div className="w-7 h-7 rounded-md bg-blue-100 flex items-center justify-center">
          <Icon name="Filter" size={14} className="text-blue-600" />
        </div>
      </div>

      <div className="space-y-1.5">
        {stageCounts.map((stage, i) => {
          const prev = i > 0 ? stageCounts[i - 1] : null;
          const convRate = prev && prev.count > 0
            ? Math.round((stage.count / prev.count) * 100)
            : null;
          const barPct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
          const dropped = prev ? prev.count - stage.count : 0;

          return (
            <div key={stage.key}>
              {/* Drop-off indicator between stages */}
              {convRate !== null && (
                <div className="flex items-center gap-2 py-1 px-1">
                  <div className="flex-1 border-l-2 border-dashed border-border ml-[72px]" />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      convRate >= 60 ? "bg-emerald-100 text-emerald-700"
                      : convRate >= 30 ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-600"
                    }`}>
                      {convRate}% convert
                    </span>
                    {dropped > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        −{dropped} dropped
                      </span>
                    )}
                  </div>
                  <div className="flex-1" />
                </div>
              )}

              {/* Stage bar */}
              <div className="flex items-center gap-3">
                <span className="w-[68px] text-right text-xs font-medium text-muted-foreground flex-shrink-0 pr-1">
                  {stage.label}
                </span>
                <div className="flex-1 relative h-9 bg-muted/50 rounded-md overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-md transition-all duration-700 ${stage.color}`}
                    style={{ width: `${barPct}%`, opacity: 0.85 }}
                  />
                  <div className="absolute inset-0 flex items-center px-3 gap-2">
                    <span className="text-xs font-bold text-white drop-shadow-sm">
                      {stage.count}
                    </span>
                    <span className="text-[10px] text-white/80 drop-shadow-sm">deals</span>
                    <span className="ml-auto text-[11px] font-medium text-muted-foreground">
                      {formatCurrency(stage.value)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Lead → Won</p>
          <p className={`text-lg font-bold ${overallRate >= 20 ? "text-emerald-600" : "text-amber-600"}`}>
            {overallRate}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Won Value</p>
          <p className="text-lg font-bold text-emerald-700">
            {formatCurrency(stageCounts[4].value)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Lost Deals</p>
          <p className="text-lg font-bold text-red-500">{lostCount}</p>
        </div>
      </div>
    </div>
  );
};

export default ConversionFunnelChart;
