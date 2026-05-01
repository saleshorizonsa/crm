import React, { useState, useEffect } from "react";
import MetricsCard from "./MetricsCard";
import SalesChart from "./SalesChart";
import ActivityFeed from "./ActivityFeed";
import TeamPerformance from "./TeamPerformance";
import UpcomingTasks from "./UpcomingTasks";
import SupervisorSalesTargetAssignment from "../../../components/SupervisorSalesTargetAssignment";
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

const SupervisorDashboard = ({ viewAsUser = null, readOnly = false }) => {
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
  const [deals, setDeals] = useState([]);
  const [salesmen, setSalesmen] = useState([]); // Salesmen under this supervisor
  const [supervisorTargets, setSupervisorTargets] = useState([]); // Targets assigned to supervisor by manager
  const [salesTargets, setSalesTargets] = useState([]); // Targets assigned by supervisor to salesmen
  const [showTargetAssignment, setShowTargetAssignment] = useState(false);
  const [clientTargetsData, setClientTargetsData] = useState([]);
  const [contactsMap, setContactsMap] = useState({});

  useEffect(() => {
    if (company?.id && effectiveUserProfile?.id) {
      loadSupervisorData();
    }
  }, [company, effectiveUserProfile]);

  const loadSupervisorData = async () => {
    setIsLoading(true);
    console.log("=== LOADING SUPERVISOR DATA ===");
    console.log("Effective User ID:", effectiveUser?.id);
    console.log("Effective User Profile ID:", effectiveUserProfile?.id);
    console.log("User Profile Email:", userProfile?.email);
    console.log("Company ID:", company?.id);

    try {
      // Get salesmen under this supervisor
      const { data: salesmenData } = await userService.getUserSubordinates(
        effectiveUser.id
      );
      console.log("Salesmen under supervisor:", salesmenData);

      // Filter to only salesmen
      const salesmenOnly =
        salesmenData?.filter((emp) => emp.role === "salesman") || [];
      setSalesmen(salesmenOnly);

      const salesmanIds = salesmenOnly.map((s) => s.id);
      const allUserIds = [effectiveUser.id, ...salesmanIds];
      console.log("All team user IDs:", allUserIds);

      const results = await Promise.allSettled([
        // Get metrics for supervisor and their salesmen
        companyService.getTeamMetrics(company.id, allUserIds),
        // Get sales data for the team
        companyService.getTeamSalesData(company.id, allUserIds),
        // Get activities for the team
        activityService.getTeamActivities(company.id, allUserIds, 10),
        // Get upcoming tasks for the team
        taskService.getTeamTasks(company.id, allUserIds, { status: "pending" }),
        // Get deals for performance calculation
        dealService.getTeamDeals(company.id, allUserIds),
        // Get supervisor's allocated targets (assigned by manager)
        salesTargetService.getMyTargets(company.id, effectiveUser.id),
        // Get targets assigned by supervisor to salesmen
        salesTargetService.getTargetsByAssignees(salesmanIds),
      ]);

      const [
        metricsResult,
        salesResult,
        activitiesResult,
        tasksResult,
        dealsResult,
        supervisorTargetsResult,
        salesTargetsResult,
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
        const dealsData = dealsResult.value.data || [];
        setDeals(dealsData);
        const teamPerformance = processTeamPerformance(salesmenOnly, dealsData);
        setTeamData(teamPerformance);
      }
      if (supervisorTargetsResult.status === "fulfilled") {
        console.log(
          "Supervisor Targets (assigned by manager):",
          supervisorTargetsResult.value.data
        );
        console.log(
          "Supervisor Targets length:",
          supervisorTargetsResult.value.data?.length
        );
        setSupervisorTargets(supervisorTargetsResult.value.data || []);
        
        // Load client targets for supervisor's own targets
        const supervisorTargetIds = (supervisorTargetsResult.value.data || [])
          .filter(t => t.target_type === "by_clients")
          .map(t => t.id);
        if (supervisorTargetIds.length > 0) {
          const { data: myClientTargets } = await supabase
            .from("client_targets")
            .select("*, contact:contacts(*)")
            .in("sales_target_id", supervisorTargetIds);
          setClientTargetsData(myClientTargets || []);
        }
      } else {
        console.error(
          "Failed to fetch supervisor targets:",
          supervisorTargetsResult.reason
        );
        setSupervisorTargets([]);
      }
      if (salesTargetsResult.status === "fulfilled") {
        console.log(
          "Sales Targets (assigned to salesmen):",
          salesTargetsResult.value.data
        );
        setSalesTargets(salesTargetsResult.value.data || []);
        
        // Load client targets for salesmen targets
        const salesmenTargetIds = (salesTargetsResult.value.data || [])
          .filter(t => t.target_type === "by_clients")
          .map(t => t.id);
        if (salesmenTargetIds.length > 0) {
          const { data: salesmenClientTargets } = await supabase
            .from("client_targets")
            .select("*, contact:contacts(*)")
            .in("sales_target_id", salesmenTargetIds);
          setClientTargetsData(prev => [...prev, ...(salesmenClientTargets || [])]);
        }
      }
      
      // Load contacts map for deals
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_name")
        .in("owner_id", allUserIds);
      const contactsMapping = {};
      (contacts || []).forEach(c => {
        contactsMapping[c.id] = c;
      });
      setContactsMap(contactsMapping);
    } catch (error) {
      console.error("Error loading supervisor data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const processTeamPerformance = (users, deals) => {
    const allUsers = [effectiveUserProfile, ...users];
    return allUsers
      .map((emp) => {
        const userDeals = deals.filter((deal) => deal.owner_id === emp.id);
        const wonDeals = userDeals.filter((deal) => deal.stage === "won");
        const lostDeals = userDeals.filter((deal) => deal.stage === "lost");
        const activeDeals = userDeals.filter(
          (deal) => !["won", "lost"].includes(deal.stage)
        );
        const totalValue = wonDeals.reduce(
          (sum, deal) => sum + getConvertedAmount(deal),
          0
        );

        return {
          id: emp.id,
          name: emp.full_name || emp.email,
          full_name: emp.full_name || emp.email,
          role: emp.role,
          isSupervisor: emp.id === effectiveUserProfile.id,
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
      })
      .sort((a, b) => {
        if (a.isSupervisor) return -1;
        if (b.isSupervisor) return 1;
        return b.totalValue - a.totalValue;
      });
  };

  const calculateAvailableBudget = () => {
    console.log(
      "🎯 calculateAvailableBudget - supervisorTargets:",
      supervisorTargets
    );
    console.log("🎯 calculateAvailableBudget - salesTargets:", salesTargets);

    const totalAllocated =
      supervisorTargets?.reduce(
        (sum, target) => sum + (parseFloat(target.target_amount) || 0),
        0
      ) || 0;
    const totalAssigned =
      salesTargets?.reduce(
        (sum, target) => sum + (parseFloat(target.target_amount) || 0),
        0
      ) || 0;

    console.log("🎯 Total Allocated:", totalAllocated);
    console.log("🎯 Total Assigned:", totalAssigned);

    const available = Math.max(0, totalAllocated - totalAssigned);
    console.log("🎯 Available Budget:", available);

    return available;
  };

  const handleAssignTargets = () => {
    setShowTargetAssignment(true);
  };

  const handleTargetAssigned = () => {
    loadSupervisorData(); // Reload data after assignment
  };

  const renderOverview = () => (
    <>
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricsCard
          title="Team Revenue"
          value={formatCurrency(
            teamData.reduce((sum, member) => sum + (member.totalValue || 0), 0)
          )}
          change="+12.5%"
          trend="up"
          icon="💰"
        />
        <MetricsCard
          title="My Salesmen"
          value={salesmen.length}
          change={salesmen.length > 0 ? "Active" : "Add salesmen"}
          trend={salesmen.length > 0 ? "up" : "neutral"}
          icon="👥"
        />
        <MetricsCard
          title="Available Budget"
          value={formatCurrency(calculateAvailableBudget())}
          change={
            calculateAvailableBudget() > 0 ? "Ready to assign" : "No budget"
          }
          trend={calculateAvailableBudget() > 0 ? "up" : "down"}
          icon="🎯"
        />
        <MetricsCard
          title="Active Tasks"
          value={upcomingTasks.length}
          change="-2.1%"
          trend="down"
          icon="📋"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <SalesChart
            data={salesData}
            title="Team Performance"
            showTypeSelector={true}
            readOnly={readOnly}
          />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Salesman Performance
          </h3>
          <div className="space-y-3">
            {teamData
              .filter((member) => !member.isSupervisor)
              .slice(0, 5)
              .map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-sm text-gray-900">
                      {member.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.dealsCount} deals
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm text-gray-900">
                      {formatCurrency(member.totalValue)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.conversionRate}% conversion
                    </div>
                  </div>
                </div>
              ))}
          </div>
          {teamData.filter((m) => !m.isSupervisor).length === 0 && (
            <div className="text-center py-8">
              <Icon
                name="users"
                className="w-12 h-12 text-gray-400 mx-auto mb-4"
              />
              <p className="text-sm text-gray-500">No salesmen added yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Activity and Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <ActivityFeed
            activities={activities}
            title="Team Activities"
            companyId={company?.id}
            users={salesmen}
          />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <UpcomingTasks tasks={upcomingTasks} />
        </div>
      </div>
    </>
  );

  const renderTeamManagement = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">My Sales Team</h2>
        <Button
          variant="primary"
          onClick={handleAssignTargets}
          disabled={calculateAvailableBudget() <= 0 || salesmen.length === 0}
        >
          <Icon name="target" className="w-4 h-4 mr-2" />
          Assign Targets
        </Button>
      </div>

      {/* Team Performance Table */}
      <TeamPerformance
        teamData={teamData}
        isLoading={isLoading}
        userProfile={userProfile}
      />
    </div>
  );

  const renderSalesTargets = () => {
    // Calculate budget info
    const totalAllocatedToMe = supervisorTargets?.reduce(
      (sum, t) => sum + (parseFloat(t.target_amount) || 0),
      0
    ) || 0;
    const totalAssignedByMe = salesTargets?.reduce(
      (sum, t) => sum + (parseFloat(t.target_amount) || 0),
      0
    ) || 0;
    const availableBudget = calculateAvailableBudget();

    // Calculate achievement breakdown by clients for a target
    const getClientBreakdown = (target) => {
      if (target.target_type !== "by_clients") return null;
      const targetClientTargets = clientTargetsData.filter(
        ct => ct.sales_target_id === target.id
      );
      return targetClientTargets.map(ct => {
        const clientDeals = deals.filter(
          d => d.contact_id === ct.contact_id && d.stage === "won"
        );
        const achieved = clientDeals.reduce((sum, d) => sum + getConvertedAmount(d), 0);
        return {
          contact: ct.contact,
          targetAmount: parseFloat(ct.target_amount) || 0,
          achieved,
        };
      });
    };

    // Calculate achievement breakdown by team members (salesmen)
    const getTeamBreakdown = () => {
      return salesmen.map(member => {
        const memberTargets = salesTargets.filter(t => t.assigned_to === member.id);
        const totalTarget = memberTargets.reduce(
          (sum, t) => sum + (parseFloat(t.target_amount) || 0),
          0
        );
        const memberDeals = deals.filter(d => d.owner_id === member.id && d.stage === "won");
        const achieved = memberDeals.reduce((sum, d) => sum + getConvertedAmount(d), 0);
        return {
          id: member.id,
          name: member.full_name || member.email,
          role: member.role,
          targetAmount: totalTarget,
          achieved,
          progress: totalTarget > 0 ? (achieved / totalTarget) * 100 : 0,
        };
      }).filter(m => m.targetAmount > 0);
    };

    const teamBreakdown = getTeamBreakdown();
    const totalTeamTarget = teamBreakdown.reduce((sum, m) => sum + m.targetAmount, 0);
    const totalTeamAchieved = teamBreakdown.reduce((sum, m) => sum + m.achieved, 0);

    return (
      <div className="space-y-6">
        {/* Enhanced Your Current Targets Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-100 rounded-lg">
              <Icon name="Target" size={24} className="text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Your Current Targets
              </h3>
              <p className="text-sm text-gray-500">Assigned by Manager</p>
            </div>
          </div>

          {supervisorTargets.length > 0 ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-sm text-green-600 font-medium">Total Allocated</p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(totalAllocatedToMe)}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-600 font-medium">Assigned to Salesmen</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {formatCurrency(totalAssignedByMe)}
                  </p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-600 font-medium">Available Budget</p>
                  <p className="text-2xl font-bold text-amber-700">
                    {formatCurrency(availableBudget)}
                  </p>
                </div>
              </div>

              {/* Target Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {supervisorTargets.map((target) => {
                  const progress = parseFloat(target.target_amount) > 0
                    ? (parseFloat(target.progress_amount || 0) / parseFloat(target.target_amount)) * 100
                    : 0;
                  const clientBreakdown = getClientBreakdown(target);

                  return (
                    <div key={target.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {target.period_type} Target
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          target.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                          {target.status}
                        </span>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="text-2xl font-bold text-gray-900">
                          {formatCurrency(target.target_amount)}
                        </div>
                        <div className="text-sm text-gray-600">
                          Progress: {formatCurrency(target.progress_amount || 0)}
                          <span className="ml-2 text-xs">
                            ({progress.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              progress >= 100 ? "bg-green-500" :
                              progress >= 70 ? "bg-blue-500" :
                              progress >= 40 ? "bg-amber-500" : "bg-red-500"
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
                              const clientProgress = cb.targetAmount > 0
                                ? (cb.achieved / cb.targetAmount) * 100
                                : 0;
                              return (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-700 truncate flex-1">
                                    {cb.contact?.first_name} {cb.contact?.last_name}
                                  </span>
                                  <span className="text-gray-500 mx-2">
                                    {formatCurrency(cb.achieved)} / {formatCurrency(cb.targetAmount)}
                                  </span>
                                  <span className={`font-medium ${
                                    clientProgress >= 100 ? "text-green-600" : "text-gray-600"
                                  }`}>
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
                        <p className="text-sm text-gray-500">Total Team Target</p>
                        <p className="text-xl font-bold text-gray-900">
                          {formatCurrency(totalTeamTarget)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Total Team Achieved</p>
                        <p className="text-xl font-bold text-green-600">
                          {formatCurrency(totalTeamAchieved)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${
                            totalTeamTarget > 0 && (totalTeamAchieved / totalTeamTarget) >= 1
                              ? "bg-green-500"
                              : "bg-green-500"
                          }`}
                          style={{
                            width: `${Math.min(
                              totalTeamTarget > 0 ? (totalTeamAchieved / totalTeamTarget) * 100 : 0,
                              100
                            )}%`
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-right">
                        {totalTeamTarget > 0
                          ? ((totalTeamAchieved / totalTeamTarget) * 100).toFixed(1)
                          : 0}% Overall Achievement
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
                            {formatCurrency(member.achieved)} / {formatCurrency(member.targetAmount)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {member.progress.toFixed(1)}% achieved
                          </div>
                        </div>
                        <div className="w-16">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                member.progress >= 100 ? "bg-green-500" :
                                member.progress >= 70 ? "bg-blue-500" :
                                member.progress >= 40 ? "bg-amber-500" : "bg-red-500"
                              }`}
                              style={{ width: `${Math.min(member.progress, 100)}%` }}
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
              <Icon name="Target" size={48} className="mx-auto text-gray-300 mb-4" />
              <p>No targets assigned by manager yet.</p>
            </div>
          )}
        </div>

        {/* Inline Target Assignment Card */}
        {!readOnly && (
          <SupervisorSalesTargetAssignment
            onTargetCreated={handleTargetAssigned}
            companyId={company?.id}
            supervisorTargets={supervisorTargets}
            existingTeamTargets={salesTargets}
          />
        )}

        {/* Target Assignment Status Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Icon name="ListChecks" size={18} className="text-gray-600" />
            Salesmen Targets Assigned
          </h3>

          {salesTargets && salesTargets.length > 0 ? (
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {salesTargets.map((target) => {
                    const salesman = salesmen.find(
                      (s) => s.id === target.assigned_to
                    );
                    const salesmanPerformance = teamData.find(
                      (t) => t.id === target.assigned_to
                    );
                    const progress =
                      target.target_amount > 0
                        ? ((salesmanPerformance?.totalValue || 0) /
                            target.target_amount) *
                          100
                        : 0;

                    return (
                      <tr key={target.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">
                            {salesman?.full_name || salesman?.email || "Unknown"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            target.target_type === "by_clients"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}>
                            {target.target_type === "by_clients" ? "By Clients" : "Total Value"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="capitalize">{target.period_type}</div>
                          <div className="text-xs">
                            {target.period_start} to {target.period_end}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(target.target_amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {formatCurrency(salesmanPerformance?.totalValue || 0)}
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                <div
                                  className={`h-1.5 rounded-full ${
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
                              <div className="text-xs text-gray-500 mt-1">
                                {progress.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            target.status === "active"
                              ? "bg-green-100 text-green-800"
                              : target.status === "completed"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}>
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
            <div className="text-center py-12">
              <Icon
                name="target"
                className="w-12 h-12 text-gray-400 mx-auto mb-4"
              />
              <h3 className="text-sm font-medium text-gray-900">
                No targets assigned
              </h3>
              <p className="text-sm text-gray-500">
                Use the form above to assign targets to your salesmen.
              </p>
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
      </div>
    );
  }

  return (
    <div className="supervisor-dashboard">
      {/* Navigation Tabs */}
      <div className="flex space-x-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveView("overview")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeView === "overview"
              ? "text-green-600 bg-green-50 border-b-2 border-green-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Icon name="home" className="w-4 h-4 mr-2 inline" />
          Overview
        </button>
        <button
          onClick={() => setActiveView("team")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeView === "team"
              ? "text-green-600 bg-green-50 border-b-2 border-green-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Icon name="users" className="w-4 h-4 mr-2 inline" />
          Team Management
        </button>
        <button
          onClick={() => setActiveView("targets")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeView === "targets"
              ? "text-green-600 bg-green-50 border-b-2 border-green-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Icon name="target" className="w-4 h-4 mr-2 inline" />
          Sales Targets
        </button>
      </div>

      {/* Content */}
      {activeView === "overview" && renderOverview()}
      {activeView === "team" && renderTeamManagement()}
      {activeView === "targets" && renderSalesTargets()}
    </div>
  );
};

export default SupervisorDashboard;
