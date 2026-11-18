import React from "react";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { STAGE_LABELS } from "utils/stageLabels";

const STAGE_STYLE = {
  lead:          { label: STAGE_LABELS.lead,          dot: "bg-slate-400",   bar: "bg-slate-400"   },
  contact_made:  { label: STAGE_LABELS.contact_made,  dot: "bg-sky-400",     bar: "bg-sky-400"     },
  proposal_sent: { label: STAGE_LABELS.proposal_sent, dot: "bg-violet-400",  bar: "bg-violet-400"  },
  negotiation:   { label: STAGE_LABELS.negotiation,   dot: "bg-amber-400",   bar: "bg-amber-400"   },
  won:           { label: STAGE_LABELS.won,           dot: "bg-emerald-500", bar: "bg-emerald-500" },
  lost:          { label: STAGE_LABELS.lost,          dot: "bg-red-400",     bar: "bg-red-400"     },
};

const StageBreakdown = ({ byStage = [] }) => {
  const { formatCurrency } = useCurrency();

  const maxTotal = Math.max(...byStage.map((s) => s.total), 1);

  const active = byStage.filter((s) => s.count > 0);

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-card-foreground">Stage Breakdown</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Deal count and value by stage</p>
      </div>

      {active.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No deals in funnel
        </div>
      ) : (
        <div className="space-y-3.5">
          {byStage.map((s) => {
            const style = STAGE_STYLE[s.stage] ?? { label: s.label, dot: "bg-muted", bar: "bg-muted" };
            const pct   = maxTotal > 0 ? (s.total / maxTotal) * 100 : 0;

            return (
              <div key={s.stage}>
                <div className="flex items-center justify-between mb-1 text-xs">
                  <span className="flex items-center gap-1.5 text-card-foreground font-medium">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                    {style.label}
                  </span>
                  <span className="flex items-center gap-3 text-muted-foreground tabular-nums">
                    <span className="font-semibold text-card-foreground">
                      {s.count}
                    </span>
                    <span>{formatCurrency(s.total)}</span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${style.bar} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Weighted total row */}
      {active.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Weighted funnel</span>
            <span className="font-semibold text-card-foreground tabular-nums">
              {formatCurrency(byStage.reduce((s, b) => s + b.weighted, 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StageBreakdown;
