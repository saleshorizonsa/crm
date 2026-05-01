import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { activityService } from "../../../services/supabaseService";

const ActivityModal = ({ isOpen, onClose, companyId, currentUserId }) => {
  const { formatCurrency } = useCurrency();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Filters
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    searchQuery: "",
  });

  useEffect(() => {
    if (isOpen && companyId) {
      fetchActivities();
    }
  }, [isOpen, companyId, currentPage, filters]);

  const fetchActivities = async () => {
    setLoading(true);
    const {
      data,
      count,
      totalPages: pages,
      error,
    } = await activityService.getAllActivities(companyId, {
      type: null,
      userId: currentUserId || null,
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
      searchQuery: filters.searchQuery || null,
      page: currentPage,
      pageSize,
    });

    if (!error) {
      setActivities(data);
      setTotalCount(count);
      setTotalPages(pages);
    }
    setLoading(false);
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      searchQuery: "",
    });
    setCurrentPage(1);
  };

  const getActivityIcon = (type) => {
    const iconMap = {
      sale: "DollarSign",
      task: "CheckSquare",
      contact: "Users",
      meeting: "Calendar",
      call: "Phone",
      email: "Mail",
      deal: "Handshake",
      note: "FileText",
    };
    return iconMap?.[type] || "Activity";
  };

  const getActivityColor = (type) => {
    const colorMap = {
      sale: "text-success bg-success/10",
      task: "text-primary bg-primary/10",
      contact: "text-accent bg-accent/10",
      meeting: "text-warning bg-warning/10",
      call: "text-secondary bg-secondary/10",
      email: "text-muted-foreground bg-muted",
      deal: "text-success bg-success/10",
      note: "text-muted-foreground bg-muted",
    };
    return colorMap?.[type] || "text-muted-foreground bg-muted";
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Activity" className="text-primary" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">All Activities</h2>
              <p className="text-sm text-muted-foreground">
                {totalCount} total activities
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Input
                placeholder="Search activities..."
                value={filters.searchQuery}
                onChange={(e) =>
                  handleFilterChange("searchQuery", e.target.value)
                }
                className="w-full"
              />
            </div>
            <div>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                placeholder="From Date"
                className="w-full"
              />
            </div>
            <div className="flex gap-2">
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                placeholder="To Date"
                className="w-full"
              />
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="px-2"
                  title="Clear filters"
                >
                  <Icon name="X" size={16} />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Activity List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg animate-pulse"
                >
                  <div className="w-10 h-10 bg-muted rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12">
              <Icon
                name="Activity"
                size={48}
                className="text-muted-foreground mx-auto mb-4"
              />
              <h3 className="text-lg font-medium mb-2">No activities found</h3>
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Try adjusting your filters"
                  : "Activities will appear here as they are logged"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 p-4 bg-card border border-border rounded-lg hover:shadow-md transition-shadow"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getActivityColor(
                      activity.type,
                    )}`}
                  >
                    <Icon name={getActivityIcon(activity.type)} size={18} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {activity.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {(activity.owner || activity.user) && (
                            <span className="flex items-center gap-1">
                              <Icon name="User" size={12} />
                              {activity.owner?.full_name ||
                                activity.user?.full_name ||
                                "Unknown"}
                            </span>
                          )}
                          {activity.contact && (
                            <span className="flex items-center gap-1">
                              <Icon name="UserCircle" size={12} />
                              {activity.contact.first_name}{" "}
                              {activity.contact.last_name}
                            </span>
                          )}
                          {activity.deal && (
                            <span className="flex items-center gap-1">
                              <Icon name="Briefcase" size={12} />
                              {activity.deal.title}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(activity.created_at)}
                        </span>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getActivityColor(
                              activity.type,
                            )}`}
                          >
                            {activity.type}
                          </span>
                        </div>
                      </div>
                    </div>

                    {activity.metadata && (
                      <div className="mt-2 text-xs">
                        {activity.metadata.amount && (
                          <span className="font-medium text-success">
                            {formatCurrency(activity.metadata.amount)}
                          </span>
                        )}
                        {activity.metadata.client && (
                          <span className="text-muted-foreground">
                            {" "}
                            • {activity.metadata.client}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
              >
                <Icon name="ChevronLeft" size={16} />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages || loading}
              >
                Next
                <Icon name="ChevronRight" size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityModal;
