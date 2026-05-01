import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";

const TaskKanbanBoard = ({ tasks, onTaskClick, onTaskUpdate, isLoading }) => {
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const columns = [
    {
      id: "pending",
      title: "Pending",
      icon: "Clock",
    },
    {
      id: "in_progress",
      title: "In Progress",
      icon: "PlayCircle",
    },
    {
      id: "completed",
      title: "Completed",
      icon: "CheckCircle",
    },
    {
      id: "cancelled",
      title: "Cancelled",
      icon: "XCircle",
    },
  ];

  const getTasksByStatus = (status) => {
    return tasks?.filter((task) => task.status === status) || [];
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else if (date < today) {
      return "Overdue";
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const isOverdue = (dueDate, status) => {
    if (!dueDate || status === "completed" || status === "cancelled")
      return false;
    return new Date(dueDate) < new Date();
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      await onTaskUpdate({
        ...task,
        status: newStatus,
        ...(newStatus === "completed" && {
          completed_at: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("Error updating task status:", error);
    }
  };

  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.target);
    // Add a subtle opacity to the dragged element
    e.target.style.opacity = "0.5";
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = "1";
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (columnId) => {
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedTask || draggedTask.status === newStatus) {
      setDraggedTask(null);
      return;
    }

    await handleStatusChange(draggedTask, newStatus);
    setDraggedTask(null);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-lg p-4"
          >
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-16 bg-gray-100 rounded mb-2"></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((column) => {
        const columnTasks = getTasksByStatus(column.id);

        return (
          <div key={column.id} className="flex flex-col h-full">
            {/* Column Header */}
            <div className={`border-2 ${column.color} rounded-t-lg p-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Icon
                    name={column.icon}
                    size={18}
                    className={column.textColor}
                  />
                  <h3 className={`font-semibold ${column.textColor}`}>
                    {column.title}
                  </h3>
                </div>
                <span
                  className={`text-sm font-medium ${column.textColor} bg-white px-2 py-0.5 rounded-full`}
                >
                  {columnTasks.length}
                </span>
              </div>
            </div>

            {/* Column Body */}
            <div
              className={`flex-1 bg-muted/30 border border-t-0 border-border rounded-b-lg p-2 space-y-2 min-h-[400px] overflow-y-auto transition-colors ${
                dragOverColumn === column.id
                  ? "bg-blue-100 border-blue-400"
                  : ""
              }`}
              onDragOver={handleDragOver}
              onDragEnter={() => handleDragEnter(column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {columnTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Icon name="Inbox" size={32} className="mb-2 opacity-50" />
                  <p className="text-sm">
                    {dragOverColumn === column.id ? "Drop here" : "No tasks"}
                  </p>
                </div>
              ) : (
                columnTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onTaskClick(task)}
                    className="bg-card border border-border rounded-lg p-3 cursor-move hover:shadow-md transition-shadow"
                  >
                    {/* Task Header */}
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-sm text-card-foreground line-clamp-2 flex-1">
                        {task.title}
                      </h4>
                      <div
                        className={`w-2 h-2 rounded-full ${getPriorityColor(
                          task.priority
                        )} ml-2 mt-1 flex-shrink-0`}
                      />
                    </div>

                    {/* Task Description */}
                    {task.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {task.description}
                      </p>
                    )}

                    {/* Task Metadata */}
                    <div className="space-y-1">
                      {/* Due Date */}
                      {task.due_date && (
                        <div
                          className={`flex items-center space-x-1 text-xs ${
                            isOverdue(task.due_date, task.status)
                              ? "text-red-600 font-medium"
                              : "text-muted-foreground"
                          }`}
                        >
                          <Icon name="Calendar" size={12} />
                          <span>{formatDate(task.due_date)}</span>
                          {isOverdue(task.due_date, task.status) && (
                            <Icon name="AlertCircle" size={12} />
                          )}
                        </div>
                      )}

                      {/* Contact/Deal Association */}
                      <div className="flex flex-wrap gap-1">
                        {task.contact_name && (
                          <span className="inline-flex items-center space-x-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            <Icon name="User" size={10} />
                            <span className="truncate max-w-[100px]">
                              {task.contact_name}
                            </span>
                          </span>
                        )}
                        {task.deal_title && (
                          <span className="inline-flex items-center space-x-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                            <Icon name="DollarSign" size={10} />
                            <span className="truncate max-w-[100px]">
                              {task.deal_title}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Assigned To */}
                      {task.assigned_user.full_name && (
                        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                          <Icon name="UserCheck" size={12} />
                          <span className="truncate">
                            {task.assigned_user.full_name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                      <div className="flex space-x-1">
                        {column.id !== "pending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(task, "pending");
                            }}
                            className="h-6 px-2 text-xs"
                          >
                            <Icon name="RotateCcw" size={12} />
                          </Button>
                        )}
                        {column.id !== "in_progress" &&
                          column.id !== "completed" &&
                          column.id !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(task, "in_progress");
                              }}
                              className="h-6 px-2 text-xs"
                            >
                              <Icon name="Play" size={12} />
                            </Button>
                          )}
                        {column.id !== "completed" &&
                          column.id !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(task, "completed");
                              }}
                              className="h-6 px-2 text-xs text-green-600 hover:text-green-700"
                            >
                              <Icon name="Check" size={12} />
                            </Button>
                          )}
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          task.priority === "high"
                            ? "bg-red-100 text-red-700"
                            : task.priority === "medium"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TaskKanbanBoard;
