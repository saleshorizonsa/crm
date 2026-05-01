import React, { useState, useEffect, useMemo } from "react";
import MetricsCard from "./MetricsCard";
import SalesChart from "./SalesChart";
import ActivityFeed from "./ActivityFeed";
import TeamPerformance from "./TeamPerformance";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";
import ProductTargetReport from "../../../components/ProductTargetReport";
import { useAuth } from "../../../contexts/AuthContext";
import { useCurrency } from "../../../contexts/CurrencyContext";
import {
  companyService,
  dealService,
  taskService,
  activityService,
  userService,
  salesTargetService,
  contactService,
} from "../../../services/supabaseService";
import SupervisorSalesTargetAssignment from "../../../components/SupervisorSalesTargetAssignment";
import PipelineChart from "./PipelineChart";
import ActionableDashboard from "./ActionableDashboard";
import HotLeadsWidget from "./HotLeadsWidget";
import MetricInsightModal from "./MetricInsightModal";
import { supabase } from "../../../lib/supabase";
import { aggregateProductPerformance } from "../../../utils/productTargetUtils";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const EnhancedSupervisorDashboard = ({
  viewAsUser = null,
  readOnly = false,
  filterMonth = undefined,
  filterQuarter = undefined,
  filterYear = undefined,
}) => {
  const { user, userProfile, company } = useAuth();
  const { formatCurrency, convertCurrency, preferredCurrency } = useCurrency();

  // If viewing as another user (director view), use that user's data
  const effectiveUser = viewAsUser || { id: user?.id };
  const effectiveUserProfile = viewAsUser || userProfile;

  // Helper to convert deal amount to user's preferred currency
  const getConvertedAmount = (deal) => {
    const amount = parseFloat(deal.amount) || 0;
    const dealCurrency = deal.currency || preferredCurrency;
    if (dealCurrency === preferredCurrency) return amount;
    return convertCurrency(amount, dealCurrency, preferredCurrency);
  };
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState("overview");

  // Separate filter states for month, quarter, and year
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Sync from parent filter props when the manager controls filters via "View As"
  useEffect(() => {
    if (filterMonth !== undefined) {
      setSelectedMonth(filterMonth ?? null);
      setSelectedQuarter(filterQuarter ?? null);
      setSelectedYear(filterYear ?? null);
    }
  }, [filterMonth, filterQuarter, filterYear]);

  // Performance Trend toggle (separate from main filters)
  const [trendPeriod, setTrendPeriod] = useState("month"); // month, quarter, year

  // Data states
  const [metrics, setMetrics] = useState(null);
  const [salesData, setSalesData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [showTargetAssignment, setShowTargetAssignment] = useState(false);
  const [showAssignmentCard, setShowAssignmentCard] = useState(false);
  const [assignedTargets, setAssignedTargets] = useState([]);
  const [myTargets, setMyTargets] = useState([]); // Targets assigned TO this supervisor
  const [selectedTargetUser, setSelectedTargetUser] = useState(null);
  const [subordinates, setSubordinates] = useState([]);
  const [allSubordinates, setAllSubordinates] = useState([]);
  const [subordinateIds, setSubordinateIds] = useState([]);
  const [clientTargetsData, setClientTargetsData] = useState([]);
  const [productTargetsData, setProductTargetsData] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [allContacts, setAllContacts] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [showTeamBreakdown, setShowTeamBreakdown] = useState(false);
  const [showClientBreakdown, setShowClientBreakdown] = useState(false);
  const [showProductBreakdown, setShowProductBreakdown] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null); // Target being edited in modal
  const [selectedTargetDetail, setSelectedTargetDetail] = useState(null); // For drill-down modal

  // Table filter states
  const [tableTypeFilter, setTableTypeFilter] = useState("all"); // all, by_value, by_clients, by_products
  const [tableStatusFilter, setTableStatusFilter] = useState("all"); // all, active, completed, expired
  const [tableMemberFilter, setTableMemberFilter] = useState("all"); // all, or specific member id

  // Enhanced data states
  const [actionItems, setActionItems] = useState([]);
  const [metricInsightModal, setMetricInsightModal] = useState({
    isOpen: false,
    metricType: null,
  });

  const handleMetricClick = (metricType) => {
    setMetricInsightModal({
      isOpen: true,
      metricType,
    });
  };

  const handleCloseMetricModal = () => {
    setMetricInsightModal({
      isOpen: false,
      metricType: null,
    });
  };

  useEffect(() => {
    if (company?.id && effectiveUserProfile?.id) {
      loadSupervisorData();
    }
  }, [company?.id, effectiveUserProfile?.id]);

  // Generate filter options for month, quarter, and year
  const monthOptions = useMemo(() => {
    const months = [];
    // Generate only months in selected quarter, or all 12 months if no quarter selected
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
    // If a month is selected, only show the quarter containing that month
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
          // Use expected_close_date for won deals
          const dealDate = new Date(
            d.expected_close_date || d.updated_at || d.created_at,
          );
          return (
            dealDate.getFullYear() === currentYear &&
            dealDate.getMonth() === index
          );
        });
        const revenue = monthDeals.reduce(
          (sum, d) => sum + getConvertedAmount(d),
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
          // Use expected_close_date for won deals
          const dealDate = new Date(
            d.expected_close_date || d.updated_at || d.created_at,
          );
          const dealMonth = dealDate.getMonth();
          return (
            dealDate.getFullYear() === currentYear &&
            dealMonth >= startMonth &&
            dealMonth <= endMonth
          );
        });
        const revenue = quarterDeals.reduce(
          (sum, d) => sum + getConvertedAmount(d),
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
          // Use expected_close_date for won deals
          const dealDate = new Date(
            d.expected_close_date || d.updated_at || d.created_at,
          );
          return dealDate.getFullYear() === year;
        });
        const revenue = yearDeals.reduce(
          (sum, d) => sum + getConvertedAmount(d),
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

  // Helper function to check if a date falls within selected filters
  // All three filters work together: year + quarter + month
  const isInSelectedPeriod = (date) => {
    const itemDate = new Date(date);
    const itemYear = itemDate.getFullYear();
    const itemMonth = itemDate.getMonth();
    const itemQuarter = Math.floor(itemMonth / 3);

    // Check year filter (required if set)
    if (selectedYear !== null && itemYear !== selectedYear) {
      return false;
    }

    // Check quarter filter (required if set)
    if (selectedQuarter !== null && itemQuarter !== selectedQuarter) {
      return false;
    }

    // Check month filter (required if set)
    if (selectedMonth !== null && itemMonth !== selectedMonth) {
      return false;
    }

    return true;
  };

  // Canonical date helper — always use closed_at for won deals
  const dealDate = (deal) =>
    deal.stage === "won"
      ? deal.closed_at || deal.expected_close_date || deal.created_at
      : deal.updated_at || deal.created_at;

  // Filter all data based on selected filters
  const filteredDeals = useMemo(() => {
    return allDeals?.filter((deal) => isInSelectedPeriod(dealDate(deal))) || [];
  }, [allDeals, selectedMonth, selectedQuarter, selectedYear]);

  // ----- useMemo-derived metrics (always in sync with filters, no state race) -----

  // Executive KPI metrics: Total Revenue = whole team (supervisor + subordinates)
  const executiveMetrics = useMemo(() => {
    if (!allDeals.length) return null;
    const teamSubIds = allSubordinates?.map((s) => s.id) || [];
    const myDeals = filteredDeals.filter(
      (d) => d.owner_id === effectiveUser.id,
    );
    const teamDeals = filteredDeals.filter(
      (d) => d.owner_id === effectiveUser.id || teamSubIds.includes(d.owner_id),
    );
    const myWon = myDeals.filter((d) => d.stage === "won");
    const totalRevenue = teamDeals
      .filter((d) => d.stage === "won")
      .reduce((sum, d) => sum + getConvertedAmount(d), 0);
    const activePipeline = myDeals
      .filter((d) => !["won", "lost"].includes(d.stage))
      .reduce((sum, d) => sum + getConvertedAmount(d), 0);
    const winRate =
      myDeals.length > 0 ? (myWon.length / myDeals.length) * 100 : 0;
    return {
      totalRevenue,
      activePipeline,
      winRate,
      totalDeals: myDeals.length,
      wonDeals: myWon.length,
      dealsWon: myWon.length,
    };
  }, [
    filteredDeals,
    allDeals,
    effectiveUser.id,
    allSubordinates,
    preferredCurrency,
  ]);

  // Pipeline stages breakdown (supervisor's own deals)
  const pipelineData = useMemo(() => {
    const myDeals = filteredDeals.filter(
      (d) => d.owner_id === effectiveUser.id,
    );
    return [
      "lead",
      "contact_made",
      "proposal_sent",
      "negotiation",
      "won",
      "lost",
    ].map((stage) => {
      const sd = myDeals.filter((d) => d.stage === stage);
      return {
        stage,
        count: sd.length,
        totalValue: sd.reduce((sum, d) => sum + getConvertedAmount(d), 0),
      };
    });
  }, [filteredDeals, effectiveUser.id, preferredCurrency]);

  // Team performance table (supervisor + subordinates)
  const teamData = useMemo(() => {
    if (!allDeals.length) return [];
    const subIds = allSubordinates?.map((s) => s.id) || [];
    const teamUsers = [effectiveUserProfile, ...allSubordinates].filter(
      (u) => u && (u.id === effectiveUser.id || subIds.includes(u.id)),
    );
    return teamUsers.map((teamUser) => {
      const userDeals = filteredDeals.filter((d) => d.owner_id === teamUser.id);
      const won = userDeals.filter((d) => d.stage === "won");
      const totalValue = won.reduce((sum, d) => sum + getConvertedAmount(d), 0);
      return {
        id: teamUser.id,
        name: teamUser.full_name || teamUser.email,
        full_name: teamUser.full_name,
        email: teamUser.email,
        role: teamUser.role,
        avatar_url: teamUser.avatar_url,
        deals: userDeals.length,
        wonDeals: won.length,
        wonAmount: totalValue,
        total: totalValue,
        activeDeals: userDeals.filter((d) => !["won", "lost"].includes(d.stage))
          .length,
        lostDeals: userDeals.filter((d) => d.stage === "lost").length,
        winRate:
          userDeals.length > 0
            ? Math.round((won.length / userDeals.length) * 100)
            : 0,
      };
    });
  }, [
    filteredDeals,
    allDeals,
    allSubordinates,
    effectiveUser.id,
    effectiveUserProfile,
    preferredCurrency,
  ]);

  const filteredActivities = useMemo(() => {
    return (
      activities?.filter((activity) =>
        isInSelectedPeriod(activity.created_at),
      ) || []
    );
  }, [activities, selectedMonth, selectedQuarter, selectedYear]);

  const filteredContacts = useMemo(() => {
    return (
      allContacts?.filter((contact) =>
        isInSelectedPeriod(contact.created_at || contact.updated_at),
      ) || []
    );
  }, [allContacts, selectedMonth, selectedQuarter, selectedYear]);

  const filteredTasks = useMemo(() => {
    return (
      allTasks?.filter((task) => isInSelectedPeriod(task.created_at)) || []
    );
  }, [allTasks, selectedMonth, selectedQuarter, selectedYear]);

  // Helper function to get dynamic period label
  const getPeriodLabel = () => {
    if (selectedMonth !== null && selectedYear !== null) {
      const monthName = new Date(2000, selectedMonth, 1).toLocaleString(
        "default",
        { month: "short" },
      );
      return `${monthName} ${selectedYear}`;
    } else if (selectedMonth !== null) {
      const monthName = new Date(2000, selectedMonth, 1).toLocaleString(
        "default",
        { month: "short" },
      );
      return monthName;
    } else if (selectedQuarter !== null && selectedYear !== null) {
      return `Q${selectedQuarter + 1} ${selectedYear}`;
    } else if (selectedQuarter !== null) {
      return `Q${selectedQuarter + 1}`;
    } else if (selectedYear !== null) {
      return `${selectedYear}`;
    }
    return "Current";
  };

  // Filter targets based on selected filters - check if target period overlaps with selected filters
  const filteredMyTargets = useMemo(() => {
    if (!myTargets) return myTargets;
    if (
      selectedMonth === null &&
      selectedQuarter === null &&
      selectedYear === null
    )
      return myTargets;

    return myTargets.filter((target) => {
      const targetStart = new Date(target.period_start);
      const targetEnd = new Date(target.period_end);

      // Build the filter period based on selected filters
      let periodStart, periodEnd;

      if (selectedMonth !== null && selectedYear !== null) {
        // Specific month in a year
        periodStart = new Date(selectedYear, selectedMonth, 1);
        periodEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      } else if (selectedQuarter !== null && selectedYear !== null) {
        // Specific quarter in a year
        const quarterMonth = selectedQuarter * 3;
        periodStart = new Date(selectedYear, quarterMonth, 1);
        periodEnd = new Date(selectedYear, quarterMonth + 3, 0, 23, 59, 59);
      } else if (selectedYear !== null) {
        // Entire year
        periodStart = new Date(selectedYear, 0, 1);
        periodEnd = new Date(selectedYear, 11, 31, 23, 59, 59);
      } else if (selectedMonth !== null) {
        // Same month across all years - check if target period includes this month
        const targetMonth = targetStart.getMonth();
        return targetMonth === selectedMonth;
      } else if (selectedQuarter !== null) {
        // Same quarter across all years - check if target period includes this quarter
        const targetMonth = targetStart.getMonth();
        const targetQuarter = Math.floor(targetMonth / 3);
        return targetQuarter === selectedQuarter;
      }

      // Check if target overlaps with the filter period
      return targetStart <= periodEnd && targetEnd >= periodStart;
    });
  }, [myTargets, selectedMonth, selectedQuarter, selectedYear]);

  // Recalculate target progress based on filtered deals for the selected filters
  const targetsWithRecalculatedProgress = useMemo(() => {
    // If no deals at all, return targets as-is
    if (!allDeals?.length) {
      return filteredMyTargets;
    }

    // Get subordinate IDs from allSubordinates (includes all team members)
    const teamSubordinateIds = allSubordinates?.map((s) => s.id) || [];

    // All won deals across the company (unfiltered by time — each target filters its own window)
    const allWonDeals = allDeals.filter((d) => d.stage === "won");

    // Helper: is a deal date inside a target's period_start … period_end?
    const isInTargetPeriod = (deal, target) => {
      const date = new Date(dealDate(deal));
      const start = new Date(target.period_start);
      const end = new Date(target.period_end);
      // Normalise end to end-of-day
      end.setHours(23, 59, 59, 999);
      return date >= start && date <= end;
    };

    // Determine period type based on which filter is active
    const periodType =
      selectedMonth !== null
        ? "month"
        : selectedQuarter !== null
          ? "quarter"
          : "year";

    // If there are no targets for this period, use the global filter to build a synthetic card
    if (!filteredMyTargets.length) {
      const dealsInPeriod = allWonDeals.filter((d) =>
        isInSelectedPeriod(dealDate(d)),
      );
      const supervisorRevenue =
        dealsInPeriod
          .filter((d) => d.owner_id === effectiveUser?.id)
          .reduce((sum, d) => sum + getConvertedAmount(d), 0) || 0;
      const subordinatesRevenue =
        dealsInPeriod
          .filter((d) => teamSubordinateIds.includes(d.owner_id))
          .reduce((sum, d) => sum + getConvertedAmount(d), 0) || 0;

      return [
        {
          id: "synthetic-period-target",
          target_amount: 0,
          calculated_progress: supervisorRevenue + subordinatesRevenue,
          supervisor_revenue: supervisorRevenue,
          subordinates_contribution: subordinatesRevenue,
          period_type: periodType,
          is_synthetic: true, // Flag to indicate this is not a real target
        },
      ];
    }

    // For each target, compute revenue only for that target's own period window
    return filteredMyTargets.map((target) => {
      const dealsInTargetPeriod = allWonDeals.filter((d) =>
        isInTargetPeriod(d, target),
      );

      const supervisorRevenue =
        dealsInTargetPeriod
          .filter((d) => d.owner_id === effectiveUser?.id)
          .reduce((sum, d) => sum + getConvertedAmount(d), 0) || 0;

      const subordinatesRevenue =
        dealsInTargetPeriod
          .filter((d) => teamSubordinateIds.includes(d.owner_id))
          .reduce((sum, d) => sum + getConvertedAmount(d), 0) || 0;

      return {
        ...target,
        calculated_progress: supervisorRevenue + subordinatesRevenue,
        supervisor_revenue: supervisorRevenue,
        subordinates_contribution: subordinatesRevenue,
      };
    });
  }, [
    filteredMyTargets,
    allDeals,
    selectedMonth,
    selectedQuarter,
    selectedYear,
    effectiveUser?.id,
    allSubordinates,
    preferredCurrency,
  ]);

  // Filter assigned targets (targets assigned BY the supervisor to salesmen) based on selected time period
  const filteredAssignedTargets = useMemo(() => {
    if (!assignedTargets) return assignedTargets;
    if (
      selectedMonth === null &&
      selectedQuarter === null &&
      selectedYear === null
    )
      return assignedTargets;

    return assignedTargets.filter((target) => {
      const targetStart = new Date(target.period_start);
      const targetEnd = new Date(target.period_end);

      // Build the filter period based on selected filters
      let periodStart, periodEnd;

      if (selectedMonth !== null && selectedYear !== null) {
        // Specific month in a year
        periodStart = new Date(selectedYear, selectedMonth, 1);
        periodEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      } else if (selectedQuarter !== null && selectedYear !== null) {
        // Specific quarter in a year
        const quarterMonth = selectedQuarter * 3;
        periodStart = new Date(selectedYear, quarterMonth, 1);
        periodEnd = new Date(selectedYear, quarterMonth + 3, 0, 23, 59, 59);
      } else if (selectedYear !== null) {
        // Entire year
        periodStart = new Date(selectedYear, 0, 1);
        periodEnd = new Date(selectedYear, 11, 31, 23, 59, 59);
      } else if (selectedMonth !== null) {
        // Same month across all years - check if target period includes this month
        const targetMonth = targetStart.getMonth();
        return targetMonth === selectedMonth;
      } else if (selectedQuarter !== null) {
        // Same quarter across all years - check if target period includes this quarter
        const targetMonth = targetStart.getMonth();
        const targetQuarter = Math.floor(targetMonth / 3);
        return targetQuarter === selectedQuarter;
      }

      // Check if target overlaps with the filter period
      return targetStart <= periodEnd && targetEnd >= periodStart;
    });
  }, [assignedTargets, selectedMonth, selectedQuarter, selectedYear]);

  // Recalculate per-subordinate target progress from deals.
  // The DB column `progress_amount` is not auto-updated when deals close,
  // so we derive it on the client. For each target:
  //   progress = sum of won-deal amounts owned by the assignee (and, if the
  //   assignee is a manager/supervisor/head, by their subordinates too)
  //   that close inside that target's period_start..period_end window.
  const assignedTargetsWithProgress = useMemo(() => {
    if (!filteredAssignedTargets || filteredAssignedTargets.length === 0) {
      return filteredAssignedTargets || [];
    }
    const deals = allDeals || [];
    const subs = allSubordinates || [];

    const childIdsByParent = subs.reduce((acc, s) => {
      if (s.supervisor_id) {
        if (!acc[s.supervisor_id]) acc[s.supervisor_id] = [];
        acc[s.supervisor_id].push(s.id);
      }
      return acc;
    }, {});

    return filteredAssignedTargets.map((target) => {
      const periodStart = new Date(target.period_start);
      const periodEnd = new Date(target.period_end);
      periodEnd.setHours(23, 59, 59, 999);

      const isInPeriod = (deal) => {
        const dateStr =
          deal.expected_close_date || deal.updated_at || deal.created_at;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d >= periodStart && d <= periodEnd;
      };

      const assignee = subs.find((s) => s.id === target.assigned_to);
      const assigneeRole = assignee?.role || target.assignee?.role;
      const includeSubordinates =
        assigneeRole === "manager" ||
        assigneeRole === "supervisor" ||
        assigneeRole === "head";

      const ownerIds = new Set([target.assigned_to]);
      if (includeSubordinates) {
        (childIdsByParent[target.assigned_to] || []).forEach((id) =>
          ownerIds.add(id),
        );
      }

      const calculated_progress = deals
        .filter(
          (d) =>
            d.stage === "won" && ownerIds.has(d.owner_id) && isInPeriod(d),
        )
        .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

      return { ...target, calculated_progress };
    });
  }, [filteredAssignedTargets, allDeals, allSubordinates]);

  const periodFilteredProductTargets = useMemo(() => {
    const visibleTargetIds = new Set(
      (filteredAssignedTargets || []).map(
        (target) => target.parent_target_id || target.id,
      ),
    );

    return (productTargetsData || []).filter((productTarget) =>
      visibleTargetIds.has(productTarget.sales_target_id),
    );
  }, [productTargetsData, filteredAssignedTargets]);

  const aggregatedProductPerformance = useMemo(
    () => aggregateProductPerformance(periodFilteredProductTargets),
    [periodFilteredProductTargets],
  );

  const topProductPerformance = useMemo(
    () =>
      [...aggregatedProductPerformance]
        .filter((item) => item.value_progress !== null || item.quantity_progress !== null)
        .sort(
          (a, b) =>
            (b.value_progress ?? b.quantity_progress ?? 0) -
            (a.value_progress ?? a.quantity_progress ?? 0),
        )
        .slice(0, 3),
    [aggregatedProductPerformance],
  );

  const underperformingProducts = useMemo(
    () =>
      [...aggregatedProductPerformance]
        .filter((item) => {
          const progress = item.value_progress ?? item.quantity_progress;
          return progress !== null && progress < 70;
        })
        .sort(
          (a, b) =>
            (a.value_progress ?? a.quantity_progress ?? 0) -
            (b.value_progress ?? b.quantity_progress ?? 0),
        )
        .slice(0, 3),
    [aggregatedProductPerformance],
  );

  const loadSupervisorData = async () => {
    setIsLoading(true);
    try {
      console.log(
        "🔍 Loading supervisor data for:",
        user.email,
        "Auth User ID:",
        user.id,
        "DB User ID:",
        userProfile?.id,
      );

      // Get subordinates (salesmen under this supervisor)
      const { data: subordinatesData, error: subError } =
        await userService.getUserSubordinates(effectiveUser.id);

      console.log("👥 Subordinates query result:", {
        data: subordinatesData,
        error: subError,
        count: subordinatesData?.length || 0,
      });

      setAllSubordinates(subordinatesData || []);

      // Store subordinate IDs for filtering deals
      const subIds = subordinatesData?.map((s) => s.id) || [];
      setSubordinateIds(subIds);

      console.log("📋 Subordinate IDs:", subIds);

      // For supervisors, only salesmen can be assigned targets
      const salesmenOnly =
        subordinatesData?.filter((sub) => sub.role === "salesman") || [];
      setSubordinates(salesmenOnly);

      console.log(
        "👤 Salesmen only:",
        salesmenOnly.map((s) => ({
          id: s.id,
          name: s.full_name,
          email: s.email,
        })),
      );

      // Get all team user IDs (supervisor + all subordinates)
      const allSubordinateIds = subordinatesData?.map((s) => s.id) || [];
      const allUserIds = [effectiveUser.id, ...allSubordinateIds];

      const results = await Promise.allSettled([
        companyService.getCompanyMetrics(company.id, effectiveUser.id, false),
        companyService.getSalesData(
          company.id,
          "monthly",
          effectiveUser.id,
          false,
        ),
        activityService.getUserActivities(company.id, effectiveUser.id, 20),
        userService.getCompanyUsers(company.id),
        dealService.getDeals(company.id, { viewAll: true }, effectiveUser.id),
        contactService.getContacts(company.id, {}, effectiveUser.id),
        taskService.getMyTasks(effectiveUser.id, company.id, {
          userOnly: false,
        }),
      ]);

      const [
        metricsResult,
        salesResult,
        activitiesResult,
        usersResult,
        dealsResult,
        contactsResult,
        tasksResult,
      ] = results;

      if (metricsResult.status === "fulfilled") {
        setMetrics(metricsResult.value.data);
      }
      if (salesResult.status === "fulfilled") {
        setSalesData(salesResult.value.data);
      }
      if (activitiesResult.status === "fulfilled") {
        setActivities(activitiesResult.value.data);
      }
      if (contactsResult.status === "fulfilled" && contactsResult.value.data) {
        setAllContacts(contactsResult.value.data);
      }
      if (tasksResult.status === "fulfilled" && tasksResult.value.data) {
        setAllTasks(tasksResult.value.data);
      }
      if (
        usersResult.status === "fulfilled" &&
        dealsResult.status === "fulfilled"
      ) {
        const users = usersResult.value.data || [];
        const deals = dealsResult.value.data || [];
        setAllDeals(deals); // Store all deals for filtering
        // Team performance will be recalculated from filtered deals in useEffect
      }

      await loadActionItems();
      await loadSalesTargets();
    } catch (error) {
      console.error("Error loading supervisor data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const processTeamPerformance = (users, deals, subordinatesData) => {
    // Filter to only include supervisor (self) and their direct subordinates (salesmen)
    const subordinateIds = subordinatesData?.map((s) => s.id) || [];
    const teamMemberIds = [effectiveUser.id, ...subordinateIds];
    const teamMembers = users.filter((u) => teamMemberIds.includes(u.id));

    console.log("👥 Team Performance Calculation:");
    console.log("  - Total deals:", deals?.length);
    console.log("  - Subordinate IDs:", subordinateIds);
    console.log("  - Team member IDs:", teamMemberIds);
    console.log(
      "  - Team members:",
      teamMembers.map((u) => ({ id: u.id, name: u.full_name, role: u.role })),
    );

    return teamMembers.map((teamUser) => {
      const userDeals = deals.filter((deal) => deal.owner_id === teamUser.id);
      const wonDeals = userDeals.filter((deal) => deal.stage === "won");
      const totalValue = wonDeals.reduce(
        (sum, deal) => sum + getConvertedAmount(deal),
        0,
      );

      console.log(
        `  - ${teamUser.full_name}: ${wonDeals.length} won deals, $${totalValue}`,
      );

      return {
        id: teamUser.id,
        name: teamUser.full_name || teamUser.email,
        full_name: teamUser.full_name,
        email: teamUser.email,
        role: teamUser.role,
        avatar_url: teamUser.avatar_url,
        deals: userDeals.length,
        wonDeals: wonDeals.length,
        wonAmount: totalValue,
        total: totalValue,
        activeDeals: userDeals.filter((d) => !["won", "lost"].includes(d.stage))
          .length,
        lostDeals: userDeals.filter((d) => d.stage === "lost").length,
        winRate:
          userDeals.length > 0
            ? Math.round((wonDeals.length / userDeals.length) * 100)
            : 0,
      };
    });
  };

  // Recalculate count metrics + chart data when filters change
  useEffect(() => {
    if (!allDeals.length) return;

    // Update simple count metrics (contacts, tasks, deal count)
    setMetrics((prev) => ({
      ...(prev || {}),
      totalRevenue: executiveMetrics?.totalRevenue ?? 0,
      totalDeals: filteredDeals.filter((d) => d.owner_id === effectiveUser.id)
        .length,
      totalContacts: filteredContacts.length,
      totalTasks: filteredTasks.length,
    }));

    // Rebuild salesData chart from filtered deals using closed_at
    const salesDataByPeriod = filteredDeals.reduce((acc, deal) => {
      const d = new Date(dealDate(deal));
      let periodKey;
      if (selectedMonth !== null) {
        periodKey = `${d.getFullYear()}-${d.getMonth()}`;
      } else if (selectedQuarter !== null) {
        periodKey = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
      } else {
        periodKey = `${d.getFullYear()}`;
      }
      if (!acc[periodKey])
        acc[periodKey] = { period: periodKey, revenue: 0, deals: 0 };
      const amt = parseFloat(deal.amount) || 0;
      const cur = deal.currency || preferredCurrency;
      const converted =
        cur !== preferredCurrency
          ? convertCurrency(amt, cur, preferredCurrency)
          : amt;
      if (deal.stage === "won") acc[periodKey].revenue += converted;
      acc[periodKey].deals += 1;
      return acc;
    }, {});
    setSalesData(Object.values(salesDataByPeriod));
  }, [
    filteredDeals,
    filteredContacts,
    filteredTasks,
    executiveMetrics,
    preferredCurrency,
    effectiveUser.id,
    selectedMonth,
    selectedQuarter,
    selectedYear,
  ]);

  const loadActionItems = async () => {
    try {
      const { data: deals } = await dealService.getDeals(
        company.id,
        { viewAll: true },
        effectiveUser.id,
      );
      const { data: tasks } = await taskService.getMyTasks(
        effectiveUser.id,
        company.id,
        { userOnly: false },
      );
      const { data: targets } = await salesTargetService.getMyTargets(
        company.id,
        effectiveUser.id,
      );

      const actions = [];

      // High-value deals (only supervisor's own deals) - threshold in user's preferred currency
      if (deals) {
        const highValueThreshold = 50000;
        const highValueDeals = deals.filter(
          (d) =>
            d.owner_id === effectiveUser.id &&
            d.stage === "negotiation" &&
            getConvertedAmount(d) > highValueThreshold,
        );
        highValueDeals.forEach((deal) => {
          actions.push({
            type: "review_deal",
            title: `Review High-Value Deal: ${deal.title}`,
            description: `Deal worth ${formatCurrency(
              deal.amount,
              deal.currency,
            )} requires attention`,
            priority: "high",
            created_at: deal.updated_at,
            dueDate: deal.expected_close_date,
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
            type: "performance_review",
            title: `Target Behind Schedule`,
            description: `Your ${target.target_type} target is at ${Math.round(
              (parseFloat(target.progress_amount || 0) /
                parseFloat(target.target_amount || 1)) *
                100,
            )}%`,
            priority: "medium",
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
            type: "urgent_follow_up",
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

  const loadSalesTargets = async () => {
    try {
      // First, get fresh subordinates data (don't rely on state which might not be updated yet)
      const { data: freshSubordinates } = await userService.getUserSubordinates(
        effectiveUser.id,
      );
      const freshSubordinateIds = freshSubordinates?.map((s) => s.id) || [];

      console.log(
        "🎯 loadSalesTargets - Fresh subordinate IDs:",
        freshSubordinateIds,
      );

      // Load targets assigned BY this supervisor
      const { data: assigned } = await salesTargetService.getAssignedTargets(
        company.id,
      );
      const supervisorAssigned =
        assigned?.filter((t) => t.assigned_by === effectiveUser.id) || [];
      const { data: deals } = await dealService.getDeals(
        company.id,
        { viewAll: true },
        effectiveUser.id,
      );
      const scopedDeals = deals || [];

      // For each parent sales target, load child client_targets or product_group_targets
      const expandedTargets = [];
      for (const target of supervisorAssigned) {
        // Check if this is a client-based target
        const { data: clientTargets } = await supabase
          .from("client_targets")
          .select(
            "*, contact:contacts(id, first_name, last_name, company_name)",
          )
          .eq("sales_target_id", target.id);

        if (clientTargets && clientTargets.length > 0) {
          // Add each client target as a separate row
          clientTargets.forEach((ct) => {
            expandedTargets.push({
              ...target,
              id: ct.id, // Use client_target id
              parent_target_id: target.id, // Keep reference to parent
              target_type: "by_clients",
              target_amount: ct.target_amount,
              progress_amount: ct.progress_amount,
              contact_id: ct.contact_id,
              contact: ct.contact,
              client_target_data: ct,
            });
          });
        } else {
          // Check if this is a product-based target
          const { data: productTargets } =
            await salesTargetService.getProductTargetsBySalesTargetIds(target.id);

          if (productTargets && productTargets.length > 0) {
            productTargets.forEach((pt) => {
              expandedTargets.push({
                ...target,
                id: pt.id,
                parent_target_id: target.id, // Keep reference to parent
                target_type: "by_products",
                target_amount: pt.target_value || 0,
                target_quantity: pt.target_quantity,
                product_id: pt.product_id,
                product: pt.product,
                product_target_data: pt,
              });
            });
          } else {
            // Fallback for legacy product-group targets.
            const { data: legacyProductTargets } = await supabase
              .from("product_group_targets")
              .select("*")
              .eq("sales_target_id", target.id);

            if (legacyProductTargets && legacyProductTargets.length > 0) {
              legacyProductTargets.forEach((pt) => {
                expandedTargets.push({
                  ...target,
                  id: pt.id,
                  parent_target_id: target.id,
                  target_type: "by_products",
                  target_amount: pt.target_amount,
                  progress_amount: pt.progress_amount,
                  product_group: pt.product_group,
                  product_target_data: pt,
                });
              });
            } else {
              // This is a value-based target, add as-is
              expandedTargets.push({
                ...target,
                target_type: "by_value",
                parent_target_id: target.id,
              });
            }
          }
        }
      }

      setAssignedTargets(expandedTargets);

      const teamProductTargetIds = supervisorAssigned.map((target) => target.id);
      if (teamProductTargetIds.length > 0) {
        const { data: teamProductTargets } =
          await salesTargetService.getProductTargetsBySalesTargetIds(
            teamProductTargetIds,
          );

        const teamProductTargetsWithProgress =
          salesTargetService.calculateProductTargetProgress(
            teamProductTargets || [],
            scopedDeals,
            [effectiveUser.id, ...freshSubordinateIds],
          );
        const targetsById = new Map(
          supervisorAssigned.map((target) => [target.id, target]),
        );
        const membersById = new Map(
          (subordinatesData || []).map((member) => [member.id, member]),
        );

        setProductTargetsData(
          teamProductTargetsWithProgress.map((productTarget) => {
            const parentTarget =
              targetsById.get(productTarget.sales_target_id) ||
              productTarget.sales_target ||
              {};
            const assignee =
              parentTarget.assignee ||
              membersById.get(parentTarget.assigned_to) ||
              null;

            return {
              ...productTarget,
              assignee,
              currency: parentTarget.currency,
              period_start: parentTarget.period_start,
              period_end: parentTarget.period_end,
              sales_target: {
                ...productTarget.sales_target,
                ...parentTarget,
                assignee,
              },
            };
          }),
        );
      } else {
        setProductTargetsData([]);
      }

      // Load targets assigned TO this supervisor with calculated progress
      const { data: myTargetsData } = await salesTargetService.getMyTargets(
        company.id,
        effectiveUser.id,
      );

      // Calculate progress including supervisor's own revenue + subordinates' revenue
      if (myTargetsData && myTargetsData.length > 0) {
        const deals = scopedDeals;

        console.log("🎯 Deals loaded for target calculation:", deals?.length);
        console.log(
          "🎯 Won deals:",
          deals
            ?.filter((d) => d.stage === "won")
            .map((d) => ({
              title: d.title,
              owner_id: d.owner_id,
              amount: d.amount,
            })),
        );

        // Get supervisor's own won deals revenue
        const supervisorRevenue =
          deals
            ?.filter(
              (d) => d.stage === "won" && d.owner_id === effectiveUser.id,
            )
            ?.reduce((sum, d) => sum + getConvertedAmount(d), 0) || 0;

        // Get subordinates' won deals revenue (using fresh subordinate IDs)
        const subordinatesRevenue =
          deals
            ?.filter(
              (d) =>
                d.stage === "won" && freshSubordinateIds.includes(d.owner_id),
            )
            ?.reduce((sum, d) => sum + getConvertedAmount(d), 0) || 0;

        console.log("🎯 Target Progress Calculation:");
        console.log("  - Total deals loaded:", deals?.length);
        console.log("  - Fresh Subordinate IDs:", freshSubordinateIds);
        console.log("  - Supervisor revenue:", supervisorRevenue);
        console.log("  - Subordinates revenue:", subordinatesRevenue);
        console.log(
          "  - Subordinates won deals:",
          deals?.filter(
            (d) =>
              d.stage === "won" && freshSubordinateIds.includes(d.owner_id),
          ),
        );

        // Update targets with calculated progress PER TARGET (filter by period)
        const targetsWithProgress = myTargetsData.map((target) => {
          // Filter deals that closed within this target's period
          const periodStart = new Date(target.period_start);
          const periodEnd = new Date(target.period_end);
          periodEnd.setHours(23, 59, 59, 999); // Include the entire end date

          const dealsInPeriod =
            deals?.filter((d) => {
              if (d.stage !== "won") return false;

              // Use closed_at if available, otherwise fall back to created_at
              const dealDate = d.closed_at
                ? new Date(d.closed_at)
                : new Date(d.created_at);
              return dealDate >= periodStart && dealDate <= periodEnd;
            }) || [];

          // Calculate supervisor revenue for this period
          const supervisorRevenueForPeriod = dealsInPeriod
            .filter((d) => d.owner_id === effectiveUser.id)
            .reduce((sum, d) => sum + getConvertedAmount(d), 0);

          // Calculate subordinates revenue for this period
          const subordinatesRevenueForPeriod = dealsInPeriod
            .filter((d) => freshSubordinateIds.includes(d.owner_id))
            .reduce((sum, d) => sum + getConvertedAmount(d), 0);

          const totalProgressForPeriod =
            supervisorRevenueForPeriod + subordinatesRevenueForPeriod;

          console.log(
            `🎯 Target ${target.period_start} to ${target.period_end}:`,
          );
          console.log(`  - Deals in period: ${dealsInPeriod.length}`);
          console.log(`  - Supervisor revenue: ${supervisorRevenueForPeriod}`);
          console.log(
            `  - Subordinates revenue: ${subordinatesRevenueForPeriod}`,
          );
          console.log(`  - Total progress: ${totalProgressForPeriod}`);

          return {
            ...target,
            calculated_progress: totalProgressForPeriod,
            supervisor_revenue: supervisorRevenueForPeriod,
            subordinates_contribution: subordinatesRevenueForPeriod,
          };
        });

        setMyTargets(targetsWithProgress);

        // Load client targets for client-based targets
        const clientBasedTargetIds = myTargetsData
          .filter((t) => t.target_type === "by_clients")
          .map((t) => t.id);
        if (clientBasedTargetIds.length > 0) {
          const { data: clientTargets } = await supabase
            .from("client_targets")
            .select(
              "*, contact:contacts(id, first_name, last_name, company_name), sales_target:sales_targets(period_start, period_end)",
            )
            .in("sales_target_id", clientBasedTargetIds);

          // Calculate client achievements from deals (filtered by target period)
          const clientTargetsWithProgress = (clientTargets || []).map((ct) => {
            const parentTarget = ct.sales_target;
            let clientDeals =
              deals?.filter(
                (d) => d.stage === "won" && d.contact_id === ct.contact_id,
              ) || [];

            // Filter by period if parent target has period dates
            if (parentTarget?.period_start && parentTarget?.period_end) {
              const periodStart = new Date(parentTarget.period_start);
              const periodEnd = new Date(parentTarget.period_end);
              periodEnd.setHours(23, 59, 59, 999);

              clientDeals = clientDeals.filter((d) => {
                const dealDate = d.closed_at
                  ? new Date(d.closed_at)
                  : new Date(d.created_at);
                return dealDate >= periodStart && dealDate <= periodEnd;
              });
            }

            const clientAchieved = clientDeals.reduce(
              (sum, d) => sum + getConvertedAmount(d),
              0,
            );
            return {
              ...ct,
              achieved: clientAchieved,
              progress:
                ct.target_amount > 0
                  ? (clientAchieved / ct.target_amount) * 100
                  : 0,
            };
          });
          setClientTargetsData(clientTargetsWithProgress);
        } else {
          setClientTargetsData([]);
        }

      } else {
        setMyTargets(myTargetsData || []);
        setClientTargetsData([]);
      }
    } catch (error) {
      console.error("Error loading sales targets:", error);
    }
  };

  const handleEditTarget = (target) => {
    // Set the editing target and show the assignment form
    setEditingTarget(target);
    setShowAssignmentCard(true);
  };

  const handleCancelEdit = () => {
    setEditingTarget(null);
    setShowAssignmentCard(false);
  };

  const handleDeleteTarget = async () => {
    if (!editingTarget) return;

    const member = allSubordinates.find(
      (s) => s.id === editingTarget.assigned_to,
    );
    const memberName = member?.full_name || member?.email || "Unknown";

    if (
      !window.confirm(
        `Are you sure you want to delete this sales target for ${memberName}?`,
      )
    ) {
      return;
    }

    try {
      const { error } = await salesTargetService.deleteTarget(editingTarget.id);
      if (error) {
        console.error("Error deleting target:", error);
        alert("Failed to delete target: " + error.message);
        return;
      }

      setEditingTarget(null);
      setShowAssignmentCard(false);
      loadSalesTargets();
    } catch (error) {
      console.error("Error deleting target:", error);
      alert("Failed to delete target: " + error.message);
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
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Supervisor Dashboard
            </h1>
            <p className="text-gray-600 mt-1">
              Welcome back, {userProfile?.full_name || user?.email}
            </p>
          </div>
        </div>

        {/* Time Filter Dropdowns — hidden when parent controls the filters */}
        {filterMonth === undefined && (
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-gray-700">
              Filter by:
            </label>

            {/* Month Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Month:</label>
              <select
                value={selectedMonth !== null ? selectedMonth : ""}
                onChange={(e) => {
                  const newMonth =
                    e.target.value === "" ? null : parseInt(e.target.value);
                  setSelectedMonth(newMonth);
                  if (newMonth !== null) {
                    const monthQuarter = Math.floor(newMonth / 3);
                    setSelectedQuarter(monthQuarter);
                  }
                }}
                className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px]"
              >
                <option value="">All Months</option>
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Quarter Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Quarter:</label>
              <select
                value={selectedQuarter !== null ? selectedQuarter : ""}
                onChange={(e) => {
                  const newQuarter =
                    e.target.value === "" ? null : parseInt(e.target.value);
                  setSelectedQuarter(newQuarter);
                  // Clear month if it's outside the selected quarter
                  if (newQuarter !== null && selectedMonth !== null) {
                    const monthQuarter = Math.floor(selectedMonth / 3);
                    if (monthQuarter !== newQuarter) {
                      setSelectedMonth(null);
                    }
                  }
                }}
                className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[120px]"
              >
                <option value="">All Quarters</option>
                {quarterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Year:</label>
              <select
                value={selectedYear !== null ? selectedYear : ""}
                onChange={(e) => {
                  const newYear =
                    e.target.value === "" ? null : parseInt(e.target.value);
                  setSelectedYear(newYear);
                }}
                className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[100px]"
              >
                <option value="">All Years</option>
                {yearOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear All Filters */}
            {(selectedMonth || selectedQuarter || selectedYear) && (
              <button
                onClick={() => {
                  setSelectedMonth(null);
                  setSelectedQuarter(null);
                  setSelectedYear(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 ml-2"
              >
                <Icon name="X" size={14} />
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: "overview", label: "Overview", icon: "LayoutDashboard" },
            { id: "team", label: "Team Management", icon: "Users" },
            { id: "targets", label: "Sales Targets", icon: "Target" },
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
          {/* Enhanced Sales Targets Card */}
          {targetsWithRecalculatedProgress.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Icon name="Target" size={20} className="text-blue-600" />
                  Your {getPeriodLabel()} Targets
                </h3>
                <div className="flex items-center gap-4">
                  {(() => {
                    const totalTarget = targetsWithRecalculatedProgress.reduce(
                      (sum, t) => sum + parseFloat(t.target_amount || 0),
                      0,
                    );
                    const totalAchieved =
                      targetsWithRecalculatedProgress.reduce(
                        (sum, t) =>
                          sum +
                          parseFloat(
                            t.calculated_progress || t.progress_amount || 0,
                          ),
                        0,
                      );
                    const overallProgress =
                      totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;
                    return (
                      <div className="text-right">
                        <div className="text-sm text-gray-500">
                          Overall Progress
                        </div>
                        <div
                          className={`text-lg font-bold ${
                            overallProgress >= 100
                              ? "text-green-600"
                              : overallProgress >= 70
                                ? "text-blue-600"
                                : "text-amber-600"
                          }`}
                        >
                          {overallProgress.toFixed(1)}%
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Summary Stats - Fixed calculations */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-700">
                    {formatCurrency(
                      targetsWithRecalculatedProgress.reduce(
                        (sum, t) => sum + parseFloat(t.target_amount || 0),
                        0,
                      ),
                    )}
                  </div>
                  <div className="text-sm text-blue-600">Total Target</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-700">
                    {formatCurrency(
                      (targetsWithRecalculatedProgress[0]?.supervisor_revenue ||
                        0) +
                        (targetsWithRecalculatedProgress[0]
                          ?.subordinates_contribution || 0),
                    )}
                  </div>
                  <div className="text-sm text-green-600">Total Achieved</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-700">
                    {formatCurrency(
                      targetsWithRecalculatedProgress[0]?.supervisor_revenue ||
                        0,
                    )}
                  </div>
                  <div className="text-sm text-purple-600">Your Revenue</div>
                </div>
                <div className="bg-red-500 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-white">
                    {formatCurrency(
                      targetsWithRecalculatedProgress.reduce(
                        (sum, t) => sum + parseFloat(t.target_amount || 0),
                        0,
                      ) -
                        ((targetsWithRecalculatedProgress[0]
                          ?.supervisor_revenue || 0) +
                          (targetsWithRecalculatedProgress[0]
                            ?.subordinates_contribution || 0)),
                    )}
                  </div>
                  <div className="text-sm text-white">Remaining Revenue</div>
                </div>
              </div>

              {/* Target Cards Grid - Only show if not synthetic */}
              {!targetsWithRecalculatedProgress[0]?.is_synthetic && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {targetsWithRecalculatedProgress.map((target) => {
                    const supervisorRev = target.supervisor_revenue || 0;
                    const teamRev = target.subordinates_contribution || 0;
                    const progressAmount = supervisorRev + teamRev;
                    const progress =
                      (parseFloat(progressAmount) /
                        parseFloat(target.target_amount || 1)) *
                      100;

                    // Format date to show only month and year
                    const formatMonthYear = (dateStr) => {
                      const date = new Date(dateStr);
                      if (isNaN(date.getTime())) return "N/A";
                      return date.toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      });
                    };
                    const periodLabel =
                      target.period_type === "monthly"
                        ? formatMonthYear(target.period_start)
                        : `${formatMonthYear(target.period_start)} - ${formatMonthYear(target.period_end)}`;

                    return (
                      <div
                        key={target.id}
                        onClick={() => setSelectedTargetDetail(target)}
                        className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg p-4 border border-blue-100 cursor-pointer hover:shadow-lg transition-all"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Icon
                              name="Target"
                              size={16}
                              className="text-blue-600"
                            />
                            <span className="text-sm font-medium text-gray-700">
                              {target.target_type
                                ?.replace("_", " ")
                                .toUpperCase()}
                            </span>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${
                              progress >= 100
                                ? "bg-green-100 text-green-800"
                                : progress >= 70
                                  ? "bg-blue-100 text-blue-800"
                                  : progress >= 40
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-red-100 text-red-800"
                            }`}
                          >
                            {Math.round(progress)}%
                          </span>
                        </div>

                        <div className="flex items-end justify-between mb-3">
                          <div>
                            <div className="text-2xl font-bold text-gray-900">
                              {formatCurrency(progressAmount)}
                            </div>
                            <div className="text-sm text-gray-600">
                              of {formatCurrency(target.target_amount)}
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-500">
                            <div>{periodLabel}</div>
                          </div>
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              progress >= 100
                                ? "bg-green-500"
                                : progress >= 70
                                  ? "bg-blue-500"
                                  : progress >= 40
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                            }`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>

                        {/* Breakdown */}
                        {target.calculated_progress && (
                          <div className="text-xs border-t border-blue-100 pt-3 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600 flex items-center gap-1">
                                <Icon name="User" size={12} /> Your Revenue
                              </span>
                              <span className="font-medium text-gray-900">
                                {formatCurrency(target.supervisor_revenue || 0)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600 flex items-center gap-1">
                                <Icon name="Users" size={12} /> Team
                                Contribution
                              </span>
                              <span className="font-medium text-gray-900">
                                {formatCurrency(
                                  target.subordinates_contribution || 0,
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Message when showing period with no targets */}
              {targetsWithRecalculatedProgress[0]?.is_synthetic && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <Icon name="Info" size={16} className="inline mr-2" />
                    No targets assigned for this period, showing revenue only.
                  </p>
                </div>
              )}

              {/* Team Breakdown Toggle */}
              {subordinates.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <button
                    onClick={() => setShowTeamBreakdown(!showTeamBreakdown)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="Users" size={18} className="text-blue-600" />
                      <span className="text-sm font-medium text-gray-900">
                        Team Performance Breakdown
                      </span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {subordinates.length} salesmen
                      </span>
                    </div>
                    <Icon
                      name={showTeamBreakdown ? "ChevronUp" : "ChevronDown"}
                      size={18}
                      className="text-gray-500"
                    />
                  </button>

                  {showTeamBreakdown && (
                    <div className="mt-3 space-y-2">
                      {subordinates.map((member) => {
                        const memberTargets = filteredAssignedTargets.filter(
                          (t) => t.assigned_to === member.id,
                        );
                        const memberTarget = memberTargets.reduce(
                          (sum, t) => sum + parseFloat(t.target_amount || 0),
                          0,
                        );
                        // Get actual revenue from teamData (won deals)
                        const memberPerformance = teamData.find(
                          (t) => t.id === member.id,
                        );
                        const memberAchieved =
                          memberPerformance?.wonAmount || 0;

                        const memberProgress =
                          memberTarget > 0
                            ? (memberAchieved / memberTarget) * 100
                            : 0;

                        return (
                          <div
                            key={member.id}
                            className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-gray-200"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-medium">
                                {member.full_name?.charAt(0) || "S"}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {member.full_name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Salesman
                                </div>
                              </div>
                            </div>
                            <div className="text-right mr-4">
                              <div className="text-sm font-bold text-gray-900">
                                {formatCurrency(memberAchieved)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {memberTarget > 0
                                  ? `of ${formatCurrency(
                                      memberTarget,
                                    )} (${memberProgress.toFixed(0)}%)`
                                  : "No target assigned"}
                              </div>
                            </div>
                            <div className="w-16">
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    memberProgress >= 100
                                      ? "bg-green-500"
                                      : memberProgress >= 70
                                        ? "bg-blue-500"
                                        : memberProgress >= 40
                                          ? "bg-amber-500"
                                          : "bg-red-500"
                                  }`}
                                  style={{
                                    width: `${Math.min(memberProgress, 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Client Achievement Breakdown Toggle */}
              {clientTargetsData.length > 0 && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <button
                    onClick={() => setShowClientBreakdown(!showClientBreakdown)}
                    className="w-full flex items-center justify-between p-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        name="Building2"
                        size={18}
                        className="text-purple-600"
                      />
                      <span className="text-sm font-medium text-gray-900">
                        Client Achievement Breakdown
                      </span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        {clientTargetsData.length} clients
                      </span>
                    </div>
                    <Icon
                      name={showClientBreakdown ? "ChevronUp" : "ChevronDown"}
                      size={18}
                      className="text-gray-500"
                    />
                  </button>

                  {showClientBreakdown && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {clientTargetsData.map((clientTarget) => {
                        const firstName =
                          clientTarget.contact?.first_name || "";
                        const lastName = clientTarget.contact?.last_name || "";
                        const clientName =
                          `${firstName} ${lastName}`.trim() || "Unknown Client";
                        const companyName =
                          clientTarget.contact?.company_name || "";
                        const achieved = clientTarget.achieved || 0;
                        const target =
                          parseFloat(clientTarget.target_amount) || 0;
                        const progress = clientTarget.progress || 0;

                        return (
                          <div
                            key={clientTarget.id}
                            className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-medium">
                                {firstName.charAt(0).toUpperCase() || "C"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-sm font-medium text-gray-900 truncate"
                                  title={clientName}
                                >
                                  {clientName}
                                </p>
                                {companyName && (
                                  <p
                                    className="text-xs text-gray-500 truncate"
                                    title={companyName}
                                  >
                                    {companyName}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <p className="text-sm font-bold text-gray-900">
                                {formatCurrency(achieved)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {target > 0
                                  ? `of ${formatCurrency(
                                      target,
                                    )} (${progress.toFixed(0)}%)`
                                  : "No target"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Product Group Achievement Breakdown Toggle */}
              {productTargetsData.length > 0 && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <button
                    onClick={() =>
                      setShowProductBreakdown(!showProductBreakdown)
                    }
                    className="w-full flex items-center justify-between p-3 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        name="Package"
                        size={18}
                        className="text-indigo-600"
                      />
                      <span className="text-sm font-medium text-gray-900">
                        Product Group Performance Breakdown
                      </span>
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        {productTargetsData.length} groups
                      </span>
                    </div>
                    <Icon
                      name={showProductBreakdown ? "ChevronUp" : "ChevronDown"}
                      size={18}
                      className="text-gray-500"
                    />
                  </button>

                  {showProductBreakdown && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {productTargetsData.map((productTarget) => {
                        const productGroup =
                          productTarget.product_group || "Unknown Group";
                        const achieved = productTarget.achieved || 0;
                        const target =
                          parseFloat(productTarget.target_amount) || 0;
                        const progress = productTarget.progress || 0;

                        return (
                          <div
                            key={productTarget.id}
                            className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">
                                {productGroup.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-sm font-medium text-gray-900 truncate"
                                  title={productGroup}
                                >
                                  {productGroup}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Product Group
                                </p>
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <p className="text-sm font-bold text-gray-900">
                                {formatCurrency(achieved)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {target > 0
                                  ? `of ${formatCurrency(
                                      target,
                                    )} (${progress.toFixed(0)}%)`
                                  : "No target"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Metrics Cards - First Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricsCard
              title="Total Revenue"
              value={formatCurrency(executiveMetrics?.totalRevenue || 0)}
              change="+12.5%"
              trend="up"
              icon="💰"
              onClick={() => handleMetricClick("totalRevenue")}
            />
            <MetricsCard
              title="Active Deals"
              value={`${metrics?.totalDeals || 0}`}
              change="+8.2%"
              trend="up"
              icon="🤝"
              onClick={() => handleMetricClick("activePipeline")}
            />
            <MetricsCard
              title="Contacts"
              value={`${metrics?.totalContacts || 0}`}
              change="+5.4%"
              trend="up"
              icon="👥"
            />
            <MetricsCard
              title="Tasks"
              value={`${metrics?.totalTasks || 0}`}
              change="-2.1%"
              trend="down"
              icon="📋"
            />
          </div>

          {/* Metrics Cards - Second Row */}
          {executiveMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricsCard
                title="Pipeline Value"
                value={formatCurrency(executiveMetrics.activePipeline)}
                icon="TrendingUp"
                trend={8}
                iconColor="text-blue-600"
                iconBgColor="bg-blue-100"
                onClick={() => handleMetricClick("activePipeline")}
              />
              <MetricsCard
                title="Win Rate"
                value={`${executiveMetrics.winRate.toFixed(1)}%`}
                icon="Target"
                trend={5}
                iconColor="text-purple-600"
                iconBgColor="bg-purple-100"
                onClick={() => handleMetricClick("winRate")}
              />
              <MetricsCard
                title="Won Deals"
                value={`${executiveMetrics.wonDeals}`}
                subtitle={`of ${executiveMetrics.totalDeals} total`}
                icon="Briefcase"
                iconColor="text-green-600"
                iconBgColor="bg-green-100"
                onClick={() => handleMetricClick("dealsClosed")}
              />
              <MetricsCard
                title="Team Members"
                value={`${subordinates.length + 1}`}
                subtitle="including you"
                icon="Users"
                iconColor="text-orange-600"
                iconBgColor="bg-orange-100"
                onClick={() => handleMetricClick("teamPerformance")}
              />
            </div>
          )}

          {/* Performance Trend Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Performance Trend
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
                  Monthly
                </button>
                <button
                  onClick={() => setTrendPeriod("quarter")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    trendPeriod === "quarter"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Quarterly
                </button>
                <button
                  onClick={() => setTrendPeriod("year")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    trendPeriod === "year"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Yearly
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
                      name === "revenue" ? "Revenue" : "Deals",
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
                  <p>No performance data available</p>
                </div>
              </div>
            )}
            {performanceTrendData.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCurrency(
                      performanceTrendData.reduce(
                        (sum, d) => sum + d.revenue,
                        0,
                      ),
                    )}
                  </div>
                  <div className="text-sm text-gray-500">Total Revenue</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {performanceTrendData.reduce((sum, d) => sum + d.deals, 0)}
                  </div>
                  <div className="text-sm text-gray-500">Deals Closed</div>
                </div>
              </div>
            )}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            <div className="bg-white rounded-lg shadow p-6 h-full">
              <SalesChart
                data={salesData}
                pipelineData={pipelineData}
                title="Sales Performance"
                showTypeSelector={true}
              />
            </div>
            <div className="bg-white rounded-lg shadow p-6 h-full">
              <TeamPerformance data={teamData} />
            </div>
          </div>

          {/* Hot Leads */}
          <HotLeadsWidget companyId={company?.id} />

          {/* Activity Feed */}
          <div className="bg-white rounded-lg shadow">
            <ActivityFeed
              activities={filteredActivities}
              title="Recent Activity"
              companyId={company?.id}
              users={subordinates}
              currentUserId={userProfile?.id}
            />
          </div>
        </div>
      )}

      {/* Team Management Tab */}
      {activeView === "team" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">My Team</h2>
            <div className="text-sm text-gray-600">
              {subordinates.length}{" "}
              {subordinates.length === 1 ? "salesman" : "salesmen"}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Member
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deals
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conversion Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {teamData.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          {member.avatar_url ? (
                            <img
                              className="h-10 w-10 rounded-full"
                              src={member.avatar_url}
                              alt={member.name}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-gray-600 font-medium text-sm">
                                {member.name?.charAt(0).toUpperCase() || "U"}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {member.name}
                            {member.id === user.id && (
                              <span className="ml-2 text-xs text-gray-500">
                                (You)
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 capitalize">
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {member.deals}
                      </div>
                      <div className="text-xs text-gray-500">
                        {member.wonDeals} won, {member.activeDeals} active
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(member.wonAmount)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span
                          className={`text-sm font-medium ${
                            member.winRate >= 70
                              ? "text-green-600"
                              : member.winRate >= 40
                                ? "text-yellow-600"
                                : "text-red-600"
                          }`}
                        >
                          {member.winRate}%
                        </span>
                        <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              member.winRate >= 70
                                ? "bg-green-500"
                                : member.winRate >= 40
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${member.winRate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {teamData.length === 0 && (
              <div className="text-center py-12">
                <Icon
                  name="Users"
                  size={48}
                  className="mx-auto text-gray-400 mb-4"
                />
                <h3 className="text-sm font-medium text-gray-900 mb-1">
                  No team members yet
                </h3>
                <p className="text-sm text-gray-500">
                  Salesmen will appear here once assigned to your team.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sales Targets Tab */}
      {activeView === "targets" && (
        <div className="space-y-6">
          {/* Enhanced Your Current Targets Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Icon name="Target" size={24} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Your {getPeriodLabel()} Targets
                </h3>
                <p className="text-sm text-gray-500">Assigned by Manager</p>
              </div>
            </div>

            {myTargets.length > 0 ? (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                    <p className="text-sm text-green-600 font-medium">
                      Total Allocated
                    </p>
                    <p className="text-2xl font-bold text-green-700">
                      {formatCurrency(
                        myTargets.reduce(
                          (sum, t) => sum + (parseFloat(t.target_amount) || 0),
                          0,
                        ),
                      )}
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-sm text-blue-600 font-medium">
                      Assigned to Salesmen
                    </p>
                    <p className="text-2xl font-bold text-blue-700">
                      {formatCurrency(
                        filteredAssignedTargets.reduce(
                          (sum, t) => sum + (parseFloat(t.target_amount) || 0),
                          0,
                        ),
                      )}
                    </p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-sm text-amber-600 font-medium">
                      Available Budget
                    </p>
                    <p className="text-2xl font-bold text-amber-700">
                      {formatCurrency(
                        Math.max(
                          0,
                          filteredMyTargets.reduce(
                            (sum, t) =>
                              sum + (parseFloat(t.target_amount) || 0),
                            0,
                          ) -
                            filteredAssignedTargets.reduce(
                              (sum, t) =>
                                sum + (parseFloat(t.target_amount) || 0),
                              0,
                            ),
                        ),
                      )}
                    </p>
                  </div>
                </div>

                {/* Target Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myTargets.map((target) => {
                    const progress =
                      parseFloat(target.target_amount) > 0
                        ? (parseFloat(
                            target.calculated_progress ||
                              target.progress_amount ||
                              0,
                          ) /
                            parseFloat(target.target_amount)) *
                          100
                        : 0;

                    return (
                      <div
                        key={target.id}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-900 capitalize">
                            {target.period_type} Target
                          </span>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              target.status === "active"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {target.status}
                          </span>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="text-2xl font-bold text-gray-900">
                            {formatCurrency(target.target_amount)}
                          </div>
                          <div className="text-sm text-gray-600">
                            Progress:{" "}
                            {formatCurrency(
                              target.calculated_progress ||
                                target.progress_amount ||
                                0,
                            )}
                            <span className="ml-2 text-xs">
                              ({progress.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                progress >= 100
                                  ? "bg-green-500"
                                  : progress >= 70
                                    ? "bg-blue-500"
                                    : progress >= 40
                                      ? "bg-amber-500"
                                      : "bg-red-500"
                              }`}
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(target.period_start).toLocaleDateString()}{" "}
                            to{" "}
                            {new Date(target.period_end).toLocaleDateString()}
                          </div>
                        </div>

                        {target.assigner && (
                          <div className="border-t border-gray-100 pt-3 text-xs text-gray-500">
                            Assigned by:{" "}
                            {target.assigner?.full_name ||
                              target.assigner?.email ||
                              "Manager"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Team Achievement Breakdown */}
                {allSubordinates.length > 0 &&
                  filteredAssignedTargets.length > 0 && (
                    <div className="border-t border-gray-200 pt-4">
                      <button
                        onClick={() => setShowTeamBreakdown(!showTeamBreakdown)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            name="Users"
                            size={18}
                            className="text-blue-600"
                          />
                          <span className="text-sm font-medium text-gray-900">
                            Team Performance Breakdown
                          </span>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            {allSubordinates.length} salesmen
                          </span>
                        </div>
                        <Icon
                          name={showTeamBreakdown ? "ChevronUp" : "ChevronDown"}
                          size={18}
                          className="text-gray-500"
                        />
                      </button>

                      {showTeamBreakdown && (
                        <div className="mt-3 space-y-2">
                          {allSubordinates
                            .map((member) => {
                              const memberTargets =
                                filteredAssignedTargets.filter(
                                  (t) => t.assigned_to === member.id,
                                );
                              const totalTarget = memberTargets.reduce(
                                (sum, t) =>
                                  sum + (parseFloat(t.target_amount) || 0),
                                0,
                              );
                              if (totalTarget === 0) return null;
                              const memberPerformance = teamData.find(
                                (t) => t.id === member.id,
                              );
                              const achieved =
                                memberPerformance?.wonAmount || 0;
                              const memberProgress =
                                totalTarget > 0
                                  ? (achieved / totalTarget) * 100
                                  : 0;

                              return (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-gray-200"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-medium">
                                      {member.full_name?.charAt(0) || "S"}
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">
                                        {member.full_name || member.email}
                                      </div>
                                      <div className="text-xs text-gray-500 capitalize">
                                        {member.role}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right mr-4">
                                    <div className="text-sm font-bold text-gray-900">
                                      {formatCurrency(achieved)}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {totalTarget > 0
                                        ? `of ${formatCurrency(totalTarget)} (${memberProgress.toFixed(0)}%)`
                                        : "No target assigned"}
                                    </div>
                                  </div>
                                  <div className="w-16">
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                      <div
                                        className={`h-2 rounded-full ${
                                          memberProgress >= 100
                                            ? "bg-green-500"
                                            : memberProgress >= 70
                                              ? "bg-blue-500"
                                              : memberProgress >= 40
                                                ? "bg-amber-500"
                                                : "bg-red-500"
                                        }`}
                                        style={{
                                          width: `${Math.min(
                                            memberProgress,
                                            100,
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                            .filter(Boolean)}
                        </div>
                      )}
                    </div>
                  )}

                {/* Client Achievement Breakdown */}
                {clientTargetsData.length > 0 && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <button
                      onClick={() =>
                        setShowClientBreakdown(!showClientBreakdown)
                      }
                      className="w-full flex items-center justify-between p-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          name="Building2"
                          size={18}
                          className="text-purple-600"
                        />
                        <span className="text-sm font-medium text-gray-900">
                          Client Performance Breakdown
                        </span>
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          {clientTargetsData.length} clients
                        </span>
                      </div>
                      <Icon
                        name={showClientBreakdown ? "ChevronUp" : "ChevronDown"}
                        size={18}
                        className="text-gray-500"
                      />
                    </button>

                    {showClientBreakdown && (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {clientTargetsData.map((clientTarget) => {
                          const firstName =
                            clientTarget.contact?.first_name || "";
                          const lastName =
                            clientTarget.contact?.last_name || "";
                          const clientName =
                            `${firstName} ${lastName}`.trim() ||
                            "Unknown Client";
                          const companyName =
                            clientTarget.contact?.company_name || "";
                          const achieved = clientTarget.achieved || 0;
                          const target =
                            parseFloat(clientTarget.target_amount) || 0;
                          const progress = clientTarget.progress || 0;

                          return (
                            <div
                              key={clientTarget.id}
                              className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-medium">
                                  {firstName.charAt(0).toUpperCase() || "C"}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p
                                    className="text-sm font-medium text-gray-900 truncate"
                                    title={clientName}
                                  >
                                    {clientName}
                                  </p>
                                  {companyName && (
                                    <p
                                      className="text-xs text-gray-500 truncate"
                                      title={companyName}
                                    >
                                      {companyName}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right ml-2">
                                <p className="text-sm font-bold text-gray-900">
                                  {formatCurrency(achieved)}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {target > 0
                                    ? `of ${formatCurrency(
                                        target,
                                      )} (${progress.toFixed(0)}%)`
                                    : "No target"}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Product Group Performance Breakdown */}
                {productTargetsData.length > 0 && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <button
                      onClick={() =>
                        setShowProductBreakdown(!showProductBreakdown)
                      }
                      className="w-full flex items-center justify-between p-3 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          name="Package"
                          size={18}
                          className="text-indigo-600"
                        />
                        <span className="text-sm font-medium text-gray-900">
                          Product Group Performance Breakdown
                        </span>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          {productTargetsData.length} groups
                        </span>
                      </div>
                      <Icon
                        name={
                          showProductBreakdown ? "ChevronUp" : "ChevronDown"
                        }
                        size={18}
                        className="text-gray-500"
                      />
                    </button>

                    {showProductBreakdown && (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {productTargetsData.map((productTarget) => {
                          const productGroup =
                            productTarget.product_group || "Unknown Group";
                          const achieved = productTarget.achieved || 0;
                          const target =
                            parseFloat(productTarget.target_amount) || 0;
                          const progress = productTarget.progress || 0;

                          return (
                            <div
                              key={productTarget.id}
                              className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">
                                  {productGroup.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p
                                    className="text-sm font-medium text-gray-900 truncate"
                                    title={productGroup}
                                  >
                                    {productGroup}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    Product Group
                                  </p>
                                </div>
                              </div>
                              <div className="text-right ml-2">
                                <p className="text-sm font-bold text-gray-900">
                                  {formatCurrency(achieved)}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {target > 0
                                    ? `of ${formatCurrency(
                                        target,
                                      )} (${progress.toFixed(0)}%)`
                                    : "No target"}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Icon
                  name="Target"
                  size={48}
                  className="mx-auto text-gray-300 mb-4"
                />
                <p>No targets assigned by manager yet.</p>
                <p className="text-sm mt-2">
                  Contact your manager to get sales targets assigned.
                </p>
              </div>
            )}
          </div>

          {/* Enhanced Targets Breakdown Section */}
          {(filteredMyTargets.length > 0 ||
            clientTargetsData.length > 0 ||
            productTargetsData.length > 0) && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Icon name="BarChart3" size={20} className="text-blue-600" />
                Targets Breakdown
              </h3>

              <div className="space-y-6">
                {/* Targets by Value */}
                {filteredMyTargets.filter((t) => t.target_type === "by_value")
                  .length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-md font-medium text-gray-900 flex items-center gap-2">
                        <Icon
                          name="DollarSign"
                          size={18}
                          className="text-green-600"
                        />
                        Targets by Total Value
                      </h4>
                      <button
                        onClick={() => setShowTeamBreakdown(!showTeamBreakdown)}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {showTeamBreakdown ? "Hide Details" : "Show Details"}
                        <Icon
                          name={showTeamBreakdown ? "ChevronUp" : "ChevronDown"}
                          size={16}
                        />
                      </button>
                    </div>

                    {showTeamBreakdown && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredMyTargets
                          .filter((t) => t.target_type === "by_value")
                          .map((target) => {
                            const progress =
                              parseFloat(target.target_amount) > 0
                                ? (parseFloat(
                                    target.calculated_progress ||
                                      target.progress_amount ||
                                      0,
                                  ) /
                                    parseFloat(target.target_amount)) *
                                  100
                                : 0;

                            return (
                              <div
                                key={target.id}
                                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-gray-700">
                                    {new Date(
                                      target.period_start,
                                    ).toLocaleDateString()}{" "}
                                    -{" "}
                                    {new Date(
                                      target.period_end,
                                    ).toLocaleDateString()}
                                  </span>
                                  <span
                                    className={`px-2 py-1 text-xs rounded-full ${
                                      target.status === "active"
                                        ? "bg-green-100 text-green-800"
                                        : "bg-gray-100 text-gray-800"
                                    }`}
                                  >
                                    {target.status}
                                  </span>
                                </div>
                                <div className="text-xl font-bold text-gray-900 mb-1">
                                  {formatCurrency(
                                    target.calculated_progress ||
                                      target.progress_amount ||
                                      0,
                                  )}{" "}
                                  / {formatCurrency(target.target_amount)}
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      progress >= 100
                                        ? "bg-green-500"
                                        : progress >= 70
                                          ? "bg-blue-500"
                                          : progress >= 40
                                            ? "bg-amber-500"
                                            : "bg-red-500"
                                    }`}
                                    style={{
                                      width: `${Math.min(progress, 100)}%`,
                                    }}
                                  />
                                </div>
                                <div className="text-sm text-gray-600">
                                  {progress.toFixed(1)}% achieved
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}

                {/* Targets by Clients */}
                {clientTargetsData.length > 0 && (
                  <div className="border-t border-gray-200 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-md font-medium text-gray-900 flex items-center gap-2">
                        <Icon
                          name="Building2"
                          size={18}
                          className="text-purple-600"
                        />
                        Targets by Clients
                        <span className="text-sm font-normal text-gray-500">
                          ({clientTargetsData.length} clients)
                        </span>
                      </h4>
                      <button
                        onClick={() =>
                          setShowClientBreakdown(!showClientBreakdown)
                        }
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {showClientBreakdown ? "Hide Details" : "Show Details"}
                        <Icon
                          name={
                            showClientBreakdown ? "ChevronUp" : "ChevronDown"
                          }
                          size={16}
                        />
                      </button>
                    </div>

                    {showClientBreakdown && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {clientTargetsData.map((clientTarget) => {
                          const firstName =
                            clientTarget.contact?.first_name || "";
                          const lastName =
                            clientTarget.contact?.last_name || "";
                          const clientName =
                            `${firstName} ${lastName}`.trim() ||
                            "Unknown Client";
                          const companyName =
                            clientTarget.contact?.company_name || "";
                          const achieved = clientTarget.achieved || 0;
                          const target =
                            parseFloat(clientTarget.target_amount) || 0;
                          const progress = clientTarget.progress || 0;

                          return (
                            <div
                              key={clientTarget.id}
                              className="border border-gray-200 rounded-lg p-4 bg-purple-50"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-purple-200 flex items-center justify-center text-purple-700 text-sm font-medium">
                                  {firstName.charAt(0).toUpperCase() || "C"}
                                </div>
                                <div>
                                  <div className="font-medium text-sm text-gray-900">
                                    {clientName}
                                  </div>
                                  {companyName && (
                                    <div className="text-xs text-gray-600">
                                      {companyName}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-xl font-bold text-gray-900 mb-1">
                                {formatCurrency(achieved)} /{" "}
                                {formatCurrency(target)}
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    progress >= 100
                                      ? "bg-green-500"
                                      : progress >= 70
                                        ? "bg-blue-500"
                                        : progress >= 40
                                          ? "bg-amber-500"
                                          : "bg-red-500"
                                  }`}
                                  style={{
                                    width: `${Math.min(progress, 100)}%`,
                                  }}
                                />
                              </div>
                              <div className="text-sm text-gray-600">
                                {progress.toFixed(1)}% achieved
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Targets by Products */}
                {productTargetsData.length > 0 && (
                  <div className="border-t border-gray-200 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-md font-medium text-gray-900 flex items-center gap-2">
                        <Icon
                          name="Package"
                          size={18}
                          className="text-orange-600"
                        />
                        Targets by Products
                        <span className="text-sm font-normal text-gray-500">
                          ({productTargetsData.length} products)
                        </span>
                      </h4>
                      <button
                        onClick={() =>
                          setShowProductBreakdown(!showProductBreakdown)
                        }
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {showProductBreakdown ? "Hide Details" : "Show Details"}
                        <Icon
                          name={
                            showProductBreakdown ? "ChevronUp" : "ChevronDown"
                          }
                          size={16}
                        />
                      </button>
                    </div>

                    {showProductBreakdown && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {productTargetsData.map((productTarget) => {
                          const productName =
                            productTarget.product_group || "Unknown Product";
                          const achieved = productTarget.achieved || 0;
                          const target =
                            parseFloat(productTarget.target_amount) || 0;
                          const progress = productTarget.progress || 0;

                          return (
                            <div
                              key={productTarget.id}
                              className="border border-gray-200 rounded-lg p-4 bg-orange-50"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-orange-200 flex items-center justify-center text-orange-700">
                                  <Icon name="Package" size={20} />
                                </div>
                                <div>
                                  <div className="font-medium text-sm text-gray-900">
                                    {productName}
                                  </div>
                                </div>
                              </div>
                              <div className="text-xl font-bold text-gray-900 mb-1">
                                {formatCurrency(achieved)} /{" "}
                                {formatCurrency(target)}
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    progress >= 100
                                      ? "bg-green-500"
                                      : progress >= 70
                                        ? "bg-blue-500"
                                        : progress >= 40
                                          ? "bg-amber-500"
                                          : "bg-red-500"
                                  }`}
                                  style={{
                                    width: `${Math.min(progress, 100)}%`,
                                  }}
                                />
                              </div>
                              <div className="text-sm text-gray-600">
                                {progress.toFixed(1)}% achieved
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <ProductTargetReport
            title="Team Performance by Product"
            productTargets={periodFilteredProductTargets}
            formatCurrency={formatCurrency}
            showUser
            showPeriod
          />

          {(topProductPerformance.length > 0 ||
            underperformingProducts.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-md font-semibold text-gray-900 mb-3">
                  Top Performing Products
                </h3>
                <div className="space-y-2">
                  {topProductPerformance.map((product) => (
                    <div
                      key={product.product_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium text-gray-900">
                        {product.product?.material || "Unknown Product"}
                      </span>
                      <span className="text-green-600 font-semibold">
                        {(
                          product.value_progress ??
                          product.quantity_progress ??
                          0
                        ).toFixed(1)}
                        %
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-md font-semibold text-gray-900 mb-3">
                  Underperforming Products
                </h3>
                <div className="space-y-2">
                  {underperformingProducts.map((product) => (
                    <div
                      key={product.product_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium text-gray-900">
                        {product.product?.material || "Unknown Product"}
                      </span>
                      <span className="text-red-600 font-semibold">
                        {(
                          product.value_progress ??
                          product.quantity_progress ??
                          0
                        ).toFixed(1)}
                        %
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Toggle Button for Target Assignment */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                if (showAssignmentCard) {
                  setShowAssignmentCard(false);
                  setEditingTarget(null);
                } else {
                  setShowAssignmentCard(true);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                showAssignmentCard
                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              <Icon
                name={showAssignmentCard ? "ChevronUp" : "Plus"}
                size={18}
              />
              {showAssignmentCard
                ? editingTarget
                  ? "Cancel Editing"
                  : "Hide Assignment Form"
                : "Assign New Target"}
            </button>
          </div>

          {/* Inline Target Assignment Card (Toggle-able) */}
          {showAssignmentCard && (
            <SupervisorSalesTargetAssignment
              onTargetCreated={() => {
                loadSalesTargets();
                if (!editingTarget) {
                  setShowAssignmentCard(false);
                }
                setEditingTarget(null);
              }}
              companyId={company?.id}
              supervisorTargets={myTargets}
              existingTeamTargets={assignedTargets}
              editingTarget={editingTarget}
              onCancelEdit={handleCancelEdit}
              onDeleteTarget={handleDeleteTarget}
            />
          )}

          {/* Team Targets Table */}
          {filteredAssignedTargets.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-medium text-gray-900 flex items-center gap-2">
                  <Icon name="ListChecks" size={18} className="text-gray-600" />
                  Salesmen Targets Assigned
                </h3>

                {/* Filter Controls */}
                <div className="flex items-center gap-3">
                  <select
                    value={tableTypeFilter}
                    onChange={(e) => setTableTypeFilter(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="by_value">By Value</option>
                    <option value="by_clients">By Clients</option>
                    <option value="by_products">By Products</option>
                  </select>

                  <select
                    value={tableStatusFilter}
                    onChange={(e) => setTableStatusFilter(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="expired">Expired</option>
                  </select>

                  <select
                    value={tableMemberFilter}
                    onChange={(e) => setTableMemberFilter(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Salesmen</option>
                    {allSubordinates.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name || member.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Salesman
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Details
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Period
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Target
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assignedTargetsWithProgress
                      .filter((target) => {
                        // Apply type filter
                        if (
                          tableTypeFilter !== "all" &&
                          target.target_type !== tableTypeFilter
                        ) {
                          return false;
                        }
                        // Apply status filter
                        if (
                          tableStatusFilter !== "all" &&
                          target.status !== tableStatusFilter
                        ) {
                          return false;
                        }
                        // Apply member filter
                        if (
                          tableMemberFilter !== "all" &&
                          target.assigned_to !== tableMemberFilter
                        ) {
                          return false;
                        }
                        return true;
                      })
                      .map((target) => {
                        const member = allSubordinates.find(
                          (s) => s.id === target.assigned_to,
                        );
                        const progressAmount = parseFloat(
                          target.calculated_progress ??
                            target.progress_amount ??
                            0,
                        );
                        const achievement =
                          parseFloat(target.target_amount) > 0
                            ? (progressAmount /
                                parseFloat(target.target_amount)) *
                              100
                            : 0;

                        return (
                          <tr key={target.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {member?.full_name ||
                                  member?.email ||
                                  "Unknown"}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${
                                  target.target_type === "by_clients"
                                    ? "bg-purple-100 text-purple-800"
                                    : target.target_type === "by_products"
                                      ? "bg-orange-100 text-orange-800"
                                      : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {target.target_type === "by_clients"
                                  ? "By Client"
                                  : target.target_type === "by_products"
                                    ? "By Product"
                                    : "By Value"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {target.target_type === "by_clients" &&
                                target.contact && (
                                  <div>
                                    <div className="font-medium">
                                      {target.contact.first_name}{" "}
                                      {target.contact.last_name}
                                    </div>
                                    {target.contact.company_name && (
                                      <div className="text-xs text-gray-500">
                                        {target.contact.company_name}
                                      </div>
                                    )}
                                  </div>
                                )}
                              {target.target_type === "by_products" &&
                                (target.product || target.product_group) && (
                                  <div>
                                    <div className="font-medium">
                                      {target.product?.material ||
                                        target.product_group}
                                    </div>
                                    {target.product?.material_group && (
                                      <div className="text-xs text-gray-500">
                                        {target.product.material_group}
                                      </div>
                                    )}
                                  </div>
                                )}
                              {target.target_type === "by_value" && (
                                <div className="text-gray-500 text-xs">
                                  Total sales value
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="capitalize">
                                {target.period_type}
                              </div>
                              <div className="text-xs">
                                {new Date(
                                  target.period_start,
                                ).toLocaleDateString()}{" "}
                                to{" "}
                                {new Date(
                                  target.period_end,
                                ).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {parseFloat(target.target_amount || 0) > 0
                                ? formatCurrency(target.target_amount)
                                : target.target_quantity
                                  ? `${Number(target.target_quantity).toLocaleString()} qty`
                                  : "N/A"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-900">
                                    {formatCurrency(progressAmount)}
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                    <div
                                      className={`h-1.5 rounded-full ${
                                        achievement >= 100
                                          ? "bg-green-500"
                                          : achievement >= 70
                                            ? "bg-blue-500"
                                            : achievement >= 40
                                              ? "bg-amber-500"
                                              : "bg-red-500"
                                      }`}
                                      style={{
                                        width: `${Math.min(achievement, 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {achievement.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${
                                  target.status === "active"
                                    ? "bg-green-100 text-green-800"
                                    : target.status === "completed"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {target.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditTarget(target)}
                                title="Edit target"
                              >
                                <Icon name="Edit" size={14} />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Performance Analytics Tab */}
      {activeView === "analytics" && (
        <div className="space-y-6">
          {pipelineData.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                Pipeline Analytics
              </h2>
              <PipelineChart data={pipelineData} />
            </div>
          )}

          {actionItems.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                Action Items
              </h2>
              <ActionableDashboard actions={actionItems} />
            </div>
          )}
        </div>
      )}

      {/* Target Detail Drill-Down Modal */}
      {selectedTargetDetail && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedTargetDetail(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Target Details</h2>
                  <p className="text-blue-100 text-sm mt-1">
                    {selectedTargetDetail.target_type
                      ?.replace("_", " ")
                      .toUpperCase()}{" "}
                    Target
                  </p>
                </div>
                <button
                  onClick={() => setSelectedTargetDetail(null)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                >
                  <Icon name="X" size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Overview Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-200">
                  <div className="text-sm text-blue-600 mb-1">
                    Target Amount
                  </div>
                  <div className="text-2xl font-bold text-blue-700">
                    {formatCurrency(selectedTargetDetail.target_amount)}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center border border-green-200">
                  <div className="text-sm text-green-600 mb-1">Achieved</div>
                  <div className="text-2xl font-bold text-green-700">
                    {formatCurrency(
                      (selectedTargetDetail.supervisor_revenue || 0) +
                        (selectedTargetDetail.subordinates_contribution || 0),
                    )}
                  </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center border border-purple-200">
                  <div className="text-sm text-purple-600 mb-1">
                    Your Revenue
                  </div>
                  <div className="text-2xl font-bold text-purple-700">
                    {formatCurrency(
                      selectedTargetDetail.supervisor_revenue || 0,
                    )}
                  </div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center border border-orange-200">
                  <div className="text-sm text-orange-600 mb-1">
                    Team Revenue
                  </div>
                  <div className="text-2xl font-bold text-orange-700">
                    {formatCurrency(
                      selectedTargetDetail.subordinates_contribution || 0,
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Overall Progress
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    {(
                      (((selectedTargetDetail.supervisor_revenue || 0) +
                        (selectedTargetDetail.subordinates_contribution || 0)) /
                        selectedTargetDetail.target_amount) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-4 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        (((selectedTargetDetail.supervisor_revenue || 0) +
                          (selectedTargetDetail.subordinates_contribution ||
                            0)) /
                          selectedTargetDetail.target_amount) *
                          100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Team Breakdown */}
              {subordinates.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Icon name="Users" size={20} className="text-blue-600" />
                    Team Performance Breakdown
                  </h3>
                  <div className="space-y-3">
                    {subordinates.map((member) => {
                      const memberPerformance = teamData.find(
                        (t) => t.id === member.id,
                      );
                      const memberAchieved = memberPerformance?.wonAmount || 0;
                      const memberTargets = filteredAssignedTargets.filter(
                        (t) => t.assigned_to === member.id,
                      );
                      const memberTarget = memberTargets.reduce(
                        (sum, t) => sum + parseFloat(t.target_amount || 0),
                        0,
                      );
                      const memberProgress =
                        memberTarget > 0
                          ? (memberAchieved / memberTarget) * 100
                          : 0;

                      return (
                        <div
                          key={member.id}
                          className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                            {member.full_name?.charAt(0) || "S"}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {member.full_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              Salesman
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-gray-900">
                              {formatCurrency(memberAchieved)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {memberTarget > 0
                                ? `of ${formatCurrency(memberTarget)}`
                                : "No target"}
                            </div>
                          </div>
                          <div className="w-20">
                            <div className="text-xs text-center font-bold text-blue-600 mb-1">
                              {memberProgress.toFixed(0)}%
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  memberProgress >= 100
                                    ? "bg-green-500"
                                    : memberProgress >= 70
                                      ? "bg-blue-500"
                                      : memberProgress >= 40
                                        ? "bg-amber-500"
                                        : "bg-red-500"
                                }`}
                                style={{
                                  width: `${Math.min(memberProgress, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Client Targets Breakdown */}
              {clientTargetsData.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Icon
                      name="Building2"
                      size={20}
                      className="text-purple-600"
                    />
                    Client Performance ({clientTargetsData.length} clients)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {clientTargetsData.map((ct) => {
                      const clientName =
                        `${ct.contact?.first_name || ""} ${ct.contact?.last_name || ""}`.trim() ||
                        "Unknown";
                      const achieved = ct.achieved || 0;
                      const target = parseFloat(ct.target_amount) || 0;
                      const progress =
                        target > 0 ? (achieved / target) * 100 : 0;

                      return (
                        <div
                          key={ct.id}
                          className="p-3 bg-purple-50 rounded-lg border border-purple-200"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-medium text-gray-900">
                                {clientName}
                              </div>
                              {ct.contact?.company_name && (
                                <div className="text-xs text-gray-500">
                                  {ct.contact.company_name}
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-purple-600">
                              {progress.toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-sm font-bold text-gray-900">
                              {formatCurrency(achieved)}
                            </span>
                            <span className="text-xs text-gray-500">
                              / {formatCurrency(target)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-purple-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Product Group Breakdown */}
              {productTargetsData.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Icon
                      name="Package"
                      size={20}
                      className="text-orange-600"
                    />
                    Product Group Performance ({productTargetsData.length}{" "}
                    groups)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {productTargetsData.map((pt) => {
                      const achieved = pt.achieved || 0;
                      const target = parseFloat(pt.target_amount) || 0;
                      const progress =
                        target > 0 ? (achieved / target) * 100 : 0;

                      return (
                        <div
                          key={pt.id}
                          className="p-3 bg-orange-50 rounded-lg border border-orange-200"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-medium text-gray-900">
                                {pt.product_group}
                              </div>
                              <div className="text-xs text-gray-500">
                                Product Group
                              </div>
                            </div>
                            <span className="text-xs font-bold text-orange-600">
                              {progress.toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-sm font-bold text-gray-900">
                              {formatCurrency(achieved)}
                            </span>
                            <span className="text-xs text-gray-500">
                              / {formatCurrency(target)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-orange-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Target Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Target Information
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Period Type:</span>
                    <span className="ml-2 font-medium text-gray-900 capitalize">
                      {selectedTargetDetail.period_type}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span
                      className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${
                        selectedTargetDetail.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {selectedTargetDetail.status}
                    </span>
                  </div>
                  {selectedTargetDetail.notes && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Notes:</span>
                      <p className="mt-1 text-gray-900">
                        {selectedTargetDetail.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metric Insight Modal */}
      <MetricInsightModal
        isOpen={metricInsightModal.isOpen}
        onClose={handleCloseMetricModal}
        metricType={metricInsightModal.metricType}
        metrics={executiveMetrics}
        teamData={[...subordinates, effectiveUserProfile]}
        dealsData={filteredDeals}
      />
    </div>
  );
};

export default EnhancedSupervisorDashboard;
