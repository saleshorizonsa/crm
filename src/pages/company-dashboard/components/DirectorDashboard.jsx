import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MetricsCard from "./MetricsCard";
import SalesChart from "./SalesChart";
import ActivityFeed from "./ActivityFeed";
import QuickActions from "./QuickActions";
import TeamPerformance from "./TeamPerformance";
import CompanySelector from "../../../components/ui/CompanySelector";
import EmployeeSelector from "../../../components/ui/EmployeeSelector";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";
import { useAuth } from "../../../contexts/AuthContext";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";
import {
  companyService,
  dealService,
  taskService,
  activityService,
  userService,
  salesTargetService,
  contactService,
} from "../../../services/supabaseService";
import SalesTargetAssignment from "../../../components/SalesTargetAssignment";
import DirectorSalesTargetAssignment from "../../../components/DirectorSalesTargetAssignment";

// New enhanced components
import ExecutiveMetrics from "./ExecutiveMetrics";
import PipelineChart from "./PipelineChart";
import CompanyPerformanceGrid from "./CompanyPerformanceGrid";
import ActionableDashboard from "./ActionableDashboard";
import MetricInsightModal from "./MetricInsightModal";
import PerformanceBarChart from "./PerformanceBarChart";
import SalesForecast from "./SalesForecast";
import { useDateRange } from "../../../contexts/DateRangeContext";

// Employee-specific dashboards - use Enhanced versions for full features
import EnhancedManagerDashboard from "./EnhancedManagerDashboard";
import EnhancedSupervisorDashboard from "./EnhancedSupervisorDashboard";
import SalesmanDashboard from "./SalesmanDashboard";

// Admin components
import UserManagement from "../../../pages/admin-dashboard/components/UserManagement";
import ProductMaster from "../../../pages/admin-dashboard/components/ProductMaster";
import SalesTarget from "../../../pages/admin-dashboard/components/SalesTarget";
import { Edit2Icon } from "lucide-react";
import { capitalize } from "utils/helper";
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
} from "recharts";

const DirectorDashboard = ({ company: propCompany, onCompanyChange }) => {
  const { user, userProfile } = useAuth();
  const { formatCurrency, convertCurrency, preferredCurrency } = useCurrency();
  const { dateRange } = useDateRange();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Helper to convert deal amount to user's preferred currency
  const getConvertedAmount = (deal) => {
    const amount = parseFloat(deal.amount) || 0;
    const dealCurrency = deal.currency || preferredCurrency;
    if (dealCurrency === preferredCurrency) return amount;
    return convertCurrency(amount, dealCurrency, preferredCurrency);
  };

  const [isLoading, setIsLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [activeView, setActiveView] = useState("overview");

  // Separate filter states for month, quarter, and year
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Time period for charts and metrics (month, quarter, year)
  const [timePeriod, setTimePeriod] = useState("month");

  // Performance Trend toggle (separate from main filters)
  const [trendPeriod, setTrendPeriod] = useState("month"); // month, quarter, year

  // Data states
  const [metrics, setMetrics] = useState(null);
  const [salesData, setSalesData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [teamData, setTeamData] = useState([]);
  const [crossCompanyMetrics, setCrossCompanyMetrics] = useState(null);
  const [showTargetAssignment, setShowTargetAssignment] = useState(false);
  const [assignedTargets, setAssignedTargets] = useState([]);
  const [productTargetsData, setProductTargetsData] = useState([]);
  const [targetGridView, setTargetGridView] = useState("value");
  const [selectedTargetUser, setSelectedTargetUser] = useState(null);

  // New enhanced data states
  const [executiveMetrics, setExecutiveMetrics] = useState(null);
  const [pipelineData, setPipelineData] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  const [companiesWithMetrics, setCompaniesWithMetrics] = useState([]);
  const [allDealsData, setAllDealsData] = useState([]);
  const [allContacts, setAllContacts] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [metricInsightModal, setMetricInsightModal] = useState({
    isOpen: false,
    metricType: null,
  });

  useEffect(() => {
    loadAllCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      loadCompanyData(selectedCompany.id);
      loadSalesTargets(selectedCompany.id);
      loadExecutiveMetrics(selectedCompany.id);
      loadPipelineData(selectedCompany.id);
      loadActionItems(selectedCompany.id);
      loadAllEmployees(selectedCompany.id);
    } else {
      loadCrossCompanyData();
      loadSalesTargets();
      loadExecutiveMetrics();
      loadPipelineData();
      loadActionItems();
      loadAllEmployees();
    }
  }, [selectedCompany, dateRange.from, dateRange.to]);

  // Reload metrics when selected employee changes
  useEffect(() => {
    if (selectedCompany) {
      // Reload all company data when employee changes to ensure correct data is shown
      loadCompanyData(selectedCompany.id);
      loadSalesTargets(selectedCompany.id);
      loadExecutiveMetrics(selectedCompany.id);
      loadPipelineData(selectedCompany.id);
      loadActionItems(selectedCompany.id);
    } else {
      loadCrossCompanyData();
      loadSalesTargets();
      loadExecutiveMetrics();
      loadPipelineData();
      loadActionItems();
    }
  }, [selectedEmployee]);

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

  // Filter all data based on selected filters
  // For won deals, use expected_close_date; for others use updated_at/created_at
  const filteredDeals = useMemo(() => {
    return (
      allDealsData?.filter((deal) => {
        const dateToCheck =
          deal.stage === "won"
            ? deal.expected_close_date || deal.updated_at || deal.created_at
            : deal.updated_at || deal.created_at;
        return isInSelectedPeriod(dateToCheck);
      }) || []
    );
  }, [allDealsData, selectedMonth, selectedQuarter, selectedYear]);

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

  // Filter assigned targets (targets assigned BY the director) based on selected time period
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

  // Recalculate per-assignee target progress from deals.
  // The DB column `progress_amount` is not auto-updated when deals close,
  // so we derive it on the client. For each target:
  //   progress = sum of won-deal amounts owned by the assignee (and, if the
  //   assignee is a manager/supervisor/head, by their subordinates too)
  //   that close inside that target's period_start..period_end window.
  const assignedTargetsWithProgress = useMemo(() => {
    if (!filteredAssignedTargets || filteredAssignedTargets.length === 0) {
      return filteredAssignedTargets || [];
    }
    const deals = allDealsData || [];
    const employees = allEmployees || [];

    const childIdsByParent = employees.reduce((acc, u) => {
      if (u.supervisor_id) {
        if (!acc[u.supervisor_id]) acc[u.supervisor_id] = [];
        acc[u.supervisor_id].push(u.id);
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

      const assignee = employees.find((u) => u.id === target.assigned_to);
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
  }, [filteredAssignedTargets, allDealsData, allEmployees]);

  const quantityTargetRows = useMemo(() => {
    const targetById = new Map(
      (assignedTargetsWithProgress || []).map((target) => [target.id, target]),
    );
    const employees = allEmployees || [];
    const childIdsByParent = employees.reduce((acc, employee) => {
      if (employee.supervisor_id) {
        if (!acc[employee.supervisor_id]) acc[employee.supervisor_id] = [];
        acc[employee.supervisor_id].push(employee.id);
      }
      return acc;
    }, {});

    return (productTargetsData || [])
      .filter(
        (productTarget) =>
          targetById.has(productTarget.sales_target_id) &&
          parseFloat(productTarget.target_quantity || 0) > 0,
      )
      .map((productTarget) => {
        const parentTarget = targetById.get(productTarget.sales_target_id) || {};
        const assignee =
          parentTarget.assignee ||
          employees.find((employee) => employee.id === parentTarget.assigned_to) ||
          {};
        const assigneeRole = assignee.role || parentTarget.assignee?.role;
        const ownerIds = new Set([parentTarget.assigned_to]);

        if (
          assigneeRole === "manager" ||
          assigneeRole === "supervisor" ||
          assigneeRole === "head"
        ) {
          (childIdsByParent[parentTarget.assigned_to] || []).forEach((id) =>
            ownerIds.add(id),
          );
        }

        const productTargetWithProgress =
          salesTargetService.calculateProductTargetProgress(
            [
              {
                ...productTarget,
                sales_target: {
                  ...productTarget.sales_target,
                  ...parentTarget,
                },
              },
            ],
            allDealsData,
            Array.from(ownerIds).filter(Boolean),
          )[0] || productTarget;

        return {
          ...productTargetWithProgress,
          parentTarget,
          assignee,
        };
      });
  }, [productTargetsData, assignedTargetsWithProgress, allDealsData, allEmployees]);

  const aggregatedQuantityRows = useMemo(
    () =>
      Object.values(
        quantityTargetRows.reduce((rowsByUserPeriod, productTarget) => {
          const parentTarget = productTarget.parentTarget || {};
          const assignee = productTarget.assignee || parentTarget.assignee || {};
          const key = [
            parentTarget.assigned_to || assignee.id || "unknown-user",
            parentTarget.period_start || "unknown-start",
            parentTarget.period_end || "unknown-end",
          ].join("|");

          if (!rowsByUserPeriod[key]) {
            rowsByUserPeriod[key] = {
              id: key,
              assignee,
              assigner: parentTarget.assigner,
              period_type: parentTarget.period_type || "monthly",
              period_start: parentTarget.period_start,
              period_end: parentTarget.period_end,
              status: parentTarget.status || "active",
              parentTarget,
              target_quantity: 0,
              achieved_quantity: 0,
            };
          }

          rowsByUserPeriod[key].target_quantity += parseFloat(
            productTarget.target_quantity || 0,
          );
          rowsByUserPeriod[key].achieved_quantity += parseFloat(
            productTarget.achieved_quantity || 0,
          );

          return rowsByUserPeriod;
        }, {}),
      ),
    [quantityTargetRows],
  );

  // Recalculate ALL metrics when filtered data changes
  // This ensures all KPIs, charts, and metrics respect the selected time filters
  // Recalculates: executiveMetrics, pipelineData, metrics, teamData, salesData
  useEffect(() => {
    if (!selectedCompany) return;

    // Recalculate executive metrics from filtered deals
    const wonDeals = filteredDeals.filter((d) => d.stage === "won");
    const lostDeals = filteredDeals.filter((d) => d.stage === "lost");
    const totalRevenue = wonDeals.reduce((sum, d) => {
      const amount = parseFloat(d.amount) || 0;
      const dealCurrency = d.currency || preferredCurrency;
      const convertedAmount =
        dealCurrency !== preferredCurrency
          ? convertCurrency(amount, dealCurrency, preferredCurrency)
          : amount;
      return sum + convertedAmount;
    }, 0);
    const activePipeline = filteredDeals
      .filter((d) => !["won", "lost"].includes(d.stage))
      .reduce((sum, d) => {
        const amount = parseFloat(d.amount) || 0;
        const dealCurrency = d.currency || preferredCurrency;
        const convertedAmount =
          dealCurrency !== preferredCurrency
            ? convertCurrency(amount, dealCurrency, preferredCurrency)
            : amount;
        return sum + convertedAmount;
      }, 0);

    // Win rate: won deals / (won + lost) to exclude active pipeline
    const closedDeals = wonDeals.length + lostDeals.length;
    const winRate = closedDeals > 0 ? (wonDeals.length / closedDeals) * 100 : 0;

    // Conversion rate: won deals / all deals (including active pipeline)
    const conversionRate =
      filteredDeals.length > 0
        ? (wonDeals.length / filteredDeals.length) * 100
        : 0;

    // Team performance: count of active team members with deals
    const activeTeamMembers = new Set();
    filteredDeals.forEach((deal) => {
      if (deal.owner_id) {
        activeTeamMembers.add(deal.owner_id);
      }
    });
    const teamPerformance = activeTeamMembers.size;

    setExecutiveMetrics((prev) => ({
      ...prev,
      totalRevenue,
      activePipeline,
      winRate,
      conversionRate,
      totalDeals: filteredDeals.length,
      dealsWon: wonDeals.length,
      teamPerformance,
      // Keep trend changes from initial load, or set to 0 if not available
      revenueChange: prev?.revenueChange || 0,
      pipelineChange: prev?.pipelineChange || 0,
      winRateChange: prev?.winRateChange || 0,
      dealsChange: prev?.dealsChange || 0,
      conversionChange: prev?.conversionChange || 0,
      performanceChange: prev?.performanceChange || 0,
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
      const stageDeals = filteredDeals.filter((d) => d.stage === stage);
      return {
        stage,
        count: stageDeals.length,
        totalValue: stageDeals.reduce((sum, d) => {
          const amount = parseFloat(d.amount) || 0;
          const dealCurrency = d.currency || preferredCurrency;
          const convertedAmount =
            dealCurrency !== preferredCurrency
              ? convertCurrency(amount, dealCurrency, preferredCurrency)
              : amount;
          return sum + convertedAmount;
        }, 0),
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
    if (allEmployees.length > 0) {
      const teamPerformance = processTeamPerformance(
        allEmployees,
        filteredDeals,
      );
      setTeamData(teamPerformance);
    }

    // Recalculate salesData from filtered deals (for charts)
    // Group filtered deals by month for sales chart
    const salesDataByPeriod = filteredDeals.reduce((acc, deal) => {
      // Use expected_close_date for won deals, otherwise updated_at/created_at
      const dateToUse =
        deal.stage === "won"
          ? deal.expected_close_date || deal.updated_at || deal.created_at
          : deal.updated_at || deal.created_at;
      const dealDate = new Date(dateToUse);
      const periodKey = `${dealDate.getFullYear()}-${dealDate.getMonth()}`;

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
    selectedCompany,
    allEmployees,
  ]);

  useEffect(() => {
    if (companies.length > 0) {
      loadCompaniesWithMetrics();
    }
  }, [companies, selectedMonth, selectedQuarter, selectedYear]);

  // Recalculate companiesWithMetrics when filters change
  useEffect(() => {
    if (companies.length > 0 && allDealsData.length > 0) {
      // Recalculate each company's metrics based on filteredDeals
      const updatedCompanies = companies.map((company) => {
        const companyFilteredDeals = filteredDeals.filter(
          (d) => d.company_id === company.id,
        );
        const wonDeals = companyFilteredDeals.filter((d) => d.stage === "won");
        const totalRevenue = wonDeals.reduce((sum, d) => {
          const amount = parseFloat(d.amount) || 0;
          const dealCurrency = d.currency || preferredCurrency;
          const convertedAmount =
            dealCurrency !== preferredCurrency
              ? convertCurrency(amount, dealCurrency, preferredCurrency)
              : amount;
          return sum + convertedAmount;
        }, 0);
        const activeDeals = companyFilteredDeals.filter(
          (d) => !["won", "lost"].includes(d.stage),
        );

        const existingCompany = companiesWithMetrics.find(
          (c) => c.id === company.id,
        );

        // Calculate remaining revenue from existing target data
        const totalTarget = existingCompany?.metrics?.totalTarget || 0;
        const remainingRevenue = Math.max(0, totalTarget - totalRevenue);

        return {
          ...company,
          metrics: {
            totalRevenue,
            activeDeals: activeDeals.length,
            totalDeals: companyFilteredDeals.length,
            teamSize: existingCompany?.metrics?.teamSize || 0,
            targetAchievement: existingCompany?.metrics?.targetAchievement || 0,
            totalTarget,
            remainingRevenue,
          },
        };
      });
      setCompaniesWithMetrics(updatedCompanies);
    }
  }, [filteredDeals, companies, preferredCurrency]);

  // Update selected company when prop changes
  useEffect(() => {
    if (
      propCompany &&
      (!selectedCompany || propCompany.id !== selectedCompany.id)
    ) {
      setSelectedCompany(propCompany);
    }
  }, [propCompany]);

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
    const wonDeals = filteredDeals?.filter((d) => d.stage === "won") || [];

    if (trendPeriod === "month") {
      // Show monthly trend for selected year (or current year if no filter)
      const displayYear = selectedYear !== null ? selectedYear : currentYear;
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
            dealDate.getFullYear() === displayYear &&
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
      // Show quarterly trend for selected year (or current year if no filter)
      const displayYear = selectedYear !== null ? selectedYear : currentYear;
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
            dealDate.getFullYear() === displayYear &&
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
  }, [filteredDeals, trendPeriod, preferredCurrency, selectedYear]);

  const loadAllCompanies = async () => {
    try {
      const { data, error } = await companyService.getAllCompanies();
      if (!error && data && Array.isArray(data)) {
        setCompanies(data);
        if (data.length > 0 && !selectedCompany) {
          setSelectedCompany(data[0]);
        }
      } else {
        console.error("Error loading companies:", error);
        setCompanies([]);
      }
    } catch (error) {
      console.error("Error loading companies:", error);
      setCompanies([]);
    }
  };

  const loadAllEmployees = async (companyId = null) => {
    try {
      if (companyId) {
        // Load employees for specific company
        const { data, error } = await userService.getCompanyUsers(companyId);
        if (!error && data) {
          // Filter employees but keep director for 'My Data' option
          const roleOrder = {
            director: 0,
            manager: 1,
            supervisor: 2,
            salesman: 3,
            agent: 4,
          };
          const filteredEmployees = data
            .filter((emp) => emp.role !== "admin") // Exclude only admin
            .sort(
              (a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99),
            );
          setAllEmployees(filteredEmployees);
        } else {
          setAllEmployees([]);
        }
      } else {
        // Load employees from all companies
        const allEmployeesData = [];
        for (const company of companies) {
          const { data, error } = await userService.getCompanyUsers(company.id);
          if (!error && data) {
            allEmployeesData.push(...data);
          }
        }
        // Filter and sort
        const roleOrder = {
          director: 0,
          manager: 1,
          supervisor: 2,
          salesman: 3,
          agent: 4,
        };
        const filteredEmployees = allEmployeesData
          .filter((emp) => emp.role !== "admin")
          .sort(
            (a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99),
          );
        setAllEmployees(filteredEmployees);
      }
    } catch (error) {
      console.error("Error loading employees:", error);
      setAllEmployees([]);
    }
  };

  const loadCompanyData = async (companyId) => {
    setIsLoading(true);
    try {
      // Determine which user's data to load based on selectedEmployee
      const targetUserId = selectedEmployee?.id || null;
      const viewAll = !selectedEmployee;

      const results = await Promise.allSettled([
        companyService.getCompanyMetrics(companyId),
        companyService.getSalesData(companyId),
        targetUserId
          ? activityService.getUserActivities(companyId, targetUserId, 20)
          : activityService.getActivities(companyId, 20),
        userService.getCompanyUsers(companyId),
        dealService.getDeals(companyId, { viewAll, dateFrom: dateRange.from, dateTo: dateRange.to }, targetUserId),
        contactService.getContacts(companyId, {}, targetUserId),
        taskService.getMyTasks(targetUserId || user.id, companyId, {
          userOnly: !viewAll,
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
        // Store all deals for filtering
        const deals = dealsResult.value.data || [];
        setAllDealsData(deals);

        // Process team performance data (will be recalculated from filtered deals in useEffect)
        const users = usersResult.value.data || [];
        setAllEmployees(users);
      }
    } catch (error) {
      console.error("Error loading company data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCrossCompanyData = async () => {
    setIsLoading(true);
    try {
      if (!companies || companies.length === 0) {
        setCrossCompanyMetrics({
          totalRevenue: 0,
          totalDeals: 0,
          totalContacts: 0,
          totalTasks: 0,
          companies: [],
        });
        setIsLoading(false);
        return;
      }

      // Load metrics across all companies
      const companyMetrics = await Promise.all(
        companies.map(async (company) => {
          try {
            const { data } = await companyService.getCompanyMetrics(company.id);
            return { company, metrics: data };
          } catch (error) {
            console.error(
              `Error loading metrics for company ${company.name}:`,
              error,
            );
            return { company, metrics: null };
          }
        }),
      );

      const aggregatedMetrics = companyMetrics.reduce(
        (acc, { company, metrics }) => {
          if (metrics) {
            acc.totalRevenue += metrics.totalRevenue || 0;
            acc.totalDeals += metrics.totalDeals || 0;
            acc.totalContacts += metrics.totalContacts || 0;
            acc.totalTasks += metrics.totalTasks || 0;
            acc.companies.push({ name: company.name, metrics });
          }
          return acc;
        },
        {
          totalRevenue: 0,
          totalDeals: 0,
          totalContacts: 0,
          totalTasks: 0,
          companies: [],
        },
      );

      setCrossCompanyMetrics(aggregatedMetrics);
    } catch (error) {
      console.error("Error loading cross-company data:", error);
      setCrossCompanyMetrics({
        totalRevenue: 0,
        totalDeals: 0,
        totalContacts: 0,
        totalTasks: 0,
        companies: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const processTeamPerformance = (users, deals) => {
    return users.map((user) => {
      const userDeals = deals.filter((deal) => deal.owner_id === user.id);
      const wonDeals = userDeals.filter((deal) => deal.stage === "won");
      const lostDeals = userDeals.filter((deal) => deal.stage === "lost");
      const activeDeals = userDeals.filter(
        (deal) => !["won", "lost"].includes(deal.stage),
      );
      const totalValue = wonDeals.reduce(
        (sum, deal) => sum + getConvertedAmount(deal),
        0,
      );

      return {
        id: user.id,
        name: user.full_name || user.email,
        full_name: user.full_name || user.email,
        role: user.role,
        dealsCount: userDeals.length,
        wonDeals: wonDeals.length,
        lostDeals: lostDeals.length,
        activeDeals: activeDeals.length,
        deals: userDeals.length,
        totalValue,
        wonAmount: totalValue,
        total: totalValue,
        winRate:
          userDeals.length > 0
            ? Math.round((wonDeals.length / userDeals.length) * 100)
            : 0,
        conversionRate:
          userDeals.length > 0
            ? ((wonDeals.length / userDeals.length) * 100).toFixed(1)
            : 0,
      };
    });
  };

  const loadSalesTargets = async (companyId = null) => {
    try {
      const { data, error } =
        await salesTargetService.getAssignedTargets(companyId);
      if (!error) {
        const targets = data || [];
        setAssignedTargets(targets);

        const productTargetIds = targets
          .filter((target) => target.target_type === "by_products")
          .map((target) => target.id);

        if (productTargetIds.length > 0) {
          const { data: productTargets } =
            await salesTargetService.getProductTargetsBySalesTargetIds(
              productTargetIds,
            );
          setProductTargetsData(productTargets || []);
        } else {
          setProductTargetsData([]);
        }
      }
    } catch (error) {
      console.error("Error loading sales targets:", error);
    }
  };

  const loadExecutiveMetrics = async (companyId = null) => {
    // Guard: Return early if companyId is not provided
    if (!companyId) {
      return;
    }

    try {
      // Use 30 days as default period for trend calculations
      const periodDays = 30;

      // Determine which user's data to load based on selectedEmployee
      // If null/undefined -> all consolidated (viewAll = true)
      // If selectedEmployee -> that employee's data only
      const targetUserId = selectedEmployee?.id || null;
      const viewAll = !selectedEmployee; // View all if no employee selected

      // Load enhanced metrics for executive dashboard
      const { data: deals, error: dealsError } = await dealService.getDeals(
        companyId,
        { viewAll }, // Pass viewAll flag
        targetUserId, // Pass target user ID for filtering
      );
      const { data: targets, error: targetsError } =
        await salesTargetService.getAssignedTargets(companyId);

      if (!dealsError && deals) {
        // Calculate executive metrics - convert each deal to preferred currency
        const wonDeals = deals.filter((d) => d.stage === "won");
        const lostDeals = deals.filter((d) => d.stage === "lost");
        const totalRevenue = wonDeals.reduce((sum, d) => {
          const amount = parseFloat(d.amount) || 0;
          const dealCurrency = d.currency || preferredCurrency;
          // Convert to preferred currency if different
          const convertedAmount =
            dealCurrency !== preferredCurrency
              ? convertCurrency(amount, dealCurrency, preferredCurrency)
              : amount;
          return sum + convertedAmount;
        }, 0);
        const activePipeline = deals
          .filter((d) => !["won", "lost"].includes(d.stage))
          .reduce((sum, d) => {
            const amount = parseFloat(d.amount) || 0;
            const dealCurrency = d.currency || preferredCurrency;
            // Convert to preferred currency if different
            const convertedAmount =
              dealCurrency !== preferredCurrency
                ? convertCurrency(amount, dealCurrency, preferredCurrency)
                : amount;
            return sum + convertedAmount;
          }, 0);

        // Win rate: won / (won + lost)
        const closedDeals = wonDeals.length + lostDeals.length;
        const winRate =
          closedDeals > 0 ? (wonDeals.length / closedDeals) * 100 : 0;

        // Team performance: count of active team members with deals
        const activeTeamMembers = new Set();
        deals.forEach((deal) => {
          if (deal.owner_id) {
            activeTeamMembers.add(deal.owner_id);
          }
        });
        const teamPerformance = activeTeamMembers.size;

        // Get trend data using selected period and target user
        const [
          revenueChangeResult,
          dealsChangeResult,
          winRateChangeResult,
          velocityResult,
        ] = await Promise.all([
          companyService.calculateTrendChange(
            selectedCompany?.id,
            targetUserId,
            "revenue",
            periodDays,
            viewAll,
          ),
          companyService.calculateTrendChange(
            selectedCompany?.id,
            targetUserId,
            "deals",
            periodDays,
            viewAll,
          ),
          companyService.calculateTrendChange(
            selectedCompany?.id,
            targetUserId,
            "winRate",
            periodDays,
            viewAll,
          ),
          companyService.calculateSalesVelocity(selectedCompany?.id),
        ]);

        // Calculate remaining revenue from targets
        let totalTargetAmount = 0;
        let remainingRevenue = 0;

        if (targets && targets.length > 0) {
          // Filter targets based on selected period - only consider monthly targets
          const now = new Date();
          const activeTargets = targets.filter((target) => {
            if ((target.period_type || "monthly") !== "monthly") return false;
            const start = new Date(target.period_start);
            const end = new Date(target.period_end);
            return start <= now && end >= now;
          });

          totalTargetAmount = activeTargets.reduce((sum, t) => {
            return sum + (parseFloat(t.target_amount) || 0);
          }, 0);

          remainingRevenue = Math.max(0, totalTargetAmount - totalRevenue);
        }

        const executiveData = {
          totalRevenue,
          revenueChange: revenueChangeResult.change || 0,
          activePipeline,
          pipelineChange: revenueChangeResult.change * 1.5 || 0, // Pipeline typically changes faster
          winRate,
          winRateChange: winRateChangeResult.change || 0,
          teamPerformance,
          performanceChange: 0, // Team count doesn't have meaningful trend yet
          remainingRevenue,
          totalTarget: totalTargetAmount,
          dealsWon: wonDeals.length,
          dealsChange: dealsChangeResult.change || 0,
          conversionRate:
            deals.length > 0 ? (wonDeals.length / deals.length) * 100 : 0,
          conversionChange: winRateChangeResult.change || 0,
          dealsThisMonth: deals.filter(
            (d) => new Date(d.created_at).getMonth() === new Date().getMonth(),
          ).length,
          avgDealCycle: velocityResult.velocityDays || 0,
          growthRate: revenueChangeResult.change || 0,
        };

        setExecutiveMetrics(executiveData);
      }
    } catch (error) {
      console.error("Error loading executive metrics:", error);
    }
  };

  const loadPipelineData = async (companyId = null) => {
    try {
      // Determine which user's data to load based on selectedEmployee
      const targetUserId = selectedEmployee?.id || null;
      const viewAll = !selectedEmployee;

      const { data: deals, error } = await dealService.getDeals(
        companyId,
        { viewAll },
        targetUserId,
      );

      if (!error && deals) {
        // Store all deals for filtering (if not already set from loadCompanyData)
        if (allDealsData.length === 0) {
          setAllDealsData(deals);
        }

        // Group deals by stage
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
            totalValue: stageDeals.reduce((sum, d) => {
              const amount = parseFloat(d.amount) || 0;
              const dealCurrency = d.currency || preferredCurrency;
              const convertedAmount =
                dealCurrency !== preferredCurrency
                  ? convertCurrency(amount, dealCurrency, preferredCurrency)
                  : amount;
              return sum + convertedAmount;
            }, 0),
          };
        });

        setPipelineData(pipelineStats);
      }
    } catch (error) {
      console.error("Error loading pipeline data:", error);
    }
  };

  const loadActionItems = async (companyId = null) => {
    // Guard: Return early if companyId is not provided
    if (!companyId) {
      return;
    }

    try {
      // Determine which user's data to load based on selectedEmployee
      const targetUserId = selectedEmployee?.id || null;
      const viewAll = !selectedEmployee;

      // Generate action items based on deals, targets, and tasks
      const { data: deals, error: dealsError } = await dealService.getDeals(
        companyId,
        { viewAll },
        targetUserId,
      );
      const { data: tasks, error: tasksError } = await taskService.getMyTasks(
        targetUserId,
        companyId,
        { userOnly: false },
      );
      const { data: targets, error: targetsError } =
        await salesTargetService.getAssignedTargets(companyId);

      const actions = [];

      // High-value deals in negotiation (threshold in preferred currency)
      const highValueThreshold = 500000; // This threshold is in user's preferred currency
      if (!dealsError && deals) {
        const highValueDeals = deals.filter((d) => {
          if (d.stage !== "negotiation") return false;
          const amount = parseFloat(d.amount) || 0;
          const dealCurrency = d.currency || preferredCurrency;
          const convertedAmount =
            dealCurrency !== preferredCurrency
              ? convertCurrency(amount, dealCurrency, preferredCurrency)
              : amount;
          return convertedAmount > highValueThreshold;
        });

        highValueDeals.forEach((deal) => {
          const amount = parseFloat(deal.amount) || 0;
          const dealCurrency = deal.currency || preferredCurrency;
          actions.push({
            type: "review_deal",
            title: `Review High-Value Deal: ${deal.title}`,
            description: `Deal worth ${formatCurrency(
              amount,
              dealCurrency,
            )} requires director approval`,
            priority: "high",
            company: companyId ? selectedCompany?.name : "Multiple",
            created_at: deal.updated_at,
            dueDate: deal.expected_close_date,
            assignee: deal.owner?.full_name,
          });
        });
      }

      // Overdue targets
      if (!targetsError && targets) {
        const overdueTargets = targets.filter((t) => {
          const progress =
            (parseFloat(t.progress_amount || 0) /
              parseFloat(t.target_amount || 1)) *
            100;
          const daysLeft = Math.ceil(
            (new Date(t.period_end) - new Date()) / (1000 * 60 * 60 * 24),
          );
          return progress < 50 && daysLeft < 30;
        });

        overdueTargets.forEach((target) => {
          actions.push({
            type: "performance_review",
            title: `Performance Review Required`,
            description: `Sales target behind schedule - ${
              target.assignee?.full_name ||
              target.assignee?.email ||
              "Unassigned"
            }`,
            priority: "medium",
            company: target.company?.name,
            created_at: target.created_at,
            assignee: target.assignee?.full_name || target.assignee?.email,
          });
        });
      }

      // Urgent tasks
      if (!tasksError && tasks) {
        const urgentTasks = tasks.filter(
          (t) => t.priority === "high" && t.status !== "completed",
        );

        urgentTasks.forEach((task) => {
          actions.push({
            type: "urgent_follow_up",
            title: task.title,
            description: task.description,
            priority: "high",
            company: task.company?.name || "Unknown",
            created_at: task.created_at,
            dueDate: task.due_date,
            assignee: task.assigned_to?.full_name,
          });
        });
      }

      // Sort by priority and date
      const sortedActions = actions.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return new Date(b.created_at) - new Date(a.created_at);
      });

      setActionItems(sortedActions);
    } catch (error) {
      console.error("Error loading action items:", error);
    }
  };

  const loadCompaniesWithMetrics = async () => {
    try {
      // Determine which user's data to load based on selectedEmployee
      const targetUserId = selectedEmployee?.id || null;
      const viewAll = !selectedEmployee;

      const companiesWithStats = await Promise.all(
        companies.map(async (company) => {
          try {
            const [{ data: deals }, { data: users }, { data: targets }] =
              await Promise.all([
                dealService.getDeals(company.id, { viewAll }, targetUserId),
                userService.getCompanyUsers(company.id),
                salesTargetService.getAssignedTargets(company.id),
              ]);

            // Filter deals by selected period
            const filteredDeals = (deals || []).filter((deal) => {
              const dateToCheck =
                deal.stage === "won" && deal.expected_close_date
                  ? new Date(deal.expected_close_date)
                  : deal.updated_at
                    ? new Date(deal.updated_at)
                    : new Date(deal.created_at);
              return isInSelectedPeriod(dateToCheck);
            });

            // Filter targets by selected period - only consider monthly targets
            const filteredTargets = (targets || []).filter((target) => {
              if (!target.period_start) return false;
              if ((target.period_type || "monthly") !== "monthly") return false;
              const targetStart = new Date(target.period_start);
              const targetEnd = target.period_end
                ? new Date(target.period_end)
                : targetStart;

              // Check if target period overlaps with selected period
              if (selectedMonth) {
                const selectedDate = new Date(
                  selectedYear,
                  selectedMonth - 1,
                  1,
                );
                const selectedEndDate = new Date(
                  selectedYear,
                  selectedMonth,
                  0,
                );
                return (
                  targetStart <= selectedEndDate && targetEnd >= selectedDate
                );
              } else if (selectedQuarter) {
                const quarterStart = new Date(
                  selectedYear,
                  (selectedQuarter - 1) * 3,
                  1,
                );
                const quarterEnd = new Date(
                  selectedYear,
                  selectedQuarter * 3,
                  0,
                );
                return targetStart <= quarterEnd && targetEnd >= quarterStart;
              } else if (selectedYear) {
                const yearStart = new Date(selectedYear, 0, 1);
                const yearEnd = new Date(selectedYear, 11, 31);
                return targetStart <= yearEnd && targetEnd >= yearStart;
              }
              return true;
            });

            const wonDeals = filteredDeals.filter((d) => d.stage === "won");
            const totalRevenue = wonDeals.reduce((sum, d) => {
              const amount = parseFloat(d.amount) || 0;
              const dealCurrency = d.currency || preferredCurrency;
              const convertedAmount =
                dealCurrency !== preferredCurrency
                  ? convertCurrency(amount, dealCurrency, preferredCurrency)
                  : amount;
              return sum + convertedAmount;
            }, 0);
            const activeDeals = filteredDeals.filter(
              (d) => !["won", "lost"].includes(d.stage),
            );

            // Calculate target achievement from actual revenue vs targets
            let targetAchievement = 0;
            let totalTargetAmount = 0;
            let remainingRevenue = 0;

            if (filteredTargets.length > 0) {
              totalTargetAmount = filteredTargets.reduce((sum, t) => {
                return sum + (parseFloat(t.target_amount) || 0);
              }, 0);

              if (totalTargetAmount > 0) {
                targetAchievement = (totalRevenue / totalTargetAmount) * 100;
                remainingRevenue = Math.max(
                  0,
                  totalTargetAmount - totalRevenue,
                );
              }
            }

            console.log(`Metrics for ${company.name}:`, {
              totalRevenue,
              totalTargetAmount,
              remainingRevenue,
              targetAchievement,
            });

            return {
              ...company,
              metrics: {
                totalRevenue,
                activeDeals: activeDeals.length,
                teamSize: users?.length || 0,
                targetAchievement,
                totalTarget: totalTargetAmount,
                remainingRevenue,
              },
            };
          } catch (error) {
            console.error(`Error loading metrics for ${company.name}:`, error);
            return {
              ...company,
              metrics: {
                totalRevenue: 0,
                activeDeals: 0,
                teamSize: 0,
                targetAchievement: 0,
                totalTarget: 0,
                remainingRevenue: 0,
              },
            };
          }
        }),
      );

      setCompaniesWithMetrics(companiesWithStats);
    } catch (error) {
      console.error("Error loading companies with metrics:", error);
    }
  };

  const handleTargetCreated = (newTarget) => {
    console.log("🎯 handleTargetCreated called with:", newTarget);

    // Always reload from API to ensure data consistency
    loadSalesTargets(selectedCompany?.id);
    setShowTargetAssignment(false);
    setSelectedTargetUser(null);
  };

  const handleEditTarget = (target) => {
    setSelectedTargetUser(target.assigned_to);
    setShowTargetAssignment(true);
  };

  const handleDeleteTarget = async (target) => {
    if (
      !window.confirm(
        `Are you sure you want to delete this sales target for ${
          target?.assignee?.full_name || target?.assignee?.email
        }?`,
      )
    ) {
      return;
    }

    try {
      const { error } = await salesTargetService.deleteTarget(target.id);
      if (error) {
        console.error("Error deleting target:", error);
        alert("Failed to delete target: " + error.message);
        return;
      }

      // Reload targets to refresh the list
      loadSalesTargets(selectedCompany?.id);
    } catch (error) {
      console.error("Error deleting target:", error);
      alert("Failed to delete target: " + error.message);
    }
  };

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

  const handleActionClick = (action) => {
    switch (action.type) {
      case "review_deal":
        navigate("/sales-pipeline?stage=negotiation", { state: { activeStage: "negotiation" } });
        break;
      case "performance_review":
        navigate("/sales-pipeline");
        break;
      case "urgent_follow_up":
        navigate("/task-management");
        break;
      case "approve_target":
      case "budget_review":
      case "team_meeting":
      default:
        navigate("/sales-pipeline");
    }
  };

  const handleCompanySelect = (company) => {
    setSelectedCompany(company);
    // Notify parent component about the change
    if (onCompanyChange) {
      onCompanyChange(company);
    }
  };

  const renderOverview = () => (
    <div className="space-y-8">
      {/* Executive Metrics */}
      {executiveMetrics && (
        <ExecutiveMetrics
          metrics={executiveMetrics}
          selectedCompany={selectedCompany}
          timePeriod={timePeriod}
          onMetricClick={handleMetricClick}
        />
      )}

      {/* Performance Bar Chart - Revenue vs Target by Time Period */}
      <PerformanceBarChart
        dealsData={filteredDeals}
        targetsData={filteredAssignedTargets}
        timePeriod={timePeriod}
        year={new Date().getFullYear()}
        isLoading={isLoading}
      />

      {/* Company Performance Grid */}
      <CompanyPerformanceGrid
        companies={companiesWithMetrics}
        onCompanySelect={handleCompanySelect}
        selectedCompany={selectedCompany}
        selectedMonth={selectedMonth}
        selectedQuarter={selectedQuarter}
        selectedYear={selectedYear}
        timePeriod={timePeriod}
      />

      {/* Pipeline and Action Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <PipelineChart
          pipelineData={pipelineData}
          selectedCompany={selectedCompany}
        />
        <ActionableDashboard
          actionItems={actionItems}
          onActionClick={handleActionClick}
        />
      </div>

      {/* Legacy Components */}
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

      <div className="bg-white rounded-lg shadow">
        <ActivityFeed
          activities={filteredActivities}
          title="Activities"
          companyId={selectedCompany?.id}
          users={allEmployees}
        />
      </div>
    </div>
  );

  const renderLegacyOverview = () => (
    <>
      {/* Company Selection */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Company Overview (Legacy)
          </h2>
          <CompanySelector
            companies={companies}
            selectedCompany={selectedCompany}
            onCompanyChange={setSelectedCompany}
            showAllOption={true}
          />
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {selectedCompany ? (
          <>
            <MetricsCard
              title="Total Revenue"
              value={formatCurrency(metrics?.totalRevenue || 0)}
              change="+12.5%"
              trend="up"
              icon="💰"
            />
            <MetricsCard
              title="Active Deals"
              value={metrics?.totalDeals || 0}
              change="+8.2%"
              trend="up"
              icon="🤝"
            />
            <MetricsCard
              title="Contacts"
              value={metrics?.totalContacts || 0}
              change="+5.4%"
              trend="up"
              icon="👥"
            />
            <MetricsCard
              title="Tasks"
              value={metrics?.totalTasks || 0}
              change="-2.1%"
              trend="down"
              icon="📋"
            />
          </>
        ) : (
          <>
            <MetricsCard
              title="Cross-Company Revenue"
              value={formatCurrency(crossCompanyMetrics?.totalRevenue || 0)}
              change="+15.3%"
              trend="up"
              icon="🏢"
            />
            <MetricsCard
              title="Total Companies"
              value={companies.length}
              change="0%"
              trend="neutral"
              icon="🏭"
            />
            <MetricsCard
              title="All Deals"
              value={crossCompanyMetrics?.totalDeals || 0}
              change="+10.7%"
              trend="up"
              icon="🤝"
            />
            <MetricsCard
              title="All Contacts"
              value={crossCompanyMetrics?.totalContacts || 0}
              change="+7.8%"
              trend="up"
              icon="👥"
            />
          </>
        )}
      </div>

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
                  performanceTrendData.reduce((sum, d) => sum + d.revenue, 0),
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

      {/* Charts and Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 items-stretch">
        <div className="bg-white rounded-lg shadow p-6 h-full">
          <SalesChart
            data={salesData}
            title="Sales Overview"
            showTypeSelector={true}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-6 h-full">
          <TeamPerformance data={teamData} />
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-white rounded-lg shadow">
        <ActivityFeed
          activities={filteredActivities}
          title="All Activities"
          companyId={selectedCompany?.id}
          users={allEmployees}
        />
      </div>
    </>
  );

  const renderTeamManagement = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {t("dashboard.teamManagement")}
        </h2>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("tables.member")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("roles.role")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("nav.deals")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("deals.revenue")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("dashboard.conversionRate")}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {teamData.map((member) => (
              <tr key={member.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {member.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    {capitalize(member.role)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {member.dealsCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(member.totalValue)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {member.conversionRate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSalesTargets = () => (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {t("dashboard.salesTargetManager")}
        </h3>
        {!showTargetAssignment && (
          <Button
            onClick={() => {
              setSelectedTargetUser(null);
              setShowTargetAssignment(true);
            }}
          >
            <Icon name="Target" size={16} className="mr-2" />
            {t("admin.assignNewTarget")}
          </Button>
        )}
      </div>

      {/* Target Assignment Card (inline instead of modal) */}
      {showTargetAssignment && (
        <DirectorSalesTargetAssignment
          companyId={selectedCompany?.id}
          onTargetCreated={handleTargetCreated}
          onClose={() => {
            setShowTargetAssignment(false);
            setSelectedTargetUser(null);
          }}
        />
      )}

      {/* Active Targets List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <h4 className="text-md font-medium text-gray-900">
            {t("admin.activeSalesTargets")}
          </h4>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setTargetGridView("value")}
              className={`px-3 py-1.5 text-sm font-medium ${
                targetGridView === "value"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Value
            </button>
            <button
              type="button"
              onClick={() => setTargetGridView("quantity")}
              className={`px-3 py-1.5 text-sm font-medium ${
                targetGridView === "quantity"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Quantity
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {targetGridView === "value" ? (
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("tables.teamMember")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("admin.targetAmount")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("admin.period")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("tasks.progress")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("common.status")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("common.actions")}
                  </th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("tables.teamMember")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Target Qty
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("admin.period")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("tasks.progress")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("common.status")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("common.actions")}
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {targetGridView === "value" &&
              assignedTargetsWithProgress?.length === 0 ? (
                <tr>
                  <td
                    colSpan="9"
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    {t("admin.noSalesTargetsAssigned")}
                  </td>
                </tr>
              ) : targetGridView === "quantity" &&
                aggregatedQuantityRows.length === 0 ? (
                <tr>
                  <td
                    colSpan="8"
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No quantity-based product targets assigned
                  </td>
                </tr>
              ) : targetGridView === "value" ? (
                assignedTargetsWithProgress
                  ?.filter((target) => target && target.id && !target.deleted)
                  ?.map((target) => {
                    const progressAmount = parseFloat(
                      target.calculated_progress ??
                        target.progress_amount ??
                        0,
                    );
                    const progressPercent =
                      parseFloat(target.target_amount) > 0
                        ? (progressAmount / parseFloat(target.target_amount)) *
                          100
                        : 0;
                    return (
                    <tr key={target.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                              <Icon name="User" size={14} />
                            </div>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {target?.assignee?.full_name ||
                                target?.assignee?.email}
                            </div>
                            <div className="text-sm text-gray-500">
                              {target?.assignee?.role &&
                                capitalize(target?.assignee?.role)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(target.target_amount, target.currency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                            target.target_type === "by_clients"
                              ? "bg-purple-100 text-purple-800"
                              : target.target_type === "by_products"
                                ? "bg-orange-100 text-orange-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          <Icon
                            name={
                              target.target_type === "by_clients"
                                ? "Users"
                                : target.target_type === "by_products"
                                  ? "Package"
                                : "DollarSign"
                            }
                            size={12}
                          />
                          {target.target_type === "by_clients"
                            ? "By Clients"
                            : target.target_type === "by_products"
                              ? "By Product"
                            : "Total Value"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {target?.assigner?.full_name ||
                          target?.assigner?.email ||
                          "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {target?.assignee?.full_name ||
                          target?.assignee?.email ||
                          "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-medium capitalize">
                          {target.period_type || "monthly"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(target.period_start).toLocaleDateString()} -{" "}
                          {new Date(target.period_end).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{
                                width: `${Math.min(100, progressPercent)}%`,
                              }}
                            ></div>
                          </div>
                          <span className="ml-2 text-sm text-gray-900">
                            {progressPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatCurrency(progressAmount, target.currency)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            target.status === "active"
                              ? "bg-green-100 text-green-800"
                              : target.status === "completed"
                                ? "bg-blue-100 text-blue-800"
                                : target.status === "overdue"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {target.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditTarget(target)}
                            title="Edit target"
                          >
                            <Icon name="Edit" size={14} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteTarget(target)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            title="Delete target"
                          >
                            <Icon name="Trash2" size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
              ) : (
                aggregatedQuantityRows.map((quantityRow) => {
                  const targetQuantity = quantityRow.target_quantity;
                  const achievedQuantity = quantityRow.achieved_quantity;
                  const progressPercent =
                    targetQuantity > 0
                      ? (achievedQuantity / targetQuantity) * 100
                      : 0;

                  return (
                    <tr key={quantityRow.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                              <Icon name="User" size={14} />
                            </div>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {quantityRow.assignee?.full_name ||
                                quantityRow.assignee?.email ||
                                "-"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {quantityRow.assignee?.role &&
                                capitalize(quantityRow.assignee.role)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {targetQuantity.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {quantityRow.assigner?.full_name ||
                          quantityRow.assigner?.email ||
                          "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {quantityRow.assignee?.full_name ||
                          quantityRow.assignee?.email ||
                          "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-medium capitalize">
                          {quantityRow.period_type || "monthly"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {quantityRow.period_start
                            ? `${new Date(
                                quantityRow.period_start,
                              ).toLocaleDateString()} - ${new Date(
                                quantityRow.period_end,
                              ).toLocaleDateString()}`
                            : "N/A"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{
                                width: `${Math.min(100, progressPercent)}%`,
                              }}
                            ></div>
                          </div>
                          <span className="ml-2 text-sm text-gray-900">
                            {progressPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {achievedQuantity.toLocaleString()} sold
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            quantityRow.status === "active"
                              ? "bg-green-100 text-green-800"
                              : quantityRow.status === "completed"
                                ? "bg-blue-100 text-blue-800"
                                : quantityRow.status === "overdue"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {quantityRow.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleEditTarget(quantityRow.parentTarget)
                            }
                            title="Edit target"
                          >
                            <Icon name="Edit" size={14} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleDeleteTarget(quantityRow.parentTarget)
                            }
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            title="Delete target"
                          >
                            <Icon name="Trash2" size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="h-64 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="director-dashboard">
      {/* Employee Selector and Filter Dropdowns */}
      <div className="mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-4">
            {/* Employee Selector */}
            <div className="flex-1 max-w-md">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("dashboard.viewDashboardAs")}
              </label>
              <EmployeeSelector
                employees={allEmployees}
                selectedEmployee={selectedEmployee}
                onEmployeeChange={setSelectedEmployee}
                showAllOption={true}
                currentUserId={user?.id}
              />
            </div>

            {/* Time Filter Dropdowns */}
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

            {/* Viewing As Badge */}
            {selectedEmployee && (
              <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <Icon name="Eye" size={14} className="inline mr-1" />
                  {t("dashboard.viewingAs")}:{" "}
                  <span className="font-semibold">
                    {selectedEmployee.id === user?.id
                      ? t("dashboard.myData")
                      : selectedEmployee.full_name || selectedEmployee.email}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conditional Dashboard Rendering */}
      {selectedEmployee ? (
        // Render employee-specific dashboard based on their role
        // Key prop ensures component remounts when user changes
        <div key={selectedEmployee.id}>
          {(selectedEmployee.role === "manager" ||
            selectedEmployee.role === "head") && (
            <EnhancedManagerDashboard
              viewAsUser={selectedEmployee}
              readOnly={true}
            />
          )}
          {selectedEmployee.role === "supervisor" && (
            <EnhancedSupervisorDashboard
              viewAsUser={selectedEmployee}
              readOnly={true}
            />
          )}
          {(selectedEmployee.role === "salesman" ||
            selectedEmployee.role === "agent") && (
            <SalesmanDashboard viewAsUser={selectedEmployee} readOnly={true} />
          )}
        </div>
      ) : (
        // Render Director's own dashboard
        <>
          {/* Navigation Tabs */}
          <div className="flex space-x-1 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveView("overview")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeView === "overview"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("dashboard.overview")}
            </button>
            <button
              onClick={() => setActiveView("team")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeView === "team"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("dashboard.teamManagement")}
            </button>
            <button
              onClick={() => setActiveView("targets")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeView === "targets"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("dashboard.salesTargets")}
            </button>
            <button
              onClick={() => setActiveView("users")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeView === "users"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon name="Users" size={16} className="inline mr-1" />
              {t("dashboard.userManagement")}
            </button>
            <button
              onClick={() => setActiveView("products")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeView === "products"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon name="Package" size={16} className="inline mr-1" />
              {t("dashboard.productMaster")}
            </button>
            <button
              onClick={() => setActiveView("sales-targets")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeView === "sales-targets"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon name="Target" size={16} className="inline mr-1" />
              {t("dashboard.salesTargetManager")}
            </button>
          </div>

          {/* Content */}
          {activeView === "overview" && renderOverview()}
          {activeView === "team" && renderTeamManagement()}
          {activeView === "targets" && renderSalesTargets()}
          {activeView === "users" && <UserManagement />}
          {activeView === "products" && <ProductMaster />}
          {activeView === "sales-targets" && <SalesTarget />}
        </>
      )}

      {/* Metric Insight Modal */}
      <MetricInsightModal
        isOpen={metricInsightModal.isOpen}
        onClose={handleCloseMetricModal}
        metricType={metricInsightModal.metricType}
        metrics={executiveMetrics}
        pipelineData={pipelineData}
        teamData={teamData}
        dealsData={filteredDeals}
        timePeriod={timePeriod}
      />
    </div>
  );
};

export default DirectorDashboard;
