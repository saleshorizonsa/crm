import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import { useAuth } from "../../../contexts/AuthContext";
import { userService } from "../../../services/supabaseService";
import { useLanguage } from "../../../i18n";

const TaskFilters = ({ filters, onFilterChange }) => {
  const { company, userProfile } = useAuth();
  const { t } = useLanguage();
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
        { value: "", label: t("pipeline.allMembers") },
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
    { value: "", label: t("contacts.allTime") },
    { value: "today", label: t("contacts.today") },
    { value: "this-week", label: t("tasks.thisWeek") },
    { value: "this-month", label: t("tasks.thisMonth") },
    { value: "this-quarter", label: t("tasks.thisQuarter") },
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
            placeholder={t("tasks.searchTasksPlaceholder")}
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
          <span>{t("common.filter")}</span>
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
            {t("common.clear")}
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border animate-slide-down">
          {/* Priority Filter */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              {t("tasks.priority")}
            </label>
            <select
              value={filters?.priority || ""}
              onChange={(e) =>
                onFilterChange({ ...filters, priority: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t("tasks.allPriorities")}</option>
              <option value="low">{t("tasks.low")}</option>
              <option value="medium">{t("tasks.medium")}</option>
              <option value="high">{t("tasks.high")}</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              {t("common.status")}
            </label>
            <select
              value={filters?.status || ""}
              onChange={(e) =>
                onFilterChange({ ...filters, status: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t("tasks.allStatuses")}</option>
              <option value="pending">{t("tasks.pending")}</option>
              <option value="in_progress">{t("tasks.inProgress")}</option>
              <option value="completed">{t("tasks.completed")}</option>
              <option value="cancelled">{t("tasks.cancelled")}</option>
            </select>
          </div>

          {/* Member Filter - Only show for supervisors, managers, and directors */}
          {canFilterByMember && (
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                {t("tasks.assignedTo")}
              </label>
              <Select
                placeholder={t("pipeline.allMembers")}
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
              {t("tasks.dateRange")}
            </label>
            <Select
              placeholder={t("contacts.allTime")}
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
          {t("tasks.highPriority")}
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
          {t("tasks.pending")}
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
          {t("tasks.inProgress")}
        </Button>
      </div>
    </div>
  );
};

export default TaskFilters;
