import React, { useState, useEffect } from "react";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Button from "./ui/Button";
import Icon from "./AppIcon";
import ProductTargetSelector from "./ProductTargetSelector";
import { salesTargetService, userService, activityService } from "../services/supabaseService";
import { useAuth } from "../contexts/AuthContext";
import { useCurrency } from "../contexts/CurrencyContext";
import { capitalize } from "utils/helper";
import { formatLocalDateYMD } from "utils/dateFormat";
import { supabase } from "../lib/supabase";
import {
  PRODUCT_TARGET_TYPE,
  calculateProductTargetValue,
  toProductTargetRows,
  validateProductTargets,
} from "../utils/productTargetUtils";

const ManagerSalesTargetAssignment = ({
  onTargetCreated,
  companyId,
  onClose,
  managerTargets = [], // Targets assigned to this manager by director
  existingTeamTargets = [], // Targets already assigned to team
  editingTarget = null, // Target being edited (if any)
  onCancelEdit, // Callback to cancel editing
  onDeleteTarget, // Callback to delete target
}) => {
  const { userProfile } = useAuth();
  const { preferredCurrency, formatCurrency } = useCurrency();

  // Determine if we're in edit mode
  const isEditing = editingTarget !== null;

  // Form state - initialize with editing data if available
  const [selectedSubordinate, setSelectedSubordinate] = useState(
    editingTarget?.assigned_to || ""
  );
  const [targetType, setTargetType] = useState(
    editingTarget?.target_type || "total_value"
  );
  const [formData, setFormData] = useState({
    targetAmount: editingTarget?.target_amount?.toString() || "",
    periodType: "monthly", // Always monthly
    periodStart: editingTarget?.period_start || "",
    periodEnd: editingTarget?.period_end || "",
    notes: editingTarget?.notes || "",
  });

  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState("");

  // Generate month options for current year
  const currentYear = new Date().getFullYear();
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(currentYear, i, 1);
    const monthName = date.toLocaleString('en-US', { month: 'short' });
    return {
      value: `${currentYear}-${String(i + 1).padStart(2, '0')}`,
      label: `${monthName} ${currentYear}`
    };
  });

  // Effect to update form when editingTarget changes
  useEffect(() => {
    if (editingTarget) {
      setSelectedSubordinate(editingTarget.assigned_to || "");
      setTargetType(editingTarget.target_type || "total_value");
      setFormData({
        targetAmount: editingTarget.target_amount?.toString() || "",
        periodType: "monthly", // Always monthly
        periodStart: editingTarget.period_start || "",
        periodEnd: editingTarget.period_end || "",
        notes: editingTarget.notes || "",
      });
      // Set selected month from editing target
      if (editingTarget.period_start) {
        const date = new Date(editingTarget.period_start);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        setSelectedMonth(`${year}-${month}`);
      }
    } else {
      // Reset form when not editing
      setSelectedSubordinate("");
      setTargetType("total_value");
      setSelectedMonth("");
      setFormData({
        targetAmount: "",
        periodType: "monthly",
        periodStart: "",
        periodEnd: "",
        notes: "",
      });
    }
  }, [editingTarget]);

  // Client-based target state
  const [clientTargets, setClientTargets] = useState([]);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClient, setNewClient] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company_name: "",
  });

  // Product-based target state
  const [productTargets, setProductTargets] = useState([]);

  // Data state
  const [subordinates, setSubordinates] = useState([]);
  const [subordinateClients, setSubordinateClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubordinates, setLoadingSubordinates] = useState(true);
  const [loadingClients, setLoadingClients] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const periodTypes = [
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
  ];

  // Calculate available budget
  const calculateAvailableBudget = () => {
    const totalAllocated =
      managerTargets?.reduce(
        (sum, t) => sum + (parseFloat(t.target_amount) || 0),
        0
      ) || 0;

    const totalAssigned =
      existingTeamTargets?.reduce(
        (sum, t) => sum + (parseFloat(t.target_amount) || 0),
        0
      ) || 0;

    return Math.max(0, totalAllocated - totalAssigned);
  };

  // Load subordinates (managers for heads, supervisors and salesmen for managers)
  useEffect(() => {
    const loadSubordinates = async () => {
      if (!userProfile?.id) return;

      setLoadingSubordinates(true);
      try {
        const { data, error } = await userService.getUserSubordinates(
          userProfile.id
        );

        if (error) throw error;

        // Head can assign to managers, Manager can assign to supervisors and salesmen
        let filtered = [];
        if (userProfile.role === "head") {
          filtered = data?.filter((user) => user.role === "manager") || [];
        } else if (userProfile.role === "manager") {
          filtered = data?.filter(
            (user) => user.role === "supervisor" || user.role === "salesman"
          ) || [];
        }
        setSubordinates(filtered);
      } catch (error) {
        console.error("Error loading subordinates:", error);
        setError("Failed to load team members");
      } finally {
        setLoadingSubordinates(false);
      }
    };

    loadSubordinates();
  }, [userProfile?.id, userProfile?.role]);

  // Load subordinate's clients
  useEffect(() => {
    const loadSubordinateClients = async () => {
      if (!selectedSubordinate) {
        setSubordinateClients([]);
        setClientTargets([]);
        return;
      }

      setLoadingClients(true);
      try {
        const { data, error } = await supabase
          .from("contacts")
          .select("*")
          .eq("owner_id", selectedSubordinate)
          .order("company_name", { ascending: true });

        if (error) throw error;

        setSubordinateClients(data || []);

        const initialClientTargets = (data || []).map((client) => ({
          contact_id: client.id,
          contact: client,
          target_amount: "",
          enabled: false,
        }));
        setClientTargets(initialClientTargets);
      } catch (error) {
        console.error("Error loading clients:", error);
        setError("Failed to load clients");
      } finally {
        setLoadingClients(false);
      }
    };

    loadSubordinateClients();
  }, [selectedSubordinate]);

  // Calculate period start and end date when month is selected
  useEffect(() => {
    if (selectedMonth) {
      // Parse year-month format (e.g., "2026-01")
      const [year, month] = selectedMonth.split('-');
      
      // Set start date to first day of the month
      const startDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const periodStart = formatLocalDateYMD(startDate);

      // Set end date to last day of the month
      const endDate = new Date(parseInt(year, 10), parseInt(month, 10), 0); // Day 0 = last day of previous month
      const periodEnd = formatLocalDateYMD(endDate);

      setFormData((prev) => ({
        ...prev,
        periodStart,
        periodEnd,
      }));
    }
  }, [selectedMonth]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleClientTargetChange = (contactId, field, value) => {
    setClientTargets((prev) =>
      prev.map((ct) =>
        ct.contact_id === contactId ? { ...ct, [field]: value } : ct
      )
    );
  };

  const handleCreateClient = async () => {
    if (!newClient.first_name || !newClient.last_name) {
      setError("First name and last name are required");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          ...newClient,
          owner_id: selectedSubordinate,
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;

      setSubordinateClients((prev) => [...prev, data]);
      setClientTargets((prev) => [
        ...prev,
        {
          contact_id: data.id,
          contact: data,
          target_amount: "",
          enabled: true,
        },
      ]);

      setNewClient({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        company_name: "",
      });
      setShowCreateClient(false);
      setSuccess("Client created successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      console.error("Error creating client:", error);
      setError("Failed to create client: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalClientTarget = () => {
    return clientTargets
      .filter((ct) => ct.enabled && parseFloat(ct.target_amount) > 0)
      .reduce((sum, ct) => sum + parseFloat(ct.target_amount || 0), 0);
  };

  const validateForm = () => {
    if (!selectedSubordinate) {
      setError("Please select a team member to assign the target to");
      return false;
    }

    if (!formData.periodStart) {
      setError("Please select a start date");
      return false;
    }

    let totalTarget = 0;
    if (targetType === "total_value") {
      if (!formData.targetAmount || parseFloat(formData.targetAmount) <= 0) {
        setError("Please enter a valid target amount");
        return false;
      }
      totalTarget = parseFloat(formData.targetAmount);
    } else if (targetType === "by_clients") {
      const enabledTargets = clientTargets.filter(
        (ct) => ct.enabled && parseFloat(ct.target_amount) > 0
      );
      if (enabledTargets.length === 0) {
        setError("Please assign a target to at least one client");
        return false;
      }
      totalTarget = calculateTotalClientTarget();
    } else if (targetType === PRODUCT_TARGET_TYPE) {
      const productTargetError = validateProductTargets(productTargets);
      if (productTargetError) {
        setError(productTargetError);
        return false;
      }
      totalTarget = calculateProductTargetValue(productTargets);
    }

    const availableBudget = calculateAvailableBudget();
    if (totalTarget > availableBudget) {
      setError(
        `Target amount (${formatCurrency(
          totalTarget
        )}) exceeds available budget (${formatCurrency(availableBudget)})`
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
      let totalTarget = 0;
      if (targetType === "total_value") {
        totalTarget = parseFloat(formData.targetAmount);
      } else if (targetType === "by_clients") {
        totalTarget = calculateTotalClientTarget();
      } else if (targetType === PRODUCT_TARGET_TYPE) {
        totalTarget = calculateProductTargetValue(productTargets);
      }

      // If editing, update the existing target
      if (isEditing) {
        const { error: updateError } = await salesTargetService.updateTarget(
          editingTarget.id,
          {
            targetAmount: totalTarget,
            currency: preferredCurrency,
            periodType: formData.periodType,
            periodStart: formData.periodStart,
            periodEnd: formData.periodEnd,
            notes: formData.notes,
          }
        );

        if (updateError) throw updateError;

        setSuccess("Sales target updated successfully!");

        if (onTargetCreated) {
          onTargetCreated();
        }

        if (onCancelEdit) {
          onCancelEdit();
        }
        return;
      }

      const targetData = {
        assignedTo: selectedSubordinate,
        companyId: companyId,
        targetAmount: totalTarget,
        currency: preferredCurrency,
        periodType: formData.periodType,
        periodStart: formData.periodStart,
        periodEnd: formData.periodEnd,
        notes: formData.notes,
        targetType: targetType,
      };

      const { data: salesTarget, error: targetError } =
        await salesTargetService.createTarget(targetData);

      if (targetError) throw targetError;

      // Create client targets if applicable
      if (targetType === "by_clients" && salesTarget?.id) {
        const clientTargetsToInsert = clientTargets
          .filter((ct) => ct.enabled && parseFloat(ct.target_amount) > 0)
          .map((ct) => ({
            sales_target_id: salesTarget.id,
            contact_id: ct.contact_id,
            target_amount: parseFloat(ct.target_amount),
            currency: preferredCurrency,
          }));

        if (clientTargetsToInsert.length > 0) {
          await supabase.from("client_targets").insert(clientTargetsToInsert);
        }
      }

      // Create product targets if applicable
      if (targetType === PRODUCT_TARGET_TYPE && salesTarget?.id) {
        const { error: productTargetError } =
          await salesTargetService.createProductTargets(
            salesTarget.id,
            toProductTargetRows(productTargets),
            preferredCurrency
          );

        if (productTargetError) throw productTargetError;
      }

      setSuccess("Sales target assigned successfully!");

      // Log activity for target assignment
      const assignedUser = subordinates.find(s => s.id === salesTarget.assigned_to);
      await activityService.createActivity({
        type: 'note',
        title: `Sales target assigned to ${assignedUser?.full_name || 'team member'}`,
        description: `${salesTarget.target_amount} ${salesTarget.currency} - ${targetType.replace('_', ' ')} target for ${formData.periodType} period`,
        company_id: companyId,
        owner_id: userProfile?.id,
      }).catch(err => console.error('Error logging target assignment activity:', err));

      if (onTargetCreated) {
        onTargetCreated(salesTarget);
      }

      // Reset form
      setSelectedSubordinate("");
      setTargetType("total_value");
      setFormData({
        targetAmount: "",
        periodType: "monthly",
        periodStart: "",
        periodEnd: "",
        notes: "",
      });
      setClientTargets([]);
      setProductTargets([]);
    } catch (error) {
      console.error(
        isEditing ? "Error updating target:" : "Error creating target:",
        error
      );
      setError(
        error.message ||
          (isEditing
            ? "Failed to update sales target"
            : "Failed to create sales target")
      );
    } finally {
      setLoading(false);
    }
  };

  const availableBudget = calculateAvailableBudget();

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              isEditing
                ? "bg-amber-100 dark:bg-amber-900"
                : "bg-blue-100 dark:bg-blue-900"
            }`}
          >
            <Icon
              name={isEditing ? "Pencil" : "Target"}
              size={24}
              className={
                isEditing
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-blue-600 dark:text-blue-400"
              }
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-card-foreground">
              {isEditing ? "Edit Sales Target" : "Assign Sales Target"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isEditing
                ? "Modify the target details below. Target type cannot be changed."
                : "Assign targets to your supervisors and salesmen"}
            </p>
          </div>
        </div>
        {(onClose || (isEditing && onCancelEdit)) && (
          <Button
            variant="ghost"
            size="icon"
            onClick={isEditing ? onCancelEdit : onClose}
          >
            <Icon name="X" size={20} />
          </Button>
        )}
      </div>

      {/* Available Budget Info */}
      <div className="mb-6 p-4 bg-muted rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-card-foreground">
              Available Budget
            </p>
            <p className="text-xs text-muted-foreground">
              From your allocated targets
            </p>
          </div>
          <div
            className={`text-xl font-bold ${
              availableBudget > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatCurrency(availableBudget)}
          </div>
        </div>
        {availableBudget <= 0 && (
          <p className="mt-2 text-xs text-red-600">
            ⚠️ You have no remaining budget. Request more from your director.
          </p>
        )}
      </div>

      {/* Success Message */}
      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <Icon name="CheckCircle" size={16} />
            <span className="text-sm">{success}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Select Team Member */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-card-foreground">
            Assign To
          </label>
          <Select
            value={selectedSubordinate}
            onChange={setSelectedSubordinate}
            placeholder={
              loadingSubordinates ? "Loading..." : "Select team member"
            }
            disabled={isEditing || loadingSubordinates || availableBudget <= 0}
            options={subordinates.map((user) => ({
              value: user.id,
              label: `${user.full_name || user.email} (${capitalize(
                user.role
              )})`,
            }))}
          />
          {isEditing && (
            <p className="text-xs text-muted-foreground">
              Team member cannot be changed when editing
            </p>
          )}
        </div>

        {/* Target Type Selection */}
        {selectedSubordinate && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-card-foreground">
              Target Type
              {isEditing && (
                <span className="ml-2 text-xs text-amber-600 font-normal">
                  (Cannot be changed)
                </span>
              )}
            </label>
            <div
              className={`grid grid-cols-3 gap-3 ${
                isEditing ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => !isEditing && setTargetType("total_value")}
                disabled={isEditing}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  targetType === "total_value"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-border hover:border-blue-300"
                } ${isEditing ? "cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon
                    name="DollarSign"
                    size={20}
                    className={
                      targetType === "total_value"
                        ? "text-blue-600"
                        : "text-muted-foreground"
                    }
                  />
                  <span
                    className={`font-medium ${
                      targetType === "total_value"
                        ? "text-blue-600"
                        : "text-card-foreground"
                    }`}
                  >
                    Total Value
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Set a single target amount
                </p>
              </button>

              <button
                type="button"
                onClick={() => !isEditing && setTargetType("by_clients")}
                disabled={isEditing}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  targetType === "by_clients"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-border hover:border-blue-300"
                } ${isEditing ? "cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon
                    name="Users"
                    size={20}
                    className={
                      targetType === "by_clients"
                        ? "text-blue-600"
                        : "text-muted-foreground"
                    }
                  />
                  <span
                    className={`font-medium ${
                      targetType === "by_clients"
                        ? "text-blue-600"
                        : "text-card-foreground"
                    }`}
                  >
                    By Clients
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Assign targets per client
                </p>
              </button>

              <button
                type="button"
                onClick={() => !isEditing && setTargetType(PRODUCT_TARGET_TYPE)}
                disabled={isEditing}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  targetType === PRODUCT_TARGET_TYPE
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-border hover:border-blue-300"
                } ${isEditing ? "cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon
                    name="Package"
                    size={20}
                    className={
                      targetType === PRODUCT_TARGET_TYPE
                        ? "text-blue-600"
                        : "text-muted-foreground"
                    }
                  />
                  <span
                    className={`font-medium ${
                      targetType === PRODUCT_TARGET_TYPE
                        ? "text-blue-600"
                        : "text-card-foreground"
                    }`}
                  >
                    By Product
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Assign quantity or value targets per product
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Month Selection */}
        {selectedSubordinate && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-card-foreground">
              Select Month
            </label>
            <Select
              value={selectedMonth}
              onChange={(value) => setSelectedMonth(value)}
              options={monthOptions}
              placeholder="Select a month"
            />
          </div>
        )}

        {/* Total Value Target */}
        {selectedSubordinate && targetType === "total_value" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-card-foreground">
              Target Amount ({preferredCurrency})
            </label>
            <Input
              type="number"
              value={formData.targetAmount}
              onChange={(e) =>
                handleInputChange("targetAmount", e.target.value)
              }
              placeholder="Enter target amount"
              step="0.01"
              min="0"
              max={availableBudget}
            />
            <p className="text-xs text-muted-foreground">
              Maximum: {formatCurrency(availableBudget)}
            </p>
          </div>
        )}

        {/* Client-Based Targets */}
        {selectedSubordinate && targetType === "by_clients" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-card-foreground">
                Client Targets
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreateClient(true)}
              >
                <Icon name="Plus" size={14} className="mr-1" />
                Add Client
              </Button>
            </div>

            {loadingClients ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : subordinateClients.length === 0 ? (
              <div className="text-center py-8 bg-muted/50 rounded-lg border border-dashed border-border">
                <Icon
                  name="Users"
                  size={32}
                  className="mx-auto text-muted-foreground mb-2"
                />
                <p className="text-sm text-muted-foreground">
                  No clients found.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowCreateClient(true)}
                >
                  <Icon name="Plus" size={14} className="mr-1" />
                  Create First Client
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto border border-border rounded-lg">
                {clientTargets.map((ct) => (
                  <div
                    key={ct.contact_id}
                    className={`flex items-center gap-4 p-3 hover:bg-muted/50 transition-colors ${
                      ct.enabled ? "bg-blue-50 dark:bg-blue-950" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={ct.enabled}
                      onChange={(e) =>
                        handleClientTargetChange(
                          ct.contact_id,
                          "enabled",
                          e.target.checked
                        )
                      }
                      className="w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">
                        {ct.contact.first_name} {ct.contact.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {ct.contact.company_name ||
                          ct.contact.email ||
                          "No company"}
                      </p>
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        value={ct.target_amount}
                        onChange={(e) =>
                          handleClientTargetChange(
                            ct.contact_id,
                            "target_amount",
                            e.target.value
                          )
                        }
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        disabled={!ct.enabled}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {clientTargets.some((ct) => ct.enabled) && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium text-card-foreground">
                  Total:
                </span>
                <span
                  className={`text-lg font-bold ${
                    calculateTotalClientTarget() > availableBudget
                      ? "text-red-600"
                      : "text-blue-600"
                  }`}
                >
                  {formatCurrency(calculateTotalClientTarget())}
                </span>
              </div>
            )}
          </div>
        )}

        <ProductTargetSelector
          active={selectedSubordinate && targetType === PRODUCT_TARGET_TYPE}
          productTargets={productTargets}
          setProductTargets={setProductTargets}
          formatCurrency={formatCurrency}
          accentClass="text-blue-600"
          selectedBgClass="bg-blue-50 dark:bg-blue-950"
        />

        {/* Create Client Modal */}
        {showCreateClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-card-foreground">
                  Create New Client
                </h4>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowCreateClient(false)}
                >
                  <Icon name="X" size={16} />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-card-foreground mb-1 block">
                      First Name *
                    </label>
                    <Input
                      value={newClient.first_name}
                      onChange={(e) =>
                        setNewClient((prev) => ({
                          ...prev,
                          first_name: e.target.value,
                        }))
                      }
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-card-foreground mb-1 block">
                      Last Name *
                    </label>
                    <Input
                      value={newClient.last_name}
                      onChange={(e) =>
                        setNewClient((prev) => ({
                          ...prev,
                          last_name: e.target.value,
                        }))
                      }
                      placeholder="Last name"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-card-foreground mb-1 block">
                    Company Name
                  </label>
                  <Input
                    value={newClient.company_name}
                    onChange={(e) =>
                      setNewClient((prev) => ({
                        ...prev,
                        company_name: e.target.value,
                      }))
                    }
                    placeholder="Company name"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-card-foreground mb-1 block">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={newClient.email}
                    onChange={(e) =>
                      setNewClient((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-card-foreground mb-1 block">
                    Phone
                  </label>
                  <Input
                    value={newClient.phone}
                    onChange={(e) =>
                      setNewClient((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateClient(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCreateClient}
                    disabled={loading}
                    className="flex-1"
                  >
                    {loading ? "Creating..." : "Create Client"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {selectedSubordinate && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-card-foreground">
              Notes (Optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder="Add any additional notes..."
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded-md text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
            />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center text-sm text-destructive">
              <Icon name="AlertCircle" size={16} className="mr-2" />
              {error}
            </div>
          </div>
        )}

        {/* Submit Button */}
        {selectedSubordinate && (
          <div className="flex items-center justify-between pt-4 border-t border-border">
            {/* Delete Button (only in edit mode) */}
            <div>
              {isEditing && onDeleteTarget && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onDeleteTarget}
                  disabled={loading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  <Icon name="Trash2" size={16} className="mr-2" />
                  Delete Target
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {(onClose || (isEditing && onCancelEdit)) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={isEditing ? onCancelEdit : onClose}
                  disabled={loading}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={
                  loading ||
                  loadingSubordinates ||
                  (!isEditing && availableBudget <= 0)
                }
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    {isEditing ? "Saving..." : "Assigning..."}
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Icon
                      name={isEditing ? "Save" : "Target"}
                      size={16}
                      className="mr-2"
                    />
                    {isEditing ? "Save Changes" : "Assign Target"}
                  </div>
                )}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default ManagerSalesTargetAssignment;
