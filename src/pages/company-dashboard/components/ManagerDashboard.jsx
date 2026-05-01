import React, { useState, useEffect } from "react";
import MetricsCard from "./MetricsCard";
import SalesChart from "./SalesChart";
import ActivityFeed from "./ActivityFeed";
import QuickActions from "./QuickActions";
import TeamPerformance from "./TeamPerformance";
import UpcomingTasks from "./UpcomingTasks";
import ManagerActionableMetrics from "./ManagerActionableMetrics";
import ManagerPipelineChart from "./ManagerPipelineChart";
import EnhancedTeamPerformance from "./EnhancedTeamPerformance";
import ManagerTargetAssignment from "./ManagerTargetAssignment";
import ManagerSummaryCards from "./ManagerSummaryCards";
import ManagerQuickActions from "./ManagerQuickActions";
import ManagerExecutiveMetrics from "./ManagerExecutiveMetrics";
import ManagerSalesTargetAssignment from "../../../components/ManagerSalesTargetAssignment";
import EnhancedSupervisorDashboard from "./EnhancedSupervisorDashboard";
import SalesmanDashboard from "./SalesmanDashboard";
import EmployeeSelector from "../../../components/ui/EmployeeSelector";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";
import { useAuth } from "../../../contexts/AuthContext";
import { useCurrency } from "../../../contexts/CurrencyContext";
import {
  companyService,
  dealService,
  taskService,
  activityService,
  userService,
  salesTargetService,
} from "../../../services/supabaseService";
import { supabase } from "../../../lib/supabase";

const ManagerDashboard = ({ viewAsUser = null, readOnly = false }) => {
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

  // Data states
  const [metrics, setMetrics] = useState(null);
  const [salesData, setSalesData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [teamData, setTeamData] = useState([]);
  const [subordinates, setSubordinates] = useState([]); // Only supervisors for target assignment
  const [allSubordinates, setAllSubordinates] = useState([]); // All subordinates for calculations
  const [salesTargets, setSalesTargets] = useState([]);
  const [managerTargets, setManagerTargets] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [showTargetAssignment, setShowTargetAssignment] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [clientTargetsData, setClientTargetsData] = useState([]);
  const [contactsMap, setContactsMap] = useState({});

  useEffect(() => {
    if (company?.id && effectiveUserProfile?.id) {
      loadManagerData();
    }
  }, [company, effectiveUserProfile]);

  const loadManagerData = async () => {
    setIsLoading(true);
    console.log("=== LOADING MANAGER DATA ===");
    console.log("Effective User ID:", effectiveUser?.id);
    console.log("Effective User Profile ID:", effectiveUserProfile?.id);
    console.log("Company ID:", company?.id);

    try {
      // Get subordinates (supervisors and salesman under this manager)
      const { data: subordinatesData } = await userService.getUserSubordinates(
        effectiveUser.id,
      );
      console.log("All subordinates data:", subordinatesData);

      // Store all subordinates for calculations
      setAllSubordinates(subordinatesData || []);

      // For managers, only show supervisors in target assignment dropdown (not salesmen)
      const supervisorsOnly =
        subordinatesData?.filter((sub) => sub.role === "supervisor") || [];
      console.log("Supervisors only (for target assignment):", supervisorsOnly);

      setSubordinates(supervisorsOnly);

      // Use ALL subordinates (supervisors + salesmen) for team metrics and data loading
      const allSubordinateIds = subordinatesData?.map((s) => s.id) || [];
      const allUserIds = [effectiveUser.id, ...allSubordinateIds];
      console.log("All team user IDs:", allUserIds);
      console.log("About to call getMyTargets with:", {
        companyId: company.id,
        userId: effectiveUser.id,
      });

      const results = await Promise.allSettled([
        // Get metrics for manager and their team
        companyService.getTeamMetrics(company.id, allUserIds),
        // Get sales data for the team
        companyService.getTeamSalesData(company.id, allUserIds),
        // Get activities for the team
        activityService.getTeamActivities(company.id, allUserIds, 15),
        // Get upcoming tasks for the team
        taskService.getTeamTasks(company.id, allUserIds, { status: "pending" }),
        // Get deals for team performance calculation
        dealService.getTeamDeals(company.id, allUserIds),
        // Get sales targets for ALL team members (to calculate what manager has assigned)
        salesTargetService.getTargetsByAssignees(allUserIds),
        // Get manager's own targets (assigned by director) - use getMyTargets for proper filtering
        salesTargetService.getMyTargets(company.id, effectiveUser.id),
      ]);

      const [
        metricsResult,
        salesResult,
        activitiesResult,
        tasksResult,
        dealsResult,
        salesTargetsResult,
        managerTargetsResult,
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
        const deals = dealsResult.value.data || [];
        setAllDeals(deals);
        const teamPerformance = processTeamPerformance(
          subordinatesData || [],
          deals,
        );
        console.log("Team performance data:", teamPerformance);
        setTeamData(teamPerformance);
      }
      if (salesTargetsResult.status === "fulfilled") {
        console.log("Sales targets for team:", salesTargetsResult.value.data);
        setSalesTargets(salesTargetsResult.value.data || []);

        // Load client targets for by_clients type targets
        const targetIds = (salesTargetsResult.value.data || [])
          .filter((t) => t.target_type === "by_clients")
          .map((t) => t.id);
        if (targetIds.length > 0) {
          const { data: clientTargets } = await supabase
            .from("client_targets")
            .select("*, contact:contacts(*)")
            .in("sales_target_id", targetIds);
          setClientTargetsData(clientTargets || []);
        }
      } else {
        console.error("Sales targets failed:", salesTargetsResult.reason);
      }
      if (managerTargetsResult.status === "fulfilled") {
        console.log("Manager targets data:", managerTargetsResult.value.data);
        setManagerTargets(managerTargetsResult.value.data || []);

        // Load client targets for manager's own targets too
        const managerTargetIds = (managerTargetsResult.value.data || [])
          .filter((t) => t.target_type === "by_clients")
          .map((t) => t.id);
        if (managerTargetIds.length > 0) {
          const { data: myClientTargets } = await supabase
            .from("client_targets")
            .select("*, contact:contacts(*)")
            .in("sales_target_id", managerTargetIds);
          setClientTargetsData((prev) => [...prev, ...(myClientTargets || [])]);
        }
      } else {
        console.error("Manager targets failed:", managerTargetsResult.reason);
      }

      // Load contacts map for deals
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_name")
        .in("owner_id", allUserIds);
      const contactsMapping = {};
      (contacts || []).forEach((c) => {
        contactsMapping[c.id] = c;
      });
      setContactsMap(contactsMapping);
    } catch (error) {
      console.error("Error loading manager data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const processTeamPerformance = (users, deals) => {
    // Create manager user object from auth user and userProfile data
    const managerUser = {
      id: effectiveUser.id, // Use effective user ID (could be viewed user)
      full_name: effectiveUserProfile?.full_name || effectiveUserProfile?.email,
      email: effectiveUserProfile?.email,
      role: effectiveUserProfile?.role || "manager",
    };
    const allUsers = [managerUser, ...users];
    return allUsers
      .map((userItem) => {
        const userDeals = deals.filter((deal) => deal.owner_id === userItem.id);
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
          id: userItem.id,
          name: userItem.full_name || userItem.email,
          full_name: userItem.full_name || userItem.email,
          role: userItem.role,
          isManager: userItem.id === user.id,
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
          subordinateCount: users.filter((u) => u.supervisor_id === userItem.id)
            .length,
        };
      })
      .sort((a, b) => {
        if (a.isManager) return -1;
        if (b.isManager) return 1;
        return b.totalValue - a.totalValue;
      });
  };

  const handleAssignTarget = (member = null) => {
    setSelectedMember(member);
    setShowTargetAssignment(true);
  };

  const handleTargetAssigned = () => {
    // Reload data after target assignment
    loadManagerData();
    setShowTargetAssignment(false);
    setSelectedMember(null);
  };

  const handleViewPerformance = (type) => {
    if (type === "low-performers") {
      setActiveView("team");
      // Could add additional filtering logic here
    } else if (type === "targets") {
      setActiveView("targets");
    }
  };

  const handleViewDetails = (member) => {
    setSelectedMember(member);
    // Could open a detailed performance modal here
    console.log("View details for:", member);
  };

  const renderOverview = () => (
    <div className="space-y-8">
      {/* Manager Executive Metrics - matching Director Dashboard style */}
      <ManagerExecutiveMetrics
        metrics={metrics}
        teamData={teamData}
        salesTargets={salesTargets}
        subordinates={subordinates}
        deals={allDeals}
        onAssignTarget={() => handleAssignTarget()}
        onViewPerformance={handleViewPerformance}
      />

      {/* Pipeline Chart and Action Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ManagerPipelineChart
          teamData={teamData}
          deals={allDeals}
          salesTargets={salesTargets}
          subordinates={subordinates}
        />
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Actions
          </h3>
          <ManagerQuickActions
            subordinates={subordinates}
            salesTargets={salesTargets}
            onAssignTarget={() => handleAssignTarget()}
            onCreateDeal={() => console.log("Create deal clicked")}
            onScheduleMeeting={() => console.log("Schedule meeting clicked")}
            onViewReports={(type) => console.log("View reports clicked:", type)}
          />
        </div>
      </div>

      {/* Sales Chart and Team Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <SalesChart
            data={salesData}
            title="Team Sales Performance"
            showTypeSelector={true}
            readOnly={readOnly}
          />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <TeamPerformance data={teamData} />
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <ActivityFeed
          activities={activities}
          title="Team Activities"
          companyId={company?.id}
          users={allSubordinates}
        />
      </div>
    </div>
  );

  const renderTeamManagement = () => (
    <EnhancedTeamPerformance
      teamData={teamData}
      salesTargets={salesTargets}
      subordinates={subordinates}
      deals={allDeals}
      onAssignTarget={handleAssignTarget}
      onViewDetails={handleViewDetails}
    />
  );

  const renderTargetManagement = () => {
    // Calculate budget info
    const totalAllocatedToMe =
      managerTargets?.reduce(
        (sum, t) => sum + (parseFloat(t.target_amount) || 0),
        0,
      ) || 0;
    const totalAssignedByMe =
      salesTargets?.reduce(
        (sum, t) => sum + (parseFloat(t.target_amount) || 0),
        0,
      ) || 0;
    const availableBudget = Math.max(0, totalAllocatedToMe - totalAssignedByMe);

    // Calculate achievement breakdown by clients
    const getClientBreakdown = (target) => {
      if (target.target_type !== "by_clients") return null;
      const targetClientTargets = clientTargetsData.filter(
        (ct) => ct.sales_target_id === target.id,
      );
      return targetClientTargets.map((ct) => {
        const clientDeals = allDeals.filter(
          (d) => d.contact_id === ct.contact_id && d.stage === "won",
        );
        const achieved = clientDeals.reduce(
          (sum, d) => sum + getConvertedAmount(d),
          0,
        );
        return {
          contact: ct.contact,
          targetAmount: parseFloat(ct.target_amount) || 0,
          achieved,
        };
      });
    };

    // Calculate achievement breakdown by team members
    const getTeamBreakdown = () => {
      return allSubordinates
        .map((member) => {
          const memberTargets = salesTargets.filter(
            (t) => t.assigned_to === member.id,
          );
          const totalTarget = memberTargets.reduce(
            (sum, t) => sum + (parseFloat(t.target_amount) || 0),
            0,
          );
          const memberDeals = allDeals.filter(
            (d) => d.owner_id === member.id && d.stage === "won",
          );
          const achieved = memberDeals.reduce(
            (sum, d) => sum + getConvertedAmount(d),
            0,
          );
          return {
            id: member.id,
            name: member.full_name || member.email,
            role: member.role,
            targetAmount: totalTarget,
            achieved,
            progress: totalTarget > 0 ? (achieved / totalTarget) * 100 : 0,
          };
        })
        .filter((m) => m.targetAmount > 0);
    };

    const teamBreakdown = getTeamBreakdown();
    const totalTeamTarget = teamBreakdown.reduce(
      (sum, m) => sum + m.targetAmount,
      0,
    );
    const totalTeamAchieved = teamBreakdown.reduce(
      (sum, m) => sum + m.achieved,
      0,
    );

    return (
      <div className="space-y-6">
        {/* Enhanced Your Current Targets Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Icon name="Target" size={24} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Your Current Targets
              </h3>
              <p className="text-sm text-gray-500">Assigned by Director</p>
            </div>
          </div>

          {managerTargets.length > 0 ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-600 font-medium">
                    Total Allocated
                  </p>
                  <p className="text-2xl font-bold text-blue-700">
                    {formatCurrency(totalAllocatedToMe)}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-sm text-green-600 font-medium">
                    Assigned to Team
                  </p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(totalAssignedByMe)}
                  </p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-600 font-medium">
                    Available Budget
                  </p>
                  <p className="text-2xl font-bold text-amber-700">
                    {formatCurrency(availableBudget)}
                  </p>
                </div>
              </div>

              {/* Target Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {managerTargets.map((target) => {
                  const progress =
                    parseFloat(target.target_amount) > 0
                      ? (parseFloat(target.progress_amount || 0) /
                          parseFloat(target.target_amount)) *
                        100
                      : 0;
                  const clientBreakdown = getClientBreakdown(target);

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
                          {formatCurrency(target.progress_amount || 0)}
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
                          {target.period_start} to {target.period_end}
                        </div>
                      </div>

                      {/* Client Breakdown for by_clients type */}
                      {clientBreakdown && clientBreakdown.length > 0 && (
                        <div className="border-t border-gray-100 pt-3">
                          <p className="text-xs font-medium text-gray-600 mb-2">
                            Client Breakdown:
                          </p>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {clientBreakdown.map((cb, idx) => {
                              const clientProgress =
                                cb.targetAmount > 0
                                  ? (cb.achieved / cb.targetAmount) * 100
                                  : 0;
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="text-gray-700 truncate flex-1">
                                    {cb.contact?.first_name}{" "}
                                    {cb.contact?.last_name}
                                  </span>
                                  <span className="text-gray-500 mx-2">
                                    {formatCurrency(cb.achieved)} /{" "}
                                    {formatCurrency(cb.targetAmount)}
                                  </span>
                                  <span
                                    className={`font-medium ${
                                      clientProgress >= 100
                                        ? "text-green-600"
                                        : "text-gray-600"
                                    }`}
                                  >
                                    {clientProgress.toFixed(0)}%
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Team Achievement Breakdown */}
              {teamBreakdown.length > 0 && (
                <div className="border-t border-gray-200 pt-6">
                  <h4 className="text-md font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Icon name="Users" size={18} className="text-gray-600" />
                    Team Achievement Breakdown
                  </h4>
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">
                          Total Team Target
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          {formatCurrency(totalTeamTarget)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">
                          Total Team Achieved
                        </p>
                        <p className="text-xl font-bold text-green-600">
                          {formatCurrency(totalTeamAchieved)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${
                            totalTeamTarget > 0 &&
                            totalTeamAchieved / totalTeamTarget >= 1
                              ? "bg-green-500"
                              : "bg-blue-500"
                          }`}
                          style={{
                            width: `${Math.min(
                              totalTeamTarget > 0
                                ? (totalTeamAchieved / totalTeamTarget) * 100
                                : 0,
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-right">
                        {totalTeamTarget > 0
                          ? (
                              (totalTeamAchieved / totalTeamTarget) *
                              100
                            ).toFixed(1)
                          : 0}
                        % Overall Achievement
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {teamBreakdown.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">
                            {member.name}
                          </div>
                          <div className="text-xs text-gray-500 capitalize">
                            {member.role}
                          </div>
                        </div>
                        <div className="text-right mr-4">
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(member.achieved)} /{" "}
                            {formatCurrency(member.targetAmount)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {member.progress.toFixed(1)}% achieved
                          </div>
                        </div>
                        <div className="w-16">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                member.progress >= 100
                                  ? "bg-green-500"
                                  : member.progress >= 70
                                    ? "bg-blue-500"
                                    : member.progress >= 40
                                      ? "bg-amber-500"
                                      : "bg-red-500"
                              }`}
                              style={{
                                width: `${Math.min(member.progress, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
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
            </div>
          )}
        </div>

        {/* Inline Target Assignment Card */}
        {!readOnly && (
          <ManagerSalesTargetAssignment
            onTargetCreated={handleTargetAssigned}
            companyId={company?.id}
            managerTargets={managerTargets}
            existingTeamTargets={salesTargets}
          />
        )}

        {/* Team Targets Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-md font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Icon name="ListChecks" size={18} className="text-gray-600" />
            Team Targets Assigned
          </h3>
          {salesTargets.filter((t) =>
            allSubordinates?.some((s) => s.id === t.assigned_to),
          ).length > 0 ? (
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
                      Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Target Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {salesTargets
                    .filter((t) =>
                      allSubordinates?.some((s) => s.id === t.assigned_to),
                    )
                    .map((target) => {
                      const member = allSubordinates.find(
                        (s) => s.id === target.assigned_to,
                      );
                      const achievement =
                        parseFloat(target.target_amount) > 0
                          ? (parseFloat(target.progress_amount || 0) /
                              parseFloat(target.target_amount)) *
                            100
                          : 0;

                      return (
                        <tr key={target.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {member?.full_name || member?.email}
                            </div>
                            <div className="text-xs text-gray-500 capitalize">
                              {member?.role}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                target.target_type === "by_clients"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {target.target_type === "by_clients"
                                ? "By Clients"
                                : "Total Value"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="capitalize">
                              {target.period_type}
                            </div>
                            <div className="text-xs text-gray-500">
                              {target.period_start} to {target.period_end}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(target.target_amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-1">
                                <div
                                  className={`text-sm font-medium ${
                                    achievement >= 100
                                      ? "text-green-600"
                                      : achievement >= 70
                                        ? "text-blue-600"
                                        : achievement >= 40
                                          ? "text-yellow-600"
                                          : "text-red-600"
                                  }`}
                                >
                                  {formatCurrency(target.progress_amount || 0)}
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                  <div
                                    className={`h-1.5 rounded-full ${
                                      achievement >= 100
                                        ? "bg-green-500"
                                        : achievement >= 70
                                          ? "bg-blue-500"
                                          : achievement >= 40
                                            ? "bg-yellow-500"
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
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No targets assigned to team members yet.
            </div>
          )}
        </div>
      </div>
    );
  };

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
        <div className="text-center mt-4 text-gray-600">Loading ...</div>
      </div>
    );
  }

  return (
    <div className="manager-dashboard">
      {/* View Dashboard As Selector (only shown when not already viewing as someone) */}
      {!viewAsUser && (
        <div className="mb-6">
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
        </div>
      )}

      {/* Subordinate dashboard or own dashboard */}
      {selectedEmployee ? (
        <div key={selectedEmployee.id}>
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
              Overview
            </button>
            <button
              onClick={() => setActiveView("team")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeView === "team"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Team Management
            </button>
            <button
              onClick={() => setActiveView("targets")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeView === "targets"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Sales Targets
            </button>
          </div>

          {/* Content */}
          {activeView === "overview" && renderOverview()}
          {activeView === "team" && renderTeamManagement()}
          {activeView === "targets" && renderTargetManagement()}
        </>
      )}
    </div>
  );
};

export default ManagerDashboard;
