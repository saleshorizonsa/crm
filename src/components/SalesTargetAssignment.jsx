import React, { useState, useEffect } from "react";
import Input from "./ui/Input";
import Select from "./ui/Select";
import { salesTargetService, userService } from "./../services/supabaseService";
import { useAuth } from "./../contexts/AuthContext";
import { useCurrency } from "./../contexts/CurrencyContext";
import Icon from "./AppIcon";
import Button from "./ui/Button";
import { capitalize } from "utils/helper";
import { formatLocalDateYMD } from "utils/dateFormat";

const SalesTargetAssignment = ({
  onTargetCreated,
  companyId,
  onClose,
  selectedUserId = null,
}) => {
  const { userProfile } = useAuth();
  const { preferredCurrency } = useCurrency();
  const [formData, setFormData] = useState({
    assignedTo: selectedUserId || "",
    targetAmount: "",
    periodType: "monthly",
    periodStart: "",
    periodEnd: "",
    notes: "",
  });

  const [subordinates, setSubordinates] = useState([]);
  const [availableTarget, setAvailableTarget] = useState({
    allocated: 0,
    assigned: 0,
    available: 0,
  });
  const [loading, setLoading] = useState(false);
  const [loadingSubordinates, setLoadingSubordinates] = useState(true);
  const [error, setError] = useState("");
  const [existingTarget, setExistingTarget] = useState(null);
  const [isUpdateMode, setIsUpdateMode] = useState(false);

  const currencies = [
    { value: "USD", label: "USD ($)" },
    { value: "EUR", label: "EUR (€)" },
    { value: "GBP", label: "GBP (£)" },
    { value: "CAD", label: "CAD (C$)" },
    { value: "AUD", label: "AUD (A$)" },
  ];

  const periodTypes = [
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
  ];

  // Update formData when selectedUserId changes
  useEffect(() => {
    if (selectedUserId) {
      setFormData((prev) => ({
        ...prev,
        assignedTo: selectedUserId,
      }));
    }
  }, [selectedUserId]);

  // Load subordinates
  useEffect(() => {
    const loadSubordinates = async () => {
      if (!userProfile?.id) return;

      setLoadingSubordinates(true);
      try {
        console.log(
          "🔍 Loading subordinates for user:",
          userProfile.id,
          "Role:",
          userProfile.role
        );

        const { data, error } = await userService.getUserSubordinates(
          userProfile.id
        );

        console.log("📊 Subordinates returned from API:", data);

        if (error) throw error;

        // Filter subordinates based on hierarchy
        let filteredSubordinates = data || [];

        if (userProfile?.role === "director") {
          // Directors can only assign to managers
          filteredSubordinates =
            data?.filter((user) => user.role === "manager") || [];
        } else if (userProfile?.role === "manager") {
          // Managers can assign to supervisors and salesmen
          filteredSubordinates =
            data?.filter(
              (user) => user.role === "supervisor" || user.role === "salesman"
            ) || [];
        } else if (userProfile?.role === "supervisor") {
          // Supervisors can assign to salesmen
          filteredSubordinates =
            data?.filter((user) => user.role === "salesman") || [];
        }

        console.log("✅ Filtered subordinates:", filteredSubordinates);
        setSubordinates(filteredSubordinates);
      } catch (error) {
        console.error("❌ Error loading subordinates:", error);
        setError("Failed to load team members");
      } finally {
        setLoadingSubordinates(false);
      }
    };

    loadSubordinates();
  }, [userProfile?.role, userProfile?.id]);

  // Load existing target when user, period, or company changes
  useEffect(() => {
    const loadExistingTarget = async () => {
      if (!formData.assignedTo || !companyId) {
        setExistingTarget(null);
        setIsUpdateMode(false);
        return;
      }

      try {
        console.log(
          "🔍 Checking for existing targets for user:",
          formData.assignedTo
        );

        const { data: existingTargets, error } =
          await salesTargetService.getTeamTargets(companyId);

        if (error) {
          console.error("Error loading existing targets:", error);
          return;
        }

        // Find a matching target based on user and dates (if dates are set)
        let matchingTarget;

        if (formData.periodStart && formData.periodEnd) {
          // If dates are selected, find exact match
          matchingTarget = existingTargets?.find(
            (target) =>
              target.assigned_to === formData.assignedTo &&
              target.period_start === formData.periodStart &&
              target.period_end === formData.periodEnd &&
              target.company_id === companyId
          );
        } else {
          // If no dates selected, find the most recent target for this user
          const userTargets = existingTargets?.filter(
            (target) =>
              target.assigned_to === formData.assignedTo &&
              target.company_id === companyId
          );
          if (userTargets && userTargets.length > 0) {
            // Get the most recent target
            matchingTarget = userTargets.sort(
              (a, b) => new Date(b.period_start) - new Date(a.period_start)
            )[0];
          }
        }

        if (matchingTarget) {
          console.log("✅ Found existing target:", matchingTarget);
          setExistingTarget(matchingTarget);
          setIsUpdateMode(formData.periodStart && formData.periodEnd); // Only update mode if dates match

          // Prefill the form with existing values
          setFormData((prev) => ({
            ...prev,
            targetAmount: matchingTarget.target_amount?.toString() || "",
            periodType: matchingTarget.period_type || "monthly",
            periodStart: matchingTarget.period_start || prev.periodStart,
            periodEnd: matchingTarget.period_end || prev.periodEnd,
            notes: matchingTarget.notes || "",
          }));
        } else {
          console.log("ℹ️ No existing target found");
          setExistingTarget(null);
          setIsUpdateMode(false);
        }
      } catch (error) {
        console.error("Error checking existing target:", error);
      }
    };

    loadExistingTarget();
  }, [
    formData.assignedTo,
    formData.periodStart,
    formData.periodEnd,
    companyId,
  ]);

  // Calculate period end date based on period type and start date
  useEffect(() => {
    if (formData.periodStart && formData.periodType) {
      const startDate = new Date(formData.periodStart);
      let endDate = new Date(startDate);

      switch (formData.periodType) {
        case "weekly":
          endDate.setDate(startDate.getDate() + 6);
          break;
        case "monthly":
          endDate.setMonth(startDate.getMonth() + 1);
          endDate.setDate(startDate.getDate() - 1);
          break;
        case "quarterly":
          endDate.setMonth(startDate.getMonth() + 3);
          endDate.setDate(startDate.getDate() - 1);
          break;
        case "yearly":
          endDate.setFullYear(startDate.getFullYear() + 1);
          endDate.setDate(startDate.getDate() - 1);
          break;
        default:
          break;
      }

      setFormData((prev) => ({
        ...prev,
        periodEnd: formatLocalDateYMD(endDate),
      }));
    }
  }, [formData.periodStart, formData.periodType]);

  // Load available target when period or company changes
  useEffect(() => {
    const loadAvailableTarget = async () => {
      if (!formData.periodStart || !formData.periodEnd || !companyId) return;

      try {
        const { data, error } = await salesTargetService.getUserAvailableTarget(
          userProfile?.id,
          companyId,
          formData.periodStart,
          formData.periodEnd
        );

        if (error) throw error;
        setAvailableTarget(data);
      } catch (error) {
        console.error("Error loading available target:", error);
      }
    };

    // Only load for non-directors (directors have unlimited targets)
    if (userProfile?.role !== "director") {
      loadAvailableTarget();
    } else {
      setAvailableTarget({
        allocated: Infinity,
        assigned: 0,
        available: Infinity,
      });
    }
  }, [formData.periodStart, formData.periodEnd, companyId, userProfile]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setError("");
  };

  const validateForm = () => {
    if (!formData.assignedTo) {
      setError("Please select a team member");
      return false;
    }
    if (!formData.targetAmount || parseFloat(formData.targetAmount) <= 0) {
      setError("Please enter a valid target amount");
      return false;
    }
    if (!formData.periodStart) {
      setError("Please select a start date");
      return false;
    }

    // Calculate effective available budget
    // When updating, add back the existing target amount to the available budget
    let effectiveAvailable = availableTarget.available;
    if (isUpdateMode && existingTarget) {
      effectiveAvailable += parseFloat(existingTarget.target_amount || 0);
    }

    if (
      userProfile?.role !== "director" &&
      parseFloat(formData.targetAmount) > effectiveAvailable
    ) {
      setError(
        `Target amount exceeds available budget (${effectiveAvailable.toFixed(
          2
        )} ${preferredCurrency})`
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setError("");

    try {
      if (isUpdateMode && existingTarget) {
        // Update existing target
        console.log("💾 Updating existing target:", existingTarget.id);

        const { data, error } = await salesTargetService.updateTarget(
          existingTarget.id,
          {
            targetAmount: parseFloat(formData.targetAmount),
            currency: preferredCurrency,
            periodStart: formData.periodStart,
            periodEnd: formData.periodEnd,
            notes: formData.notes,
          }
        );

        if (error) throw error;

        console.log("✅ Target updated successfully");

        if (onTargetCreated) {
          onTargetCreated(data);
        }
      } else {
        // Create new target
        console.log("➕ Creating new target");

        const targetData = {
          assignedTo: formData.assignedTo,
          companyId: companyId,
          targetAmount: parseFloat(formData.targetAmount),
          currency: preferredCurrency,
          periodType: formData.periodType,
          periodStart: formData.periodStart,
          periodEnd: formData.periodEnd,
          notes: formData.notes,
        };

        const { data, error } = await salesTargetService.createTarget(
          targetData
        );

        if (error) throw error;

        console.log("✅ Target created successfully");

        if (onTargetCreated) {
          onTargetCreated(data);
        }
      }

      // Reset form
      setFormData({
        assignedTo: "",
        targetAmount: "",
        periodType: "monthly",
        periodStart: "",
        periodEnd: "",
        notes: "",
      });
      setExistingTarget(null);
      setIsUpdateMode(false);

      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error("Error saving target:", error);
      setError(error.message || "Failed to save sales target");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTarget = async () => {
    if (!existingTarget?.id) return;

    if (
      !window.confirm(
        "Are you sure you want to delete this sales target? This action cannot be undone."
      )
    ) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      console.log("🗑️ Deleting target:", existingTarget.id);

      const { error } = await salesTargetService.deleteTarget(
        existingTarget.id
      );

      if (error) throw error;

      console.log("✅ Target deleted successfully");

      // Reset form
      setFormData({
        assignedTo: "",
        targetAmount: "",
        periodType: "monthly",
        periodStart: "",
        periodEnd: "",
        notes: "",
      });
      setExistingTarget(null);
      setIsUpdateMode(false);

      // Close the modal first
      if (onClose) {
        onClose();
      }

      // Then signal deletion to parent (which will reload the data)
      if (onTargetCreated) {
        onTargetCreated({ deleted: true });
      }
    } catch (error) {
      console.error("Error deleting target:", error);
      setError(error.message || "Failed to delete sales target");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-card-foreground flex items-center">
          <Icon name="Target" size={20} className="mr-2" />
          {isUpdateMode ? "Update Sales Target" : "Assign Sales Target"}
        </h3>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Icon name="X" size={16} />
          </Button>
        )}
      </div>

      {/* Update Mode Indicator */}
      {isUpdateMode && existingTarget && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center gap-2 text-blue-800">
            <Icon name="Info" size={16} />
            <span className="text-sm font-medium">
              Updating existing target for this period
            </span>
          </div>
          <p className="text-xs text-blue-600 mt-1">
            Current target: {existingTarget.currency}{" "}
            {parseFloat(existingTarget.target_amount).toLocaleString()}
          </p>
        </div>
      )}

      {/* Available Target Info - Only show for non-directors */}
      {userProfile?.role !== "director" && (
        <div className="mb-4 p-3 bg-muted rounded-md">
          <div className="text-sm text-muted-foreground mb-2">
            Target Allocation Summary
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-card-foreground">
                Total Allocated to You:
              </span>
              <span className="font-medium text-card-foreground">
                {availableTarget.allocated.toFixed(2)} {preferredCurrency}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Already Assigned:
              </span>
              <span className="text-sm text-muted-foreground">
                {availableTarget.assigned.toFixed(2)} {preferredCurrency}
              </span>
            </div>

            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm font-medium text-card-foreground">
                Available to Assign:
              </span>
              <span
                className={`font-medium ${
                  availableTarget.available > 0
                    ? "text-success"
                    : "text-destructive"
                }`}
              >
                {availableTarget.available.toFixed(2)} {preferredCurrency}
              </span>
            </div>

            {availableTarget.available <= 0 && (
              <div className="text-xs text-destructive mt-1">
                ⚠️ You have no remaining budget to assign targets
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Team Member Selection */}
        <div>
          <label className="block text-sm font-medium text-card-foreground mb-2">
            Assign To
          </label>
          <Select
            value={formData.assignedTo}
            onChange={(value) => handleInputChange("assignedTo", value)}
            placeholder={
              loadingSubordinates ? "Loading..." : "Select team member"
            }
            disabled={loadingSubordinates}
            options={subordinates.map((user) => ({
              value: user.id,
              label: `${user.full_name || user.email} (${capitalize(
                user.role
              )})${user.department ? ` - ${user.department}` : ""}`,
            }))}
          />
        </div>

        {/* Target Amount */}
        <div>
          <label className="block text-sm font-medium text-card-foreground mb-2">
            Target Amount ({preferredCurrency})
          </label>
          <Input
            type="number"
            value={formData.targetAmount}
            onChange={(e) => handleInputChange("targetAmount", e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
          />
        </div>

        {/* Period Type and Start Date */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              Period Type
            </label>
            <Select
              value={formData.periodType}
              onChange={(value) => handleInputChange("periodType", value)}
              options={periodTypes}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              Start Date
            </label>
            <Input
              type="date"
              value={formData.periodStart}
              onChange={(e) => handleInputChange("periodStart", e.target.value)}
              min={formatLocalDateYMD(new Date())}
            />
          </div>
        </div>

        {/* End Date (readonly) */}
        {formData.periodEnd && (
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              End Date
            </label>
            <Input
              type="date"
              value={formData.periodEnd}
              readOnly
              className="bg-muted"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-card-foreground mb-2">
            Notes (Optional)
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => handleInputChange("notes", e.target.value)}
            placeholder="Add any additional notes or objectives..."
            rows={3}
            className="w-full px-3 py-2 bg-background border border-input rounded-md text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center text-sm text-destructive">
              <Icon name="AlertCircle" size={16} className="mr-2" />
              {error}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4">
          {/* Delete button - only show in update mode */}
          {isUpdateMode && existingTarget && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteTarget}
              disabled={loading}
            >
              <Icon name="Trash2" size={16} className="mr-2" />
              Delete Target
            </Button>
          )}

          <div
            className={`flex items-center space-x-3 ${
              !isUpdateMode || !existingTarget ? "ml-auto" : ""
            }`}
          >
            {onClose && (
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={loading || loadingSubordinates}
              className="min-w-[120px]"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  {isUpdateMode ? "Updating..." : "Creating..."}
                </div>
              ) : (
                <div className="flex items-center">
                  <Icon
                    name={isUpdateMode ? "Edit" : "Target"}
                    size={16}
                    className="mr-2"
                  />
                  {isUpdateMode ? "Update Target" : "Assign Target"}
                </div>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default SalesTargetAssignment;
