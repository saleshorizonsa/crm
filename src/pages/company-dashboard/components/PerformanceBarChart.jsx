import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";
import {
  computeAchieved,
  achievedAmount,
  achieverIdsFrom,
  targetPerPerson,
} from "../../../utils/planningCalculations";
import { bucketsFor } from "../../../utils/achievedSeries";

const PerformanceBarChart = ({
  dealsData = [],
  allDeals = [], // full company deal set (unfiltered by period) — for pipeline value
  targetsData = [],
  timePeriod = "month", // month, quarter, year
  year = new Date().getFullYear(),
  isLoading = false,
  totalSalesmen = 1,
  showAvg = true,
  employees = [],
  annual = null, // director annual view: { target, achieved, deficit, dealCount } → YTD summary tiles
  achievedRange = null, // { start, end } yyyy-MM-dd — the dashboard's selected period
  contributorIds = null, // whose deals count as Achieved (active salesmen + supervisors)
  returns = [], // credit notes, so revenue is NET like the KPI strip
}) => {
  const { formatCurrency, convertCurrency, preferredCurrency } = useCurrency();
  const { t } = useLanguage();

  // Default open so the director sees the breakdown on load
  const [showBreakdown, setShowBreakdown] = useState(true);

  // Active salesmen only (matches the totalSalesmen prop derivation)
  // Everyone whose revenue is counted in the totals above gets a row here:
  // salesmen, supervisors, and any flagged manager. It used to list salesmen
  // only, so supervisors — who carry targets and close deals — were missing
  // from the breakdown while their revenue sat in the total.
  const salesmenList = useMemo(
    () => {
      const countable = new Set(achieverIdsFrom(employees || []));
      return (employees || []).filter((e) => countable.has(e.id));
    },
    [employees],
  );

  // Helper to convert a deal's value to the preferred currency. Uses the
  // negotiated final_amount when present (falls back to amount) so revenue counts
  // the closing value; open deals have no final_amount and use amount.
  const getConvertedAmount = (deal) => {
    const amount = achievedAmount(deal);
    const dealCurrency = deal.currency || preferredCurrency;
    if (dealCurrency === preferredCurrency) return amount;
    return convertCurrency(amount, dealCurrency, preferredCurrency);
  };

  // Revenue here IS Achieved, so it comes from the one shared rule
  // (utils/planningCalculations.js): won AND invoiced, by invoice_date inside the
  // selected period, final value, contributors only. It used to start from the
  // dashboard's close-date-filtered deal list, which dropped deals invoiced in
  // the period but closed earlier (and vice versa) and counted every owner.
  // The selected period's Achieved, net of returns — the same figure the KPI
  // strip shows. Without `returns` this card read gross while the strip
  // beside it read net, for the same period and the same people.
  const achieved = useMemo(
    () =>
      computeAchieved({
        deals: allDeals,
        contributorIds,
        start: achievedRange?.start || null,
        end: achievedRange?.end || null,
        amountOf: getConvertedAmount,
        returns,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allDeals, contributorIds, achievedRange?.start, achievedRange?.end, preferredCurrency, returns],
  );


  // Whose target counts: exactly whose Achieved counts. `contributorIds` is
  // the dashboard's achiever scope, already narrowed to one person when
  // "View dashboard as" picks one — so the target narrows with the revenue
  // instead of staying at the whole company's.
  const targetScopeIds = useMemo(
    () => (Array.isArray(contributorIds) ? new Set(contributorIds) : null),
    [contributorIds],
  );

  // One bucket per month / quarter / year of the SELECTED year
  // (utils/achievedSeries.js). The year view ends at that year rather than at
  // today's, so picking 2025 no longer draws 2026.
  const periods = useMemo(() => bucketsFor(timePeriod, year, 5), [timePeriod, year]);

  const chartData = useMemo(() => periods.map((period) => {
    // Revenue = Achieved over the BUCKET's own window, net of the returns
    // dated in it — one rule, applied per bar. It was a loop over won deals
    // bucketed by invoice month with no returns at all, so a credit note
    // never reduced a bar and the bars did not add up to the net headline.
    const bucket = computeAchieved({
      deals: allDeals,
      contributorIds,
      start: period.start,
      end: period.end,
      amountOf: getConvertedAmount,
      returns,
    });
    // Unique owners who actually invoiced in THIS bucket — the avg divisor.
    const activeOwners = new Set(bucket.deals.map((d) => d.owner_id).filter(Boolean));

    // Target — the shared rule (targetPerPerson / targetRowValue) over the
    // rows that fall in this bucket. It was a raw sum of every monthly row's
    // target_amount, which added a by_products row on top of the same month's
    // total_value, counted a header row's own amount instead of its client
    // breakdown, and counted rows belonging to people whose revenue is not in
    // Achieved at all — an inactive salesman, a plain manager.
    //
    // The row's month is SLICED from its yyyy-MM-dd string, never parsed:
    // new Date('2026-01-01') is UTC midnight, which in any zone behind UTC is
    // 31 December — the wrong bucket, and in January the wrong year.
    const bucketRows = (targetsData || []).filter((t) => {
      if ((t.period_type || "monthly") !== "monthly") return false;
      if ((t.status || "active") !== "active") return false;
      if (targetScopeIds && !targetScopeIds.has(t.assigned_to)) return false;
      const ymd = String(t.period_start || "");
      const rowYear = Number(ymd.slice(0, 4));
      const rowMonth = Number(ymd.slice(5, 7)) - 1;
      if (timePeriod === "month") return rowYear === period.year && rowMonth === period.month;
      if (timePeriod === "quarter") return rowYear === period.year && period.months.includes(rowMonth);
      return rowYear === period.year;
    });
    const target = Object.values(targetPerPerson(bucketRows)).reduce((s, v) => s + v, 0);

    return {
      name: period.label,
      revenue: bucket.total,
      target,
      deals: bucket.count,
      avg: activeOwners.size > 0 ? bucket.total / activeOwners.size : 0,
      achievement: target > 0 ? Math.round((bucket.total / target) * 100) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [periods, allDeals, contributorIds, returns, targetsData, timePeriod, targetScopeIds, preferredCurrency]);

  // Per-salesman revenue breakdown for the displayed range.
  // Includes every active salesman (zeros for non-performers) and counts
  // only the salesmen who actually won a deal as "active".
  const { salesmenBreakdown, activeSalesmenCount } = useMemo(() => {
    // Exactly the window the bars cover — the first and last bucket — so the
    // breakdown always adds up to the headline. It used to span
    // new Date().getFullYear() - 4 .. this year for the year view, which did
    // not follow the selected year.
    const first = periods[0];
    const last = periods[periods.length - 1];
    const span = computeAchieved({
      deals: allDeals,
      contributorIds,
      start: first?.start || null,
      end: last?.end || null,
      amountOf: getConvertedAmount,
      returns,
    });

    const dealCountMap = {};
    const activeIds = new Set();
    span.deals.forEach((deal) => {
      if (!deal.owner_id) return;
      dealCountMap[deal.owner_id] = (dealCountMap[deal.owner_id] || 0) + 1;
      activeIds.add(deal.owner_id);
    });

    const breakdown = salesmenList
      .map((s) => ({
        id: s.id,
        name: s.full_name || s.email,
        // perPerson is NET: a person's credit notes reduce his own row.
        revenue: span.perPerson[s.id] || 0,
        dealCount: dealCountMap[s.id] || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return { salesmenBreakdown: breakdown, activeSalesmenCount: activeIds.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods, allDeals, contributorIds, returns, salesmenList, preferredCurrency]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);
    const totalTarget = chartData.reduce((sum, d) => sum + d.target, 0);
    const totalDeals = chartData.reduce((sum, d) => sum + d.deals, 0);
    const avgAchievement =
      totalTarget > 0 ? Math.round((totalRevenue / totalTarget) * 100) : 0;
    // Active pipeline value = sum of ALL open deals (not won/lost), no date filter.
    const remainingRevenue = (allDeals || [])
      .filter((d) => !["won", "lost"].includes(d.stage))
      .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    // Avg is over salesmen who actually won a deal, not the whole headcount
    const avgPerSalesman =
      activeSalesmenCount > 0 ? totalRevenue / activeSalesmenCount : 0;
    const proRatedTargetPerSalesman =
      activeSalesmenCount > 0 ? totalTarget / activeSalesmenCount : 0;
    const avgSalesmanAchievement =
      proRatedTargetPerSalesman > 0
        ? (avgPerSalesman / proRatedTargetPerSalesman) * 100
        : 0;

    return {
      totalRevenue,
      totalTarget,
      totalDeals,
      avgAchievement,
      remainingRevenue,
      avgPerSalesman,
      avgSalesmanAchievement,
    };
  }, [chartData, activeSalesmenCount, allDeals]);

  // Does a target exist for what is on screen? A period can have real revenue
  // and no target at all — 2025 in this database has neither a yearly row nor
  // monthly rows — and "0%" then reads as total failure rather than as "nobody
  // set one". The annual card asks computeDirectorAnnual, which knows the same
  // thing (annual.hasTarget).
  const hasTargetInPeriod = annual
    ? (annual.hasTarget !== undefined ? annual.hasTarget : (annual.target || 0) > 0)
    : summaryStats.totalTarget > 0;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-sm text-green-600">
              <span className="font-medium">Revenue:</span>{" "}
              {formatCurrency(data.revenue)}
            </p>
            <p className="text-sm text-blue-600">
              <span className="font-medium">Target:</span>{" "}
              {formatCurrency(data.target)}
            </p>
            {showAvg && (
              <p className="text-sm text-teal-600">
                <span className="font-medium">Avg / Salesman:</span>{" "}
                {formatCurrency(data.avg || 0)}
              </p>
            )}
            <p className="text-sm text-purple-600">
              <span className="font-medium">Deals Won:</span> {data.deals}
            </p>
            <p className="text-sm text-orange-600">
              <span className="font-medium">Achievement:</span>{" "}
              {data.achievement}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Icon name="BarChart2" size={20} color="white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {t("dashboard.performanceSummary") || "Performance Overview"}
            </h3>
            <p className="text-sm text-gray-500">
              {timePeriod === "month"
                ? `${t("dashboard.monthly") || "Monthly"} ${year}`
                : timePeriod === "quarter"
                  ? `${t("dashboard.quarterly") || "Quarterly"} ${year}`
                  : t("dashboard.yearly") || "Yearly"}{" "}
              {t("dashboard.performance") || "Performance"}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats. For the director annual view the revenue/target/deals
          tiles switch to full-year (YTD) figures; Active Pipeline stays as-is. */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${showAvg ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-4 mb-6`}>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-xs text-green-600 mb-1">
            {annual ? "YTD Revenue" : (t("dashboard.totalRevenue") || "Total Revenue")}
          </div>
          <div className="text-lg font-bold text-green-700">
            {formatCurrency(annual ? annual.achieved : summaryStats.totalRevenue)}
          </div>
        </div>
        {showAvg && (
          <div className="bg-teal-50 rounded-lg p-3 text-center">
            <div className="text-xs text-teal-600 mb-1">
              {annual ? "Avg per Salesman (YTD)" : "Avg per Salesman"}
            </div>
            <div className="text-lg font-bold text-teal-700">
              {formatCurrency(
                annual
                  ? (activeSalesmenCount > 0 ? annual.achieved / activeSalesmenCount : 0)
                  : summaryStats.avgPerSalesman,
              )}
            </div>
            <div className="text-xs text-teal-500 mt-1">
              {activeSalesmenCount} active of {totalSalesmen} salesmen
            </div>
          </div>
        )}
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-xs text-blue-600 mb-1">
            {annual ? "Annual Target" : (t("common.target") || "Total Target")}
          </div>
          <div className={`text-lg font-bold ${hasTargetInPeriod ? "text-blue-700" : "text-gray-400"}`}>
            {hasTargetInPeriod
              ? formatCurrency(annual ? annual.target : summaryStats.totalTarget)
              : "No target set"}
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-xs text-purple-600 mb-1">
            {annual ? "YTD Deals Closed" : (t("dashboard.dealsClosed") || "Deals Won")}
          </div>
          <div className="text-lg font-bold text-purple-700">
            {annual ? annual.dealCount : summaryStats.totalDeals}
          </div>
        </div>
        <div className="bg-indigo-500 rounded-lg p-3 text-center">
          <div className="text-xs text-white mb-1">Active Pipeline Value</div>
          <div className="text-lg font-bold text-white">
            {formatCurrency(summaryStats.remainingRevenue)}
          </div>
          <div className="text-[10px] text-white/80 mt-0.5">Open deals in Funnel</div>
        </div>
      </div>

      {/* Salesman Revenue Breakdown — consolidated view only */}
      {showAvg && salesmenBreakdown.length > 0 && (
        <div className="mb-6">
          {/* Collapsible header */}
          <button
            onClick={() => setShowBreakdown((b) => !b)}
            className="flex items-center justify-between w-full px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors mb-2"
          >
            <div className="flex items-center gap-2">
              <Icon name="Users" size={15} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-900">
                Salesman Revenue Breakdown
              </span>
              <span className="text-xs text-gray-400">
                ({activeSalesmenCount} active · {salesmenBreakdown.length} total)
              </span>
            </div>
            <Icon
              name={showBreakdown ? "ChevronUp" : "ChevronDown"}
              size={15}
              className="text-gray-400"
            />
          </button>

          {showBreakdown && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-2 min-w-[560px] px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-400 border-b border-gray-200">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Salesman</div>
                <div className="col-span-2 text-center">Deals</div>
                <div className="col-span-3">Revenue</div>
                <div className="col-span-2 text-right">% of Total</div>
              </div>

              {/* Salesman rows */}
              {salesmenBreakdown.map((s, idx) => {
                const pct =
                  summaryStats.totalRevenue > 0
                    ? (s.revenue / summaryStats.totalRevenue) * 100
                    : 0;
                const isActive = s.revenue > 0;

                return (
                  <div
                    key={s.id}
                    className={`grid grid-cols-12 gap-2 min-w-[560px] px-4 py-3 border-b border-gray-100 last:border-0 items-center transition-colors hover:bg-gray-50 ${
                      !isActive ? "opacity-50" : ""
                    }`}
                  >
                    {/* Rank */}
                    <div className="col-span-1 text-xs font-bold text-gray-400">
                      {isActive ? `#${idx + 1}` : "—"}
                    </div>

                    {/* Name + avatar */}
                    <div className="col-span-4 flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          isActive
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {s.name?.charAt(0).toUpperCase()}
                      </div>
                      <span
                        className={`text-sm truncate ${
                          isActive
                            ? "text-gray-900 font-medium"
                            : "text-gray-400"
                        }`}
                      >
                        {s.name}
                      </span>
                      {!isActive && (
                        <span className="text-xs text-red-400 flex-shrink-0">
                          0 deals
                        </span>
                      )}
                    </div>

                    {/* Deal count */}
                    <div className="col-span-2 text-center">
                      <span
                        className={`text-sm font-medium ${
                          isActive ? "text-gray-900" : "text-gray-400"
                        }`}
                      >
                        {s.dealCount}
                      </span>
                    </div>

                    {/* Revenue + bar */}
                    <div className="col-span-3">
                      <div
                        className="text-sm font-medium tabular-nums mb-1"
                        style={{ color: isActive ? "#0D9488" : "#9CA3AF" }}
                      >
                        {formatCurrency(s.revenue)}
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            background: isActive ? "#0D9488" : "#E5E7EB",
                          }}
                        />
                      </div>
                    </div>

                    {/* % of total */}
                    <div
                      className="col-span-2 text-right text-sm font-medium"
                      style={{
                        color: isActive
                          ? pct >= 20
                            ? "#059669"
                            : pct >= 10
                              ? "#D97706"
                              : "#6B7280"
                          : "#9CA3AF",
                      }}
                    >
                      {isActive ? `${pct.toFixed(1)}%` : "—"}
                    </div>
                  </div>
                );
              })}

              {/* Summary footer */}
              <div className="grid grid-cols-12 gap-2 min-w-[560px] px-4 py-3 bg-gray-50 border-t-2 border-gray-200 text-sm font-semibold">
                <div className="col-span-1"></div>
                <div className="col-span-4 text-gray-900">Total</div>
                <div className="col-span-2 text-center text-gray-900">
                  {salesmenBreakdown.reduce((sum, r) => sum + r.dealCount, 0)}
                </div>
                <div className="col-span-3 tabular-nums" style={{ color: "#0D9488" }}>
                  {formatCurrency(summaryStats.totalRevenue)}
                </div>
                <div className="col-span-2 text-right text-gray-900">
                  {summaryStats.totalRevenue > 0 ? "100%" : "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#6b7280" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#6b7280" }}
              tickFormatter={(value) => {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                return value;
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value) => (
                <span className="text-sm text-gray-600">
                  {value === "revenue"
                    ? t("dashboard.totalRevenue") || "Revenue"
                    : value === "target"
                      ? t("common.target") || "Target"
                      : value === "avg"
                        ? "Avg / Salesman"
                        : value}
                </span>
              )}
            />
            <Bar
              dataKey="revenue"
              name="revenue"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="target"
              name="target"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            {showAvg && (
              <Bar
                dataKey="avg"
                name="avg"
                fill="#0D9488"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Achievement Indicator. With no target in the period there is nothing
          to be a percentage OF: 0% read as total failure where the truth is
          that nobody set a target. */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {t("dashboard.targetAchievement") || "Overall Achievement"}
          </span>
          {hasTargetInPeriod ? (
            <span
              className={`text-sm font-bold ${summaryStats.avgAchievement >= 100 ? "text-green-600" : summaryStats.avgAchievement >= 80 ? "text-orange-600" : "text-red-600"}`}
            >
              {summaryStats.avgAchievement}%
            </span>
          ) : (
            <span className="text-sm font-medium text-gray-400">No target set</span>
          )}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              !hasTargetInPeriod
                ? "bg-gray-300"
                : summaryStats.avgAchievement >= 100
                  ? "bg-green-500"
                  : summaryStats.avgAchievement >= 80
                    ? "bg-orange-500"
                    : "bg-red-500"
            }`}
            style={{ width: hasTargetInPeriod ? `${Math.min(summaryStats.avgAchievement, 100)}%` : '0%' }}
          ></div>
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Avg Achievement per Salesman */}
      {showAvg && <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">
            Avg Achievement per Salesman
          </span>
          {hasTargetInPeriod ? (
            <span
              className="text-sm font-bold"
              style={{
                color:
                  summaryStats.avgSalesmanAchievement >= 100
                    ? "#059669"
                    : summaryStats.avgSalesmanAchievement >= 50
                      ? "#D97706"
                      : "#DC2626",
              }}
            >
              {summaryStats.avgSalesmanAchievement.toFixed(1)}%
            </span>
          ) : (
            <span className="text-sm font-medium text-gray-400">No target set</span>
          )}
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: hasTargetInPeriod
                ? `${Math.min(summaryStats.avgSalesmanAchievement, 100)}%`
                : '0%',
              background: hasTargetInPeriod ? "#0D9488" : "#D1D5DB",
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>}
    </div>
  );
};

export default PerformanceBarChart;
