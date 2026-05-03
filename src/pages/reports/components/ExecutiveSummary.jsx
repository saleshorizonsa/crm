import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const buildInsights = (deals, prevDeals, role, formatCurrency) => {
  const insights = [];
  const today = new Date();

  const won    = deals.filter((d) => d.stage === "won");
  const lost   = deals.filter((d) => d.stage === "lost");
  const open   = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const closed = won.length + lost.length;
  const winRate  = closed > 0 ? Math.round((won.length / closed) * 100) : 0;
  const revenue  = won.reduce((s, d) => s + (d.amount || 0), 0);
  const pipeline = open.reduce((s, d) => s + (d.amount || 0), 0);

  const pWon     = prevDeals.filter((d) => d.stage === "won");
  const pRevenue = pWon.reduce((s, d) => s + (d.amount || 0), 0);
  const pClosed  = prevDeals.filter((d) => ["won", "lost"].includes(d.stage)).length;
  const pWinRate = pClosed > 0 ? Math.round((pWon.length / pClosed) * 100) : 0;

  // 1. Revenue vs previous period
  if (pRevenue > 0) {
    const delta = Math.round(((revenue - pRevenue) / pRevenue) * 100);
    insights.push({
      type: delta >= 0 ? "positive" : "negative",
      icon: delta >= 0 ? "TrendingUp" : "TrendingDown",
      text: `Revenue is ${Math.abs(delta)}% ${delta >= 0 ? "up" : "down"} vs previous period (${formatCurrency(pRevenue)} → ${formatCurrency(revenue)})`,
    });
  } else if (revenue > 0) {
    insights.push({
      type: "positive",
      icon: "DollarSign",
      text: `${formatCurrency(revenue)} in closed revenue from ${won.length} won deal${won.length !== 1 ? "s" : ""} this period`,
    });
  }

  // 2. Win rate vs industry benchmark
  if (closed >= 3) {
    const delta = pWinRate > 0 ? winRate - pWinRate : null;
    insights.push({
      type: winRate >= 30 ? "positive" : winRate >= 20 ? "neutral" : "negative",
      icon: "Target",
      text:
        winRate >= 30
          ? `Win rate of ${winRate}%${delta !== null ? ` (${delta >= 0 ? "+" : ""}${delta}pp vs prev)` : ""} — above the 30% benchmark. Strong pipeline execution.`
          : `Win rate is ${winRate}%${delta !== null ? ` (${delta >= 0 ? "+" : ""}${delta}pp vs prev)` : ""} — below the 30% target. Review qualification criteria.`,
    });
  }

  // 3. Overdue deals alert
  const overdue = open.filter(
    (d) => d.expected_close_date && new Date(d.expected_close_date) < today,
  );
  if (overdue.length > 0) {
    const overdueVal = overdue.reduce((s, d) => s + (d.amount || 0), 0);
    insights.push({
      type: "warning",
      icon: "AlertTriangle",
      text: `${overdue.length} deal${overdue.length !== 1 ? "s" : ""} worth ${formatCurrency(overdueVal)} ${overdue.length !== 1 ? "are" : "is"} past expected close date — immediate follow-up required.`,
    });
  }

  // 4. Pipeline coverage
  if (revenue > 0) {
    const coverage = (pipeline / revenue).toFixed(1);
    const num = parseFloat(coverage);
    insights.push({
      type: num >= 3 ? "positive" : num >= 2 ? "neutral" : "negative",
      icon: "Layers",
      text: `Pipeline coverage is ${coverage}x (${formatCurrency(pipeline)} open vs ${formatCurrency(revenue)} closed). ${num >= 3 ? "Healthy ratio — on track for next period." : "Build more pipeline to sustain growth."}`,
    });
  }

  // 5. Top performer (supervisor+)
  if (role !== "salesman" && won.length > 0) {
    const ownerRev = {};
    won.forEach((d) => {
      const n = d.owner?.full_name || "Unknown";
      ownerRev[n] = (ownerRev[n] || 0) + (d.amount || 0);
    });
    const [topName, topVal] = Object.entries(ownerRev).sort((a, b) => b[1] - a[1])[0];
    insights.push({
      type: "positive",
      icon: "Award",
      text: `Top performer: ${topName} with ${formatCurrency(topVal)} in closed revenue this period.`,
    });
  }

  // 6. Stale deals (60+ days open)
  const stale = open.filter(
    (d) => (today - new Date(d.created_at)) / 86400000 > 60,
  );
  if (stale.length > 0) {
    const staleVal = stale.reduce((s, d) => s + (d.amount || 0), 0);
    insights.push({
      type: "warning",
      icon: "Clock",
      text: `${stale.length} deal${stale.length !== 1 ? "s" : ""} worth ${formatCurrency(staleVal)} have been open 60+ days. Advance or close to keep pipeline healthy.`,
    });
  }

  // 7. Best lead source by revenue
  const srcRev = {};
  won.forEach((d) => {
    const src = d.contact?.lead_source;
    if (src) srcRev[src] = (srcRev[src] || 0) + (d.amount || 0);
  });
  const topSrc = Object.entries(srcRev).sort((a, b) => b[1] - a[1])[0];
  if (topSrc) {
    insights.push({
      type: "neutral",
      icon: "Magnet",
      text: `Best revenue source: "${topSrc[0]}" contributed ${formatCurrency(topSrc[1])} in closed deals. Invest more in this channel.`,
    });
  }

  // 8. Avg deal size trend
  const avgDeal  = won.length > 0 ? revenue / won.length : 0;
  const pAvgDeal = pWon.length > 0 ? pWon.reduce((s, d) => s + (d.amount || 0), 0) / pWon.length : 0;
  if (pAvgDeal > 0 && won.length >= 3) {
    const diff = Math.round(((avgDeal - pAvgDeal) / pAvgDeal) * 100);
    if (Math.abs(diff) >= 10) {
      insights.push({
        type: diff >= 0 ? "positive" : "negative",
        icon: diff >= 0 ? "ArrowUpRight" : "ArrowDownRight",
        text: `Average deal size ${diff >= 0 ? "increased" : "decreased"} by ${Math.abs(diff)}% (${formatCurrency(pAvgDeal)} → ${formatCurrency(avgDeal)}). ${diff >= 0 ? "Good upsell momentum." : "Review deal quality and scope."}`,
      });
    }
  }

  return insights.slice(0, 6);
};

const TYPE_CONFIG = {
  positive: {
    wrap: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },
  negative: {
    wrap: "bg-red-50 border-red-200",
    text: "text-red-800",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
  },
  warning: {
    wrap: "bg-amber-50 border-amber-200",
    text: "text-amber-800",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
  neutral: {
    wrap: "bg-blue-50 border-blue-200",
    text: "text-blue-800",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },
};

const ExecutiveSummary = ({ deals = [], prevDeals = [], role = "salesman" }) => {
  const { formatCurrency } = useCurrency();
  const insights = buildInsights(deals, prevDeals, role, formatCurrency);

  if (insights.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg enterprise-shadow p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon name="Lightbulb" size={14} className="text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Executive Summary</h3>
          <p className="text-xs text-muted-foreground">Auto-generated insights from this period's data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {insights.map((ins, i) => {
          const c = TYPE_CONFIG[ins.type] ?? TYPE_CONFIG.neutral;
          return (
            <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg border ${c.wrap}`}>
              <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5 ${c.iconBg}`}>
                <Icon name={ins.icon} size={12} className={c.iconColor} />
              </div>
              <p className={`text-xs leading-relaxed ${c.text}`}>{ins.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExecutiveSummary;
