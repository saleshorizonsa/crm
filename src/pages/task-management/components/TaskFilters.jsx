import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import { useAuth } from "../../../contexts/AuthContext";
import { userService } from "../../../services/supabaseService";

const TaskFilters = ({ filters, onFilterChange }) => {
  const { company, userProfile } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [members, setMembers] = useState([]);

  const priorities = ["low", "medium", "high"];
  const statuses = ["pending", "in_progress", "completed", "cancelled"];

  // Check if user can see member filter (supervisor, manager, director)
  const canFilterByMember = ["supervisor", "manager", "director"].includes(
    userProfile?.role
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
    const { data, error } = await userService.getUserSubordinates(
      userProfile.id
    );

    if (!error && data) {
      let filteredMembers = [];

      if (userProfile?.role === "director") {
        filteredMembers = data.filter((user) => user.role === "manager");
      } else if (userProfile?.role === "manager") {
        filteredMembers = data.filter(
          (user) =>
            user.role === "supervisor" ||
            user.role === "salesman" ||
            user.role === "sales_rep"
        );
      } else if (userProfile?.role === "supervisor") {
        filteredMembers = data.filter(
          (user) => user.role === "salesman" || user.role === "sales_rep"
        );
      }

      setMembers([
        { value: "", label: "All Members" },
        {
          value: userProfile.id,
          label: `${userProfile.full_name || userProfile.email} (${formatRole(
            userProfile.role
          )})`,
        },
        ...filteredMembers.map((user) => ({
          value: user.id,
          label: `${user.full_name || user.email} (${formatRole(user.role)})`,
        })),
      ]);
    }
  };

  const dateRanges = [
    { value: "", label: "All Time" },
    { value: "today", label: "Today" },
    { value: "this-week", label: "This Week" },
    { value: "this-month", label: "This Month" },
    { value: "this-quarter", label: "This Quarter" },
  ];

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters?.priority) count++;
    if (filters?.status) count++;
    if (filters?.assignedTo) count++;
    if (filters?.dateRange) count++;
    return count;
  };

  const handleClearFilters = () => {
    onFilterChange({
      search: "",
      priority: "",
      status: "",
      assignedTo: "",
      dateRange: "",
    });
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      {/* Search Bar */}
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <Input
            type="search"
            placeholder="Search tasks by title or description..."
            value={filters?.search || ""}
            onChange={(e) =>
              onFilterChange({ ...filters, search: e.target.value })
            }
            className="w-full"
          />
        </div>

        <Button
          variant="outline"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-2"
        >
          <Icon name="Filter" size={16} />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
          <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={16} />
        </Button>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            onClick={handleClearFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon name="X" size={16} className="mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border animate-slide-down">
          {/* Priority Filter */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              Priority
            </label>
            <select
              value={filters?.priority || ""}
              onChange={(e) =>
                onFilterChange({ ...filters, priority: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Priorities</option>
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              Status
            </label>
            <select
              value={filters?.status || ""}
              onChange={(e) =>
                onFilterChange({ ...filters, status: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status
                    .replace("_", " ")
                    .split(" ")
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(" ")}
                </option>
              ))}
            </select>
          </div>

          {/* Member Filter - Only show for supervisors, managers, and directors */}
          {canFilterByMember && (
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                Assigned To
              </label>
              <Select
                placeholder="All Members"
                options={members}
                value={filters?.assignedTo || ""}
                onChange={(value) =>
                  onFilterChange({ ...filters, assignedTo: value })
                }
              />
            </div>
          )}

          {/* Date Range Filter */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              Date Range
            </label>
            <Select
              placeholder="All Time"
              options={dateRanges}
              value={filters?.dateRange || ""}
              onChange={(value) =>
                onFilterChange({ ...filters, dateRange: value })
              }
            />
          </div>
        </div>
      )}

      {/* Quick Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filters?.priority === "high" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            onFilterChange({
              ...filters,
              priority: filters?.priority === "high" ? "" : "high",
            })
          }
        >
          <Icon name="AlertCircle" size={14} className="mr-1" />
          High Priority
        </Button>

        <Button
          variant={filters?.status === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            onFilterChange({
              ...filters,
              status: filters?.status === "pending" ? "" : "pending",
            })
          }
        >
          <Icon name="Clock" size={14} className="mr-1" />
          Pending
        </Button>

        <Button
          variant={filters?.status === "in_progress" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            onFilterChange({
              ...filters,
              status: filters?.status === "in_progress" ? "" : "in_progress",
            })
          }
        >
          <Icon name="PlayCircle" size={14} className="mr-1" />
          In Progress
        </Button>
      </div>
    </div>
  );
};

export default TaskFilters;
