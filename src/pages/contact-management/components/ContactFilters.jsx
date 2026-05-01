import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";

const ContactFilters = ({ filters, onFilterChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const statuses = ["active", "inactive"];

  const activityPeriods = [
    { label: "All Time", value: "all" },
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
    { label: "Last 6 months", value: "6m" },
    { label: "Last year", value: "1y" },
  ];

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters?.status) count++;
    if (filters?.tags && filters?.tags?.length > 0) count++;
    if (filters?.owner) count++;
    if (filters?.sort) count++;
    return count;
  };

  const handleClearFilters = () => {
    onFilterChange({
      search: "",
      status: "",
      tags: [],
      owner: "",
      sort: "",
    });
  };

  const handleSortToggle = (value) => {
    onFilterChange({ ...filters, sort: filters?.sort === value ? "" : value });
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      {/* Search Bar */}
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <Input
            type="search"
            placeholder="Search clients by name, email, or company..."
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-border animate-slide-down">
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
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Activity Period Filter */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              Last Activity
            </label>
            <select
              value={filters?.activityPeriod || "all"}
              onChange={(e) =>
                onFilterChange({ ...filters, activityPeriod: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {activityPeriods.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Quick Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filters?.status === "active" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            onFilterChange({
              ...filters,
              status: filters?.status === "active" ? "" : "active",
            })
          }
        >
          <Icon name="CheckCircle" size={14} className="mr-1" />
          Active
        </Button>

        <Button
          variant={filters?.status === "inactive" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            onFilterChange({
              ...filters,
              status: filters?.status === "inactive" ? "" : "inactive",
            })
          }
        >
          <Icon name="XCircle" size={14} className="mr-1" />
          Inactive
        </Button>

        <div className="w-px bg-border self-stretch mx-1" />

        <Button
          variant={filters?.sort === "hottest" ? "default" : "outline"}
          size="sm"
          onClick={() => handleSortToggle("hottest")}
        >
          <Icon name="TrendingUp" size={14} className="mr-1" />
          Hottest first
        </Button>

        <Button
          variant={filters?.sort === "coldest" ? "default" : "outline"}
          size="sm"
          onClick={() => handleSortToggle("coldest")}
        >
          <Icon name="TrendingDown" size={14} className="mr-1" />
          Coldest first
        </Button>
      </div>
    </div>
  );
};

export default ContactFilters;
