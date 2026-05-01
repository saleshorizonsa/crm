import React, { useState, useMemo } from "react";
import { useCurrency } from "../../../contexts/CurrencyContext";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";

const EnhancedSalesmanPerformance = ({
  teamData,
  salesTargets,
  deals,
  onEditSalesman,
  onCoachSalesman,
  onAssignTarget,
  isLoading,
}) => {
  const { formatCurrency, convertCurrency, preferredCurrency } = useCurrency();

  // Helper to convert deal amount to user's preferred currency
  const getConvertedAmount = (deal) => {
    const amount = parseFloat(deal.amount) || 0;
    const dealCurrency = deal.currency || preferredCurrency;
    if (dealCurrency === preferredCurrency) return amount;
    return convertCurrency(amount, dealCurrency, preferredCurrency);
  };
  const [sortBy, setSortBy] = useState("totalValue");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterBy, setFilterBy] = useState("all");

  const getPerformanceStatus = (targetAchievement, conversionRate) => {
    if (targetAchievement >= 80 && conversionRate >= 20) return "excellent";
    if (targetAchievement >= 60 && conversionRate >= 15) return "good";
    if (targetAchievement >= 40 && conversionRate >= 10) return "average";
    return "needs-attention";
  };

  const enhancedTeamData = useMemo(() => {
    if (!teamData || !Array.isArray(teamData)) return [];

    return teamData.map((member) => {
      // Get member's assigned targets
      const memberTargets =
        salesTargets?.filter((target) => target.assignee_id === member.id) ||
        [];

      // Calculate current target amount (active targets)
      const currentTarget = memberTargets.reduce((sum, target) => {
        const now = new Date();
        const targetStart = new Date(target.period_start);
        const targetEnd = new Date(target.period_end);

        if (now >= targetStart && now <= targetEnd) {
          return sum + (parseFloat(target.target_amount) || 0);
        }
        return sum;
      }, 0);

      // Get member's deals
      const memberDeals =
        deals?.filter((deal) => deal.owner_id === member.id) || [];
      const activeDeals = memberDeals.filter(
        (deal) => !["won", "lost"].includes(deal.stage)
      );
      const pipelineValue = activeDeals.reduce(
        (sum, deal) => sum + getConvertedAmount(deal),
        0
      );

      // Calculate performance metrics
      const targetAchievement =
        currentTarget > 0 ? (member.totalValue / currentTarget) * 100 : 0;
      const avgDealSize =
        member.wonDeals > 0 ? member.totalValue / member.wonDeals : 0;

      // Calculate activity score (deals + conversion rate + target achievement)
      const activityScore =
        (member.dealsCount * 10 +
          parseFloat(member.conversionRate) * 2 +
          Math.min(targetAchievement, 100)) /
        3;

      return {
        ...member,
        currentTarget,
        targetAchievement: targetAchievement.toFixed(1),
        pipelineValue,
        avgDealSize,
        activityScore: activityScore.toFixed(1),
        status: getPerformanceStatus(
          targetAchievement,
          parseFloat(member.conversionRate)
        ),
        activeDealsCount: activeDeals.length,
        assignedTargets: memberTargets.length,
      };
    });
  }, [teamData, salesTargets, deals]);

  const getStatusColor = (status) => {
    switch (status) {
      case "excellent":
        return "text-green-600 bg-green-50";
      case "good":
        return "text-blue-600 bg-blue-50";
      case "average":
        return "text-yellow-600 bg-yellow-50";
      case "needs-attention":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "excellent":
        return "Excellent";
      case "good":
        return "Good";
      case "average":
        return "Average";
      case "needs-attention":
        return "Needs Attention";
      default:
        return "Unknown";
    }
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = enhancedTeamData;

    // Apply filters
    if (filterBy === "high-performers") {
      filtered = filtered.filter(
        (member) => member.status === "excellent" || member.status === "good"
      );
    } else if (filterBy === "needs-attention") {
      filtered = filtered.filter(
        (member) => member.status === "needs-attention"
      );
    } else if (filterBy === "no-targets") {
      filtered = filtered.filter((member) => member.assignedTargets === 0);
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle numeric values
      if (typeof aValue === "string" && !isNaN(parseFloat(aValue))) {
        aValue = parseFloat(aValue);
        bValue = parseFloat(bValue);
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [enhancedTeamData, sortBy, sortOrder, filterBy]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const salesmen = enhancedTeamData.filter((member) => !member.isSupervisor);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Sales Team Performance
          </h3>
          <div className="flex items-center space-x-2">
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
              className="text-sm border border-gray-300 rounded px-3 py-1"
            >
              <option value="all">All Salesmen</option>
              <option value="high-performers">High Performers</option>
              <option value="needs-attention">Needs Attention</option>
              <option value="no-targets">No Targets</option>
            </select>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {salesmen.length}
            </div>
            <div className="text-xs text-gray-500">Total Salesmen</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {
                salesmen.filter(
                  (s) => s.status === "excellent" || s.status === "good"
                ).length
              }
            </div>
            <div className="text-xs text-gray-500">High Performers</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">
              {salesmen.filter((s) => s.status === "needs-attention").length}
            </div>
            <div className="text-xs text-gray-500">Need Attention</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">
              {salesmen.filter((s) => s.assignedTargets === 0).length}
            </div>
            <div className="text-xs text-gray-500">No Targets</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                onClick={() => handleSort("name")}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Salesman</span>
                  <Icon name="chevron-up-down" className="w-3 h-3" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th
                onClick={() => handleSort("totalValue")}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Revenue</span>
                  <Icon name="chevron-up-down" className="w-3 h-3" />
                </div>
              </th>
              <th
                onClick={() => handleSort("targetAchievement")}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Target Progress</span>
                  <Icon name="chevron-up-down" className="w-3 h-3" />
                </div>
              </th>
              <th
                onClick={() => handleSort("conversionRate")}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Conversion</span>
                  <Icon name="chevron-up-down" className="w-3 h-3" />
                </div>
              </th>
              <th
                onClick={() => handleSort("pipelineValue")}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Pipeline</span>
                  <Icon name="chevron-up-down" className="w-3 h-3" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedData
              .filter((member) => !member.isSupervisor)
              .map((member) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-medium text-xs">
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {member.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {member.dealsCount} total deals
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                        member.status
                      )}`}
                    >
                      {getStatusText(member.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(member.totalValue)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.wonDeals} deals won
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm text-gray-900">
                        {member.targetAchievement}%
                      </div>
                      <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            parseFloat(member.targetAchievement) >= 80
                              ? "bg-green-500"
                              : parseFloat(member.targetAchievement) >= 60
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{
                            width: `${Math.min(
                              parseFloat(member.targetAchievement),
                              100
                            )}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Target: {formatCurrency(member.currentTarget)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {member.conversionRate}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.wonDeals}/{member.dealsCount} deals
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(member.pipelineValue)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.activeDealsCount} active deals
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => onEditSalesman && onEditSalesman(member)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          onCoachSalesman && onCoachSalesman(member)
                        }
                        className="text-green-600 hover:text-green-900"
                      >
                        Coach
                      </button>
                      <button
                        onClick={() => onAssignTarget && onAssignTarget(member)}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        Target
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {filteredAndSortedData.filter((member) => !member.isSupervisor).length ===
        0 && (
        <div className="text-center py-12">
          <Icon name="users" className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-sm font-medium text-gray-900">
            No salesmen found
          </h3>
          <p className="text-sm text-gray-500">
            {filterBy === "all"
              ? "Add salesmen to your team to start tracking performance."
              : "No salesmen match the selected filter."}
          </p>
        </div>
      )}
    </div>
  );
};

export default EnhancedSalesmanPerformance;
