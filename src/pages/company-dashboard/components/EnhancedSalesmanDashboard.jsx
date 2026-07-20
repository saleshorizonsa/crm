import React, { useState, useEffect, useMemo } from "react";
import MetricsCard from "./MetricsCard";
import SalesChart from "./SalesChart";
import ActivityFeed from "./ActivityFeed";
import QuickActions from "./QuickActions";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";
import ProductTargetReport from "../../../components/ProductTargetReport";
import SalesTargetTable from "../../../components/SalesTargetTable";
import { useAuth } from "../../../contexts/AuthContext";
import { useCurrency } from "../../../contexts/CurrencyContext";
import {
  companyService,
  dealService,
  taskService,
  activityService,
  salesTargetService,
  getMonthlyTarget,
} from "../../../services/supabaseService";
import MonthlyTargetCard from "../../../components/MonthlyTargetCard";
import ExecutiveMetrics from "./ExecutiveMetrics";
import PipelineChart from "./PipelineChart";
import ActionableDashboard from "./ActionableDashboard";
import HotLeadsWidget from "./HotLeadsWidget";
import SalesForecast from "./SalesForecast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { useDateRange } from "../../../contexts/DateRangeContext";
import { useLanguage } from "../../../i18n";
import { format, startOfMonth } from 'date-fns';
import QuickDateSelector from '../../../components/QuickDateSelector';
import {
  buildDateRange,
  syncDropdownsFromRange,
} from "../../../utils/dashboardDateUtils";
import { classifyDealsByOrigin } from '../../../utils/dealGroupUtils';
import LogActivityModal from '../../../components/LogActivityModal';

const EnhancedSalesmanDashboard = ({
  viewAsUser = null,
  readOnly = false,
  filterMonth = undefined,
  filterQuarter = undefined,
  filterYear = undefined,
}) => {
  const { user, userProfile, company } = useAuth();
  const { formatCurrency, convertCurrency, preferredCurrency } = useCurrency();
  const { dateRange, setRange } = useDateRange();
  const navigate = useNavigate();
  const { t } = useLanguage();

  // When viewing as another user (manager "view as"), use their identity for all queries
  const effectiveUser = viewAsUser || { id: user?.id };
  const effectiveUserProfile = viewAsUser || userProfile;

  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [activeView, setActiveView] = useState("overview");

  // Separate filter states for month, quarter, and year
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Single source of truth for the active date range — defaults to current month 1st → today
  const [activeDateRange, setActiveDateRange] = useState(() => {
    const now = new Date();
    return {
      from: format(startOfMonth(now), 'yyyy-MM-dd'),
      to:   format(now, 'yyyy-MM-dd'),
      label: format(now, 'MMMM yyyy'),
      type:  'monthly',
      period: format(now, 'MMMM yyyy'),
    };
  });
  const [refreshing, setRefreshing] = useState(false);

  // Sync from top-right DateRangePicker (via context) → local dropdowns
  const activeDateRangeRef = React.useRef(activeDateRange);
  activeDateRangeRef.current = activeDateRange;
  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    if (
      dateRange.from === activeDateRangeRef.current.from &&
      dateRange.to   === activeDateRangeRef.current.to
    ) return;
    const synced = syncDropdownsFromRange(dateRange.from, dateRange.to);
    setActiveDateRange({ from: dateRange.from, to: dateRange.to });
    setSelectedMonth(synced.selectedMonth);
    setSelectedQuarter(synced.selectedQuarter);
    setSelectedYear(synced.selectedYear);
  }, [dateRange?.from, dateRange?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  // Brief opacity flash when date range changes
  useEffect(() => {
    setRefreshing(true);
    const timer = setTimeout(() => setRefreshing(false), 200);
    return () => clearTimeout(timer);
  }, [activeDateRange.from, activeDateRange.to]);

  // Sync from parent filter props when manager controls filters via "View As"
  useEffect(() => {
    if (filterMonth !== undefined) {
      const m = filterMonth ?? null;
      const q = filterQuarter ?? null;
      const y = filterYear ?? null;
      setSelectedMonth(m);
      setSelectedQuarter(q);
      setSelectedYear(y);
      const range = buildDateRange(m, q, y);
      setActiveDateRange(range);
    }
  }, [filterMonth, filterQuarter, filterYear]);

  // Performance Trend toggle (separate from main filters)
  const [trendPeriod, setTrendPeriod] = useState("month"); // month, quarter, year

  // Data states
  const [metrics, setMetrics] = useState(null);
  const [salesData, setSalesData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [myTargets, setMyTargets] = useState([]); // Targets assigned TO this salesman (view-only)
  const [productTargetsData, setProductTargetsData] = useState([]);
  const [allDeals, setAllDeals] = useState([]); // Store all deals for trend calculation
  const [pendingTasks, setPendingTasks] = useState([]); // Pending/upcoming tasks
  const [allTasks, setAllTasks] = useState([]); // All tasks for metrics

  // Enhanced data states
  const [executiveMetrics, setExecutiveMetrics] = useState(null);
  const [pipelineData, setPipelineData] = useState([]);
  const [actionItems, setActionItems] = useState([]);

  // Monthly target state
  const [monthlyTarget, setMonthlyTarget] = useState(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // Generate filter options for month, quarter, and year
  const monthOptions = useMemo(() => {
    const months = [];
    // If quarter is selected, only show months in that quarter
    const startMonth = selectedQuarter !== null ? selectedQuarter * 3 : 0;
    const endMonth = selectedQuarter !== null ? startMonth + 3 : 12;

    for (let m = startMonth; m < endMonth; m++) {
      const date = new Date(2000, m, 1); // Use any year for month name
      const monthName = date.toLocaleString("default", { month: "short" });
      months.push({
        value: m,
        label: monthName,
        month: m,
      });
    }
    return months;
  }, [selectedQuarter]);

  const quarterOptions = useMemo(() => {
    const quarters = [];
    // Generate only 4 quarters (Q1 - Q4)
    for (let q = 0; q < 4; q++) {
      quarters.push({
        value: q,
        label: `Q${q + 1}`,
        quarter: q,
      });
    }
    // If month is selected, filter to show only the quarter containing that month
    if (selectedMonth !== null) {
      const monthQuarter = Math.floor(selectedMonth / 3);
      return quarters.filter((q) => q.value === monthQuarter);
    }
    return quarters;
  }, [selectedMonth]);

  const yearOptions = useMemo(() => {
    const years = [
      { value: 2025, label: "2025", year: 2025 },
      { value: 2026, label: "2026", year: 2026 },
    ];
    return years;
  }, []);

  // Helper function to convert deal amount to preferred currency
  const convertDealAmount = (deal) => {
    const amount = parseFloat(deal.amount) || 0;
    const dealCurrency = deal.currency || preferredCurrency;
    return dealCurrency !== preferredCurrency
      ? convertCurrency(amount, dealCurrency, preferredCurrency)
      : amount;
  };

  const filteredDeals = useMemo(() => {
    const from = new Date(activeDateRange.from + 'T00:00:00');
    const to   = new Date(activeDateRange.to   + 'T23:59:59');
    return (
      allDeals?.filter((deal) => {
        const dateToCheck = deal.stage === "won" ? deal.closed_at : deal.created_at;
        if (!dateToCheck) return false;
        const d = new Date(dateToCheck);
        return d >= from && d <= to;
      }) || []
    );
  }, [allDeals, activeDateRange.from, activeDateRange.to]);

  // Origin classification: new pipeline vs carry-forward
  const originMetrics = useMemo(() => {
    if (!filteredDeals?.length || !activeDateRange?.from) return null;
    return classifyDealsByOrigin(filteredDeals, activeDateRange.from);
  }, [filteredDeals, activeDateRange?.from]);
  const [todayActivities,  setTodayActivities]  = useState([]);
  const [showLogModal,     setShowLogModal]      = useState(false);

  const filteredTasks = useMemo(() => {
    const from = new Date(activeDateRange.from + 'T00:00:00');
    const to   = new Date(activeDateRange.to   + 'T23:59:59');
    return (
      allTasks?.filter((task) => {
        if (!task.created_at) return false;
        const d = new Date(task.created_at);
        return d >= from && d <= to;
      }) || []
    );
  }, [allTasks, activeDateRange.from, activeDateRange.to]);

  const filteredActivities = useMemo(() => {
    const from = new Date(activeDateRange.from + 'T00:00:00');
    const to   = new Date(activeDateRange.to   + 'T23:59:59');
    return (
      activities?.filter((activity) => {
        if (!activity.created_at) return false;
        const d = new Date(activity.created_at);
        return d >= from && d <= to;
      }) || []
    );
  }, [activities, activeDateRange.from, activeDateRange.to]);

  // Filter targets whose period overlaps with activeDateRange
  const filteredMyTargets = useMemo(() => {
    if (!myTargets) return myTargets;
    const from = new Date(activeDateRange.from + 'T00:00:00');
    const to   = new Date(activeDateRange.to   + 'T23:59:59');
    return myTargets.filter((target) => {
      const targetStart = new Date(target.period_start);
      const targetEnd   = new Date(target.period_end);
      return targetStart <= to && targetEnd >= from;
    });
  }, [myTargets, activeDateRange.from, activeDateRange.to]);

  // Recalculate per-target progress from this salesman's won deals.
  // The DB column `progress_amount` is not auto-updated when deals close,
  // so we derive it on the client (mirrors Manager/Supervisor dashboards).
  // Each target's progress = sum of won-deal amounts whose close date falls
  // inside that target's own period_start..period_end window.
  const targetsWithCalculatedProgress = useMemo(() => {
    if (!filteredMyTargets || filteredMyTargets.length === 0) {
      return filteredMyTargets || [];
    }

    const wonDeals = (allDeals || []).filter((d) => d.stage === "won");

    return filteredMyTargets.map((target) => {
      const periodStart = new Date(target.period_start);
      const periodEnd = new Date(target.period_end);
      // Include the entire end day
      periodEnd.setHours(23, 59, 59, 999);

      const calculated_progress = wonDeals.reduce((sum, deal) => {
        const dateStr =
          deal.stage === "won" ? deal.closed_at : deal.created_at;
        if (!dateStr) return sum;
        const dealDate = new Date(dateStr);
        if (dealDate >= periodStart && dealDate <= periodEnd) {
          return sum + convertDealAmount(deal);
        }
        return sum;
      }, 0);

      return {
        ...target,
        calculated_progress,
      };
    });
    // convertDealAmount depends on preferredCurrency, so include it in deps
  }, [filteredMyTargets, allDeals, preferredCurrency]);

  const productTargetsWithProgress = useMemo(() => {
    return salesTargetService.calculateProductTargetProgress(
      productTargetsData,
      allDeals,
      effectiveUser?.id ? [effectiveUser.id] : null,
    );
  }, [productTargetsData, allDeals, effectiveUser?.id]);

  // Calculate performance trend based on trendPeriod toggle (NOT affected by main filters)
  const performanceTrendData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const wonDeals = allDeals?.filter((d) => d.stage === "won") || [];

    if (trendPeriod === "month") {
      // Show monthly trend for current year
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      return months.map((month, index) => {
        const monthDeals = wonDeals.filter((d) => {
          const dealDate = new Date(
            d.closed_at || d.created_at,
          );
          return (
            dealDate.getFullYear() === currentYear &&
            dealDate.getMonth() === index
          );
        });
        const revenue = monthDeals.reduce(
          (sum, d) => sum + convertDealAmount(d),
          0,
        );
        return {
          period: month,
          revenue,
          deals: monthDeals.length,
        };
      });
    } else if (trendPeriod === "quarter") {
      // Show quarterly trend for current year
      const quarters = ["Q1", "Q2", "Q3", "Q4"];

      return quarters.map((quarter, index) => {
        const startMonth = index * 3;
        const endMonth = startMonth + 2;
        const quarterDeals = wonDeals.filter((d) => {
          const dealDate = new Date(
            d.closed_at || d.created_at,
          );
          const dealMonth = dealDate.getMonth();
          return (
            dealDate.getFullYear() === currentYear &&
            dealMonth >= startMonth &&
            dealMonth <= endMonth
          );
        });
        const revenue = quarterDeals.reduce(
          (sum, d) => sum + convertDealAmount(d),
          0,
        );
        return {
          period: quarter,
          revenue,
          deals: quarterDeals.length,
        };
      });
    } else {
      // Show yearly trend for last 3 years
      const years = [currentYear - 2, currentYear - 1, currentYear];

      return years.map((year) => {
        const yearDeals = wonDeals.filter((d) => {
          const dealDate = new Date(
            d.closed_at || d.created_at,
          );
          return dealDate.getFullYear() === year;
        });
        const revenue = yearDeals.reduce(
          (sum, d) => sum + convertDealAmount(d),
          0,
        );
        return {
          period: year.toString(),
          revenue,
          deals: yearDeals.length,
        };
      });
    }
  }, [allDeals, trendPeriod, preferredCurrency]);

  // Task metrics calculation
  const taskMetrics = useMemo(() => {
    const total = filteredTasks.length;
    const pending = filteredTasks.filter(
      (t) => t.status === "pending" || t.status === "todo",
    ).length;
    const inProgress = filteredTasks.filter(
      (t) => t.status === "in_progress",
    ).length;
    const completed = filteredTasks.filter(
      (t) => t.status === "completed",
    ).length;
    return { total, pending, inProgress, completed };
  }, [filteredTasks]);

  // Filtered pending tasks for display (top 5 upcoming)
  const filteredPendingTasks = useMemo(() => {
    return filteredTasks
      .filter((t) => t.status !== "completed" && t.status !== "cancelled")
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      })
      .slice(0, 5);
  }, [filteredTasks]);

  // Client insights - revenue and deals by client (top 10)
  const clientInsights = useMemo(() => {
    const wonDeals = filteredDeals?.filter((d) => d.stage === "won") || [];
    const clientMap = new Map();

    wonDeals.forEach((deal) => {
      const clientName =
        deal.contact?.company_name ||
        (deal.contact?.first_name && deal.contact?.last_name
          ? `${deal.contact.first_name} ${deal.contact.last_name}`
          : "Unknown");
      const clientId = deal.contact?.id || "unknown";

      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          name: clientName,
          revenue: 0,
          deals: 0,
        });
      }

      const client = clientMap.get(clientId);
      client.revenue += convertDealAmount(deal);
      client.deals += 1;
    });

    return Array.from(clientMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10); // Top 10 clients
  }, [filteredDeals, preferredCurrency]);

  // Target progress metrics - recalculated from filtered deals
  const targetMetrics = useMemo(() => {
    const now = new Date();
    const hasFilters =
      selectedMonth !== null ||
      selectedQuarter !== null ||
      selectedYear !== null;

    // Calculate progress from filtered won deals
    const wonDealsInPeriod =
      filteredDeals?.filter((d) => d.stage === "won") || [];
    const progressAmount = wonDealsInPeriod.reduce(
      (sum, d) => sum + convertDealAmount(d),
      0,
    );

    // Calculate target amount: sum all filtered targets
    const targetAmount = filteredMyTargets.reduce(
      (sum, target) => sum + (parseFloat(target.target_amount) || 0),
      0,
    );

    // Calculate days based on selected filters
    let periodStart, periodEnd, totalDays, daysGone;

    if (selectedMonth !== null && selectedYear !== null) {
      // Specific month in a year
      periodStart = new Date(selectedYear, selectedMonth, 1);
      periodEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
    } else if (selectedQuarter !== null && selectedYear !== null) {
      // Specific quarter in a year
      const startMonth = selectedQuarter * 3;
      periodStart = new Date(selectedYear, startMonth, 1);
      periodEnd = new Date(selectedYear, startMonth + 3, 0, 23, 59, 59);
    } else if (selectedYear !== null) {
      // Entire year
      periodStart = new Date(selectedYear, 0, 1);
      periodEnd = new Date(selectedYear, 11, 31, 23, 59, 59);
    } else if (selectedMonth !== null) {
      // Same month across all years (use current year)
      const currentYear = now.getFullYear();
      periodStart = new Date(currentYear, selectedMonth, 1);
      periodEnd = new Date(currentYear, selectedMonth + 1, 0, 23, 59, 59);
    } else if (selectedQuarter !== null) {
      // Same quarter across all years (use current year)
      const currentYear = now.getFullYear();
      const startMonth = selectedQuarter * 3;
      periodStart = new Date(currentYear, startMonth, 1);
      periodEnd = new Date(currentYear, startMonth + 3, 0, 23, 59, 59);
    } else {
      // No filters - use all time
      // Find earliest and latest target dates from filtered targets
      if (filteredMyTargets.length > 0) {
        const dates = filteredMyTargets.map((t) => new Date(t.period_start));
        periodStart = new Date(Math.min(...dates));
        const endDates = filteredMyTargets.map((t) => new Date(t.period_end));
        periodEnd = new Date(Math.max(...endDates));
      } else {
        // Default to current month if no targets
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        periodStart = new Date(currentYear, currentMonth, 1);
        periodEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
      }
    }

    totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
    daysGone =
      periodEnd < now
        ? totalDays
        : Math.max(
            1,
            Math.ceil(
              (Math.min(now, periodEnd) - periodStart) / (1000 * 60 * 60 * 24),
            ),
          );

    const daysRemaining = Math.max(
      0,
      Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)),
    );
    const dailyAverage = daysGone > 0 ? progressAmount / daysGone : 0;
    const expectedRevenue = dailyAverage * totalDays;

    const progressPercent =
      targetAmount > 0 ? (progressAmount / targetAmount) * 100 : 0;
    const expectedPercent =
      targetAmount > 0 ? (expectedRevenue / targetAmount) * 100 : 0;

    return {
      targetAmount,
      progressAmount,
      progressPercent,
      dailyAverage,
      daysGone,
      daysRemaining,
      totalDays,
      expectedRevenue,
      expectedPercent,
      periodType: "custom",
      isOnTrack:
        targetAmount > 0
          ? progressPercent >= (daysGone / totalDays) * 100
          : true,
      hasActiveTarget: filteredMyTargets.length > 0,
    };
  }, [filteredMyTargets, filteredDeals, preferredCurrency, activeDateRange.from, activeDateRange.to]);

  // Period label for monthly target card
  const periodLabel = useMemo(() => {
    if (selectedMonth !== null && selectedYear !== null) {
      return new Date(2000, selectedMonth, 1).toLocaleString('default', { month: 'long' }) + ' ' + selectedYear;
    }
    const now = new Date();
    return now.toLocaleString('default', { month: 'long' }) + ' ' + now.getFullYear();
  }, [selectedMonth, selectedYear]);

  // Pipeline summary and attention deals
  const pipelineSummary = useMemo(() => {
    const stages = [
      "lead",
      "contact_made",
      "proposal_sent",
      "negotiation",
      "won",
      "lost",
    ];
    const summary = {};

    stages.forEach((stage) => {
      summary[stage] =
        filteredDeals?.filter((d) => d.stage === stage).length || 0;
    });

    return summary;
  }, [filteredDeals]);

  // Deals needing attention (stale, high-value in negotiation, closing soon)
  const attentionDeals = useMemo(() => {
    const now = new Date();
    const deals =
      filteredDeals?.filter((d) => !["won", "lost"].includes(d.stage)) || [];

    return deals
      .map((deal) => {
        const daysSinceUpdate = Math.floor(
          (now - new Date(deal.updated_at)) / (1000 * 60 * 60 * 24),
        );
        const daysUntilClose = deal.expected_close_date
          ? Math.floor(
              (new Date(deal.expected_close_date) - now) /
                (1000 * 60 * 60 * 24),
            )
          : null;
        const dealValue = convertDealAmount(deal);
        const isHighValue = dealValue > 25000;
        const isStale = daysSinceUpdate > 7;
        const isClosingSoon =
          daysUntilClose !== null && daysUntilClose <= 7 && daysUntilClose >= 0;
        const isOverdue = daysUntilClose !== null && daysUntilClose < 0;

        let priority = 0;
        let reason = [];

        if (isOverdue) {
          priority += 4;
          reason.push(t("pipeline.overdue"));
        }
        if (isHighValue && deal.stage === "negotiation") {
          priority += 3;
          reason.push(t("dashboard.highValueLabel"));
        }
        if (isClosingSoon) {
          priority += 2;
          reason.push(t("dashboard.closingSoonLabel"));
        }
        if (isStale) {
          priority += 1;
          reason.push(t("dashboard.staleLabel"));
        }

        // Get product names
        const products =
          deal.deal_products
            ?.map(
              (dp) =>
                dp.product?.material || dp.product?.description || "Unknown",
            )
            .slice(0, 2)
            .join(", ") || "No products";

        return {
          ...deal,
          dealValue,
          daysSinceUpdate,
          daysUntilClose,
          priority,
          reason,
          products,
          clientName:
            deal.contact?.company_name ||
            (deal.contact?.first_name
              ? `${deal.contact.first_name} ${
                  deal.contact.last_name || ""
                }`.trim()
              : "Unknown"),
        };
      })
      .filter((d) => d.priority > 0)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10);
  }, [filteredDeals, preferredCurrency]);

  // Colors for charts
  const CHART_COLORS = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#84CC16",
    "#F97316",
    "#6366F1",
  ];

  useEffect(() => {
    if (company?.id && effectiveUserProfile?.id) {
      loadSalesmanData();
    }
  }, [company, effectiveUserProfile?.id]);

  // Recalculate executive metrics when filtered data changes
  useEffect(() => {
    const wonDeals = filteredDeals?.filter((d) => d.stage === "won") || [];
    const totalRevenue = wonDeals.reduce(
      (sum, d) => sum + convertDealAmount(d),
      0,
    );
    const activePipeline = (filteredDeals || [])
      .filter((d) => !["won", "lost"].includes(d.stage))
      .reduce((sum, d) => sum + convertDealAmount(d), 0);
    const lostDealsInPeriod = filteredDeals?.filter((d) => d.stage === "lost") || [];
    const closedCount = wonDeals.length + lostDealsInPeriod.length;
    const winRate = closedCount > 0 ? (wonDeals.length / closedCount) * 100 : 0;

    setExecutiveMetrics({
      totalRevenue,
      activePipeline,
      winRate,
      totalDeals: filteredDeals?.length || 0,
      wonDeals: wonDeals.length,
    });

    // Recalculate pipeline data
    const stages = [
      "lead",
      "contact_made",
      "proposal_sent",
      "negotiation",
      "won",
      "lost",
    ];
    const pipelineStats = stages.map((stage) => {
      const stageDeals = filteredDeals?.filter((d) => d.stage === stage) || [];
      return {
        stage,
        count: stageDeals.length,
        totalValue: stageDeals.reduce(
          (sum, d) => sum + convertDealAmount(d),
          0,
        ),
      };
    });
    setPipelineData(pipelineStats);
  }, [filteredDeals, preferredCurrency]);

  const loadSalesmanData = async () => {
    // Only show loading spinner on initial load, not on refocus/refresh
    if (isInitialLoad) {
      setIsLoading(true);
    }
    try {
      const results = await Promise.allSettled([
        companyService.getCompanyMetrics(company.id, effectiveUser.id, false),
        companyService.getSalesData(company.id, "monthly", effectiveUser.id, false),
        activityService.getUserActivities(company.id, effectiveUser.id, 20),
        dealService.getDeals(company.id, { viewAll: true }, effectiveUser.id),
      ]);

      const [metricsResult, salesResult, activitiesResult, dealsResult] =
        results;

      if (metricsResult.status === "fulfilled") {
        setMetrics(metricsResult.value.data);
      }
      if (salesResult.status === "fulfilled") {
        setSalesData(salesResult.value.data);
      }
      if (activitiesResult.status === "fulfilled") {
        setActivities(activitiesResult.value.data);
      }

      await loadExecutiveMetrics();
      await loadPipelineData();
      await loadActionItems();
      await loadSalesTargets();
      await loadPendingTasks();

      // Today's activities
      try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const { data: actData } = await activityService.getMyActivities({
          userId:    effectiveUser.id,
          companyId: company.id,
          dateFrom:  todayStr,
          dateTo:    todayStr + 'T23:59:59',
        });
        setTodayActivities(actData || []);
      } catch (e) { console.error('Activity fetch error:', e); }
    } catch (error) {
      console.error("Error loading salesman data:", error);
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  };

  const loadPendingTasks = async () => {
    try {
      const { data: tasks } = await taskService.getMyTasks(
        effectiveUser.id,
        company.id,
        { userOnly: true },
      );

      if (tasks) {
        setAllTasks(tasks); // Store all tasks for metrics

        // Filter for pending/in-progress tasks with due dates, sorted by due date
        const pending = tasks
          .filter((t) => t.status !== "completed" && t.status !== "cancelled")
          .sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
          })
          .slice(0, 5); // Show top 5 tasks
        setPendingTasks(pending);
      }
    } catch (error) {
      console.error("Error loading pending tasks:", error);
    }
  };

  const loadExecutiveMetrics = async () => {
    try {
      const periodDays =
        selectedYear && !selectedMonth && !selectedQuarter
          ? 365
          : selectedQuarter && !selectedMonth
            ? 90
            : 30;
      const { data: allFetchedDeals } = await dealService.getDeals(
        company.id,
        { viewAll: true },
        effectiveUser.id,
      );
      const deals = (allFetchedDeals || []).filter(
        (d) => d.owner_id === effectiveUser.id,
      );

      if (deals.length >= 0) {
        const wonDeals = deals.filter((d) => d.stage === "won");
        const totalRevenue = wonDeals.reduce(
          (sum, d) => sum + convertDealAmount(d),
          0,
        );
        const activePipeline = deals
          .filter((d) => !["won", "lost"].includes(d.stage))
          .reduce((sum, d) => sum + convertDealAmount(d), 0);
        const lostDealsAll = deals.filter((d) => d.stage === "lost");
        const closedCountAll = wonDeals.length + lostDealsAll.length;
        const winRate = closedCountAll > 0 ? (wonDeals.length / closedCountAll) * 100 : 0;

        setAllDeals(deals); // Store all deals for trend calculation
        setExecutiveMetrics({
          totalRevenue,
          activePipeline,
          winRate,
          totalDeals: deals.length,
          wonDeals: wonDeals.length,
        });
      }
    } catch (error) {
      console.error("Error loading executive metrics:", error);
    }
  };

  const loadPipelineData = async () => {
    try {
      const { data: allFetchedDeals } = await dealService.getDeals(
        company.id,
        { viewAll: true },
        effectiveUser.id,
      );
      const deals = (allFetchedDeals || []).filter(
        (d) => d.owner_id === effectiveUser.id,
      );

      if (deals) {
        const stages = [
          "lead",
          "contact_made",
          "proposal_sent",
          "negotiation",
          "won",
          "lost",
        ];
        const pipelineStats = stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          return {
            stage,
            count: stageDeals.length,
            totalValue: stageDeals.reduce(
              (sum, d) => sum + convertDealAmount(d),
              0,
            ),
          };
        });

        setPipelineData(pipelineStats);
      }
    } catch (error) {
      console.error("Error loading pipeline data:", error);
    }
  };

  const loadActionItems = async () => {
    try {
      const { data: allFetchedDeals } = await dealService.getDeals(
        company.id,
        { viewAll: true },
        effectiveUser.id,
      );
      const deals = (allFetchedDeals || []).filter(
        (d) => d.owner_id === effectiveUser.id,
      );
      const { data: tasks } = await taskService.getMyTasks(
        effectiveUser.id,
        company.id,
        { userOnly: true },
      );
      const { data: targets } = await salesTargetService.getMyTargets(
        company.id,
        effectiveUser.id,
      );

      const actions = [];

      // High-value deals - convert deal amount and use converted threshold
      if (deals) {
        const highValueThreshold = 25000; // in user's preferred currency
        const highValueDeals = deals.filter(
          (d) =>
            d.stage === "negotiation" &&
            convertDealAmount(d) > highValueThreshold,
        );
        highValueDeals.forEach((deal) => {
          actions.push({
            type: "review_deal",
            title: `Close High-Value Deal: ${deal.title}`,
            description: `Deal worth ${formatCurrency(
              deal.amount,
              deal.currency,
            )} in negotiation`,
            priority: "high",
            created_at: deal.updated_at,
            dueDate: deal.expected_close_date,
          });
        });

        // Stale deals
        const staleDeals = deals.filter((d) => {
          const daysSinceUpdate = Math.floor(
            (Date.now() - new Date(d.updated_at)) / (1000 * 60 * 60 * 24),
          );
          return !["won", "lost"].includes(d.stage) && daysSinceUpdate > 7;
        });
        staleDeals.forEach((deal) => {
          actions.push({
            type: "follow_up",
            title: `Follow Up: ${deal.title}`,
            description: `No activity for ${Math.floor(
              (Date.now() - new Date(deal.updated_at)) / (1000 * 60 * 60 * 24),
            )} days`,
            priority: "medium",
            created_at: deal.updated_at,
          });
        });
      }

      // Behind schedule targets
      if (targets) {
        const behindTargets = targets.filter((t) => {
          const progress =
            (parseFloat(t.progress_amount || 0) /
              parseFloat(t.target_amount || 1)) *
            100;
          return progress < 50;
        });
        behindTargets.forEach((target) => {
          actions.push({
            type: "target_alert",
            title: `Target Behind Schedule`,
            description: `Your ${target.target_type} target is at ${Math.round(
              (parseFloat(target.progress_amount || 0) /
                parseFloat(target.target_amount || 1)) *
                100,
            )}%`,
            priority: "high",
            created_at: target.created_at,
          });
        });
      }

      // Urgent tasks
      if (tasks) {
        const urgentTasks = tasks.filter(
          (t) => t.priority === "high" && t.status !== "completed",
        );
        urgentTasks.forEach((task) => {
          actions.push({
            type: "urgent_task",
            title: task.title,
            description: task.description,
            priority: "high",
            created_at: task.created_at,
            dueDate: task.due_date,
          });
        });
      }

      setActionItems(
        actions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      );
    } catch (error) {
      console.error("Error loading action items:", error);
    }
  };

  // Fetch monthly target when targets tab is active or date range changes
  useEffect(() => {
    if (activeView !== 'targets') return;
    if (!effectiveUser?.id || !company?.id) return;
    fetchMonthlyTarget();
  }, [activeView, activeDateRange.from, activeDateRange.to, effectiveUser?.id, company?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMonthlyTarget = async () => {
    setMonthlyLoading(true);
    try {
      const result = await getMonthlyTarget({
        userId:    effectiveUser.id,
        companyId: company.id,
        dateFrom:  activeDateRange.from,
        dateTo:    activeDateRange.to,
      });
      setMonthlyTarget(result);
    } catch (err) {
      console.error('Error fetching monthly target:', err);
      setMonthlyTarget(null);
    } finally {
      setMonthlyLoading(false);
    }
  };

  const loadSalesTargets = async () => {
    try {
      // Load targets assigned TO this salesman (view-only)
      const { data: myTargetsData } = await salesTargetService.getMyTargets(
        company.id,
        effectiveUser.id,
      );
      setMyTargets(myTargetsData || []);

      const productTargetIds =
        myTargetsData
          ?.filter((target) => target.target_type === "by_products")
          .map((target) => target.id) || [];

      if (productTargetIds.length > 0) {
        const { data: productTargets } =
          await salesTargetService.getProductTargetsBySalesTargetIds(
            productTargetIds,
          );
        setProductTargetsData(productTargets || []);
      } else {
        setProductTargetsData([]);
      }
    } catch (error) {
      console.error("Error loading sales targets:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-8 transition-opacity duration-200 ${refreshing ? 'opacity-60' : 'opacity-100'}`}>
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tabular-nums text-gray-900">
              Salesman Dashboard
            </h1>
            <p className="text-gray-600 mt-1">
              {readOnly
                ? `Viewing as: ${effectiveUserProfile?.full_name || effectiveUser?.email}`
                : `Welcome back, ${userProfile?.full_name || user?.email}`}
            </p>
          </div>
          {readOnly && (
            <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 flex items-center gap-1">
                <Icon name="Eye" size={14} />
                Read-only view
              </p>
            </div>
          )}
        </div>

        {/* Quick Date Selector */}
        <QuickDateSelector
          activeDateRange={activeDateRange}
          onRangeChange={(range) => {
            setActiveDateRange(range);
            if (range.type === 'monthly') {
              const d = new Date(range.from);
              setSelectedMonth(d.getMonth());
              setSelectedQuarter(Math.floor(d.getMonth() / 3));
              setSelectedYear(d.getFullYear());
            } else if (range.type === 'quarterly') {
              const d = new Date(range.from);
              setSelectedMonth(null);
              setSelectedQuarter(Math.floor(d.getMonth() / 3));
              setSelectedYear(d.getFullYear());
            } else if (range.type === 'yearly') {
              setSelectedMonth(null);
              setSelectedQuarter(null);
              setSelectedYear(new Date(range.from).getFullYear());
            } else {
              setSelectedMonth(null);
              setSelectedQuarter(null);
              setSelectedYear(null);
            }
            setRange({ from: range.from, to: range.to });
          }}
        />
      </div>

      {/* Navigation Tabs (NO Team Management for Salesman) */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: "overview", label: t("dashboard.overview"), icon: "LayoutDashboard" },
            { id: "deals", label: t("common.deals"), icon: "Briefcase" },
            { id: "targets", label: t("dashboard.myPerformance"), icon: "Target" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeView === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon name={tab.icon} size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeView === "overview" && (
        <div className="space-y-8">
          {/* Revenue & Target Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("dashboard.totalRevenue")}
              </h3>
              {targetMetrics?.hasActiveTarget && (
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    targetMetrics.isOnTrack
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {targetMetrics.isOnTrack ? t("dashboard.onTrack") : t("dashboard.salesTargetBehindSchedule")}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Revenue */}
              <div className="text-center p-4 bg-green-50 rounded-lg min-w-0 overflow-hidden">
                <div className="text-xl font-bold tabular-nums truncate leading-tight text-green-600">
                  {formatCurrency(
                    targetMetrics?.progressAmount ||
                      executiveMetrics?.totalRevenue ||
                      0,
                  )}
                </div>
                <div className="text-sm text-gray-600 mt-1">{t("dashboard.totalRevenue")}</div>
              </div>

              {/* Target Assigned */}
              <div className="text-center p-4 bg-blue-50 rounded-lg min-w-0 overflow-hidden">
                <div className="text-xl font-bold tabular-nums truncate leading-tight text-blue-600">
                  {targetMetrics?.hasActiveTarget
                    ? formatCurrency(targetMetrics.targetAmount)
                    : "—"}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {t("dashboard.target")}
                </div>
              </div>

              {/* Progress */}
              <div className="text-center p-4 bg-purple-50 rounded-lg min-w-0 overflow-hidden">
                <div className="text-xl font-bold tabular-nums truncate leading-tight text-purple-600">
                  {targetMetrics?.hasActiveTarget
                    ? `${targetMetrics.progressPercent.toFixed(1)}%`
                    : "—"}
                </div>
                <div className="text-sm text-gray-600 mt-1">{t("common.progress")}</div>
                {targetMetrics?.hasActiveTarget && (
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`h-2 rounded-full ${
                        targetMetrics.isOnTrack ? "bg-green-500" : "bg-red-500"
                      }`}
                      style={{
                        width: `${Math.min(
                          targetMetrics.progressPercent,
                          100,
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Remaining Revenue */}
              <div className="text-center p-4 bg-red-500 rounded-lg min-w-0 overflow-hidden">
                <div className="text-xl font-bold tabular-nums truncate leading-tight text-white">
                  {targetMetrics?.hasActiveTarget
                    ? formatCurrency(
                        Math.max(
                          0,
                          targetMetrics.targetAmount -
                            (targetMetrics.progressAmount || 0),
                        ),
                      )
                    : "—"}
                </div>
                <div className="text-sm text-white mt-1">{t("dashboard.remaining")}</div>
              </div>
            </div>

            {/* Pipeline Origin KPI Cards */}
            {originMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="bg-white rounded-xl border border-border-tertiary p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                      <Icon name="Sparkles" size={18} className="text-green-500" />
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">New</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums truncate text-text-primary">
                    {formatCurrency(originMetrics.newValue || 0)}
                  </div>
                  <div className="text-xs text-text-tertiary mt-1">New Pipeline This Period</div>
                  <div className="text-xs text-green-600 mt-1">{originMetrics.newCount || 0} new deals</div>
                </div>
                <div className="bg-white rounded-xl border border-border-tertiary p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                      <Icon name="RefreshCw" size={18} className="text-amber-500" />
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Carry</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums truncate text-text-primary">
                    {formatCurrency(originMetrics.carryValue || 0)}
                  </div>
                  <div className="text-xs text-text-tertiary mt-1">Carried Forward Pipeline</div>
                  <div className="text-xs text-amber-600 mt-1">{originMetrics.carryCount || 0} carry deals</div>
                </div>
              </div>
            )}

            {/* Today's Activity */}
              <div
                className={`bg-white rounded-xl border p-5 cursor-pointer transition-colors hover:bg-background-secondary ${todayActivities.length === 0 ? 'border-amber-200 bg-amber-50/30' : 'border-border-tertiary'}`}
                onClick={() => setShowLogModal(true)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Icon name="Activity" size={18} className="text-blue-600" />
                  </div>
                  <Icon name="Plus" size={16} className="text-blue-500" />
                </div>
                <div className={`text-xl font-bold tabular-nums truncate leading-tight ${todayActivities.length === 0 ? 'text-amber-600' : 'text-text-primary'}`}>
                  {todayActivities.length}
                </div>
                <div className="text-xs text-text-tertiary mt-1">
                  {todayActivities.length === 0 ? 'No activity today — tap to log' : 'Activities logged today'}
                </div>
              </div>

              {/* Quick Log Activity Modal */}
              <LogActivityModal
                isOpen={showLogModal}
                onClose={() => setShowLogModal(false)}
                onSaved={(a) => setTodayActivities(p => [a, ...p])}
                dealId={null}
                contactId={null}
                contactName=""
                // In "View As" this is the viewed salesman's id, so the logged
                // activity is owned by them — not the director. Falls back to
                // the director's own id on their own dashboard.
                ownerId={effectiveUser?.id}
              />

            {!targetMetrics?.hasActiveTarget && (
              <div className="mt-4 pt-4 border-t text-center text-gray-500">
                <Icon name="Info" size={20} className="inline mr-2" />
                {t("dashboard.noActiveTarget")}
              </div>
            )}
          </div>

          {/* Quick Stats Row */}
          {executiveMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Icon name="TrendingUp" size={24} className="text-blue-600" />
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(executiveMetrics.activePipeline)}
                  </div>
                  <div className="text-sm text-gray-500">{t("dashboard.activePipeline")}</div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Icon name="Target" size={24} className="text-purple-600" />
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-900">
                    {executiveMetrics.winRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500">{t("dashboard.winRate")}</div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Icon
                    name="CheckCircle"
                    size={24}
                    className="text-green-600"
                  />
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-900">
                    {executiveMetrics.wonDeals}
                  </div>
                  <div className="text-sm text-gray-500">{t("dashboard.wonDeals")}</div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Icon
                    name="Briefcase"
                    size={24}
                    className="text-orange-600"
                  />
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-900">
                    {executiveMetrics.totalDeals}
                  </div>
                  <div className="text-sm text-gray-500">{t("dashboard.totalDeals")}</div>
                </div>
              </div>
            </div>
          )}

          {/* Performance Trend Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("dashboard.salesTrend")}
              </h3>
              {/* Trend Period Toggle */}
              <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setTrendPeriod("month")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    trendPeriod === "month"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  {t("dashboard.monthly")}
                </button>
                <button
                  onClick={() => setTrendPeriod("quarter")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    trendPeriod === "quarter"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  {t("dashboard.quarterly")}
                </button>
                <button
                  onClick={() => setTrendPeriod("year")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    trendPeriod === "year"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  {t("dashboard.yearly")}
                </button>
              </div>
            </div>
            {performanceTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis
                    tickFormatter={(value) => {
                      if (value >= 1000000)
                        return `${(value / 1000000).toFixed(1)}M`;
                      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                      return value;
                    }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      name === "revenue" ? formatCurrency(value) : value,
                      name === "revenue" ? t("dashboard.totalRevenue") : t("common.deals"),
                    ]}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="#3B82F6"
                    name="revenue"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <Icon
                    name="BarChart2"
                    size={48}
                    className="mx-auto mb-2 text-gray-300"
                  />
                  <p>{t("common.noData")}</p>
                </div>
              </div>
            )}
            {performanceTrendData.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-lg font-bold tabular-nums text-blue-600">
                    {formatCurrency(
                      performanceTrendData.reduce(
                        (sum, d) => sum + d.revenue,
                        0,
                      ),
                    )}
                  </div>
                  <div className="text-sm text-gray-500">{t("dashboard.totalRevenue")}</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold tabular-nums text-green-600">
                    {performanceTrendData.reduce((sum, d) => sum + d.deals, 0)}
                  </div>
                  <div className="text-sm text-gray-500">{t("dashboard.dealsClosed")}</div>
                </div>
              </div>
            )}
          </div>

          {/* Sales Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <SalesChart
              data={salesData}
              pipelineData={pipelineData}
              allDeals={allDeals}
              title={viewAsUser ? `${viewAsUser.full_name || viewAsUser.email}'s Performance` : "My Sales Performance"}
              showTypeSelector={true}
            />
          </div>

          {/* Upcoming Tasks Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("tasks.upcomingTasks")}
              </h3>
              <button
                onClick={() => navigate("/task-management")}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                {t("common.viewAll")}
                <Icon name="ArrowRight" size={16} />
              </button>
            </div>

            {/* Task Metrics Summary */}
            <div className="grid grid-cols-4 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-gray-900">
                  {taskMetrics.total}
                </div>
                <div className="text-xs text-gray-500">{t("common.total")}</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-yellow-600">
                  {taskMetrics.pending}
                </div>
                <div className="text-xs text-gray-500">{t("tasks.pending")}</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">
                  {taskMetrics.inProgress}
                </div>
                <div className="text-xs text-gray-500">{t("common.inProgress")}</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">
                  {taskMetrics.completed}
                </div>
                <div className="text-xs text-gray-500">{t("tasks.completed")}</div>
              </div>
            </div>

            {filteredPendingTasks.length > 0 ? (
              <div className="space-y-3">
                {filteredPendingTasks.map((task) => {
                  const isOverdue =
                    task.due_date && new Date(task.due_date) < new Date();
                  const isDueSoon =
                    task.due_date &&
                    !isOverdue &&
                    new Date(task.due_date) <=
                      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

                  return (
                    <div
                      key={task.id}
                      onClick={() =>
                        navigate(`/task-management?taskId=${task.id}`)
                      }
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            task.priority === "high"
                              ? "bg-red-500"
                              : task.priority === "medium"
                                ? "bg-yellow-500"
                                : "bg-green-500"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 truncate">
                            {task.title}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {task.status === "in_progress"
                              ? t("common.inProgress")
                              : t("tasks.pending")}
                            {task.due_date &&
                              ` • ${t("tasks.dueDate")} ${new Date(
                                task.due_date,
                              ).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isOverdue && (
                          <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                            {t("tasks.overdue")}
                          </span>
                        )}
                        {isDueSoon && !isOverdue && (
                          <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">
                            {t("dashboard.dueSoon")}
                          </span>
                        )}
                        <Icon
                          name="ChevronRight"
                          size={16}
                          className="text-gray-400"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Icon
                  name="CheckCircle"
                  size={40}
                  className="mx-auto mb-2 text-green-400"
                />
                <p>{t("dashboard.pendingTasks")}</p>
                <p className="text-sm">{t("notifications.allCaughtUp")}</p>
              </div>
            )}
          </div>

          {/* Top Clients Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("dashboard.topClientsRevenue")}
              </h3>
              <div className="text-sm text-gray-500">
                {clientInsights.length} clients
              </div>
            </div>

            {clientInsights.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue by Client Bar Chart */}
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={clientInsights}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        tickFormatter={(val) => {
                          if (val >= 1000000)
                            return `${(val / 1000000).toFixed(1)}M`;
                          if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
                          return val;
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(val) =>
                          val.length > 15 ? `${val.slice(0, 15)}...` : val
                        }
                      />
                      <Tooltip
                        formatter={(val) => formatCurrency(val)}
                        labelStyle={{ fontWeight: "bold" }}
                      />
                      <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                        {clientInsights.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Client Stats Table */}
                <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 font-medium text-gray-600">
                          #
                        </th>
                        <th className="text-left p-3 font-medium text-gray-600">
                          {t("common.client")}
                        </th>
                        <th className="text-right p-3 font-medium text-gray-600">
                          {t("dashboard.totalRevenue")}
                        </th>
                        <th className="text-right p-3 font-medium text-gray-600">
                          {t("common.deals")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientInsights.map((client, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="p-3">
                            <span
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                              style={{
                                backgroundColor:
                                  CHART_COLORS[idx % CHART_COLORS.length],
                              }}
                            >
                              {idx + 1}
                            </span>
                          </td>
                          <td className="p-3 font-medium">{client.name}</td>
                          <td className="p-3 text-right text-green-600 font-medium">
                            {formatCurrency(client.revenue)}
                          </td>
                          <td className="p-3 text-right">{client.deals}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Icon
                  name="Users"
                  size={40}
                  className="mx-auto mb-2 text-gray-300"
                />
                <p>{t("common.noData")}</p>
                <p className="text-sm">{t("dashboard.closeDealsToSeeInsights")}</p>
              </div>
            )}
          </div>

          {/* Hot Leads + Forecast */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HotLeadsWidget companyId={company?.id} />
            <SalesForecast />
          </div>

          {/* Activity Feed */}
          <div className="bg-white rounded-lg shadow">
            <ActivityFeed
              activities={filteredActivities}
              title="My Recent Activity"
              companyId={company?.id}
              users={[]}
              // View-As consistency: the "all activities" viewer must filter to
              // the salesman being viewed, not the director's own id.
              currentUserId={effectiveUser?.id}
            />
          </div>
        </div>
      )}

      {/* Deals Tab */}
      {activeView === "deals" && (
        <div className="space-y-6">
          {/* Pipeline Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t("deals.pipelineSummary")}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div
                className="text-center p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => navigate("/sales-pipeline", { state: { activeStage: "lead" } })}
                title="View Lead deals in pipeline"
              >
                <div className="text-lg font-bold tabular-nums text-gray-600">
                  {pipelineSummary.lead || 0}
                </div>
                <div className="text-sm text-gray-500">{t("deals.lead")}</div>
              </div>
              <div
                className="text-center p-4 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => navigate("/sales-pipeline", { state: { activeStage: "contact_made" } })}
                title="View Contacted deals in pipeline"
              >
                <div className="text-lg font-bold tabular-nums text-blue-600">
                  {pipelineSummary.contact_made || 0}
                </div>
                <div className="text-sm text-gray-500">{t("deals.qualified")}</div>
              </div>
              <div
                className="text-center p-4 bg-yellow-50 rounded-lg cursor-pointer hover:bg-yellow-100 transition-colors"
                onClick={() => navigate("/sales-pipeline", { state: { activeStage: "proposal_sent" } })}
                title="View Proposal deals in pipeline"
              >
                <div className="text-lg font-bold tabular-nums text-yellow-600">
                  {pipelineSummary.proposal_sent || 0}
                </div>
                <div className="text-sm text-gray-500">{t("deals.proposal")}</div>
              </div>
              <div
                className="text-center p-4 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors"
                onClick={() => navigate("/sales-pipeline", { state: { activeStage: "negotiation" } })}
                title="View Negotiation deals in pipeline"
              >
                <div className="text-lg font-bold tabular-nums text-orange-600">
                  {pipelineSummary.negotiation || 0}
                </div>
                <div className="text-sm text-gray-500">{t("deals.negotiation")}</div>
              </div>
              <div
                className="text-center p-4 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                onClick={() => navigate("/sales-pipeline", { state: { activeStage: "won" } })}
                title="View Won deals in pipeline"
              >
                <div className="text-lg font-bold tabular-nums text-green-600">
                  {pipelineSummary.won || 0}
                </div>
                <div className="text-sm text-gray-500">{t("deals.won")}</div>
              </div>
              <div
                className="text-center p-4 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
                onClick={() => navigate("/sales-pipeline", { state: { activeStage: "lost" } })}
                title="View Lost deals in pipeline"
              >
                <div className="text-lg font-bold tabular-nums text-red-600">
                  {pipelineSummary.lost || 0}
                </div>
                <div className="text-sm text-gray-500">{t("deals.lost")}</div>
              </div>
            </div>
          </div>

          {/* Deals Needing Attention */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {t("dashboard.dealsNeedingAttention")}
                </h3>
                <p className="text-sm text-gray-500">
                  {t("dashboard.dealsNeedingAttentionDesc")}
                </p>
              </div>
              <button
                onClick={() => navigate("/sales-pipeline")}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                {t("dashboard.viewPipeline")}
                <Icon name="ArrowRight" size={16} />
              </button>
            </div>

            {attentionDeals.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-600">
                        {t("common.status")}
                      </th>
                      <th className="text-left p-3 font-medium text-gray-600">
                        {t("common.deal")}
                      </th>
                      <th className="text-left p-3 font-medium text-gray-600">
                        {t("common.client")}
                      </th>
                      <th className="text-right p-3 font-medium text-gray-600">
                        {t("common.value")}
                      </th>
                      <th className="text-left p-3 font-medium text-gray-600">
                        {t("common.products")}
                      </th>
                      <th className="text-left p-3 font-medium text-gray-600">
                        {t("common.stage")}
                      </th>
                      <th className="text-left p-3 font-medium text-gray-600">
                        {t("deals.closeDate")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attentionDeals.map((deal) => (
                      <tr
                        key={deal.id}
                        className="border-t hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          navigate("/sales-pipeline", { state: { activeStage: deal.stage } })
                        }
                      >
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {deal.reason.map((r, idx) => (
                              <span
                                key={idx}
                                className={`text-xs px-2 py-1 rounded-full font-medium ${
                                  r === t("pipeline.overdue")
                                    ? "bg-orange-100 text-orange-700"
                                    : r === t("dashboard.highValueLabel")
                                      ? "bg-purple-100 text-purple-700"
                                      : r === t("dashboard.closingSoonLabel")
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-gray-900">
                            {deal.title}
                          </div>
                          <div className="text-xs text-gray-500">
                            {t("dashboard.lastUpdated")} {deal.daysSinceUpdate}{t("dashboard.daysCount")} {t("common.old")}
                          </div>
                        </td>
                        <td className="p-3 text-gray-700">{deal.clientName}</td>
                        <td className="p-3 text-right font-medium text-green-600">
                          {formatCurrency(deal.dealValue)}
                        </td>
                        <td
                          className="p-3 text-gray-600 max-w-[150px] truncate"
                          title={deal.products}
                        >
                          {deal.products}
                        </td>
                        <td className="p-3">
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                              deal.stage === "negotiation"
                                ? "bg-orange-100 text-orange-700"
                                : deal.stage === "proposal_sent"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : deal.stage === "contact_made"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {deal.stage.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-3">
                          {deal.expected_close_date ? (
                            <div>
                              <div
                                className={`font-medium ${
                                  deal.daysUntilClose < 0
                                    ? "text-red-600"
                                    : deal.daysUntilClose <= 7
                                      ? "text-yellow-600"
                                      : "text-gray-700"
                                }`}
                              >
                                {new Date(
                                  deal.expected_close_date,
                                ).toLocaleDateString()}
                              </div>
                              <div className="text-xs text-gray-500">
                                {deal.daysUntilClose < 0
                                  ? `${Math.abs(deal.daysUntilClose)}d overdue`
                                  : `${deal.daysUntilClose}d left`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">{t("common.none")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Icon
                  name="CheckCircle"
                  size={48}
                  className="mx-auto mb-3 text-green-400"
                />
                <p className="font-medium">All deals are on track!</p>
                <p className="text-sm">{t("dashboard.dealsNeedingAttentionDesc")}</p>
              </div>
            )}
          </div>

          {/* Pipeline Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <PipelineChart
              pipelineData={pipelineData}
              selectedCompany={company}
            />
          </div>
        </div>
      )}

      {/* My Targets Tab (VIEW-ONLY) */}
      {activeView === "targets" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Monthly Target Card */}
            <MonthlyTargetCard
              monthlyTarget={monthlyTarget}
              periodLabel={periodLabel}
              loading={monthlyLoading}
            />

            {/* Existing Yearly Target Card — unchanged */}
            {targetsWithCalculatedProgress.length > 0 ? (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start space-x-3 mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <Icon name="Info" size={20} className="text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-900 mb-1">
                    Your Assigned Targets
                  </h3>
                  <p className="text-sm text-blue-800">
                    These targets have been assigned to you by your supervisor.
                    Track your progress and work towards achieving them.
                  </p>
                </div>
              </div>

              <SalesTargetTable
                title="Your Assigned Targets"
                targets={targetsWithCalculatedProgress}
                role="salesman"
              />

              <div className="mt-6">
                <ProductTargetReport
                  title="Product-wise Target vs Achieved"
                  productTargets={productTargetsWithProgress}
                  formatCurrency={formatCurrency}
                />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Icon
                name="Target"
                size={48}
                className="mx-auto text-gray-400 mb-4"
              />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Targets Assigned
              </h3>
              <p className="text-gray-600">
                You don't have any sales targets assigned yet. Check back later
                or contact your supervisor.
              </p>
            </div>
          )}
          </div>{/* end grid */}
        </div>
      )}
    </div>
  );
};

export default EnhancedSalesmanDashboard;
