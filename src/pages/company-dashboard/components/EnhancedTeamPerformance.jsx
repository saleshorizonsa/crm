import React, { useState } from "react";
import { useCurrency } from "../../../contexts/CurrencyContext";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";

const EnhancedTeamPerformance = ({
  teamData,
  salesTargets,
  subordinates,
  deals,
  onAssignTarget,
  onViewDetails,
}) => {
  const { formatCurrency } = useCurrency();
  const [sortBy, setSortBy] = useState("totalValue");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterBy, setFilterBy] = useState("all");

  const getEnhancedTeamData = () => {
    console.log("Enhanced team performance - teamData:", teamData);
    console.log("Enhanced team performance - subordinates:", subordinates);
    return (
      teamData?.map((member) => {
        const memberTargets =
          salesTargets?.filter((target) => target.assigned_to === member.id) ||
          [];
        const memberDeals =
          deals?.filter((deal) => deal.owner_id === member.id) || [];
        const wonDeals = memberDeals.filter((deal) => deal.stage === "won");
        const activeDeals = memberDeals.filter(
          (deal) => !["won", "lost"].includes(deal.stage)
        );

        const totalTarget = memberTargets.reduce(
          (sum, target) => sum + parseFloat(target.target_amount || 0),
          0
        );
        const totalProgress = memberTargets.reduce(
          (sum, target) => sum + parseFloat(target.progress_amount || 0),
          0
        );

        const targetAchievement =
          totalTarget > 0 ? (totalProgress / totalTarget) * 100 : 0;
        const activePipelineValue = activeDeals.reduce(
          (sum, deal) => sum + parseFloat(deal.amount || 0),
          0
        );

        // Performance score calculation
        const conversionScore = parseFloat(member.conversionRate || 0);
        const targetScore = Math.min(targetAchievement, 100);
        const activityScore = Math.min((memberDeals.length / 5) * 100, 100); // Normalized to 5 deals = 100%
        const performanceScore =
          conversionScore * 0.4 + targetScore * 0.4 + activityScore * 0.2;

        return {
          ...member,
          totalTarget,
          totalProgress,
          targetAchievement,
          activePipelineValue,
          activeDealsCount: activeDeals.length,
          wonDealsValue: wonDeals.reduce(
            (sum, deal) => sum + parseFloat(deal.amount || 0),
            0
          ),
          performanceScore,
          hasTarget: memberTargets.length > 0,
          status: getPerformanceStatus(performanceScore, targetAchievement),
        };
      }) || []
    );
  };

  const getPerformanceStatus = (score, targetAchievement) => {
    if (score >= 80 && targetAchievement >= 90) return "excellent";
    if (score >= 60 && targetAchievement >= 70) return "good";
    if (score >= 40 && targetAchievement >= 50) return "average";
    return "needs-attention";
  };

  const getStatusConfig = (status) => {
    const configs = {
      excellent: {
        color: "text-green-600",
        bg: "bg-green-100",
        label: "Excellent",
      },
      good: { color: "text-blue-600", bg: "bg-blue-100", label: "Good" },
      average: {
        color: "text-yellow-600",
        bg: "bg-yellow-100",
        label: "Average",
      },
      "needs-attention": {
        color: "text-red-600",
        bg: "bg-red-100",
        label: "Needs Attention",
      },
    };
    return configs[status] || configs["average"];
  };

  const sortedAndFilteredData = () => {
    let data = getEnhancedTeamData();

    // Filter
    if (filterBy !== "all") {
      data = data.filter((member) => {
        switch (filterBy) {
          case "no-targets":
            return !member.hasTarget;
          case "underperforming":
            return member.targetAchievement < 70;
          case "top-performers":
            return member.performanceScore >= 80;
          default:
            return true;
        }
      });
    }

    // Sort
    data.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return data;
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const enhancedData = sortedAndFilteredData();
  console.log("Enhanced data for rendering:", enhancedData);
  console.log("Filter by:", filterBy);
  console.log("Sort by:", sortBy);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-4">
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">All Team Members</option>
            <option value="no-targets">No Targets Assigned</option>
            <option value="underperforming">Under-performing (&lt;70%)</option>
            <option value="top-performers">Top Performers (≥80%)</option>
          </select>
        </div>
        <Button variant="primary" onClick={onAssignTarget}>
          <Icon name="target" className="w-4 h-4 mr-2" />
          Assign Targets
        </Button>
      </div>

      {/* Performance Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["excellent", "good", "average", "needs-attention"].map((status) => {
          const count = enhancedData.filter(
            (member) => member.status === status
          ).length;
          const config = getStatusConfig(status);
          return (
            <div
              key={status}
              className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{config.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                </div>
                <div className={`w-3 h-3 rounded-full ${config.bg}`}></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Team Performance Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Team Performance Dashboard
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Team Member</span>
                    {sortBy === "name" && (
                      <Icon
                        name={
                          sortOrder === "asc" ? "chevron-up" : "chevron-down"
                        }
                        className="w-3 h-3"
                      />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("totalTarget")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Target</span>
                    {sortBy === "totalTarget" && (
                      <Icon
                        name={
                          sortOrder === "asc" ? "chevron-up" : "chevron-down"
                        }
                        className="w-3 h-3"
                      />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("targetAchievement")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Achievement</span>
                    {sortBy === "targetAchievement" && (
                      <Icon
                        name={
                          sortOrder === "asc" ? "chevron-up" : "chevron-down"
                        }
                        className="w-3 h-3"
                      />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("totalValue")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Revenue</span>
                    {sortBy === "totalValue" && (
                      <Icon
                        name={
                          sortOrder === "asc" ? "chevron-up" : "chevron-down"
                        }
                        className="w-3 h-3"
                      />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("conversionRate")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Conversion</span>
                    {sortBy === "conversionRate" && (
                      <Icon
                        name={
                          sortOrder === "asc" ? "chevron-up" : "chevron-down"
                        }
                        className="w-3 h-3"
                      />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pipeline
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {enhancedData.map((member) => {
                const statusConfig = getStatusConfig(member.status);
                return (
                  <tr
                    key={member.id}
                    className={
                      member.isManager ? "bg-blue-50" : "hover:bg-gray-50"
                    }
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8">
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                              member.isManager ? "bg-blue-500" : "bg-gray-400"
                            }`}
                          >
                            {member.name.charAt(0)}
                          </div>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {member.name}
                            {member.isManager && (
                              <span className="ml-2 text-blue-600">(You)</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 capitalize">
                            {member.role}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusConfig.bg} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.hasTarget ? (
                        formatCurrency(member.totalTarget)
                      ) : (
                        <span className="text-gray-400">No target</span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-1">
                          <div
                            className={`text-sm font-medium ${
                              member.targetAchievement >= 100
                                ? "text-green-600"
                                : member.targetAchievement >= 70
                                ? "text-blue-600"
                                : member.targetAchievement >= 40
                                ? "text-yellow-600"
                                : "text-red-600"
                            }`}
                          >
                            {member.hasTarget
                              ? `${member.targetAchievement.toFixed(1)}%`
                              : "N/A"}
                          </div>
                          {member.hasTarget && (
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                              <div
                                className={`h-1.5 rounded-full ${
                                  member.targetAchievement >= 100
                                    ? "bg-green-500"
                                    : member.targetAchievement >= 70
                                    ? "bg-blue-500"
                                    : member.targetAchievement >= 40
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    member.targetAchievement,
                                    100
                                  )}%`,
                                }}
                              ></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(member.totalValue)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-medium ${
                          parseFloat(member.conversionRate) >= 30
                            ? "text-green-600"
                            : parseFloat(member.conversionRate) >= 20
                            ? "text-blue-600"
                            : parseFloat(member.conversionRate) >= 10
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {member.conversionRate}%
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="font-medium">
                          {member.activeDealsCount} active
                        </div>
                        <div className="text-gray-500">
                          {formatCurrency(member.activePipelineValue)}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onViewDetails(member)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View Details
                        </button>
                        {!member.hasTarget && (
                          <button
                            onClick={() => onAssignTarget(member)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Assign Target
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {enhancedData.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No team members match the current filter.
        </div>
      )}
    </div>
  );
};

export default EnhancedTeamPerformance;
