import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import ProductTargetReport from "../../../components/ProductTargetReport";
import {
  salesTargetService,
  userService,
  dealService,
} from "../../../services/supabaseService";
import { useAuth } from "../../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";
import { Edit, Edit2 } from "lucide-react";
import { capitalize } from "utils/helper";
import {
  formatLocalYearMonth,
  yearMonthFromDateString,
} from "utils/dateFormat";
import { aggregateProductPerformance } from "../../../utils/productTargetUtils";

const SalesTarget = ({ userRole, currentUserId, companyId: propCompanyId }) => {
  const { company: authCompany } = useAuth();
  const company = propCompanyId ? { id: propCompanyId } : authCompany;
  const [targets, setTargets] = useState([]);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [productTargetsData, setProductTargetsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("all"); // Default to "all" instead of current month
  const [selectedCompany, setSelectedCompany] = useState("all"); // Default to all companies
  const [targetGridView, setTargetGridView] = useState("value");
  const [editingTarget, setEditingTarget] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedCompany, userRole, currentUserId, company?.id]);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");

      if (error) throw error;
      console.log("🏢 Loaded companies:", data?.length);
      setCompanies(data || []);
    } catch (error) {
      console.error("❌ Error loading companies:", error);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      console.log("🎯 Loading sales targets");
      console.log("🎯 Selected month:", selectedMonth);
      console.log("🎯 Selected company:", selectedCompany);
      console.log("🎯 User role:", userRole);
      console.log("🎯 Current user ID:", currentUserId);

      // Load all targets (optionally filtered by company)
      const companyFilter = selectedCompany !== "all" ? selectedCompany : null;

      // For supervisors/managers, load only their subordinates' targets
      let targetsData;
      if (userRole === "supervisor" || userRole === "manager") {
        const { data, error } = await salesTargetService.getAssignedTargets(
          company?.id
        );
        if (error) throw error;
        // Filter to only targets assigned BY this user
        targetsData =
          data?.filter((t) => t.assigned_by === currentUserId) || [];
      } else {
        const { data, error } = await salesTargetService.getTeamTargets(
          companyFilter
        );
        if (error) throw error;
        targetsData = data;
      }

      console.log("📊 All targets loaded:", targetsData?.length, targetsData);

      // Calculate progress dynamically from deals for ALL viewer roles.
      // The DB column `progress_amount` is not auto-updated when deals close,
      // so we derive it on the client. For targets assigned to a manager or
      // supervisor we include their subordinates' won deals too.
      let dealsForProgress = [];
      if (targetsData && targetsData.length > 0) {
        const { data: deals } = await dealService.getDeals(
          company?.id,
          { viewAll: true },
          currentUserId
        );
        dealsForProgress = deals || [];

        if (deals) {
          // Build a subordinates map for any assignee whose own role can have
          // subordinates (manager / supervisor / head). Salesmen get an empty list.
          const assigneeSubordinatesMap = {};
          for (const target of targetsData) {
            const assigneeId = target.assigned_to;
            if (assigneeId && !(assigneeId in assigneeSubordinatesMap)) {
              const assigneeRole = target.assignee?.role;
              if (
                assigneeRole === "manager" ||
                assigneeRole === "supervisor" ||
                assigneeRole === "head"
              ) {
                const { data: subordinates } =
                  await userService.getUserSubordinates(assigneeId);
                assigneeSubordinatesMap[assigneeId] =
                  subordinates?.map((s) => s.id) || [];
              } else {
                assigneeSubordinatesMap[assigneeId] = [];
              }
            }
          }

          targetsData = targetsData.map((target) => {
            const periodStart = new Date(target.period_start);
            const periodEnd = new Date(target.period_end);
            periodEnd.setHours(23, 59, 59, 999);

            const isInPeriod = (deal) => {
              const dateStr =
                deal.expected_close_date ||
                deal.updated_at ||
                deal.created_at;
              if (!dateStr) return false;
              const d = new Date(dateStr);
              return d >= periodStart && d <= periodEnd;
            };

            // Assignee's own won deals within the target period
            const ownProgress = deals
              .filter(
                (d) =>
                  d.owner_id === target.assigned_to &&
                  d.stage === "won" &&
                  isInPeriod(d)
              )
              .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

            // Subordinates' won deals within the target period
            const subordinateIds =
              assigneeSubordinatesMap[target.assigned_to] || [];
            const subordinatesProgress =
              subordinateIds.length > 0
                ? deals
                    .filter(
                      (d) =>
                        subordinateIds.includes(d.owner_id) &&
                        d.stage === "won" &&
                        isInPeriod(d)
                    )
                    .reduce(
                      (sum, d) => sum + (parseFloat(d.amount) || 0),
                      0
                    )
                : 0;

            const totalProgress = ownProgress + subordinatesProgress;

            return {
              ...target,
              progress_amount: totalProgress,
              calculated_progress: totalProgress,
              own_revenue: ownProgress,
              subordinates_revenue: subordinatesProgress,
            };
          });
        }
      }

      // Filter by selected month (if not "all")
      let filtered = targetsData || [];
      if (selectedMonth !== "all") {
        filtered = filtered.filter((target) => {
          const targetMonth = yearMonthFromDateString(target.period_start);
          console.log(
            "  Target period_start:",
            target.period_start,
            "-> targetMonth:",
            targetMonth,
            "selectedMonth:",
            selectedMonth,
            "match:",
            targetMonth === selectedMonth
          );
          return targetMonth === selectedMonth;
        });
      }

      console.log("✅ Filtered targets:", filtered.length, filtered);
      setTargets(filtered);

      const productTargetIds =
        filtered
          ?.filter((target) => target.target_type === "by_products")
          .map((target) => target.id) || [];

      if (productTargetIds.length > 0) {
        const { data: productTargets } =
          await salesTargetService.getProductTargetsBySalesTargetIds(
            productTargetIds,
          );
        const targetsById = new Map(filtered.map((target) => [target.id, target]));
        const productTargetsWithProgress =
          salesTargetService.calculateProductTargetProgress(
            productTargets || [],
            dealsForProgress,
          ).map((productTarget) => {
            const parentTarget =
              targetsById.get(productTarget.sales_target_id) ||
              productTarget.sales_target ||
              {};

            return {
              ...productTarget,
              assignee: parentTarget.assignee,
              company: parentTarget.company,
              currency: parentTarget.currency,
              period_start: parentTarget.period_start,
              period_end: parentTarget.period_end,
              sales_target: {
                ...productTarget.sales_target,
                ...parentTarget,
              },
            };
          });
        setProductTargetsData(productTargetsWithProgress);
      } else {
        setProductTargetsData([]);
      }
    } catch (error) {
      console.error("❌ Error loading sales targets:", error);
      alert("Failed to load sales targets: " + (error.message || error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditTarget = (target) => {
    setEditingTarget({
      id: target.id,
      assigned_to: target.assigned_to,
      target_amount: target.target_amount,
      currency: target.currency,
      notes: target.notes || "",
    });
    setShowEditModal(true);
  };

  const handleSaveTarget = async () => {
    try {
      console.log("💾 Saving target:", editingTarget);

      const { data, error } = await salesTargetService.updateTarget(
        editingTarget.id,
        {
          targetAmount: parseFloat(editingTarget.target_amount),
          currency: editingTarget.currency,
          notes: editingTarget.notes,
        }
      );

      console.log("💾 Update response:", { data, error });

      if (error) throw error;

      setShowEditModal(false);
      setEditingTarget(null);
      loadData();
    } catch (error) {
      console.error("❌ Error updating target:", error);
      alert("Failed to update target: " + (error.message || error));
    }
  };

  const handleDeleteTarget = async () => {
    if (!editingTarget?.id) return;

    if (
      !window.confirm(
        "Are you sure you want to delete this sales target? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      console.log("🗑️ Deleting target:", editingTarget.id);

      const { error } = await salesTargetService.deleteTarget(editingTarget.id);

      if (error) throw error;

      console.log("✅ Target deleted successfully");
      setShowEditModal(false);
      setEditingTarget(null);
      loadData();
    } catch (error) {
      console.error("❌ Error deleting target:", error);
      alert("Failed to delete target: " + (error.message || error));
    }
  };

  const getProgressPercentage = (target) => {
    if (!target.target_amount || target.target_amount === 0) return 0;
    return Math.min(
      100,
      (parseFloat(target.progress_amount || 0) /
        parseFloat(target.target_amount)) *
        100
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 border-green-200";
      case "completed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "overdue":
        return "bg-red-100 text-red-800 border-red-200";
      case "cancelled":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const companyProductPerformance = aggregateProductPerformance(productTargetsData);
  const quantityTargetRows = productTargetsData.filter(
    (target) => parseFloat(target.target_quantity || 0) > 0,
  );
  const aggregatedQuantityRows = Object.values(
    quantityTargetRows.reduce((rowsByUserPeriod, productTarget) => {
      const parentTarget = productTarget.sales_target || {};
      const assignee = productTarget.assignee || parentTarget.assignee || {};
      const companyData = productTarget.company || parentTarget.company || {};
      const key = [
        parentTarget.assigned_to || assignee.id || "unknown-user",
        parentTarget.period_start || "unknown-start",
        parentTarget.period_end || "unknown-end",
      ].join("|");

      if (!rowsByUserPeriod[key]) {
        rowsByUserPeriod[key] = {
          id: key,
          assignee,
          company: companyData,
          role: assignee.role,
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
  );

  // Generate month options (current month and next 11 months)
  const monthOptions = [
    { value: "all", label: "All Months" },
    ...Array.from({ length: 12 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() + i - 6); // 6 months back to 5 months forward
      const value = formatLocalYearMonth(date);
      const label = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      });
      return { value, label };
    }),
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with Month Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-card-foreground">
            Sales Targets
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage sales targets for all users
          </p>
        </div>
        <div className="flex gap-3">
          <div className="w-56">
            <Select
              label="Company"
              options={[
                { value: "all", label: "All Companies" },
                ...companies.map((c) => ({ value: c.id, label: c.name })),
              ]}
              value={selectedCompany}
              onChange={(value) => setSelectedCompany(value)}
            />
          </div>
          <div className="w-56">
            <Select
              label="Month"
              options={monthOptions}
              value={selectedMonth}
              onChange={(value) => setSelectedMonth(value)}
            />
          </div>
        </div>
      </div>

      <ProductTargetReport
        title="Product-wise Revenue Contribution and Target Achievement"
        productTargets={companyProductPerformance}
        formatCurrency={(amount) =>
          `${targets[0]?.currency || ""} ${Number(amount || 0).toLocaleString()}`
        }
      />

      {/* Targets Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-card-foreground">
            User-wise Sales Target Progress
          </h3>
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setTargetGridView("value")}
              className={`px-3 py-1.5 text-sm font-medium ${
                targetGridView === "value"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted/40"
              }`}
            >
              Value
            </button>
            <button
              type="button"
              onClick={() => setTargetGridView("quantity")}
              className={`px-3 py-1.5 text-sm font-medium ${
                targetGridView === "quantity"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted/40"
              }`}
            >
              Quantity
            </button>
          </div>
        </div>
        <table className="w-full">
          <thead className="bg-muted/30 border-b border-border">
            {targetGridView === "value" ? (
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Target Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Period
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            ) : (
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Target Qty
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Period
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-border">
            {targetGridView === "value" && targets.length === 0 ? (
              <tr>
                <td
                  colSpan="8"
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  <Icon
                    name="Target"
                    size={48}
                    className="mx-auto mb-2 opacity-20"
                  />
                  <p>
                    {selectedMonth === "all"
                      ? "No sales targets found"
                      : `No sales targets found for ${new Date(
                          selectedMonth + "-01"
                        ).toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        })}`}
                  </p>
                </td>
              </tr>
            ) : targetGridView === "quantity" &&
              aggregatedQuantityRows.length === 0 ? (
              <tr>
                <td
                  colSpan="8"
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  <Icon
                    name="Package"
                    size={48}
                    className="mx-auto mb-2 opacity-20"
                  />
                  <p>
                    {selectedMonth === "all"
                      ? "No quantity-based product targets found"
                      : `No quantity-based product targets found for ${new Date(
                          selectedMonth + "-01"
                        ).toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        })}`}
                  </p>
                </td>
              </tr>
            ) : targetGridView === "value" ? (
              targets.map((target) => {
                const percentage = getProgressPercentage(target);
                return (
                  <tr key={target.id} className="hover:bg-muted/20">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Icon
                            name="User"
                            size={16}
                            className="text-primary"
                          />
                        </div>
                        <div>
                          <div className="font-medium text-card-foreground">
                            {target.assignee?.full_name || "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {target.assignee?.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-card-foreground">
                        {target.company?.name || "Unknown"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                        {target.assignee?.role &&
                          capitalize(target.assignee.role)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-card-foreground">
                        {target.currency}{" "}
                        {parseFloat(target.target_amount).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {target.currency}{" "}
                            {parseFloat(
                              target.progress_amount || 0
                            ).toLocaleString()}
                          </span>
                          <span className="font-semibold text-card-foreground">
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              percentage >= 100
                                ? "bg-green-500"
                                : percentage >= 75
                                ? "bg-blue-500"
                                : percentage >= 50
                                ? "bg-yellow-500"
                                : "bg-orange-500"
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        {/* Show breakdown for supervisors if they have subordinates' revenue */}
                        {target.subordinates_revenue > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            <span className="text-gray-500">
                              Own: {target.currency}{" "}
                              {parseFloat(
                                target.own_revenue || 0
                              ).toLocaleString()}
                            </span>
                            <span className="mx-1">|</span>
                            <span className="text-blue-600">
                              Team: {target.currency}{" "}
                              {parseFloat(
                                target.subordinates_revenue || 0
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                          target.status
                        )}`}
                      >
                        {target.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-muted-foreground">
                        {new Date(target.period_start).toLocaleDateString()} -{" "}
                        {new Date(target.period_end).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditTarget(target)}
                      >
                        <Icon name="Edit" size={16} />
                        <Edit2 size={16} />
                      </Button>
                    </td>
                  </tr>
                );
              })
            ) : (
              aggregatedQuantityRows.map((quantityRow) => {
                const targetQuantity = quantityRow.target_quantity;
                const achievedQuantity = quantityRow.achieved_quantity;
                const percentage =
                  targetQuantity > 0
                    ? Math.min(100, (achievedQuantity / targetQuantity) * 100)
                    : 0;

                return (
                  <tr key={quantityRow.id} className="hover:bg-muted/20">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Icon
                            name="User"
                            size={16}
                            className="text-primary"
                          />
                        </div>
                        <div>
                          <div className="font-medium text-card-foreground">
                            {quantityRow.assignee.full_name || "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {quantityRow.assignee.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-card-foreground">
                        {quantityRow.company.name || "Unknown"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                        {quantityRow.role && capitalize(quantityRow.role)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-card-foreground">
                        {targetQuantity.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {achievedQuantity.toLocaleString()} sold
                          </span>
                          <span className="font-semibold text-card-foreground">
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              percentage >= 100
                                ? "bg-green-500"
                                : percentage >= 75
                                ? "bg-blue-500"
                                : percentage >= 50
                                ? "bg-yellow-500"
                                : "bg-orange-500"
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                          quantityRow.status
                        )}`}
                      >
                        {quantityRow.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-muted-foreground">
                        {quantityRow.period_start
                          ? `${new Date(
                              quantityRow.period_start
                            ).toLocaleDateString()} - ${new Date(
                              quantityRow.period_end
                            ).toLocaleDateString()}`
                          : "N/A"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditTarget(quantityRow.parentTarget)}
                      >
                        <Icon name="Edit" size={16} />
                        <Edit2 size={16} />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {showEditModal && editingTarget && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-card-foreground">
                Edit Sales Target
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-muted-foreground hover:text-card-foreground"
              >
                <Icon name="X" size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <Input
                label="Target Amount"
                type="number"
                min="0"
                step="0.01"
                value={editingTarget.target_amount}
                onChange={(e) =>
                  setEditingTarget({
                    ...editingTarget,
                    target_amount: e.target.value,
                  })
                }
              />

              <Select
                label="Currency"
                options={[
                  { value: "USD", label: "USD - US Dollar" },
                  { value: "EUR", label: "EUR - Euro" },
                  { value: "GBP", label: "GBP - British Pound" },
                  { value: "SAR", label: "SAR - Saudi Riyal" },
                  { value: "AED", label: "AED - UAE Dirham" },
                ]}
                value={editingTarget.currency}
                onChange={(value) =>
                  setEditingTarget({ ...editingTarget, currency: value })
                }
              />

              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Notes
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  rows={3}
                  value={editingTarget.notes}
                  onChange={(e) =>
                    setEditingTarget({
                      ...editingTarget,
                      notes: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex justify-between gap-3 p-6 border-t border-border">
              <Button variant="destructive" onClick={handleDeleteTarget}>
                <Icon name="Trash2" size={16} className="mr-2" />
                Delete Target
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveTarget}>Save Changes</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesTarget;
