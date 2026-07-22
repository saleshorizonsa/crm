import React, { useEffect, useMemo } from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

// Stage probability weights — must match forecastEngine DEFAULT_STAGE_WEIGHTS,
// so the figures shown here reconcile with the KPI card values.
const WEIGHTS = { lead: 0.1, contact_made: 0.25, proposal_sent: 0.5, negotiation: 0.75, won: 1.0 };
const OPEN_STAGES = ["lead", "contact_made", "proposal_sent", "negotiation"];
const STAGE_LABEL = {
  lead: "Lead", contact_made: "Contact Made", proposal_sent: "Proposal Sent",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};

// Per-type presentation. Highlighted totals are pulled from `forecast.*` so they
// always equal the card, even if the engine's weighting changes.
const THEME = {
  committed:  { title: "Committed Revenue",  color: "text-emerald-600", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700" },
  weighted:   { title: "Weighted Forecast",  color: "text-blue-600",    bg: "bg-blue-50",    badge: "bg-blue-100 text-blue-700" },
  bestCase:   { title: "Best Case",          color: "text-amber-600",   bg: "bg-amber-50",   badge: "bg-amber-100 text-amber-700" },
  attainment: { title: "Target Attainment",  color: "text-violet-600",  bg: "bg-violet-50",  badge: "bg-violet-100 text-violet-700" },
  gap:        { title: "Gap to Target",      color: "text-red-600",     bg: "bg-red-50",     badge: "bg-red-100 text-red-700" },
};

const num = (d) => parseFloat(d?.amount) || 0;

const ForecastFormulaModal = ({
  type,
  forecast = {},
  targetAmount = 0,
  deals = [],
  periodLabel = "This period",
  salesmanName = "",
  onClose,
}) => {
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const theme = THEME[type];

  const { formula, steps, dealList, dealLabel, showWeight } = useMemo(() => {
    const won     = deals.filter((d) => d.stage === "won");
    const open    = deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const nonLost = deals.filter((d) => d.stage !== "lost");
    const byAmt   = (arr) => [...arr].sort((a, b) => num(b) - num(a));
    const wSum    = (stage) => deals.filter((d) => d.stage === stage).reduce((s, d) => s + num(d) * (WEIGHTS[stage] ?? 0), 0);
    const openSum = open.reduce((s, d) => s + num(d), 0);

    switch (type) {
      case "committed":
        return {
          formula: "Σ amount of Won deals closed in the period",
          steps: [
            { label: "Won deals", value: `${won.length}`, unit: "deals" },
            { label: "Period", value: periodLabel },
            { label: "Committed revenue", value: formatCurrency(forecast.committed || 0), highlight: true },
          ],
          dealList: byAmt(won),
          dealLabel: "Won deals in period",
        };

      case "weighted":
        return {
          formula: "Committed + Σ(open amount × stage probability)",
          steps: [
            { label: "Committed (Won × 100%)", value: formatCurrency(wSum("won")) },
            { label: "Negotiation × 75%", value: formatCurrency(wSum("negotiation")) },
            { label: "Proposal Sent × 50%", value: formatCurrency(wSum("proposal_sent")) },
            { label: "Contact Made × 25%", value: formatCurrency(wSum("contact_made")) },
            { label: "Lead × 10%", value: formatCurrency(wSum("lead")) },
            { label: "Weighted total", value: formatCurrency(forecast.weighted || 0), highlight: true },
          ],
          dealList: byAmt(nonLost),
          dealLabel: "Deals in the weighted forecast",
          showWeight: true,
        };

      case "bestCase":
        return {
          formula: "Committed + Σ(all open amounts) — every non-lost deal at full value",
          steps: [
            { label: "Contributing deals", value: `${nonLost.length}`, unit: "deals" },
            { label: "Assumption", value: "100% of deals close" },
            { label: "Best case total", value: formatCurrency(forecast.bestCase || 0), highlight: true },
          ],
          dealList: byAmt(nonLost),
          dealLabel: "All contributing deals",
        };

      case "attainment":
        return {
          formula: "(Weighted Forecast ÷ Target) × 100",
          steps: [
            { label: "Weighted forecast", value: formatCurrency(forecast.weighted || 0) },
            { label: "Target", value: formatCurrency(targetAmount) },
            { label: "Attainment", value: targetAmount > 0 ? `${forecast.attainment}%` : "—", highlight: true },
          ],
          dealList: byAmt(nonLost),
          dealLabel: "Deals contributing to the weighted forecast",
        };

      case "gap": {
        const gapPositive = (forecast.gap || 0) > 0;
        return {
          formula: "Target − Weighted Forecast",
          steps: [
            { label: "Target", value: formatCurrency(targetAmount) },
            { label: "Weighted forecast", value: formatCurrency(forecast.weighted || 0) },
            { label: "Gap remaining", value: gapPositive ? formatCurrency(forecast.gap) : "Target exceeded ✓", highlight: true },
            { label: "Open pipeline available", value: formatCurrency(openSum), unit: "could close the gap" },
          ],
          dealList: byAmt(open),
          dealLabel: "Open deals that could close the gap",
        };
      }

      default:
        return { formula: "", steps: [], dealList: [], dealLabel: "Deals" };
    }
  }, [type, deals, forecast, targetAmount, periodLabel, formatCurrency]);

  if (!theme) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[600] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel wrapper — outside clicks fall through to the backdrop */}
      <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden pointer-events-auto">
          {/* Header */}
          <div className={`px-6 py-4 ${theme.bg} border-b border-border flex items-start justify-between gap-3 flex-shrink-0`}>
            <div className="min-w-0">
              <h2 className={`text-base font-semibold ${theme.color}`}>{theme.title}</h2>
              <p className="text-xs text-muted-foreground mt-1 font-mono break-words">{formula}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors flex-shrink-0"
            >
              <Icon name="X" size={16} className="text-muted-foreground" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Calculation steps */}
            <div className="mb-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                How it is calculated
              </p>
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl ${
                      step.highlight ? theme.bg : "bg-muted/40"
                    }`}
                  >
                    <span className={`text-sm ${step.highlight ? `font-semibold ${theme.color}` : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-sm font-semibold tabular-nums ${step.highlight ? theme.color : "text-card-foreground"}`}>
                        {step.value}
                      </span>
                      {step.unit && <span className="text-xs text-muted-foreground ml-1">{step.unit}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stage weights legend (weighted only) */}
            {showWeight && (
              <div className="mb-5 p-3 bg-muted/40 rounded-xl">
                <p className="text-xs font-medium text-muted-foreground mb-2">Stage probability weights</p>
                <div className="grid grid-cols-2 gap-1">
                  {[["Lead", "10%"], ["Contact Made", "25%"], ["Proposal Sent", "50%"], ["Negotiation", "75%"]].map(([s, w]) => (
                    <div key={s} className="flex justify-between text-xs px-2 py-1 bg-card rounded-lg">
                      <span className="text-muted-foreground">{s}</span>
                      <span className="font-medium text-blue-600">{w}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deal list */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                {dealLabel}
                {dealList.length > 0 && ` (${dealList.length})`}
              </p>

              {dealList.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No deals for this period
                </div>
              ) : (
                <div
                  className="space-y-1.5"
                  style={{ maxHeight: "280px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#E2E8F0 transparent" }}
                >
                  {dealList.map((deal) => {
                    const weight = WEIGHTS[deal.stage] ?? 0.1;
                    const raw = num(deal);
                    return (
                      <div key={deal.id} className="flex items-center gap-3 px-3 py-2.5 bg-muted/40 rounded-xl">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground capitalize flex-shrink-0">
                          {STAGE_LABEL[deal.stage] || deal.stage?.replace("_", " ") || "—"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-card-foreground truncate">
                            {deal.contact?.company_name || deal.title || "—"}
                          </p>
                          {deal.owner?.full_name && (
                            <p className="text-xs text-muted-foreground truncate">{deal.owner.full_name}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-card-foreground tabular-nums">
                            {formatCurrency(raw)}
                          </p>
                          {type === "weighted" && (
                            <p className="text-xs text-blue-500 tabular-nums">
                              ×{Math.round(weight * 100)}% = {formatCurrency(raw * weight)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground truncate">
              {periodLabel} · {salesmanName || "All salesmen"}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ForecastFormulaModal;
