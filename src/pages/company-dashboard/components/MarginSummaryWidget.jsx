import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";

const MarginSummaryWidget = ({ deals = [] }) => {
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { t } = useLanguage();

  const { avgMargin, totalGrossProfit, lowestMarginDeal, repData } = useMemo(() => {
    const wonDeals = deals.filter(
      (d) => d.stage === "won" && d.margin_pct != null
    );

    if (wonDeals.length === 0) {
      return { avgMargin: null, totalGrossProfit: 0, lowestMarginDeal: null, repData: [] };
    }

    const avg = wonDeals.reduce((s, d) => s + (d.margin_pct || 0), 0) / wonDeals.length;
    const profit = wonDeals.reduce((s, d) => s + (parseFloat(d.gross_margin) || 0), 0);
    const lowest = wonDeals.reduce((min, d) =>
      d.margin_pct < (min?.margin_pct ?? Infinity) ? d : min, null
    );

    // Group by rep — use all deals (not just won) for pipeline view
    const allWithMargin = deals.filter((d) => d.margin_pct != null);
    const repMap = {};
    allWithMargin.forEach((d) => {
      const name = d.owner?.full_name || t("dashboard.unassigned");
      if (!repMap[name]) repMap[name] = { total: 0, count: 0 };
      repMap[name].total += d.margin_pct || 0;
      repMap[name].count += 1;
    });

    const reps = Object.entries(repMap)
      .map(([name, { total, count }]) => ({
        name: name.split(" ")[0],
        margin: parseFloat((total / count).toFixed(1)),
      }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 10);

    return { avgMargin: avg, totalGrossProfit: profit, lowestMarginDeal: lowest, repData: reps };
  }, [deals]);

  const marginColor = (pct) =>
    pct >= 20 ? "#16a34a" : pct >= 10 ? "#d97706" : "#dc2626";

  const MetricCard = ({ icon, label, value, sub, color }) => (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon name={icon} size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );

  if (avgMargin == null && totalGrossProfit === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
        <Icon name="TrendingUp" size={24} className="mx-auto mb-2 opacity-40" />
        {t("dashboard.noMarginData")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 3 metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          icon="Percent"
          label={t("dashboard.avgDealMarginWon")}
          value={avgMargin != null ? `${avgMargin.toFixed(1)}%` : "—"}
          color={avgMargin != null && avgMargin < 10 ? "bg-red-500" : avgMargin != null && avgMargin < 20 ? "bg-amber-500" : "bg-green-600"}
        />
        <MetricCard
          icon="DollarSign"
          label={t("dashboard.totalGrossProfitWon")}
          value={formatCurrency(totalGrossProfit, preferredCurrency)}
          color="bg-primary"
        />
        <MetricCard
          icon="AlertTriangle"
          label={t("dashboard.lowestMarginDeal")}
          value={lowestMarginDeal ? `${lowestMarginDeal.margin_pct.toFixed(1)}%` : "—"}
          sub={lowestMarginDeal?.title}
          color={lowestMarginDeal && lowestMarginDeal.margin_pct < 10 ? "bg-red-500" : "bg-amber-500"}
        />
      </div>

      {/* Horizontal bar chart by rep */}
      {repData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Icon name="BarChart2" size={16} />
            {t("dashboard.avgMarginByRep")}
          </h3>
          <ResponsiveContainer width="100%" height={repData.length * 36 + 20}>
            <BarChart
              data={repData}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 'dataMax']}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={70}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(v) => [`${v}%`, t("dashboard.marginLabel")]} />
              <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                {repData.map((entry, index) => (
                  <Cell key={index} fill={marginColor(entry.margin)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default MarginSummaryWidget;
