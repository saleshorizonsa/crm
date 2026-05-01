import React, { useState, useEffect } from "react";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { salesTargetService } from "../../../services/supabaseService";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Icon from "../../../components/AppIcon";
import { formatLocalDateYMD } from "utils/dateFormat";

const ManagerTargetAssignment = ({
  managerTargets,
  subordinates,
  allSubordinates,
  salesTargets,
  companyId,
  managerId,
  onTargetAssigned,
  onClose,
}) => {
  console.log("🎯🎯🎯 ManagerTargetAssignment Component Props:");
  console.log("- managerTargets:", managerTargets);
  console.log("- subordinates:", subordinates);
  console.log("- salesTargets:", salesTargets);
  console.log("- companyId:", companyId);
  console.log("- managerId:", managerId);

  const { formatCurrency, preferredCurrency } = useCurrency();
  const [isLoading, setIsLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [availableAmount, setAvailableAmount] = useState(0);

  useEffect(() => {
    calculateAvailableAmount();
  }, [managerTargets, salesTargets, allSubordinates]);

  const calculateAvailableAmount = () => {
    console.log("=== Calculating Available Amount ===");
    console.log("Manager ID:", managerId);
    console.log("Manager Targets (assigned TO manager):", managerTargets);
    console.log("Sales Targets (all targets):", salesTargets);
    console.log("Subordinates (supervisors only):", subordinates);
    console.log("All Subordinates (for calculations):", allSubordinates);

    if (!managerTargets || !Array.isArray(managerTargets)) {
      console.log(
        "No manager targets or not an array - setting available to 0"
      );
      setAvailableAmount(0);
      return;
    }

    // Calculate total allocated to manager (targets assigned TO the manager by director)
    let totalManagerTarget = 0;
    managerTargets.forEach((target) => {
      const amount = parseFloat(target.target_amount || 0);
      console.log(
        `Adding manager target: $${amount} (${target.period_type}, ${target.period_start} to ${target.period_end})`
      );
      totalManagerTarget += amount;
    });

    console.log("Total Manager Target:", totalManagerTarget);

    // Get ALL subordinate IDs for budget calculation (supervisors + salesmen)
    const allSubordinateIds = allSubordinates?.map((sub) => sub.id) || [];
    console.log(
      "All Subordinate IDs (for budget calculation):",
      allSubordinateIds
    );

    // Calculate already assigned amounts (targets assigned BY the manager TO subordinates)
    let assignedToSubordinates = 0;
    if (salesTargets && Array.isArray(salesTargets)) {
      salesTargets.forEach((target) => {
        console.log("Checking sales target:", {
          id: target.id,
          assigned_by: target.assigned_by,
          assigned_to: target.assigned_to,
          amount: target.target_amount,
          isManagerAssigned: target.assigned_by === managerId,
          isToSubordinate: allSubordinateIds.includes(target.assigned_to),
        });

        if (
          target.assigned_by === managerId &&
          allSubordinateIds.includes(target.assigned_to)
        ) {
          const amount = parseFloat(target.target_amount || 0);
          console.log(`Found subordinate target - adding: $${amount}`);
          assignedToSubordinates += amount;
        }
      });
    } else {
      console.log("Sales targets is not an array or is null:", salesTargets);
    }

    console.log("Already Assigned to Subordinates:", assignedToSubordinates);

    const available = totalManagerTarget - assignedToSubordinates;
    console.log("Final Available Amount:", available);
    console.log(
      `Calculation: $${totalManagerTarget} - $${assignedToSubordinates} = $${available}`
    );

    setAvailableAmount(available);
  };

  const getValidDefaultDate = () => {
    // Find a future period where budget is allocated
    const futurePeriods =
      managerTargets?.filter((target) => {
        return new Date(target.period_start) > new Date();
      }) || [];

    if (futurePeriods.length > 0) {
      // Use the start date of the nearest future period
      const nearestPeriod = futurePeriods.sort(
        (a, b) => new Date(a.period_start) - new Date(b.period_start)
      )[0];
      return nearestPeriod.period_start;
    }

    // Fallback to current date
    return formatLocalDateYMD(new Date());
  };

  const handleAddAssignment = () => {
    setAssignments([
      ...assignments,
      {
        id: Date.now(),
        subordinateId: "",
        amount: 0,
        periodType: "monthly",
        startDate: getValidDefaultDate(),
        endDate: "",
        notes: "",
      },
    ]);
  };

  const handleRemoveAssignment = (id) => {
    setAssignments(assignments.filter((a) => a.id !== id));
  };

  const handleAssignmentChange = (id, field, value) => {
    setAssignments(
      assignments.map((assignment) =>
        assignment.id === id ? { ...assignment, [field]: value } : assignment
      )
    );
  };

  const calculateEndDate = (startDate, periodType) => {
    const start = new Date(startDate);
    let end = new Date(start);

    switch (periodType) {
      case "monthly":
        end.setMonth(end.getMonth() + 1);
        end.setDate(0); // Last day of the month
        break;
      case "quarterly":
        end.setMonth(end.getMonth() + 3);
        end.setDate(0);
        break;
      case "yearly":
        end.setFullYear(end.getFullYear() + 1);
        end.setDate(0);
        break;
      default:
        end = start;
    }

    return formatLocalDateYMD(end);
  };

  const getTotalAssignedAmount = () => {
    return assignments.reduce(
      (sum, assignment) => sum + parseFloat(assignment.amount || 0),
      0
    );
  };

  const getRemainingAmount = () => {
    return availableAmount - getTotalAssignedAmount();
  };

  const validatePeriodOverlap = (startDate, endDate) => {
    if (!managerTargets || !Array.isArray(managerTargets)) return false;

    const assignStart = new Date(startDate);
    const assignEnd = new Date(endDate);

    return managerTargets.some((target) => {
      const targetStart = new Date(target.period_start);
      const targetEnd = new Date(target.period_end);

      // Check for period overlap
      return (
        (assignStart <= targetStart && assignEnd >= targetStart) ||
        (assignStart <= targetEnd && assignEnd >= targetEnd) ||
        (assignStart >= targetStart && assignEnd <= targetEnd)
      );
    });
  };

  const handleSubmitAssignments = async () => {
    console.log("=== SUBMIT ASSIGNMENTS DEBUG ===");
    console.log("Manager ID (prop):", managerId);
    console.log("Company ID:", companyId);
    console.log("Assignments to create:", assignments);
    console.log("Available amount:", availableAmount);

    if (assignments.length === 0) {
      alert("Please add at least one assignment");
      return;
    }

    // Validate each assignment individually
    for (const assignment of assignments) {
      if (!assignment.subordinateId) {
        alert("Please select a team member for all assignments");
        return;
      }
      if (!assignment.amount || assignment.amount <= 0) {
        alert("Please enter a valid target amount for all assignments");
        return;
      }
      if (!assignment.startDate) {
        alert("Please select a start date for all assignments");
        return;
      }

      // Validate period overlap
      const endDate =
        assignment.endDate ||
        calculateEndDate(assignment.startDate, assignment.periodType);
      if (!validatePeriodOverlap(assignment.startDate, endDate)) {
        const periods =
          managerTargets
            ?.map((t) => `${t.period_start} to ${t.period_end}`)
            .join(", ") || "none";
        alert(
          `Invalid period: ${assignment.startDate} to ${endDate}\n\n` +
            `This period doesn't overlap with your allocated budget periods: ${periods}\n\n` +
            `Try using dates within December 2025 (2025-12-01 to 2025-12-31) where you have $20,000 allocated.`
        );
        return;
      }
    }

    const totalAssigned = getTotalAssignedAmount();
    if (totalAssigned > availableAmount) {
      alert(
        `Total assigned amount (${formatCurrency(
          totalAssigned,
          preferredCurrency
        )}) exceeds available budget (${formatCurrency(
          availableAmount,
          preferredCurrency
        )}).\n\n` +
          `Note: Your available budget is calculated based on targets allocated to you for the same time period as the targets you're assigning. ` +
          `Make sure you have an allocated target that covers the period you're trying to assign.`
      );
      return;
    }

    setIsLoading(true);
    try {
      const targetPromises = assignments.map((assignment) => {
        const endDate =
          assignment.endDate ||
          calculateEndDate(assignment.startDate, assignment.periodType);

        console.log("=== CREATING TARGET ===");
        console.log("Assignment details:", assignment);
        console.log("Calculated end date:", endDate);
        console.log(
          "Period being assigned:",
          assignment.startDate,
          "to",
          endDate
        );

        console.log("Target data being sent:", {
          assignedBy: managerId,
          assignedTo: assignment.subordinateId,
          companyId: companyId,
          targetAmount: assignment.amount,
          currency: preferredCurrency,
          periodType: assignment.periodType,
          periodStart: assignment.startDate,
          periodEnd: endDate,
          notes: assignment.notes,
          status: "active",
        });

        return salesTargetService.createTarget({
          assignedBy: managerId,
          assignedTo: assignment.subordinateId,
          companyId: companyId,
          targetAmount: assignment.amount,
          currency: preferredCurrency,
          periodType: assignment.periodType,
          periodStart: assignment.startDate,
          periodEnd: endDate,
          notes: assignment.notes,
          status: "active",
        });
      });

      const results = await Promise.all(targetPromises);

      console.log("Target creation results:", results);

      // Check for any errors
      const hasErrors = results.some((result) => result.error);
      if (hasErrors) {
        const errorMessages = results
          .filter((r) => r.error)
          .map((r) => {
            const errorMsg = r.error.message || JSON.stringify(r.error);
            console.error("Target creation error:", errorMsg);
            return errorMsg;
          })
          .join("\n\n");

        throw new Error(`Failed to create targets:\n\n${errorMessages}`);
      }

      if (onTargetAssigned) {
        onTargetAssigned();
      }

      // Reset form
      setAssignments([]);

      alert("Targets assigned successfully!");
      if (onClose) onClose();
    } catch (error) {
      console.error("Error assigning targets:", error);
      const errorMessage = error.message || String(error);
      alert(
        `Failed to assign targets:\n\n${errorMessage}\n\n` +
          `Tip: Make sure you have an allocated target that covers the same time period as the target you're trying to assign.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Assign Sales Targets
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>

      {/* Available Budget Summary */}
      <div className="bg-blue-50 p-4 rounded-lg mb-6">
        {/* Warning about period matching */}
        <div className="bg-yellow-100 border border-yellow-400 rounded-md p-3 mb-4">
          <div className="flex">
            <Icon
              name="alert-triangle"
              className="w-4 h-4 text-yellow-600 mr-2 mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-yellow-800">
                Period Validation Required
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                You can only assign targets for periods where you have allocated
                budget. The database validates period overlap, not just total
                amounts.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <p className="text-blue-600 font-medium">Total Allocated</p>
            <p className="text-xl font-bold text-blue-800">
              {formatCurrency(availableAmount)}
            </p>
            <p className="text-xs text-blue-600">Across all periods</p>
          </div>
          <div>
            <p className="text-blue-600 font-medium">Total Assigning</p>
            <p className="text-xl font-bold text-blue-800">
              {formatCurrency(getTotalAssignedAmount(), preferredCurrency)}
            </p>
          </div>
          <div>
            <p className="text-blue-600 font-medium">Remaining</p>
            <p
              className={`text-xl font-bold ${
                getRemainingAmount() < 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {formatCurrency(getRemainingAmount(), preferredCurrency)}
            </p>
          </div>
        </div>

        {/* Show allocated targets */}
        {managerTargets && managerTargets.length > 0 && (
          <div className="border-t border-blue-200 pt-3">
            <p className="text-xs text-blue-700 font-medium mb-2">
              Your Allocated Budget Periods:
            </p>
            <div className="space-y-2">
              {managerTargets.map((target) => {
                const isCurrentPeriod =
                  new Date() >= new Date(target.period_start) &&
                  new Date() <= new Date(target.period_end);
                const isFuture = new Date() < new Date(target.period_start);

                return (
                  <div
                    key={target.id}
                    className={`text-xs p-2 rounded ${
                      isCurrentPeriod
                        ? "bg-green-100 border border-green-300"
                        : isFuture
                        ? "bg-blue-100 border border-blue-300"
                        : "bg-gray-100 border border-gray-300"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">
                        {formatCurrency(target.target_amount)} -{" "}
                        {target.period_type}
                      </span>
                      <span
                        className={`px-1 py-0.5 rounded text-xs ${
                          isCurrentPeriod
                            ? "bg-green-200 text-green-800"
                            : isFuture
                            ? "bg-blue-200 text-blue-800"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {isCurrentPeriod
                          ? "ACTIVE"
                          : isFuture
                          ? "FUTURE"
                          : "PAST"}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      {target.period_start} to {target.period_end}
                    </div>
                    {isFuture && (
                      <div className="text-blue-700 font-medium mt-1">
                        ✓ Use dates within this period for assignments
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="bg-red-100 border border-red-300 rounded p-2 mt-2">
              <p className="text-xs text-red-700 font-medium">
                ⚠️ CRITICAL: Your target dates must fall within one of the
                periods above
              </p>
              <p className="text-xs text-red-600">
                Example: Use dates 2025-12-01 to 2025-12-31 to access your
                $20,000 December budget
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Assignment Forms */}
      <div className="space-y-4 mb-6">
        {assignments.map((assignment, index) => (
          <div
            key={assignment.id}
            className="border border-gray-200 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-900">
                Assignment #{index + 1}
              </h4>
              <button
                onClick={() => handleRemoveAssignment(assignment.id)}
                className="text-red-500 hover:text-red-700"
              >
                <Icon name="trash" className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team Member
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={assignment.subordinateId}
                  onChange={(e) =>
                    handleAssignmentChange(
                      assignment.id,
                      "subordinateId",
                      e.target.value
                    )
                  }
                  required
                >
                  <option value="">Select team member...</option>
                  {subordinates?.map((subordinate) => (
                    <option key={subordinate.id} value={subordinate.id}>
                      {subordinate.full_name || subordinate.email} (
                      {subordinate.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Amount ({preferredCurrency})
                </label>
                <Input
                  type="number"
                  value={assignment.amount}
                  onChange={(e) =>
                    handleAssignmentChange(
                      assignment.id,
                      "amount",
                      parseFloat(e.target.value) || 0
                    )
                  }
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period Type
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={assignment.periodType}
                  onChange={(e) =>
                    handleAssignmentChange(
                      assignment.id,
                      "periodType",
                      e.target.value
                    )
                  }
                  required
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={assignment.startDate}
                  onChange={(e) =>
                    handleAssignmentChange(
                      assignment.id,
                      "startDate",
                      e.target.value
                    )
                  }
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <Input
                  value={assignment.notes}
                  onChange={(e) =>
                    handleAssignmentChange(
                      assignment.id,
                      "notes",
                      e.target.value
                    )
                  }
                  placeholder="Additional notes or instructions..."
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleAddAssignment}>
          <Icon name="plus" className="w-4 h-4 mr-2" />
          Add Assignment
        </Button>

        <div className="flex space-x-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmitAssignments}
            disabled={
              isLoading || assignments.length === 0 || getRemainingAmount() < 0
            }
          >
            {isLoading
              ? "Assigning..."
              : `Assign Targets (${assignments.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ManagerTargetAssignment;
