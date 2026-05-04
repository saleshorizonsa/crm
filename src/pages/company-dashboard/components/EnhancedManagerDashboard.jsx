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
import ManagerSalesTargetAssignment from "../../../components/ManagerSalesTargetAssignment";
import EnhancedSupervisorDashboard from "./EnhancedSupervisorDashboard";
import SalesmanDashboard from "./SalesmanDashboard";
import EmployeeSelector from "../../../components/ui/EmployeeSelector";
import PipelineChart from "./PipelineChart";
import ActionableDashboard from "./ActionableDashboard";
import MetricInsightModal from "./MetricInsightModal";
import SalesForecast from "./SalesForecast";
import { supabase } from "../../../lib/supabase";
import { Edit2 } from "lucide-react";
import { aggregateProductPerformance } from "../../../utils/productTargetUtils";
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

const EnhancedManagerDashboard = ({ viewAsUser = null, readOnly = false }) => {
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

  // Performance Trend toggle (separate from main filters)
  const [trendPeriod, setTrendPeriod] = useState("month"); // month, quarter, year

  // Data states
  const [metrics, setMetrics] = useState(null);
  const [salesData, setSalesData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [teamData, setTeamData] = useState([]);
  const [showTargetAssignment, setShowTargetAssignment] = useState(false);
  const [showAssignmentCard, setShowAssignmentCard] = useState(false);
  const [assignedTargets, setAssignedTargets] = useState([]);
  const [myTargets, setMyTargets] = useState([]); // Targets assigned TO this manager
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
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Table filter states
  const [tableTypeFilter, setTableTypeFilter] = useState("all"); // all, by_value, by_clients, by_products
  const [tableStatusFilter, setTableStatusFilter] = useState("all"); // all, active, completed, expired
  const [tableMemberFilter, setTableMemberFilter] = useState("all"); // all, or specific member id

  // Enhanced data states
  const [executiveMetrics, setExecutiveMetrics] = useState(null);
  const [pipelineData, setPipelineData] = useState([]);
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
    if (company?.id && userProfile?.id) {
      loadManagerData();
    }
  }, [company?.id, userProfile?.id]);

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

  // Helper function to check if a date falls within selected filters
  // All three filters work together: year + quarter + month
  const isInSelectedPeriod = (date) => {
    if (!date) return false;

    const itemDate = new Date(date);
    const now = new Date();

    // Don't include future dates
    if (itemDate > now) {
      return false;
    }

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

  // Filter all data based on selected period
  // For won deals, use expected_close_date; for others use updated_at/created_at
  const filteredDeals = useMemo(() => {
    return (
      allDeals?.filter((deal) => {
        const dateToCheck =
          deal.stage === "won"
            ? deal.expected_close_date || deal.updated_at || deal.created_at
            : deal.updated_at || deal.created_at;
        return isInSelectedPeriod(dateToCheck);
      }) || []
    );
  }, [allDeals, selectedMonth, selectedQuarter, selectedYear]);

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

  // Filter targets based on selected filters - check if target period overlaps with selected filters
  const filteredMyTargets = useMemo(() => {
    if (
      selectedMonth === null &&
      selectedQuarter === null &&
      selectedYear === null
    )
      return myTargets;
    if (!myTargets) return myTargets;

    return myTargets.filter((target) => {
      const targetStart = new Date(target.period_start);
      const targetEnd = new Date(target.period_end);

      // All filters work together with AND logic
      // Check year filter (required if set)
      if (selectedYear !== null) {
        const periodStart = new Date(selectedYear, 0, 1);
        const periodEnd = new Date(selectedYear, 11, 31, 23, 59, 59);
        if (!(targetStart <= periodEnd && targetEnd >= periodStart))
          return false;
      }

      // Check quarter filter (required if set)
      if (selectedQuarter !== null) {
        const quarterMonth = selectedQuarter * 3;
        // Use selectedYear if available, otherwise check all years
        const year =
          selectedYear !== null ? selectedYear : targetStart.getFullYear();
        const periodStart = new Date(year, quarterMonth, 1);
        const periodEnd = new Date(year, quarterMonth + 3, 0, 23, 59, 59);
        if (!(targetStart <= periodEnd && targetEnd >= periodStart))
          return false;
      }

      // Check month filter (required if set)
      if (selectedMonth !== null) {
        // Use selectedYear if available, otherwise check all years
        const year =
          selectedYear !== null ? selectedYear : targetStart.getFullYear();
        const periodStart = new Date(year, selectedMonth, 1);
        const periodEnd = new Date(year, selectedMonth + 1, 0, 23, 59, 59);
        if (!(targetStart <= periodEnd && targetEnd >= periodStart))
          return false;
      }

      return true;
    });
  }, [myTargets, selectedMonth, selectedQuarter, selectedYear]);

  // Filter assigned targets based on selected time filters
  const filteredAssignedTargets = useMemo(() => {
    if (
      selectedMonth === null &&
      selectedQuarter === null &&
      selectedYear === null
    )
      return assignedTargets;
    if (!assignedTargets) return assignedTargets;

    return assignedTargets.filter((target) => {
      const targetStart = new Date(target.period_start);
      const targetEnd = new Date(target.period_end);

      // All filters work together with AND logic
      // Check year filter (required if set)
      if (selectedYear !== null) {
        const periodStart = new Date(selectedYear, 0, 1);
        const periodEnd = new Date(selectedYear, 11, 31, 23, 59, 59);
        if (!(targetStart <= periodEnd && targetEnd >= periodStart))
          return false;
      }

      // Check quarter filter (required if set)
      if (selectedQuarter !== null) {
        const quarterMonth = selectedQuarter * 3;
        // Use selectedYear if available, otherwise check all years
        const year =
          selectedYear !== null ? selectedYear : targetStart.getFullYear();
        const periodStart = new Date(year, quarterMonth, 1);
        const periodEnd = new Date(year, quarterMonth + 3, 0, 23, 59, 59);
        if (!(targetStart <= periodEnd && targetEnd >= periodStart))
          return false;
      }

      // Check month filter (required if set)
      if (selectedMonth !== null) {
        // Use selectedYear if available, otherwise check all years
        const year =
          selectedYear !== null ? selectedYear : targetStart.getFullYear();
        const periodStart = new Date(year, selectedMonth, 1);
        const periodEnd = new Date(year, selectedMonth + 1, 0, 23, 59, 59);
        if (!(targetStart <= periodEnd && targetEnd >= periodStart))
          return false;
      }

      return true;
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

    // Map: assigneeId -> [direct subordinate ids]
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

      // Determine which user ids contribute to this target
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

  // Recalculate target progress based on filtered deals for the selected period
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

  const targetsWithRecalculatedProgress = useMemo(() => {
    // If no filter selected, return targets as-is with their original calculated progress
    if (
      selectedMonth === null &&
      selectedQuarter === null &&
      selectedYear === null
    ) {
      return filteredMyTargets;
    }

    // If no deals at all, return targets as-is
    if (!allDeals?.length) {
      return filteredMyTargets;
    }

    // Get subordinate IDs from allSubordinates (includes all team members)
    const teamSubordinateIds = allSubordinates?.map((s) => s.id) || [];

    // Filter won deals by expected_close_date (when deal was actually won)
    const dealsInPeriod = allDeals.filter((deal) => {
      if (deal.stage !== "won" || !deal.expected_close_date) return false;
      return isInSelectedPeriod(deal.expected_close_date);
    });

    // Calculate manager's own won deals revenue from deals in the selected period
    const managerRevenue =
      dealsInPeriod
        ?.filter((d) => d.owner_id === user?.id)
        ?.reduce((sum, d) => sum + getConvertedAmount(d), 0) || 0;

    // Calculate subordinates' won deals revenue from deals in the selected period
    const subordinatesRevenue =
      dealsInPeriod
        ?.filter((d) => teamSubordinateIds.includes(d.owner_id))
        ?.reduce((sum, d) => sum + getConvertedAmount(d), 0) || 0;

    const totalProgress = managerRevenue + subordinatesRevenue;

    // If there are no targets for this period, create a synthetic target to hold revenue data
    if (!filteredMyTargets.length) {
      return [
        {
          id: "synthetic-period-target",
          target_amount: 0,
          calculated_progress: totalProgress,
          manager_revenue: managerRevenue,
          subordinates_contribution: subordinatesRevenue,
          period_type: selectedMonth
            ? "month"
            : selectedQuarter
              ? "quarter"
              : "year",
          is_synthetic: true, // Flag to indicate this is not a real target
        },
      ];
    }

    // Update targets with recalculated progress for the selected period
    return filteredMyTargets.map((target) => ({
      ...target,
      calculated_progress: totalProgress,
      manager_revenue: managerRevenue,
      subordinates_contribution: subordinatesRevenue,
    }));
  }, [
    filteredMyTargets,
    allDeals,
    selectedMonth,
    selectedQuarter,
    selectedYear,
    user?.id,
    allSubordinates,
    isInSelectedPeriod,
  ]);

  // Calculate performance trend based on active filters
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

  const loadManagerData = async () => {
    setIsLoading(true);
    try {
      // Get subordinates (supervisors under this manager)
      const { data: subordinatesData } = await userService.getUserSubordinates(
        effectiveUser.id,
      );
      setAllSubordinates(subordinatesData || []);

      // Store subordinate IDs for filtering deals
      const subIds = subordinatesData?.map((s) => s.id) || [];
      setSubordinateIds(subIds);

      // For managers, only supervisors can be assigned targets
      const supervisorsOnly =
        subordinatesData?.filter((sub) => sub.role === "supervisor") || [];
      setSubordinates(supervisorsOnly);

      // Get all team user IDs (manager + all subordinates)
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

      await loadExecutiveMetrics();
      await loadPipelineData();
      await loadActionItems();
      await loadSalesTargets();
    } catch (error) {
      console.error("Error loading manager data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const processTeamPerformance = (users, deals, subordinatesData) => {
    // Filter to only include manager (self) and their direct subordinates (supervisors)
    const subordinateIds = subordinatesData?.map((s) => s.id) || [];
    const teamMemberIds = [effectiveUser.id, ...subordinateIds];
    const teamMembers = users.filter((u) => teamMemberIds.includes(u.id));

    return teamMembers.map((teamUser) => {
      const userDeals = deals.filter((deal) => deal.owner_id === teamUser.id);
      const wonDeals = userDeals.filter((deal) => deal.stage === "won");
      const totalValue = wonDeals.reduce(
        (sum, deal) => sum + getConvertedAmount(deal),
        0,
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

  const loadExecutiveMetrics = async () => {
    try {
      const { data: deals } = await dealService.getDeals(
        company.id,
        { viewAll: true },
        effectiveUser.id,
      );

      if (deals) {
        setAllDeals(deals); // Store all deals for filtering
        // Filter to only manager's own deals for personal metrics
        const myDeals = deals.filter((d) => d.owner_id === effectiveUser.id);
        const wonDeals = myDeals.filter((d) => d.stage === "won");
        const totalRevenue = wonDeals.reduce(
          (sum, d) => sum + getConvertedAmount(d),
          0,
        );
        const activePipeline = myDeals
          .filter((d) => !["won", "lost"].includes(d.stage))
          .reduce((sum, d) => sum + getConvertedAmount(d), 0);
        const winRate =
          myDeals.length > 0 ? (wonDeals.length / myDeals.length) * 100 : 0;

        setExecutiveMetrics({
          totalRevenue,
          activePipeline,
          winRate,
          totalDeals: myDeals.length,
          wonDeals: wonDeals.length,
        });
      }
    } catch (error) {
      console.error("Error loading executive metrics:", error);
    }
  };

  // Recalculate all metrics when filtered data changes
  useEffect(() => {
    if (!allDeals.length) return;

    // Recalculate executive metrics from filtered deals (only manager's own deals)
    const myFilteredDeals = filteredDeals.filter(
      (d) => d.owner_id === effectiveUser.id,
    );
    const wonDeals = myFilteredDeals.filter((d) => d.stage === "won");
    const totalRevenue = wonDeals.reduce(
      (sum, d) => sum + getConvertedAmount(d),
      0,
    );
    const activePipeline = myFilteredDeals
      .filter((d) => !["won", "lost"].includes(d.stage))
      .reduce((sum, d) => sum + getConvertedAmount(d), 0);
    const winRate =
      myFilteredDeals.length > 0
        ? (wonDeals.length / myFilteredDeals.length) * 100
        : 0;

    setExecutiveMetrics((prev) => ({
      ...prev,
      totalRevenue,
      activePipeline,
      winRate,
      totalDeals: myFilteredDeals.length,
      dealsWon: wonDeals.length,
    }));

    // Recalculate pipeline data from filtered deals
    const stages = [
      "lead",
      "contact_made",
      "proposal_sent",
      "negotiation",
      "won",
      "lost",
    ];
    const pipelineStats = stages.map((stage) => {
      const stageDeals = myFilteredDeals.filter((d) => d.stage === stage);
      return {
        stage,
        count: stageDeals.length,
        totalValue: stageDeals.reduce(
          (sum, d) => sum + getConvertedAmount(d),
          0,
        ),
      };
    });
    setPipelineData(pipelineStats);

    // Recalculate metrics (totalRevenue, totalDeals, totalContacts, totalTasks) from filtered data
    setMetrics((prev) => {
      const baseMetrics = prev || {};
      return {
        ...baseMetrics,
        totalRevenue: totalRevenue,
        totalDeals: filteredDeals.length,
        totalContacts: filteredContacts.length,
        totalTasks: filteredTasks.length,
      };
    });

    // Recalculate team performance from filtered deals
    if (allSubordinates.length > 0) {
      const teamPerformance = processTeamPerformance(
        [user, ...allSubordinates],
        filteredDeals,
        allSubordinates,
      );
      setTeamData(teamPerformance);
    }

    // Recalculate salesData from filtered deals (for charts)
    const salesDataByPeriod = filteredDeals.reduce((acc, deal) => {
      // Use expected_close_date for won deals, otherwise updated_at/created_at
      const dateToUse =
        deal.stage === "won"
          ? deal.expected_close_date || deal.updated_at || deal.created_at
          : deal.updated_at || deal.created_at;
      const dealDate = new Date(dateToUse);
      let periodKey;

      // Determine period based on active filter
      if (selectedMonth) {
        periodKey = `${dealDate.getFullYear()}-${dealDate.getMonth()}`;
      } else if (selectedQuarter) {
        const quarter = Math.floor(dealDate.getMonth() / 3) + 1;
        periodKey = `${dealDate.getFullYear()}-Q${quarter}`;
      } else {
        periodKey = `${dealDate.getFullYear()}`;
      }

      if (!acc[periodKey]) {
        acc[periodKey] = {
          period: periodKey,
          revenue: 0,
          deals: 0,
        };
      }

      const amount = parseFloat(deal.amount) || 0;
      const dealCurrency = deal.currency || preferredCurrency;
      const convertedAmount =
        dealCurrency !== preferredCurrency
          ? convertCurrency(amount, dealCurrency, preferredCurrency)
          : amount;

      if (deal.stage === "won") {
        acc[periodKey].revenue += convertedAmount;
      }
      acc[periodKey].deals += 1;
      return acc;
    }, {});

    setSalesData(Object.values(salesDataByPeriod));
  }, [
    filteredDeals,
    filteredContacts,
    filteredTasks,
    preferredCurrency,
    user.id,
    allSubordinates,
    selectedMonth,
    selectedQuarter,
    selectedYear,
  ]);

  const loadPipelineData = async () => {
    try {
      const { data: deals } = await dealService.getDeals(
        company.id,
        { viewAll: true },
        user.id,
      );

      if (deals) {
        // Filter to only manager's own deals for personal pipeline
        const myDeals = deals.filter((d) => d.owner_id === user.id);
        const stages = [
          "lead",
          "contact_made",
          "proposal_sent",
          "negotiation",
          "won",
          "lost",
        ];
        const pipelineStats = stages.map((stage) => {
          const stageDeals = myDeals.filter((d) => d.stage === stage);
          return {
            stage,
            count: stageDeals.length,
            totalValue: stageDeals.reduce(
              (sum, d) => sum + getConvertedAmount(d),
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
      const { data: deals } = await dealService.getDeals(
        company.id,
        { viewAll: true },
        user.id,
      );
      const { data: tasks } = await taskService.getMyTasks(
        user.id,
        company.id,
        { userOnly: false },
      );
      const { data: targets } = await salesTargetService.getMyTargets(
        company.id,
        user.id,
      );

      const actions = [];

      // High-value deals (only manager's own deals) - threshold in user's preferred currency
      if (deals) {
        const highValueThreshold = 100000;
        const highValueDeals = deals.filter(
          (d) =>
            d.owner_id === user.id &&
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
        effectiveUserProfile.id,
      );
      const freshSubordinateIds = freshSubordinates?.map((s) => s.id) || [];

      // Load targets assigned BY this manager
      const { data: assigned } = await salesTargetService.getAssignedTargets(
        company.id,
      );
      const managerAssigned =
        assigned?.filter((t) => t.assigned_by === effectiveUserProfile.id) ||
        [];
      const { data: deals } = await dealService.getDeals(
        company.id,
        { viewAll: true },
        effectiveUserProfile.id,
      );
      const scopedDeals = deals || [];

      // For each parent sales target, load child client_targets or product_group_targets
      const expandedTargets = [];
      for (const target of managerAssigned) {
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
            // Check legacy product group targets so existing data still displays.
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

      const teamProductTargetIds = managerAssigned.map((target) => target.id);
      if (teamProductTargetIds.length > 0) {
        const { data: teamProductTargets } =
          await salesTargetService.getProductTargetsBySalesTargetIds(
            teamProductTargetIds,
          );

        const teamProductTargetsWithProgress =
          salesTargetService.calculateProductTargetProgress(
            teamProductTargets || [],
            scopedDeals,
            [effectiveUserProfile.id, ...freshSubordinateIds],
          );
        const targetsById = new Map(
          managerAssigned.map((target) => [target.id, target]),
        );
        const membersById = new Map(
          (freshSubordinates || []).map((member) => [member.id, member]),
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

      // Load targets assigned TO this manager with calculated progress
      const { data: myTargetsData } = await salesTargetService.getMyTargets(
        company.id,
        effectiveUserProfile.id,
      );

      // Calculate progress including manager's own revenue + subordinates' revenue
      if (myTargetsData && myTargetsData.length > 0) {
        const deals = scopedDeals;

        // Get manager's own won deals revenue
        const managerRevenue =
          deals
            ?.filter(
              (d) =>
                d.stage === "won" && d.owner_id === effectiveUserProfile.id,
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

        const totalProgress = managerRevenue + subordinatesRevenue;

        // Update targets with calculated progress
        const targetsWithProgress = myTargetsData.map((target) => ({
          ...target,
          calculated_progress: totalProgress,
          manager_revenue: managerRevenue,
          subordinates_contribution: subordinatesRevenue,
        }));

        setMyTargets(targetsWithProgress);

        // Load client targets for client-based targets
        const clientBasedTargetIds = myTargetsData
          .filter((t) => t.target_type === "by_clients")
          .map((t) => t.id);
        if (clientBasedTargetIds.length > 0) {
          const { data: clientTargets } = await supabase
            .from("client_targets")
            .select(
              "*, contact:contacts(id, first_name, last_name, company_name)",
            )
            .in("sales_target_id", clientBasedTargetIds);

          // Calculate client achievements from deals
          const clientTargetsWithProgress = (clientTargets || []).map((ct) => {
            const clientDeals =
              deals?.filter(
                (d) => d.stage === "won" && d.contact_id === ct.contact_id,
              ) || [];
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Manager Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            Welcome back, {userProfile?.full_name || user?.email}
          </p>
        </div>
      </div>

      {/* View Dashboard As Selector (only shown when not already viewing as someone) */}
      {!viewAsUser && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-md">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                View Dashboard As
              </label>
              <EmployeeSelector
                employees={allSubordinates}
                selectedEmployee={selectedEmployee}
                onEmployeeChange={setSelectedEmployee}
                showAllOption={true}
                currentUserId={user?.id}
              />
            </div>
            {selectedEmployee && (
              <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <Icon name="Eye" size={14} className="inline mr-1" />
                  Viewing as:{" "}
                  <span className="font-semibold">
                    {selectedEmployee.full_name || selectedEmployee.email}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Time Filter Dropdowns (always visible) */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-sm font-medium text-gray-700">Filter by:</label>

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

        {/* Clear Filter Button */}
        {(selectedMonth || selectedQuarter || selectedYear) && (
          <button
            onClick={() => {
              setSelectedMonth(null);
              setSelectedQuarter(null);
              setSelectedYear(null);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <Icon name="X" size={14} />
            Clear filters
          </button>
        )}
      </div>

      {/* Sub-dashboard (view as) or own manager content */}
      {selectedEmployee ? (
        <div key={selectedEmployee.id}>
          {selectedEmployee.role === "supervisor" && (
            <EnhancedSupervisorDashboard
              viewAsUser={selectedEmployee}
              readOnly={true}
              filterMonth={selectedMonth}
              filterQuarter={selectedQuarter}
              filterYear={selectedYear}
            />
          )}
          {(selectedEmployee.role === "salesman" ||
            selectedEmployee.role === "agent") && (
            <SalesmanDashboard
              viewAsUser={selectedEmployee}
              readOnly={true}
              filterMonth={selectedMonth}
              filterQuarter={selectedQuarter}
              filterYear={selectedYear}
            />
          )}
        </div>
      ) : (
        <>
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
              {/* Enhanced Sales Target Card (if assigned) - Show if manager has any targets OR if there's a filter selected */}
              {(myTargets.length > 0 ||
                selectedMonth ||
                selectedQuarter ||
                selectedYear) && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Icon name="Target" size={24} className="text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Your {getPeriodLabel()} Targets
                      </h3>
                      <p className="text-sm text-gray-500">
                        Assigned by Director
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveView("targets")}
                    >
                      View Details
                    </Button>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600 font-medium">
                        Total Target
                      </p>
                      <p className="text-xl font-bold text-blue-700">
                        {formatCurrency(
                          targetsWithRecalculatedProgress.reduce(
                            (sum, t) =>
                              sum + (parseFloat(t.target_amount) || 0),
                            0,
                          ),
                        )}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600 font-medium">
                        Achieved
                      </p>
                      <p className="text-xl font-bold text-green-700">
                        {formatCurrency(
                          targetsWithRecalculatedProgress.reduce(
                            (sum, t) =>
                              sum +
                              parseFloat(
                                t.calculated_progress || t.progress_amount || 0,
                              ),
                            0,
                          ),
                        )}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-600 font-medium">
                        Your Revenue
                      </p>
                      <p className="text-xl font-bold text-purple-700">
                        {formatCurrency(
                          targetsWithRecalculatedProgress.reduce(
                            (sum, t) =>
                              sum + parseFloat(t.manager_revenue || 0),
                            0,
                          ),
                        )}
                      </p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600 font-medium">
                        Team Revenue
                      </p>
                      <p className="text-xl font-bold text-amber-700">
                        {formatCurrency(
                          targetsWithRecalculatedProgress.reduce(
                            (sum, t) =>
                              sum +
                              parseFloat(t.subordinates_contribution || 0),
                            0,
                          ),
                        )}
                      </p>
                    </div>
                    <div className="p-3 bg-red-500 rounded-lg">
                      <p className="text-xs text-white font-medium">
                        Remaining Targets
                      </p>
                      <p className="text-xl font-bold text-white">
                        {formatCurrency(
                          Math.max(
                            0,
                            targetsWithRecalculatedProgress.reduce(
                              (sum, t) =>
                                sum + (parseFloat(t.target_amount) || 0),
                              0,
                            ) -
                              targetsWithRecalculatedProgress.reduce(
                                (sum, t) =>
                                  sum +
                                  parseFloat(
                                    t.calculated_progress ||
                                      t.progress_amount ||
                                      0,
                                  ),
                                0,
                              ),
                          ),
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Target Cards with Progress - Only show if not synthetic */}
                  {!targetsWithRecalculatedProgress[0]?.is_synthetic && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {targetsWithRecalculatedProgress.map((target) => {
                        const progressAmount =
                          target.calculated_progress ||
                          target.progress_amount ||
                          0;
                        const progress =
                          (parseFloat(progressAmount) /
                            parseFloat(target.target_amount || 1)) *
                          100;
                        return (
                          <div
                            key={target.id}
                            className="border border-gray-200 rounded-lg p-4"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-900 capitalize">
                                {target.period_type} Target
                              </span>
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${
                                  progress >= 100
                                    ? "bg-green-100 text-green-800"
                                    : progress >= 70
                                      ? "bg-blue-100 text-blue-800"
                                      : progress >= 40
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-red-100 text-red-800"
                                }`}
                              >
                                {Math.round(progress)}%
                              </span>
                            </div>
                            <div className="flex items-baseline gap-2 mb-2">
                              <span className="text-2xl font-bold text-gray-900">
                                {formatCurrency(progressAmount)}
                              </span>
                              <span className="text-sm text-gray-500">
                                / {formatCurrency(target.target_amount)}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
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
                              {new Date(
                                target.period_start,
                              ).toLocaleDateString()}{" "}
                              -{" "}
                              {new Date(target.period_end).toLocaleDateString()}
                            </div>
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
                        No targets assigned for this period, showing revenue
                        only.
                      </p>
                    </div>
                  )}

                  {/* Team Breakdown Toggle */}
                  {allSubordinates.length > 0 && (
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
                            Team Achievement Breakdown
                          </span>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            {allSubordinates.length} members
                          </span>
                        </div>
                        <Icon
                          name={showTeamBreakdown ? "ChevronUp" : "ChevronDown"}
                          size={18}
                          className="text-gray-500"
                        />
                      </button>

                      {showTeamBreakdown && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {allSubordinates.map((member) => {
                            const memberTargets =
                              filteredAssignedTargets.filter(
                                (t) => t.assigned_to === member.id,
                              );
                            const totalTarget = memberTargets.reduce(
                              (sum, t) =>
                                sum + (parseFloat(t.target_amount) || 0),
                              0,
                            );
                            const memberPerformance = teamData.find(
                              (t) => t.id === member.id,
                            );
                            const achieved = memberPerformance?.wonAmount || 0;
                            const memberProgress =
                              totalTarget > 0
                                ? (achieved / totalTarget) * 100
                                : 0;

                            return (
                              <div
                                key={member.id}
                                className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-medium">
                                    {member.full_name?.charAt(0) || "U"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {member.full_name || member.email}
                                    </p>
                                    <p className="text-xs text-gray-500 capitalize">
                                      {member.role}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right ml-2">
                                  <p className="text-sm font-bold text-gray-900">
                                    {formatCurrency(achieved)}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {totalTarget > 0
                                      ? `of ${formatCurrency(
                                          totalTarget,
                                        )} (${memberProgress.toFixed(0)}%)`
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

                  {/* Client Achievement Breakdown Toggle */}
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
                            Client Achievement Breakdown
                          </span>
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            {clientTargetsData.length} clients
                          </span>
                        </div>
                        <Icon
                          name={
                            showClientBreakdown ? "ChevronUp" : "ChevronDown"
                          }
                          size={18}
                          className="text-gray-500"
                        />
                      </button>

                      {showClientBreakdown && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                          if (value >= 1000)
                            return `${(value / 1000).toFixed(0)}K`;
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
                        {performanceTrendData.reduce(
                          (sum, d) => sum + d.deals,
                          0,
                        )}
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

              {/* Sales Forecast */}
              <SalesForecast />

              {/* Activity Feed */}
              <div className="bg-white rounded-lg shadow">
                <ActivityFeed
                  activities={filteredActivities}
                  title="Recent Activity"
                  companyId={company?.id}
                  users={allSubordinates}
                  currentUserId={user?.id}
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
                  {subordinates.length === 1 ? "supervisor" : "supervisors"}
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
                                    {member.name?.charAt(0).toUpperCase() ||
                                      "U"}
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
                      Supervisors will appear here once assigned to your team.
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
                    <p className="text-sm text-gray-500">
                      Assigned by Director
                    </p>
                  </div>
                </div>

                {myTargets.length > 0 ? (
                  <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-sm text-blue-600 font-medium">
                          Total Allocated
                        </p>
                        <p className="text-2xl font-bold text-blue-700">
                          {formatCurrency(
                            myTargets.reduce(
                              (sum, t) =>
                                sum + (parseFloat(t.target_amount) || 0),
                              0,
                            ),
                          )}
                        </p>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                        <p className="text-sm text-green-600 font-medium">
                          Assigned to Team
                        </p>
                        <p className="text-2xl font-bold text-green-700">
                          {formatCurrency(
                            filteredAssignedTargets.reduce(
                              (sum, t) =>
                                sum + (parseFloat(t.target_amount) || 0),
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
                                  style={{
                                    width: `${Math.min(progress, 100)}%`,
                                  }}
                                />
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(
                                  target.period_start,
                                ).toLocaleDateString()}{" "}
                                to{" "}
                                {new Date(
                                  target.period_end,
                                ).toLocaleDateString()}
                              </div>
                            </div>

                            {target.assigner && (
                              <div className="border-t border-gray-100 pt-3 text-xs text-gray-500">
                                Assigned by:{" "}
                                {target.assigner?.full_name ||
                                  target.assigner?.email ||
                                  "Director"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Team Achievement Breakdown */}
                    {allSubordinates.length > 0 &&
                      filteredAssignedTargets.length > 0 && (
                        <div className="border-t border-gray-200 pt-6">
                          <h4 className="text-md font-medium text-gray-900 mb-4 flex items-center gap-2">
                            <Icon
                              name="Users"
                              size={18}
                              className="text-gray-600"
                            />
                            Team Achievement Breakdown
                          </h4>
                          <div className="space-y-3">
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
                                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                                  >
                                    <div className="flex-1">
                                      <div className="font-medium text-sm text-gray-900">
                                        {member.full_name || member.email}
                                      </div>
                                      <div className="text-xs text-gray-500 capitalize">
                                        {member.role}
                                      </div>
                                    </div>
                                    <div className="text-right mr-4">
                                      <div className="text-sm font-medium text-gray-900">
                                        {formatCurrency(achieved)} /{" "}
                                        {formatCurrency(totalTarget)}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {memberProgress.toFixed(1)}% achieved
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
                        </div>
                      )}

                    {/* Client Achievement Breakdown */}
                    {clientTargetsData.length > 0 && (
                      <div className="border-t border-gray-200 pt-6">
                        <h4 className="text-md font-medium text-gray-900 mb-4 flex items-center gap-2">
                          <Icon
                            name="Building2"
                            size={18}
                            className="text-purple-600"
                          />
                          Client Achievement Breakdown
                        </h4>
                        <div className="space-y-3">
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
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-medium">
                                    {firstName.charAt(0).toUpperCase() || "C"}
                                  </div>
                                  <div className="flex-1">
                                    <div className="font-medium text-sm text-gray-900">
                                      {clientName}
                                    </div>
                                    {companyName && (
                                      <div className="text-xs text-gray-500">
                                        {companyName}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right mr-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {formatCurrency(achieved)} /{" "}
                                    {formatCurrency(target)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {progress.toFixed(1)}% achieved
                                  </div>
                                </div>
                                <div className="w-16">
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
                                      style={{
                                        width: `${Math.min(progress, 100)}%`,
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
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Icon
                      name="Target"
                      size={48}
                      className="mx-auto text-gray-300 mb-4"
                    />
                    <p>No targets assigned by director yet.</p>
                    <p className="text-sm mt-2">
                      Contact your director to get sales targets assigned.
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
                    <Icon
                      name="BarChart3"
                      size={20}
                      className="text-blue-600"
                    />
                    Targets Breakdown
                  </h3>

                  <div className="space-y-6">
                    {/* Targets by Value */}
                    {filteredMyTargets.filter(
                      (t) => t.target_type === "by_value",
                    ).length > 0 && (
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
                            onClick={() =>
                              setShowTeamBreakdown(!showTeamBreakdown)
                            }
                            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            {showTeamBreakdown
                              ? "Hide Details"
                              : "Show Details"}
                            <Icon
                              name={
                                showTeamBreakdown ? "ChevronUp" : "ChevronDown"
                              }
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
                            {showClientBreakdown
                              ? "Hide Details"
                              : "Show Details"}
                            <Icon
                              name={
                                showClientBreakdown
                                  ? "ChevronUp"
                                  : "ChevronDown"
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
                            {showProductBreakdown
                              ? "Hide Details"
                              : "Show Details"}
                            <Icon
                              name={
                                showProductBreakdown
                                  ? "ChevronUp"
                                  : "ChevronDown"
                              }
                              size={16}
                            />
                          </button>
                        </div>

                        {showProductBreakdown && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {productTargetsData.map((productTarget) => {
                              const productName =
                                productTarget.product_group ||
                                "Unknown Product";
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

              {/* Inline Target Assignment Card (toggle) */}
              {showAssignmentCard && (
                <ManagerSalesTargetAssignment
                  onTargetCreated={() => {
                    loadSalesTargets();
                    if (!editingTarget) {
                      setShowAssignmentCard(false);
                    }
                    setEditingTarget(null);
                  }}
                  companyId={company?.id}
                  managerTargets={myTargets}
                  existingTeamTargets={assignedTargets}
                  editingTarget={editingTarget}
                  onCancelEdit={handleCancelEdit}
                  onDeleteTarget={handleDeleteTarget}
                />
              )}

              {/* Team Targets Table */}
              {assignedTargets.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-md font-medium text-gray-900 flex items-center gap-2">
                      <Icon
                        name="ListChecks"
                        size={18}
                        className="text-gray-600"
                      />
                      Team Targets Assigned
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
                        <option value="all">All Members</option>
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
                            Team Member
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
                                  <div className="text-xs text-gray-500 capitalize">
                                    {member?.role}
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
                                    <Edit2 name="Edit" size={14} />
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

          {/* Metric Insight Modal */}
          <MetricInsightModal
            isOpen={metricInsightModal.isOpen}
            onClose={handleCloseMetricModal}
            metricType={metricInsightModal.metricType}
            metrics={executiveMetrics}
            teamData={[...subordinates, effectiveUserProfile]}
            dealsData={filteredDeals}
          />
        </>
      )}
    </div>
  );
};

export default EnhancedManagerDashboard;
