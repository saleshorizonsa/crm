import React, { useState, useMemo } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";

const TaskListView = ({
  tasks,
  onTaskClick,
  onTaskUpdate,
  onTaskDelete,
  selectedTasks = [],
  onTaskSelect = () => {},
  isLoading,
}) => {
  const [sortConfig, setSortConfig] = useState({
    key: "due_date",
    direction: "asc",
  });

  const sortedTasks = useMemo(() => {
    if (!tasks) return [];

    const sorted = [...tasks].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle null values
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      // Convert to comparable values
      if (sortConfig.key === "due_date" || sortConfig.key === "created_at") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue?.toLowerCase() || "";
      }

      if (aValue < bValue) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }, [tasks, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((prevConfig) => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const getPriorityBadge = (priority) => {
    const styles = {
      high: "bg-red-100 text-red-700 border-red-200",
      medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
      low: "bg-green-100 text-green-700 border-green-200",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
          styles[priority] || styles.low
        }`}
      >
        {priority}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
      in_progress: "bg-blue-100 text-blue-700 border-blue-200",
      completed: "bg-green-100 text-green-700 border-green-200",
      cancelled: "bg-gray-100 text-gray-700 border-gray-200",
    };
    const labels = {
      pending: "Pending",
      in_progress: "In Progress",
      completed: "Completed",
      cancelled: "Cancelled",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
          styles[status] || styles.pending
        }`}
      >
        {labels[status]}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "No date";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isOverdue = (dueDate, status) => {
    if (!dueDate || status === "completed" || status === "cancelled")
      return false;
    return new Date(dueDate) < new Date();
  };

  const handleSelectAll = () => {
    if (selectedTasks.length === tasks.length) {
      onTaskSelect([]);
    } else {
      onTaskSelect(tasks.map((t) => t.id));
    }
  };

  const handleSelectTask = (taskId) => {
    if (selectedTasks.includes(taskId)) {
      onTaskSelect(selectedTasks.filter((id) => id !== taskId));
    } else {
      onTaskSelect([...selectedTasks, taskId]);
    }
  };

  const SortableHeader = ({ column, children }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortConfig.key === column && (
          <Icon
            name={sortConfig.direction === "asc" ? "ChevronUp" : "ChevronDown"}
            size={14}
          />
        )}
      </div>
    </th>
  );

  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <Icon
          name="Inbox"
          size={48}
          className="mx-auto mb-4 text-muted-foreground opacity-50"
        />
        <h3 className="text-lg font-medium text-card-foreground mb-2">
          No tasks found
        </h3>
        <p className="text-muted-foreground">
          Create a new task to get started
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-4">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-4 w-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded flex-1"></div>
                <div className="h-4 bg-gray-200 rounded w-20"></div>
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-4 py-3 w-12">
                <Checkbox
                  checked={
                    selectedTasks.length === tasks.length && tasks.length > 0
                  }
                  onChange={handleSelectAll}
                />
              </th>
              <SortableHeader column="title">Task</SortableHeader>
              <SortableHeader column="priority">Priority</SortableHeader>
              <SortableHeader column="status">Status</SortableHeader>
              <SortableHeader column="due_date">Due Date</SortableHeader>
              <SortableHeader column="assigned_to_name">
                Assigned To
              </SortableHeader>
              <SortableHeader column="created_by_name">
                Created By
              </SortableHeader>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Related
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedTasks.map((task) => (
              <tr
                key={task.id}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onTaskClick(task)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedTasks.includes(task.id)}
                    onChange={() => handleSelectTask(task.id)}
                  />
                </td>

                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-card-foreground">
                      {task.title}
                    </span>
                    {task.description && (
                      <span className="text-sm text-muted-foreground line-clamp-1">
                        {task.description}
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3">{getPriorityBadge(task.priority)}</td>

                <td className="px-4 py-3">{getStatusBadge(task.status)}</td>

                <td className="px-4 py-3">
                  <div
                    className={`flex items-center space-x-1 ${
                      isOverdue(task.due_date, task.status)
                        ? "text-red-600 font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Icon name="Calendar" size={14} />
                    <span className="text-sm">{formatDate(task.due_date)}</span>
                    {isOverdue(task.due_date, task.status) && (
                      <Icon name="AlertCircle" size={14} />
                    )}
                  </div>
                </td>

                <td className="px-4 py-3">
                  {task.assigned_to_name ? (
                    <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                      <Icon name="User" size={14} />
                      <span>{task.assigned_to_name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Unassigned
                    </span>
                  )}
                </td>

                <td className="px-4 py-3">
                  {task.created_by_name ? (
                    <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                      <Icon name="UserPlus" size={14} />
                      <span>{task.created_by_name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Unknown
                    </span>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex flex-col space-y-1">
                    {task.contact_name && (
                      <span className="inline-flex items-center space-x-1 text-xs text-blue-700">
                        <Icon name="User" size={12} />
                        <span className="truncate max-w-[120px]">
                          {task.contact_name}
                        </span>
                      </span>
                    )}
                    {task.deal_title && (
                      <span className="inline-flex items-center space-x-1 text-xs text-purple-700">
                        <Icon name="DollarSign" size={12} />
                        <span className="truncate max-w-[120px]">
                          {task.deal_title}
                        </span>
                      </span>
                    )}
                  </div>
                </td>

                <td
                  className="px-4 py-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end space-x-1">
                    {task.status !== "completed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onTaskUpdate({
                            ...task,
                            status: "completed",
                            completed_at: new Date().toISOString(),
                          })
                        }
                        title="Mark as complete"
                      >
                        <Icon
                          name="CheckCircle"
                          size={16}
                          className="text-green-600"
                        />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onTaskClick(task)}
                      title="Edit task"
                    >
                      <Icon name="Edit" size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onTaskDelete(task.id)}
                      title="Delete task"
                    >
                      <Icon name="Trash2" size={16} className="text-red-600" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaskListView;
