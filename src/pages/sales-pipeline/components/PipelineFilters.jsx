import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import { useAuth } from "../../../contexts/AuthContext";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { userService } from "../../../services/supabaseService";

const PipelineFilters = ({
  onFiltersChange,
  totalDeals,
  filteredDeals,
  onExport,
  initialFilters,
}) => {
  const { company, userProfile } = useAuth();
  const { getCurrencySymbol } = useCurrency();
  const [members, setMembers] = useState([]);
  const [localFilters, setLocalFilters] = useState(
    initialFilters || {
      search: "",
      owner_id: "",
      stage: "",
      minValue: "",
      maxValue: "",
      dateRange: "",
      customDateRange: { from: "", to: "" },
      showOverdue: false,
    },
  );

  // Check if current user is a salesman (should not see member filter)
  const isSalesman =
    userProfile?.role === "salesman" || userProfile?.role === "sales_rep";

  // Check if user can see member filter (supervisor, manager, director)
  const canFilterByMember = ["supervisor", "manager", "director"].includes(
    userProfile?.role,
  );

  // Helper function to format role for display
  const formatRole = (role) => {
    const roleMap = {
      director: "Director",
      manager: "Manager",
      supervisor: "Supervisor",
      salesman: "Salesman",
      sales_rep: "Sales Rep",
    };
    return roleMap[role] || role;
  };

  useEffect(() => {
    if (company?.id && userProfile?.id && canFilterByMember) {
      loadMembers();
    }
  }, [company?.id, userProfile?.id, userProfile?.role]);

  const loadMembers = async () => {
    // For supervisors, managers, and directors - load their subordinates based on role
    const { data, error } = await userService.getUserSubordinates(
      userProfile.id,
    );

    if (!error && data) {
      let filteredMembers = [];

      // Filter subordinates based on user's role
      if (userProfile?.role === "director") {
        // Directors see heads and managers
        filteredMembers = data.filter(
          (user) => user.role === "head" || user.role === "manager",
        );
      } else if (userProfile?.role === "head") {
        // Heads see managers
        filteredMembers = data.filter((user) => user.role === "manager");
      } else if (userProfile?.role === "manager") {
        // Managers see supervisors and salesmen
        filteredMembers = data.filter(
          (user) =>
            user.role === "supervisor" ||
            user.role === "salesman" ||
            user.role === "sales_rep",
        );
      } else if (userProfile?.role === "supervisor") {
        // Supervisors see salesmen only
        filteredMembers = data.filter(
          (user) => user.role === "salesman" || user.role === "sales_rep",
        );
      }

      setMembers([
        { value: "", label: "All Members" },
        // Add current user first
        {
          value: userProfile.id,
          label: `${userProfile.full_name || userProfile.email} (${formatRole(
            userProfile.role,
          )})`,
        },
        // Add subordinates with role in brackets
        ...filteredMembers.map((user) => ({
          value: user.id,
          label: `${user.full_name || user.email} (${formatRole(user.role)})`,
        })),
      ]);
    }
  };

  const stages = [
    { value: "", label: "All Stages" },
    { value: "lead", label: "Lead" },
    { value: "contact_made", label: "Qualified" },
    { value: "proposal_sent", label: "Proposal" },
    { value: "negotiation", label: "Negotiation" },
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
  ];

  const handleFilterChange = (key, value) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleDateRangeChange = (rangeValue, customRange) => {
    const newFilters = {
      ...localFilters,
      dateRange: rangeValue,
      customDateRange: customRange || { from: "", to: "" },
    };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      search: "",
      owner_id: "",
      stage: "",
      minValue: "",
      maxValue: "",
      dateRange: "",
      customDateRange: { from: "", to: "" },
      showOverdue: false,
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const hasActiveFilters =
    !!localFilters.search ||
    !!localFilters.owner_id ||
    !!localFilters.stage ||
    !!localFilters.minValue ||
    !!localFilters.maxValue ||
    !!localFilters.dateRange ||
    !!localFilters.showOverdue;

  return (
    <div className="bg-card border border-border rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Icon name="Filter" size={20} className="text-muted-foreground" />
          <h3 className="text-lg font-semibold text-card-foreground">
            Funnel Filters
          </h3>
          <div className="text-sm text-muted-foreground">
            Showing {filteredDeals} of {totalDeals} deals
          </div>
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            iconName="X"
            iconPosition="left"
          >
            Clear Filters
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {/* Search */}
        <div className="lg:col-span-2">
          <Input
            type="search"
            placeholder="Search deals, companies, contacts..."
            value={localFilters?.search}
            onChange={(e) => handleFilterChange("search", e?.target?.value)}
            className="w-full"
          />
        </div>

        {/* Member - Only show for supervisors, managers, and directors */}
        {canFilterByMember && (
          <Select
            placeholder="Member"
            options={members}
            value={localFilters?.owner_id}
            onChange={(value) => handleFilterChange("owner_id", value)}
          />
        )}

        {/* Date Range */}
        <DateRangePicker
          value={localFilters?.dateRange}
          customRange={localFilters?.customDateRange}
          onChange={handleDateRangeChange}
          placeholder="Date Range"
        />

        {/* Stage */}
        <Select
          placeholder="Stage"
          options={stages}
          value={localFilters?.stage}
          onChange={(value) => handleFilterChange("stage", value)}
        />

        {/* Overdue Filter */}
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="showOverdue"
            checked={localFilters?.showOverdue}
            onChange={(e) =>
              handleFilterChange("showOverdue", e.target.checked)
            }
            className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
          />
          <label
            htmlFor="showOverdue"
            className="text-sm text-card-foreground cursor-pointer"
          >
            Overdue Only
          </label>
        </div>
      </div>
      {/* Value Range */}
      <div className="flex items-center space-x-4 mt-4">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Deal Value:</span>
          <Input
            type="number"
            placeholder={`Min (${getCurrencySymbol()})`}
            value={localFilters?.minValue}
            onChange={(e) => handleFilterChange("minValue", e?.target?.value)}
            className="w-28"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            placeholder={`Max (${getCurrencySymbol()})`}
            value={localFilters?.maxValue}
            onChange={(e) => handleFilterChange("maxValue", e?.target?.value)}
            className="w-28"
          />
        </div>

        <div className="flex items-center space-x-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            iconName="Download"
            iconPosition="left"
            onClick={onExport}
          >
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconName="RefreshCw"
            iconPosition="left"
          >
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PipelineFilters;
