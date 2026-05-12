import React, { useMemo, useState } from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";
import { capitalize } from "../../../utils/helper";

const MEDALS = ["🥇", "🥈", "🥉"];

const SALES_ROLES = ["salesman", "sales_rep", "supervisor", "manager"];

const winRateColor = (rate) => {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 70) return "text-green-600";
  if (rate >= 50) return "text-amber-600";
  return "text-red-500";
};

const progressBarColor = (pct) => {
  if (pct === null) return "bg-muted";
  if (pct >= 100) return "bg-green-500";
  if (pct >= 60) return "bg-primary";
  if (pct >= 30) return "bg-amber-500";
  return "bg-red-400";
};

const Avatar = ({ person, size = 8 }) => {
  const initials = (person.full_name || person.email || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-green-100 text-green-700",
    "bg-purple-100 text-purple-700",
    "bg-orange-100 text-orange-700",
    "bg-pink-100 text-pink-700",
    "bg-teal-100 text-teal-700",
  ];
  const colorIdx = (person.full_name || "").charCodeAt(0) % colors.length;

  if (person.avatar_url) {
    return (
      <img
        src={person.avatar_url}
        alt={person.full_name}
        className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div
      className={`w-${size} h-${size} rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${colors[colorIdx]}`}
    >
      {initials}
    </div>
  );
};

const SalesLeaderboard = ({
  deals = [],
  employees = [],
  targets = [],
  isLoading = false,
}) => {
  const { formatCurrency } = useCurrency();
  const { t, isRTL } = useLanguage();
  const [showAll, setShowAll] = useState(false);

  const leaderboard = useMemo(() => {
    // Build per-person stats
    const statsMap = {};
    deals.forEach((deal) => {
      const id = deal.owner_id;
      if (!statsMap[id]) statsMap[id] = { wonAmount: 0, wonDeals: 0, lostDeals: 0, activeDeals: 0 };
      if (deal.stage === "won") {
        statsMap[id].wonAmount += parseFloat(deal.amount) || 0;
        statsMap[id].wonDeals++;
      } else if (deal.stage === "lost") {
        statsMap[id].lostDeals++;
      } else {
        statsMap[id].activeDeals++;
      }
    });

    // Best target per person (highest amount among active targets)
    const targetMap = {};
    (targets || []).forEach((tgt) => {
      const uid = tgt.assigned_to;
      if (!targetMap[uid] || (tgt.target_amount || 0) > (targetMap[uid].target_amount || 0)) {
        targetMap[uid] = tgt;
      }
    });

    return employees
      .filter((e) => SALES_ROLES.includes(e.role) && e.is_active !== false)
      .map((emp) => {
        const s = statsMap[emp.id] || { wonAmount: 0, wonDeals: 0, lostDeals: 0, activeDeals: 0 };
        const tgt = targetMap[emp.id];
        const targetAmount = tgt?.target_amount || 0;
        const targetProgress = targetAmount > 0 ? Math.min((s.wonAmount / targetAmount) * 100, 100) : null;
        const closed = s.wonDeals + s.lostDeals;
        const winRate = closed > 0 ? Math.round((s.wonDeals / closed) * 100) : null;
        return { ...emp, ...s, targetAmount, targetProgress, winRate };
      })
      .sort((a, b) => b.wonAmount - a.wonAmount);
  }, [deals, employees, targets]);

  const totalWon = leaderboard.reduce((s, e) => s + e.wonAmount, 0);
  const totalTarget = leaderboard.reduce((s, e) => s + e.targetAmount, 0);
  const overallProgress = totalTarget > 0 ? Math.min((totalWon / totalTarget) * 100, 100) : null;

  const visible = showAll ? leaderboard : leaderboard.slice(0, 7);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="h-5 w-40 bg-muted rounded animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!leaderboard.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center justify-center text-center">
        <Icon name="Users" size={36} className="text-muted-foreground mb-2" />
        <p className="text-sm font-medium text-foreground">{t("leaderboard.noData")}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t("leaderboard.noDataHint")}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center text-base">
            🏆
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("leaderboard.title")}</h3>
            <p className="text-xs text-muted-foreground">
              {leaderboard.length} {t("leaderboard.reps")} &middot;{" "}
              <span className="font-medium text-foreground">{formatCurrency(totalWon)}</span>{" "}
              {t("leaderboard.wonThisPeriod")}
            </p>
          </div>
        </div>

        {/* Overall progress badge */}
        {overallProgress !== null && (
          <div className="hidden sm:flex flex-col items-end gap-0.5">
            <span className="text-xs text-muted-foreground">{t("leaderboard.teamTarget")}</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progressBarColor(overallProgress)}`}
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-foreground">
                {Math.round(overallProgress)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className={`grid px-4 py-2 border-b border-border bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wide ${isRTL ? "grid-cols-[auto_1fr_120px_80px_56px]" : "grid-cols-[auto_1fr_120px_80px_56px]"}`}>
        <span className="w-8">#</span>
        <span>{t("leaderboard.salesperson")}</span>
        <span className="text-right">{t("leaderboard.revenue")}</span>
        <span className="text-right">{t("leaderboard.deals")}</span>
        <span className="text-right">{t("leaderboard.rate")}</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {visible.map((person, idx) => {
          const rank = idx + 1;
          const isTop3 = rank <= 3;
          return (
            <div
              key={person.id}
              className={`grid grid-cols-[auto_1fr_120px_80px_56px] items-center px-4 py-3 gap-3 transition-colors hover:bg-muted/20 ${
                rank === 1 ? "bg-yellow-50/40" : ""
              }`}
            >
              {/* Rank */}
              <div className="w-8 flex-shrink-0 text-center">
                {isTop3 ? (
                  <span className="text-base">{MEDALS[idx]}</span>
                ) : (
                  <span className="text-xs font-bold text-muted-foreground">{rank}</span>
                )}
              </div>

              {/* Person */}
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar person={person} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate leading-tight">
                    {person.full_name || person.email}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{capitalize(person.role || "")}</span>
                    {person.activeDeals > 0 && (
                      <span className="text-[10px] px-1 py-0 bg-blue-50 text-blue-600 rounded">
                        {person.activeDeals} {t("leaderboard.active")}
                      </span>
                    )}
                  </div>
                  {/* Target progress bar */}
                  {person.targetProgress !== null && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${progressBarColor(person.targetProgress)}`}
                          style={{ width: `${person.targetProgress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(person.targetProgress)}% {t("leaderboard.ofTarget")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Won amount */}
              <div className="text-right">
                <p className={`text-sm font-bold ${rank === 1 ? "text-yellow-700" : "text-foreground"}`}>
                  {formatCurrency(person.wonAmount)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {person.wonDeals} {t("leaderboard.won")}
                </p>
              </div>

              {/* Deals won count */}
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{person.wonDeals + person.activeDeals + person.lostDeals}</p>
                <p className="text-[10px] text-muted-foreground">{t("leaderboard.total")}</p>
              </div>

              {/* Win rate */}
              <div className="text-right">
                {person.winRate !== null ? (
                  <p className={`text-sm font-bold ${winRateColor(person.winRate)}`}>
                    {person.winRate}%
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {leaderboard.length > 7 && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowAll((p) => !p)}
            className="w-full py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <Icon name={showAll ? "ChevronUp" : "ChevronDown"} size={13} />
            {showAll
              ? t("common.showLess")
              : t("leaderboard.showMore", { count: leaderboard.length - 7 })}
          </button>
        </div>
      )}
    </div>
  );
};

export default SalesLeaderboard;
