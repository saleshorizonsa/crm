import React from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { useLanguage } from "../../../i18n";

const UpcomingTasks = ({ tasks = [], isLoading = false }) => {
  const { t } = useLanguage();
  const getPriorityColor = (priority) => {
    const colorMap = {
      high: "text-error",
      medium: "text-warning",
      low: "text-success",
    };
    return colorMap?.[priority] || "text-muted-foreground";
  };

  const getPriorityIcon = (priority) => {
    const iconMap = {
      high: "AlertTriangle",
      medium: "Clock",
      low: "CheckCircle",
    };
    return iconMap?.[priority] || "Circle";
  };

  const formatDueDate = (dueDate) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffInHours = Math.floor((due - now) / (1000 * 60 * 60));

    if (diffInHours < 0) return "Overdue";
    if (diffInHours < 24) return `${diffInHours}h left`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d left`;
    return due?.toLocaleDateString();
  };

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date();
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
        <div className="w-32 h-6 bg-muted rounded skeleton mb-4"></div>
        <div className="space-y-3">
          {[...Array(4)]?.map((_, index) => (
            <div
              key={index}
              className="flex items-center space-x-3 p-3 border border-border rounded-lg"
            >
              <div className="w-4 h-4 bg-muted rounded skeleton"></div>
              <div className="flex-1 space-y-2">
                <div className="w-3/4 h-4 bg-muted rounded skeleton"></div>
                <div className="w-1/2 h-3 bg-muted rounded skeleton"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-card-foreground">
          {t("dashboard.upcomingTasks")}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          iconName="Plus"
          iconPosition="left"
          onClick={() => (window.location.href = "/task-management")}
        >
          {t("tasks.addTask")}
        </Button>
      </div>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {tasks?.length === 0 ? (
          <div className="text-center py-8">
            <Icon
              name="CheckSquare"
              size={32}
              className="text-muted-foreground mx-auto mb-2"
            />
            <p className="text-sm text-muted-foreground mb-2">
              {t("dashboard.noUpcomingTasks")}
            </p>
            <Button
              variant="outline"
              size="sm"
              iconName="Plus"
              iconPosition="left"
              onClick={() => (window.location.href = "/task-management")}
            >
              {t("tasks.createFirstTask")}
            </Button>
          </div>
        ) : (
          tasks?.map((task) => (
            <div
              key={task?.id}
              className={`flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-enterprise group cursor-pointer ${
                isOverdue(task?.dueDate)
                  ? "border-error/50 bg-error/5"
                  : "border-border"
              }`}
              onClick={() => (window.location.href = "/task-management")}
            >
              <button className="mt-0.5">
                <Icon
                  name={task?.completed ? "CheckCircle" : "Circle"}
                  size={16}
                  className={
                    task?.completed
                      ? "text-success"
                      : "text-muted-foreground hover:text-primary"
                  }
                />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <p
                    className={`text-sm font-medium group-hover:text-primary transition-enterprise ${
                      task?.completed
                        ? "line-through text-muted-foreground"
                        : "text-card-foreground"
                    }`}
                  >
                    {task?.title}
                  </p>
                  <div className="flex items-center space-x-1 ml-2">
                    <Icon
                      name={getPriorityIcon(task?.priority)}
                      size={12}
                      className={getPriorityColor(task?.priority)}
                    />
                    <span
                      className={`text-xs ${
                        isOverdue(task?.dueDate)
                          ? "text-error font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatDueDate(task?.dueDate)}
                    </span>
                  </div>
                </div>

                {task?.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {task?.description}
                  </p>
                )}

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center space-x-2">
                    {task?.assignee && (
                      <div className="flex items-center space-x-1">
                        <div className="w-4 h-4 bg-primary/10 rounded-full flex items-center justify-center">
                          <Icon
                            name="User"
                            size={10}
                            color="var(--color-primary)"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {task?.assignee}
                        </span>
                      </div>
                    )}
                    {task?.project && (
                      <span className="text-xs text-muted-foreground">
                        • {task?.project}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        task?.priority === "high"
                          ? "bg-error/10 text-error"
                          : task?.priority === "medium"
                          ? "bg-warning/10 text-warning"
                          : "bg-success/10 text-success"
                      }`}
                    >
                      {task?.priority}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {tasks?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-muted-foreground hover:text-primary"
            iconName="ExternalLink"
            iconPosition="right"
            onClick={() => (window.location.href = "/task-management")}
          >
            {t("dashboard.viewAllTasks")}
          </Button>
        </div>
      )}
    </div>
  );
};

export default UpcomingTasks;
