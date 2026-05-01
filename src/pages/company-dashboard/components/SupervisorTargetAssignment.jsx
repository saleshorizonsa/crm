import React, { useState, useEffect, useMemo } from "react";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useAuth } from "../../../contexts/AuthContext";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";
import { salesTargetService } from "../../../services/supabaseService";
import { formatLocalDateYMD } from "utils/dateFormat";

const SupervisorTargetAssignment = ({
  isOpen,
  onClose,
  supervisorTargets,
  salesmen,
  allSalesmen, // For budget calculation
  onTargetAssigned,
}) => {
  const { formatCurrency } = useCurrency();
  const { userProfile } = useAuth();

  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [salesTargets, setSalesTargets] = useState([]);

  useEffect(() => {
    if (isOpen && userProfile?.id) {
      loadSalesTargets();
    }
  }, [isOpen, userProfile]);

  const loadSalesTargets = async () => {
    try {
      const { data } = await salesTargetService.getTargetsByAssignees(
        allSalesmen?.map((s) => s.id) || []
      );
      setSalesTargets(data || []);
    } catch (error) {
      console.error("Error loading sales targets:", error);
      setSalesTargets([]);
    }
  };

  const calculateAvailableAmount = useMemo(() => {
    console.log(
      "=== SupervisorTargetAssignment: Calculating Available Amount ==="
    );
    console.log("supervisorTargets:", supervisorTargets);
    console.log("salesTargets:", salesTargets);
    console.log("allSalesmen:", allSalesmen);
    console.log("assignments:", assignments);

    if (!supervisorTargets || !Array.isArray(supervisorTargets)) {
      console.log("No supervisor targets available");
      return 0;
    }

    // Calculate total allocated to supervisor
    const totalAllocated = supervisorTargets.reduce((sum, target) => {
      const amount = parseFloat(target.target_amount) || 0;
      console.log(
        `Supervisor target: ${target.id}, amount: ${amount}, period: ${target.period_start} to ${target.period_end}`
      );
      return sum + amount;
    }, 0);

    console.log("Total allocated to supervisor:", totalAllocated);

    // Calculate total already assigned to salesmen (from database)
    const totalAssigned = salesTargets.reduce((sum, target) => {
      if (allSalesmen?.some((salesman) => salesman.id === target.assignee_id)) {
        const amount = parseFloat(target.target_amount) || 0;
        console.log(
          `Already assigned: ${target.id}, to: ${target.assignee_id}, amount: ${amount}`
        );
        return sum + amount;
      }
      return sum;
    }, 0);

    console.log("Total already assigned:", totalAssigned);

    // Calculate amount from current assignments (in modal)
    const currentAssignments = assignments.reduce((sum, assignment) => {
      const amount = parseFloat(assignment.amount) || 0;
      console.log(
        `Current assignment: ${assignment.subordinateId}, amount: ${amount}`
      );
      return sum + amount;
    }, 0);

    console.log("Current assignments total:", currentAssignments);

    const available = totalAllocated - totalAssigned - currentAssignments;
    console.log("Available amount:", available);
    console.log("=== End Calculation ===");

    return Math.max(0, available);
  }, [supervisorTargets, salesTargets, allSalesmen, assignments]);

  const validatePeriodOverlap = (startDate, endDate) => {
    const assignmentStart = new Date(startDate);
    const assignmentEnd = new Date(endDate);

    const overlappingTargets =
      supervisorTargets?.filter((target) => {
        const targetStart = new Date(target.period_start);
        const targetEnd = new Date(target.period_end);

        // Check if periods overlap
        return assignmentStart <= targetEnd && assignmentEnd >= targetStart;
      }) || [];

    return {
      hasOverlap: overlappingTargets.length > 0,
      overlappingTargets,
      availableAmount: overlappingTargets.reduce(
        (sum, target) => sum + (parseFloat(target.target_amount) || 0),
        0
      ),
    };
  };

  const getValidDefaultDate = () => {
    // Find a future period where budget is allocated
    const futurePeriods =
      supervisorTargets?.filter((target) => {
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
      assignments.map((assignment) => {
        if (assignment.id === id) {
          const updated = { ...assignment, [field]: value };

          // Auto-calculate end date based on period type and start date
          if (field === "startDate" || field === "periodType") {
            const startDate = new Date(
              field === "startDate" ? value : assignment.startDate
            );
            let endDate = new Date(startDate);

            switch (updated.periodType) {
              case "weekly":
                endDate.setDate(endDate.getDate() + 6);
                break;
              case "monthly":
                endDate.setMonth(endDate.getMonth() + 1);
                endDate.setDate(endDate.getDate() - 1);
                break;
              case "quarterly":
                endDate.setMonth(endDate.getMonth() + 3);
                endDate.setDate(endDate.getDate() - 1);
                break;
              case "yearly":
                endDate.setFullYear(endDate.getFullYear() + 1);
                endDate.setDate(endDate.getDate() - 1);
                break;
              default:
                break;
            }

            updated.endDate = formatLocalDateYMD(endDate);
          }

          return updated;
        }
        return assignment;
      })
    );
  };

  const handleSubmitAssignments = async () => {
    // Validate assignments
    const errors = [];

    assignments.forEach((assignment, index) => {
      if (!assignment.subordinateId) {
        errors.push(`Assignment ${index + 1}: Please select a salesman`);
      }
      if (!assignment.amount || assignment.amount <= 0) {
        errors.push(`Assignment ${index + 1}: Please enter a valid amount`);
      }
      if (!assignment.startDate) {
        errors.push(`Assignment ${index + 1}: Please select a start date`);
      }

      // Validate period overlap
      if (assignment.startDate && assignment.endDate) {
        const validation = validatePeriodOverlap(
          assignment.startDate,
          assignment.endDate
        );
        if (!validation.hasOverlap) {
          errors.push(
            `Assignment ${
              index + 1
            }: Assignment period must overlap with your allocated budget periods. Available periods: ${supervisorTargets
              ?.map((t) => `${t.period_start} to ${t.period_end}`)
              .join(", ")}`
          );
        }
      }
    });

    // Check available amount
    const totalAssignmentAmount = assignments.reduce(
      (sum, a) => sum + (parseFloat(a.amount) || 0),
      0
    );
    if (totalAssignmentAmount > calculateAvailableAmount) {
      errors.push(
        `Total assignment amount (${formatCurrency(
          totalAssignmentAmount
        )}) exceeds available budget (${formatCurrency(
          calculateAvailableAmount
        )})`
      );
    }

    if (errors.length > 0) {
      alert("Please fix the following errors:\n\n" + errors.join("\n"));
      return;
    }

    setIsLoading(true);
    try {
      const results = await Promise.allSettled(
        assignments.map(async (assignment) => {
          const targetData = {
            assignee_id: assignment.subordinateId,
            assigned_by: userProfile.id,
            target_amount: assignment.amount,
            period_start: assignment.startDate,
            period_end: assignment.endDate,
            period_type: assignment.periodType,
            notes: assignment.notes,
          };

          console.log("Creating target with data:", targetData);
          return await salesTargetService.createTarget(targetData);
        })
      );

      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      if (successful > 0) {
        alert(
          `Successfully assigned ${successful} target(s)${
            failed > 0 ? ` (${failed} failed)` : ""
          }`
        );
        setAssignments([]);
        await loadSalesTargets(); // Reload to update available amount
        if (onTargetAssigned) {
          onTargetAssigned();
        }
      } else {
        alert("Failed to assign targets. Please try again.");
      }
    } catch (error) {
      console.error("Error assigning targets:", error);
      alert("Error assigning targets. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Assign Sales Targets to Salesmen
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <Icon name="x" className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Available Budget Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-blue-800 mb-2">
              Available Budget Summary
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-600">Total Allocated:</span>
                <span className="ml-2 font-semibold">
                  {formatCurrency(
                    supervisorTargets?.reduce(
                      (sum, t) => sum + (parseFloat(t.target_amount) || 0),
                      0
                    ) || 0
                  )}
                </span>
              </div>
              <div>
                <span className="text-blue-600">Already Assigned:</span>
                <span className="ml-2 font-semibold">
                  {formatCurrency(
                    salesTargets?.reduce(
                      (sum, t) => sum + (parseFloat(t.target_amount) || 0),
                      0
                    ) || 0
                  )}
                </span>
              </div>
              <div>
                <span className="text-blue-600">Available Amount:</span>
                <span className="ml-2 font-bold text-green-600">
                  {formatCurrency(calculateAvailableAmount)}
                </span>
              </div>
              <div>
                <span className="text-blue-600">Current Assignments:</span>
                <span className="ml-2 font-semibold">
                  {formatCurrency(
                    assignments.reduce(
                      (sum, a) => sum + (parseFloat(a.amount) || 0),
                      0
                    )
                  )}
                </span>
              </div>
            </div>

            {/* Period Validation Warning */}
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <div className="flex items-start space-x-2">
                <Icon
                  name="alert-triangle"
                  className="w-4 h-4 text-yellow-600 mt-0.5"
                />
                <div className="text-xs text-yellow-800">
                  <div className="font-medium mb-1">
                    ⚠️ Critical: Assignment Period Requirements
                  </div>
                  <div className="space-y-1">
                    <div>
                      • Target assignments must fall within your allocated
                      budget periods
                    </div>
                    <div>
                      • Available periods:{" "}
                      {supervisorTargets
                        ?.map((t) => {
                          const start = new Date(t.period_start);
                          const end = new Date(t.period_end);
                          const now = new Date();
                          const status =
                            start > now
                              ? "FUTURE"
                              : end < now
                              ? "PAST"
                              : "ACTIVE";
                          return `${t.period_start} to ${t.period_end} (${status})`;
                        })
                        .join(", ")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Target Assignments */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Target Assignments
              </h3>
              <Button
                variant="primary"
                onClick={handleAddAssignment}
                disabled={calculateAvailableAmount <= 0}
              >
                <Icon name="plus" className="w-4 h-4 mr-2" />
                Add Assignment
              </Button>
            </div>

            {assignments.length === 0 ? (
              <div className="text-center py-8">
                <Icon
                  name="target"
                  className="w-12 h-12 text-gray-400 mx-auto mb-4"
                />
                <h3 className="text-sm font-medium text-gray-900">
                  No assignments created
                </h3>
                <p className="text-sm text-gray-500">
                  Click "Add Assignment" to start assigning targets to your
                  salesmen.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {assignments.map((assignment, index) => (
                  <div
                    key={assignment.id}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-gray-900">
                        Assignment #{index + 1}
                      </h4>
                      <button
                        onClick={() => handleRemoveAssignment(assignment.id)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Salesman Selection */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Salesman *
                        </label>
                        <select
                          value={assignment.subordinateId}
                          onChange={(e) =>
                            handleAssignmentChange(
                              assignment.id,
                              "subordinateId",
                              e.target.value
                            )
                          }
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">Select a salesman</option>
                          {salesmen?.map((salesman) => (
                            <option key={salesman.id} value={salesman.id}>
                              {salesman.full_name || salesman.email}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Amount */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Target Amount *
                        </label>
                        <input
                          type="number"
                          value={assignment.amount}
                          onChange={(e) =>
                            handleAssignmentChange(
                              assignment.id,
                              "amount",
                              e.target.value
                            )
                          }
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          placeholder="Enter amount"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      {/* Period Type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Period Type *
                        </label>
                        <select
                          value={assignment.periodType}
                          onChange={(e) =>
                            handleAssignmentChange(
                              assignment.id,
                              "periodType",
                              e.target.value
                            )
                          }
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>

                      {/* Start Date */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Start Date *
                        </label>
                        <input
                          type="date"
                          value={assignment.startDate}
                          onChange={(e) =>
                            handleAssignmentChange(
                              assignment.id,
                              "startDate",
                              e.target.value
                            )
                          }
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>

                      {/* End Date (Auto-calculated) */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          End Date
                        </label>
                        <input
                          type="date"
                          value={assignment.endDate}
                          readOnly
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-gray-100"
                        />
                      </div>

                      {/* Notes */}
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Notes
                        </label>
                        <textarea
                          value={assignment.notes}
                          onChange={(e) =>
                            handleAssignmentChange(
                              assignment.id,
                              "notes",
                              e.target.value
                            )
                          }
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          rows="2"
                          placeholder="Optional notes for this assignment"
                        />
                      </div>
                    </div>

                    {/* Period Validation */}
                    {assignment.startDate && assignment.endDate && (
                      <div className="mt-3">
                        {(() => {
                          const validation = validatePeriodOverlap(
                            assignment.startDate,
                            assignment.endDate
                          );
                          return validation.hasOverlap ? (
                            <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                              ✅ Valid period - overlaps with allocated budget (
                              {formatCurrency(validation.availableAmount)}{" "}
                              available)
                            </div>
                          ) : (
                            <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                              ❌ Invalid period - no overlap with allocated
                              budget periods
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Total:{" "}
            {formatCurrency(
              assignments.reduce(
                (sum, a) => sum + (parseFloat(a.amount) || 0),
                0
              )
            )}{" "}
            / Available: {formatCurrency(calculateAvailableAmount)}
          </div>
          <div className="flex space-x-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitAssignments}
              disabled={assignments.length === 0 || isLoading}
            >
              {isLoading
                ? "Assigning Targets..."
                : `Assign ${assignments.length} Target(s)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupervisorTargetAssignment;
