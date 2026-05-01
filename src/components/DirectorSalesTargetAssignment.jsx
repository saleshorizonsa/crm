import React, { useState, useEffect } from "react";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Button from "./ui/Button";
import Icon from "./AppIcon";
import ProductTargetSelector from "./ProductTargetSelector";
import {
  salesTargetService,
  userService,
  contactService,
  activityService,
} from "../services/supabaseService";
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

const DirectorSalesTargetAssignment = ({
  onTargetCreated,
  companyId,
  onClose,
}) => {
  const { userProfile } = useAuth();
  const { preferredCurrency, formatCurrency } = useCurrency();

  // Form state
  const [selectedSubordinate, setSelectedSubordinate] = useState("");
  const [targetType, setTargetType] = useState("total_value");
  const [formData, setFormData] = useState({
    targetAmount: "",
    periodType: "monthly",
    periodStart: "",
    periodEnd: "",
    notes: "",
  });

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
  const [managers, setManagers] = useState([]);
  const [subordinateClients, setSubordinateClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingManagers, setLoadingManagers] = useState(true);
  const [loadingClients, setLoadingClients] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const periodTypes = [
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
  ];

  // Load managers (directors can only assign to managers)
  useEffect(() => {
    const loadManagers = async () => {
      if (!userProfile?.id) return;

      setLoadingManagers(true);
      try {
        const { data, error } = await userService.getUserSubordinates(
          userProfile.id
        );

        if (error) throw error;

        // Filter to heads and managers for directors (new hierarchy: Director -> Head -> Manager)
        const filteredManagers =
          data?.filter((user) => user.role === "head" || user.role === "manager") || [];
        setManagers(filteredManagers);
      } catch (error) {
        console.error("Error loading managers:", error);
        setError("Failed to load managers");
      } finally {
        setLoadingManagers(false);
      }
    };

    loadManagers();
  }, [userProfile?.id]);

  // Load subordinate's clients when a subordinate is selected
  useEffect(() => {
    const loadSubordinateClients = async () => {
      if (!selectedSubordinate) {
        setSubordinateClients([]);
        setClientTargets([]);
        return;
      }

      setLoadingClients(true);
      try {
        // Get all contacts owned by the selected subordinate
        const { data, error } = await supabase
          .from("contacts")
          .select("*")
          .eq("owner_id", selectedSubordinate)
          .order("company_name", { ascending: true });

        if (error) throw error;

        setSubordinateClients(data || []);

        // Initialize client targets with empty values
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

  // Calculate period end date
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
      // Create client for the selected subordinate
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

      // Add to subordinate clients list
      setSubordinateClients((prev) => [...prev, data]);

      // Add to client targets with enabled
      setClientTargets((prev) => [
        ...prev,
        {
          contact_id: data.id,
          contact: data,
          target_amount: "",
          enabled: true,
        },
      ]);

      // Reset form
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

  const validateForm = () => {
    if (!selectedSubordinate) {
      setError("Please select a manager to assign the target to");
      return false;
    }

    if (!formData.periodStart) {
      setError("Please select a start date");
      return false;
    }

    if (targetType === "total_value") {
      if (!formData.targetAmount || parseFloat(formData.targetAmount) <= 0) {
        setError("Please enter a valid target amount");
        return false;
      }
    } else if (targetType === "by_clients") {
      // Check if at least one client has a target
      const enabledTargets = clientTargets.filter(
        (ct) => ct.enabled && parseFloat(ct.target_amount) > 0
      );
      if (enabledTargets.length === 0) {
        setError("Please assign a target to at least one client");
        return false;
      }
    } else if (targetType === PRODUCT_TARGET_TYPE) {
      const productTargetError = validateProductTargets(productTargets);
      if (productTargetError) {
        setError(productTargetError);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setError("");

    try {
      // Calculate total target amount
      let totalTarget = 0;
      if (targetType === "total_value") {
        totalTarget = parseFloat(formData.targetAmount);
      } else if (targetType === "by_clients") {
        totalTarget = clientTargets
          .filter((ct) => ct.enabled && parseFloat(ct.target_amount) > 0)
          .reduce((sum, ct) => sum + parseFloat(ct.target_amount), 0);
      } else if (targetType === PRODUCT_TARGET_TYPE) {
        totalTarget = calculateProductTargetValue(productTargets);
      }

      // Create the main sales target
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

      // If client-based targets, create individual client targets
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
          const { error: clientTargetError } = await supabase
            .from("client_targets")
            .insert(clientTargetsToInsert);

          if (clientTargetError) {
            console.error("Error creating client targets:", clientTargetError);
            // Don't throw - main target was created successfully
          }
        }
      }

      // If product-based targets, create individual product target rows
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
      const assignedUser = managers.find(u => u.id === salesTarget.assigned_to);
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
      console.error("Error creating target:", error);
      setError(error.message || "Failed to create sales target");
    } finally {
      setLoading(false);
    }
  };

  // Calculate total from client targets
  const calculateTotalClientTarget = () => {
    return clientTargets
      .filter((ct) => ct.enabled && parseFloat(ct.target_amount) > 0)
      .reduce((sum, ct) => sum + parseFloat(ct.target_amount || 0), 0);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon name="Target" size={24} className="text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Assign Sales Target
            </h3>
            <p className="text-sm text-muted-foreground">
              Assign targets to your managers by total value or by clients
            </p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Icon name="X" size={20} />
          </Button>
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
        {/* Step 1: Select Manager */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-card-foreground">
            Assign To (Manager)
          </label>
          <Select
            value={selectedSubordinate}
            onChange={setSelectedSubordinate}
            placeholder={
              loadingManagers ? "Loading managers..." : "Select a manager"
            }
            disabled={loadingManagers}
            options={managers.map((user) => ({
              value: user.id,
              label: `${user.full_name || user.email} ${
                user.department ? `(${user.department})` : ""
              }`,
            }))}
          />
          {managers.length === 0 && !loadingManagers && (
            <p className="text-xs text-amber-600">
              No managers found. Please ensure you have managers assigned to
              you.
            </p>
          )}
        </div>

        {/* Step 2: Target Type Selection */}
        {selectedSubordinate && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-card-foreground">
              Target Assignment Type
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setTargetType("total_value")}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  targetType === "total_value"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon
                    name="DollarSign"
                    size={20}
                    className={
                      targetType === "total_value"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  />
                  <span
                    className={`font-medium ${
                      targetType === "total_value"
                        ? "text-primary"
                        : "text-card-foreground"
                    }`}
                  >
                    Total Value
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Set a single target amount for all sales
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTargetType("by_clients")}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  targetType === "by_clients"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon
                    name="Users"
                    size={20}
                    className={
                      targetType === "by_clients"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  />
                  <span
                    className={`font-medium ${
                      targetType === "by_clients"
                        ? "text-primary"
                        : "text-card-foreground"
                    }`}
                  >
                    By Clients
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Assign targets per client for detailed tracking
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTargetType(PRODUCT_TARGET_TYPE)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  targetType === PRODUCT_TARGET_TYPE
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon
                    name="Package"
                    size={20}
                    className={
                      targetType === PRODUCT_TARGET_TYPE
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  />
                  <span
                    className={`font-medium ${
                      targetType === PRODUCT_TARGET_TYPE
                        ? "text-primary"
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

        {/* Period Selection */}
        {selectedSubordinate && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">
                Period Type
              </label>
              <Select
                value={formData.periodType}
                onChange={(value) => handleInputChange("periodType", value)}
                options={periodTypes}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">
                Start Date
              </label>
              <Input
                type="date"
                value={formData.periodStart}
                onChange={(e) =>
                  handleInputChange("periodStart", e.target.value)
                }
                min={formatLocalDateYMD(new Date())}
              />
            </div>
          </div>
        )}

        {/* End Date Display */}
        {formData.periodEnd && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-card-foreground">
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
            />
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
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : subordinateClients.length === 0 ? (
              <div className="text-center py-8 bg-muted/50 rounded-lg border border-dashed border-border">
                <Icon
                  name="Users"
                  size={32}
                  className="mx-auto text-muted-foreground mb-2"
                />
                <p className="text-sm text-muted-foreground">
                  No clients found for this manager.
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
              <div className="space-y-2 max-h-80 overflow-y-auto border border-border rounded-lg">
                {clientTargets.map((ct) => (
                  <div
                    key={ct.contact_id}
                    className={`flex items-center gap-4 p-3 hover:bg-muted/50 transition-colors ${
                      ct.enabled ? "bg-primary/5" : ""
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
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
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
                    <div className="w-32">
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

            {/* Total Summary for Client Targets */}
            {clientTargets.some((ct) => ct.enabled) && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium text-card-foreground">
                  Total Target Amount:
                </span>
                <span className="text-lg font-bold text-primary">
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
          accentClass="text-primary"
          selectedBgClass="bg-primary/5"
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
              placeholder="Add any additional notes or objectives..."
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
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            {onClose && (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading || loadingManagers}>
              {loading ? (
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Assigning...
                </div>
              ) : (
                <div className="flex items-center">
                  <Icon name="Target" size={16} className="mr-2" />
                  Assign Target
                </div>
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
};

export default DirectorSalesTargetAssignment;
