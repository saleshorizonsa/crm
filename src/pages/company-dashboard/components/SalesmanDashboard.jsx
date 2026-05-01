import React, { useState, useEffect, useMemo } from "react";
import MetricsCard from "./MetricsCard";
import SalesChart from "./SalesChart";
import ActivityFeed from "./ActivityFeed";
import QuickActions from "./QuickActions";
import UpcomingTasks from "./UpcomingTasks";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";
import { useAuth } from "../../../contexts/AuthContext";
import { useCurrency } from "../../../contexts/CurrencyContext";
import {
  companyService,
  dealService,
  taskService,
  activityService,
  contactService,
  salesTargetService,
} from "../../../services/supabaseService";

const SalesmanDashboard = ({
  viewAsUser = null,
  readOnly = false,
  filterMonth = undefined,
  filterQuarter = undefined,
  filterYear = undefined,
}) => {
  const { user, userProfile, company } = useAuth();
  const { formatCurrency, convertCurrency, preferredCurrency } = useCurrency();

  // Helper to convert deal amount to user's preferred currency
  const getConvertedAmount = (deal) => {
    const amount = parseFloat(deal.amount) || 0;
    const dealCurrency = deal.currency || preferredCurrency;
    if (dealCurrency === preferredCurrency) return amount;
    return convertCurrency(amount, dealCurrency, preferredCurrency);
  };

  // If viewing as another user (director view), use that user's data
  const effectiveUser = viewAsUser || { id: user?.id };
  const effectiveUserProfile = viewAsUser || userProfile;

  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState("overview");

  // Time filter states
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

  const monthOptions = useMemo(() => {
    const months = [];
    const startMonth = selectedQuarter !== null ? selectedQuarter * 3 : 0;
    const endMonth = selectedQuarter !== null ? startMonth + 3 : 12;
    for (let m = startMonth; m < endMonth; m++) {
      const date = new Date(2000, m, 1);
      months.push({
        value: m,
        label: date.toLocaleString("default", { month: "short" }),
      });
    }
    return months;
  }, [selectedQuarter]);

  const quarterOptions = useMemo(() => {
    const quarters = [
      { value: 0, label: "Q1" },
      { value: 1, label: "Q2" },
      { value: 2, label: "Q3" },
      { value: 3, label: "Q4" },
    ];
    if (selectedMonth !== null)
      return quarters.filter((q) => q.value === Math.floor(selectedMonth / 3));
    return quarters;
  }, [selectedMonth]);

  const yearOptions = [
    { value: 2025, label: "2025" },
    { value: 2026, label: "2026" },
  ];
  const [metrics, setMetrics] = useState(null);
  const [salesData, setSalesData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [myDeals, setMyDeals] = useState([]);
  const [myContacts, setMyContacts] = useState([]);
  const [performanceGoals, setPerformanceGoals] = useState(null);

  // Deals filtered by the selected time period
  const filteredDeals = useMemo(() => {
    return myDeals.filter((deal) => {
      // For won deals use closed_at (when revenue was realised); otherwise created_at
      const dateField =
        deal.stage === "won"
          ? deal.closed_at || deal.created_at
          : deal.created_at;
      const date = new Date(dateField);
      const dealYear = date.getFullYear();
      const dealMonth = date.getMonth();
      if (selectedYear !== null && dealYear !== selectedYear) return false;
      if (
        selectedQuarter !== null &&
        Math.floor(dealMonth / 3) !== selectedQuarter
      )
        return false;
      if (selectedMonth !== null && dealMonth !== selectedMonth) return false;
      return true;
    });
  }, [myDeals, selectedYear, selectedQuarter, selectedMonth]);

  // Revenue computed from filtered won deals with currency conversion
  const filteredRevenue = useMemo(() => {
    return filteredDeals
      .filter((d) => d.stage === "won")
      .reduce((sum, d) => sum + getConvertedAmount(d), 0);
  }, [filteredDeals, preferredCurrency]);

  useEffect(() => {
    if (company?.id && effectiveUserProfile?.id) {
      loadSalesmanData();
    }
  }, [company, effectiveUserProfile]);

  const loadSalesmanData = async () => {
    setIsLoading(true);
    try {
      const results = await Promise.allSettled([
        // Get personal metrics
        companyService.getUserMetrics(company.id, effectiveUserProfile.id),
        // Get personal sales data
        companyService.getUserSalesData(company.id, effectiveUserProfile.id),
        // Get personal activities
        activityService.getUserActivities(
          company.id,
          effectiveUserProfile.id,
          10,
        ),
        // Get personal tasks
        taskService.getMyTasks(effectiveUserProfile.id, company.id, {
          status: "pending",
        }),
        // Get personal deals
        dealService.getUserDeals(company.id, effectiveUserProfile.id),
        // Get personal contacts
        contactService.getUserContacts(company.id, effectiveUserProfile.id),
        // Get sales targets
        salesTargetService.getMyTargets(company.id, effectiveUserProfile.id),
      ]);

      const [
        metricsResult,
        salesResult,
        activitiesResult,
        tasksResult,
        dealsResult,
        contactsResult,
        targetsResult,
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
      if (tasksResult.status === "fulfilled") {
        setUpcomingTasks(tasksResult.value.data);
      }
      if (dealsResult.status === "fulfilled") {
        setMyDeals(dealsResult.value.data || []);
      }
      if (contactsResult.status === "fulfilled") {
        setMyContacts(contactsResult.value.data || []);
      }

      // Calculate performance goals with real targets
      calculatePerformanceGoals(
        dealsResult.value.data || [],
        activitiesResult.value.data || [],
        targetsResult.value.data || [],
      );
    } catch (error) {
      console.error("Error loading salesman data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculatePerformanceGoals = (deals, activities, targets) => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // Filter deals that were won in the current month (use closed_at for won deals)
    const currentMonthDeals = deals.filter((deal) => {
      const dateField =
        deal.stage === "won"
          ? deal.closed_at || deal.created_at
          : deal.created_at;
      const dealDate = new Date(dateField);
      return (
        dealDate.getMonth() === currentMonth &&
        dealDate.getFullYear() === currentYear
      );
    });

    const wonDeals = currentMonthDeals.filter((deal) => deal.stage === "won");
    const totalRevenue = wonDeals.reduce(
      (sum, deal) => sum + getConvertedAmount(deal),
      0,
    );

    // Get active monthly target from database
    const now = new Date();
    const activeTarget = targets.find((target) => {
      const start = new Date(target.period_start);
      const end = new Date(target.period_end);
      return start <= now && end >= now && target.period_type === "monthly";
    });

    // Use target from database or calculate based on historical average
    const targetAmount = activeTarget
      ? parseFloat(activeTarget.target_amount)
      : totalRevenue * 1.2; // 20% growth if no target
    const targetDeals = activeTarget
      ? Math.ceil(targetAmount / (totalRevenue / (wonDeals.length || 1)))
      : wonDeals.length + 2;

    // Count activities for the current month
    const currentMonthActivities = activities.filter((activity) => {
      const activityDate = new Date(activity.created_at);
      return (
        activityDate.getMonth() === currentMonth &&
        activityDate.getFullYear() === currentYear
      );
    });

    const callsThisMonth = currentMonthActivities.filter(
      (a) => a.type === "call",
    ).length;
    const meetingsThisMonth = currentMonthActivities.filter(
      (a) => a.type === "meeting",
    ).length;

    // Estimate targets for calls and meetings based on deals (if no specific target exists)
    const targetCalls = Math.max(targetDeals * 10, callsThisMonth * 1.2); // ~10 calls per deal
    const targetMeetings = Math.max(targetDeals * 2, meetingsThisMonth * 1.2); // ~2 meetings per deal

    setPerformanceGoals({
      revenue: {
        current: totalRevenue,
        target: targetAmount,
        percentage:
          targetAmount > 0
            ? ((totalRevenue / targetAmount) * 100).toFixed(1)
            : 0,
      },
      deals: {
        current: wonDeals.length,
        target: targetDeals,
        percentage:
          targetDeals > 0
            ? ((wonDeals.length / targetDeals) * 100).toFixed(1)
            : 0,
      },
      calls: {
        current: callsThisMonth,
        target: Math.ceil(targetCalls),
        percentage:
          targetCalls > 0
            ? ((callsThisMonth / targetCalls) * 100).toFixed(1)
            : 0,
      },
      meetings: {
        current: meetingsThisMonth,
        target: Math.ceil(targetMeetings),
        percentage:
          targetMeetings > 0
            ? ((meetingsThisMonth / targetMeetings) * 100).toFixed(1)
            : 0,
      },
    });
  };

  const renderOverview = () => (
    <>
      {/* Personal Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricsCard
          title="My Revenue"
          value={formatCurrency(filteredRevenue)}
          change="+15.2%"
          trend="up"
          icon="💰"
        />
        <MetricsCard
          title="My Deals"
          value={filteredDeals.length.toString()}
          change="+5.8%"
          trend="up"
          icon="🤝"
        />
        <MetricsCard
          title="My Contacts"
          value={myContacts.length.toString()}
          change="+12.1%"
          trend="up"
          icon="👥"
        />
        <MetricsCard
          title="My Tasks"
          value={upcomingTasks.length.toString()}
          change="-8.3%"
          trend="down"
          icon="📋"
        />
      </div>

      {/* Performance Goals */}
      {performanceGoals && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h3 className="text-lg font-semibold mb-4">Monthly Goals Progress</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {performanceGoals.revenue.percentage}%
              </div>
              <div className="text-sm text-gray-500">Revenue Goal</div>
              <div className="text-xs text-gray-400">
                {formatCurrency(performanceGoals.revenue.current)} /{" "}
                {formatCurrency(performanceGoals.revenue.target)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {performanceGoals.deals.percentage}%
              </div>
              <div className="text-sm text-gray-500">Deals Goal</div>
              <div className="text-xs text-gray-400">
                {performanceGoals.deals.current} /{" "}
                {performanceGoals.deals.target}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {performanceGoals.calls.percentage}%
              </div>
              <div className="text-sm text-gray-500">Calls Goal</div>
              <div className="text-xs text-gray-400">
                {performanceGoals.calls.current} /{" "}
                {performanceGoals.calls.target}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {performanceGoals.meetings.percentage}%
              </div>
              <div className="text-sm text-gray-500">Meetings Goal</div>
              <div className="text-xs text-gray-400">
                {performanceGoals.meetings.current} /{" "}
                {performanceGoals.meetings.target}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Personal Performance Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <SalesChart
            data={salesData}
            title="My Sales Performance"
            showTypeSelector={true}
            readOnly={readOnly}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Deal Pipeline</h3>
          <div className="space-y-3">
            {[
              "lead",
              "contact_made",
              "proposal_sent",
              "negotiation",
              "won",
              "lost",
            ].map((stage) => {
              const stageDeals = filteredDeals.filter(
                (deal) => deal.stage === stage,
              );
              const stageValue = stageDeals.reduce(
                (sum, deal) => sum + getConvertedAmount(deal),
                0,
              );
              return (
                <div
                  key={stage}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded"
                >
                  <div>
                    <div className="font-medium text-sm capitalize">
                      {stage.replace("_", " ")}
                    </div>
                    <div className="text-xs text-gray-500">
                      {stageDeals.length} deals
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm">
                      {formatCurrency(stageValue)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Activity and Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-lg shadow">
          <ActivityFeed
            activities={activities}
            title="My Recent Activities"
            companyId={company?.id}
            users={[]}
          />
        </div>
        <div className="bg-white rounded-lg shadow">
          <UpcomingTasks tasks={upcomingTasks} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <QuickActions userProfile={userProfile} company={company} />
      </div>
    </>
  );

  const renderMyDeals = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">My Deals</h2>
        <Button variant="primary">
          <Icon name="plus" className="w-4 h-4 mr-2" />
          Add Deal
        </Button>
      </div>

      {/* Deal Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDeals.slice(0, 9).map((deal) => (
          <div
            key={deal.id}
            className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{deal.title}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {deal.contact?.first_name} {deal.contact?.last_name}
                </p>
                <p className="text-xs text-gray-500">
                  {deal.contact?.company_name}
                </p>
              </div>
              <span
                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  deal.stage === "won"
                    ? "bg-green-100 text-green-800"
                    : deal.stage === "lost"
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {deal.stage}
              </span>
            </div>

            <div className="mt-4">
              <div className="text-lg font-bold text-green-600">
                {formatCurrency(deal.amount)}
              </div>
            </div>

            <div className="mt-4 flex items-center text-xs text-gray-500">
              <Icon name="calendar" className="w-3 h-3 mr-1" />
              Expected:{" "}
              {new Date(deal.expected_close_date).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {filteredDeals.length === 0 && (
        <div className="text-center py-12">
          <Icon
            name="briefcase"
            className="w-12 h-12 mx-auto text-gray-400 mb-4"
          />
          <h3 className="text-lg font-medium text-gray-900">No deals yet</h3>
          <p className="text-gray-500">
            Start by creating your first deal to track your sales pipeline.
          </p>
        </div>
      )}
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
    <div className="salesman-dashboard">
      {/* Time Filter Dropdowns — hidden when parent controls the filters */}
      {filterMonth === undefined && (
        <div className="flex items-center gap-4 flex-wrap mb-6">
          <label className="text-sm font-medium text-gray-700">
            Filter by:
          </label>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Month:</label>
            <select
              value={selectedMonth !== null ? selectedMonth : ""}
              onChange={(e) => {
                const v =
                  e.target.value === "" ? null : parseInt(e.target.value);
                setSelectedMonth(v);
                if (v !== null) setSelectedQuarter(Math.floor(v / 3));
              }}
              className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px]"
            >
              <option value="">All Months</option>
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Quarter:</label>
            <select
              value={selectedQuarter !== null ? selectedQuarter : ""}
              onChange={(e) => {
                const v =
                  e.target.value === "" ? null : parseInt(e.target.value);
                setSelectedQuarter(v);
                if (
                  v !== null &&
                  selectedMonth !== null &&
                  Math.floor(selectedMonth / 3) !== v
                )
                  setSelectedMonth(null);
              }}
              className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[120px]"
            >
              <option value="">All Quarters</option>
              {quarterOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Year:</label>
            <select
              value={selectedYear !== null ? selectedYear : ""}
              onChange={(e) =>
                setSelectedYear(
                  e.target.value === "" ? null : parseInt(e.target.value),
                )
              }
              className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
            >
              <option value="">All Years</option>
              {yearOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {(selectedMonth !== null ||
            selectedQuarter !== null ||
            selectedYear !== null) && (
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
      )}

      {/* Navigation Tabs */}
      <div className="flex space-x-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveView("overview")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeView === "overview"
              ? "text-orange-600 bg-orange-50 border-b-2 border-orange-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          My Dashboard
        </button>
        <button
          onClick={() => setActiveView("deals")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeView === "deals"
              ? "text-orange-600 bg-orange-50 border-b-2 border-orange-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          My Deals
        </button>
      </div>

      {/* Content */}
      {activeView === "overview" && renderOverview()}
      {activeView === "deals" && renderMyDeals()}
    </div>
  );
};

export default SalesmanDashboard;
