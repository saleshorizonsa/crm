import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const delta = (curr, prev) => {
  if (!prev || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
};

const Card = ({ label, value, subtitle, icon, iconBg, iconColor, valColor, prevValue }) => {
  const { formatCurrency } = useCurrency();
  const d = prevValue !== undefined ? delta(value, prevValue) : null;
  return (
    <div className="bg-card border border-border rounded-lg p-4 enterprise-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`w-7 h-7 rounded-md flex items-center justify-center ${iconBg}`}>
          <Icon name={icon} size={14} className={iconColor} />
        </span>
      </div>
      <p className={`text-xl font-bold tabular-nums ${valColor}`}>{value}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {d !== null && (
          <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${d >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            <Icon name={d >= 0 ? "TrendingUp" : "TrendingDown"} size={10} />
            {d >= 0 ? "+" : ""}{d}%
          </span>
        )}
      </div>
    </div>
  );
};

const ReportKPIBar = ({ deals = [], prevDeals = [], contacts = [], role }) => {
  const { formatCurrency } = useCurrency();
  const today = new Date();

  const won      = deals.filter((d) => d.stage === "won");
  const lost     = deals.filter((d) => d.stage === "lost");
  const open     = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const closed   = won.length + lost.length;
  const winRate  = closed > 0 ? Math.round((won.length / closed) * 100) : 0;
  const revenue  = won.reduce((s, d) => s + (d.amount || 0), 0);
  const pipeline = open.reduce((s, d) => s + (d.amount || 0), 0);
  const avgDeal  = won.length > 0 ? revenue / won.length : 0;
  const overdue  = open.filter((d) => d.expected_close_date && new Date(d.expected_close_date) < today).length;

  const pWon     = prevDeals.filter((d) => d.stage === "won");
  const pRevenue = pWon.reduce((s, d) => s + (d.amount || 0), 0);
  const pClosed  = prevDeals.filter((d) => ["won", "lost"].includes(d.stage)).length;
  const pWinRate = pClosed > 0 ? Math.round((pWon.length / pClosed) * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      <Card label="Revenue" value={formatCurrency(revenue)} subtitle="Won deals" icon="DollarSign" iconBg="bg-emerald-100" iconColor="text-emerald-600" valColor="text-emerald-700" prevValue={pRevenue} />
      <Card label="Won Deals" value={won.length} subtitle="Closed won" icon="CheckCircle" iconBg="bg-blue-100" iconColor="text-blue-600" valColor="text-blue-700" prevValue={pWon.length} />
      <Card label="Win Rate" value={`${winRate}%`} subtitle="Won / Closed" icon="Target" iconBg="bg-violet-100" iconColor="text-violet-600" valColor="text-violet-700" prevValue={pWinRate} />
      <Card label="Pipeline" value={formatCurrency(pipeline)} subtitle="Open deals" icon="TrendingUp" iconBg="bg-amber-100" iconColor="text-amber-600" valColor="text-amber-700" />
      <Card label="Total Deals" value={deals.length} subtitle="All stages" icon="BarChart2" iconBg="bg-slate-100" iconColor="text-slate-600" valColor="text-slate-700" prevValue={prevDeals.length} />
      <Card label="Avg Deal" value={formatCurrency(avgDeal)} subtitle="Per won deal" icon="Award" iconBg="bg-rose-100" iconColor="text-rose-600" valColor="text-rose-700" />
      <Card label="New Contacts" value={contacts.length} subtitle="This period" icon="Users" iconBg="bg-cyan-100" iconColor="text-cyan-600" valColor="text-cyan-700" />
      <Card label="Overdue" value={overdue} subtitle="Past close date" icon="AlertTriangle" iconBg="bg-red-100" iconColor="text-red-600" valColor={overdue > 0 ? "text-red-600" : "text-slate-700"} />
    </div>
  );
};

export default ReportKPIBar;
