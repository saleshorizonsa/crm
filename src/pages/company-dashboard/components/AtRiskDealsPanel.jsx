import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/AppIcon";
import { dealService } from "../../../services/supabaseService";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";

const LEVEL_CONFIG = {
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
    icon: "AlertOctagon",
    iconColor: "text-red-500",
    label: "atRisk.critical",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    icon: "AlertTriangle",
    iconColor: "text-amber-500",
    label: "atRisk.warning",
  },
  watch: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-400",
    icon: "Eye",
    iconColor: "text-blue-500",
    label: "atRisk.watch",
  },
};

const STAGE_LABELS = {
  lead: "Lead",
  contact_made: "Qualified",
  proposal_sent: "Proposal",
  negotiation: "Negotiation",
};

const FLAG_CONFIG = {
  overdue: { icon: "CalendarX", color: "text-red-600 bg-red-50", labelKey: "atRisk.flagOverdue" },
  no_activity: { icon: "BellOff", color: "text-red-600 bg-red-50", labelKey: "atRisk.flagNoActivity" },
  no_activity_soon: { icon: "Bell", color: "text-amber-600 bg-amber-50", labelKey: "atRisk.flagSlowActivity" },
  stalled: { icon: "PauseCircle", color: "text-red-600 bg-red-50", labelKey: "atRisk.flagStalled" },
  stalling: { icon: "Clock", color: "text-amber-600 bg-amber-50", labelKey: "atRisk.flagSlowing" },
};

const AtRiskDealsPanel = ({ companyId }) => {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const { t, isRTL } = useLanguage();

  const [deals, setDeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    const { data } = await dealService.getAtRiskDeals(companyId);
    setDeals(data || []);
    setIsLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = {
    critical: deals.filter((d) => d.risk_level === "critical").length,
    warning: deals.filter((d) => d.risk_level === "warning").length,
    watch: deals.filter((d) => d.risk_level === "watch").length,
  };

  const filtered =
    filter === "all" ? deals : deals.filter((d) => d.risk_level === filter);
  // Render the full filtered list inside a fixed-height scroll area (below),
  // so ~5 show and the rest scroll instead of expanding the whole dashboard.
  const visible = filtered;

  const totalRisk = counts.critical + counts.warning + counts.watch;

  const headerBadgeColor =
    counts.critical > 0
      ? "bg-red-500"
      : counts.warning > 0
      ? "bg-amber-500"
      : "bg-blue-400";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <Icon name="ShieldAlert" size={16} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("atRisk.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("atRisk.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalRisk > 0 && (
            <span className={`${headerBadgeColor} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>
              {totalRisk}
            </span>
          )}
          <button
            onClick={load}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title={t("common.refresh")}
          >
            <Icon name="RefreshCw" size={13} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1">
        {[
          { key: "all", label: t("common.all"), count: totalRisk },
          { key: "critical", label: t("atRisk.critical"), count: counts.critical },
          { key: "warning", label: t("atRisk.warning"), count: counts.warning },
          { key: "watch", label: t("atRisk.watch"), count: counts.watch },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === tab.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  filter === tab.key
                    ? "bg-background/20 text-background"
                    : tab.key === "critical"
                    ? "bg-red-100 text-red-700"
                    : tab.key === "warning"
                    ? "bg-amber-100 text-amber-700"
                    : tab.key === "watch"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content — cap height so ~5 deals show, the rest scroll */}
      <div
        className="divide-y divide-border overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
        style={{ maxHeight: "400px", scrollbarWidth: "thin" }}
      >
        {isLoading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Icon name="Loader2" size={16} className="animate-spin" />
            <span className="text-sm">{t("common.loading")}</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
              <Icon name="ShieldCheck" size={22} className="text-green-500" />
            </div>
            <p className="text-sm font-medium text-foreground mb-0.5">{t("atRisk.allHealthy")}</p>
            <p className="text-xs text-muted-foreground">{t("atRisk.allHealthyHint")}</p>
          </div>
        ) : (
          visible.map((deal) => {
            const cfg = LEVEL_CONFIG[deal.risk_level];
            const isOpen = expanded === deal.id;
            return (
              <div key={deal.id} className={`transition-colors ${isOpen ? cfg.bg : "hover:bg-muted/30"}`}>
                {/* Main row */}
                <div
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : deal.id)}
                >
                  {/* Risk indicator */}
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />

                  {/* Deal info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                        {deal.title}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.badge}`}>
                        {t(cfg.label)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {/* Owner */}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Icon name="User" size={10} />
                        {deal.owner?.full_name || t("common.unknown")}
                      </span>
                      {/* Stage */}
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {STAGE_LABELS[deal.stage] || deal.stage}
                      </span>
                      {/* Contact company */}
                      {deal.contact?.company_name && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Icon name="Building2" size={10} />
                          {deal.contact.company_name}
                        </span>
                      )}
                    </div>

                    {/* Risk flag pills */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {deal.risk_flags.map((flag, i) => {
                        const fc = FLAG_CONFIG[flag.type];
                        if (!fc) return null;
                        return (
                          <span
                            key={i}
                            className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${fc.color}`}
                          >
                            <Icon name={fc.icon} size={9} />
                            {t(fc.labelKey, { days: flag.days ?? "—" })}
                            {flag.days != null && ` (${flag.days}d)`}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amount + chevron */}
                  <div className={`flex items-center gap-2 flex-shrink-0 ${isRTL ? "mr-auto" : "ml-auto"}`}>
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(deal.amount)}
                    </span>
                    <Icon
                      name={isOpen ? "ChevronUp" : "ChevronDown"}
                      size={14}
                      className="text-muted-foreground"
                    />
                  </div>
                </div>

                {/* Expanded actions */}
                {isOpen && (
                  <div className={`px-4 pb-3 flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <button
                      onClick={() => navigate("/sales-pipeline")}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                      <Icon name="ExternalLink" size={11} />
                      {t("atRisk.openDeal")}
                    </button>
                    <button
                      onClick={() => navigate("/calendar")}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border text-foreground rounded-md hover:bg-muted transition-colors"
                    >
                      <Icon name="CalendarPlus" size={11} />
                      {t("atRisk.scheduleCall")}
                    </button>
                    {deal.last_activity_at && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {t("atRisk.lastActivity")}: {new Date(deal.last_activity_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Scroll hint — shown when more than 5 at-risk deals exist below the fold */}
      {!isLoading && filtered.length > 5 && (
        <div className="border-t border-border py-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="ChevronDown" size={13} />
          +{filtered.length - 5} {t("atRisk.more")}
        </div>
      )}

      {/* Footer summary */}
      {!isLoading && totalRisk > 0 && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t("atRisk.totalAtRisk", { count: totalRisk })}
          </span>
          <span className="text-xs font-medium text-foreground">
            {formatCurrency(deals.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0))}
            {" "}{t("atRisk.atStake")}
          </span>
        </div>
      )}
    </div>
  );
};

export default AtRiskDealsPanel;
