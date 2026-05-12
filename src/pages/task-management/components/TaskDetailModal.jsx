import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { useAuth } from "../../../contexts/AuthContext";
import { userService } from "../../../services/supabaseService";
import { useLanguage } from "../../../i18n";

const TaskDetailModal = ({
  task,
  isOpen,
  onClose,
  onSave,
  contacts = [],
  deals = [],
  users = [],
}) => {
  const { user, userProfile } = useAuth();
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "pending",
    task_type: "general",
    due_date: "",
    contact_id: "",
    deal_id: "",
    assigned_to: "",
  });
  const [assignableUsers, setAssignableUsers] = useState([]);

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || "",
        description: task.description || "",
        priority: task.priority || "medium",
        status: task.status || "pending",
        task_type: task.task_type || "general",
        due_date: task.due_date ? task.due_date.split("T")[0] : "",
        contact_id: task.contact_id || "",
        deal_id: task.deal_id || "",
        assigned_to: task.assigned_to || user?.id || "",
      });
    } else {
      setFormData({
        title: "",
        description: "",
        priority: "medium",
        status: "pending",
        task_type: "general",
        due_date: "",
        contact_id: "",
        deal_id: "",
        assigned_to: user?.id || "",
      });
    }
    setErrors({});
  }, [task, user]);

  // Load assignable users based on current user's role
  useEffect(() => {
    if (userProfile?.id) {
      loadAssignableUsers();
    }
  }, [userProfile?.id, userProfile?.role]);

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

  const loadAssignableUsers = async () => {
    // Start with current user (self)
    const assignableList = [
      {
        id: userProfile.id,
        name: `${userProfile.full_name || userProfile.email} (${formatRole(
          userProfile.role
        )}) - Me`,
      },
    ];

    // Load subordinates based on role
    if (["director", "manager", "supervisor"].includes(userProfile?.role)) {
      const { data, error } = await userService.getUserSubordinates(
        userProfile.id
      );

      if (!error && data) {
        let filteredSubordinates = [];

        if (userProfile.role === "director") {
          // Directors can assign to managers
          filteredSubordinates = data.filter((u) => u.role === "manager");
        } else if (userProfile.role === "manager") {
          // Managers can assign to supervisors and salesmen
          filteredSubordinates = data.filter(
            (u) =>
              u.role === "supervisor" ||
              u.role === "salesman" ||
              u.role === "sales_rep"
          );
        } else if (userProfile.role === "supervisor") {
          // Supervisors can assign to salesmen
          filteredSubordinates = data.filter(
            (u) => u.role === "salesman" || u.role === "sales_rep"
          );
        }

        // Add subordinates to list
        filteredSubordinates.forEach((subordinate) => {
          assignableList.push({
            id: subordinate.id,
            name: `${subordinate.full_name || subordinate.email} (${formatRole(
              subordinate.role
            )})`,
          });
        });
      }
    }

    setAssignableUsers(assignableList);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title?.trim()) {
      newErrors.title = t("tasks.taskTitleRequired");
    } else if (formData.title?.length > 200) {
      newErrors.title = t("tasks.titleTooLong");
    }

    // Block past due dates only when creating a new task, not when editing
    if (formData.due_date && !task) {
      const due = new Date(formData.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (due < today) {
        newErrors.due_date = t("tasks.dueDatePast");
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const taskData = {
        ...formData,
        // Use selected assigned_to or fallback to current user
        assigned_to: formData.assigned_to || user?.id,
        // Convert empty strings to null for foreign keys
        contact_id: formData.contact_id || null,
        deal_id: formData.deal_id || null,
        due_date: formData.due_date || null,
      };

      if (task) {
        await onSave({ ...task, ...taskData });
      } else {
        await onSave(taskData);
      }

      onClose();
    } catch (error) {
      console.error("Error saving task:", error);
      setErrors({ submit: error.message || "Failed to save task" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-xl font-semibold text-card-foreground flex items-center space-x-2">
            <Icon name="CheckSquare" size={24} />
            <span>{task ? t("tasks.editTask") : t("tasks.createNewTask")}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="X" size={24} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              {t("tasks.taskTitle")} <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder={t("tasks.enterTaskTitle")}
              className={errors.title ? "border-red-500" : ""}
            />
            {errors.title && (
              <p className="text-red-500 text-sm mt-1">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              {t("common.description")}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder={t("tasks.enterTaskDescription")}
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {/* Priority, Status, and Task Type Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                {t("tasks.priority")}
              </label>
              <select
                value={formData.priority}
                onChange={(e) => handleChange("priority", e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="low">{t("tasks.low")}</option>
                <option value="medium">{t("tasks.medium")}</option>
                <option value="high">{t("tasks.high")}</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                {t("common.status")}
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleChange("status", e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="pending">{t("tasks.pending")}</option>
                <option value="in_progress">{t("tasks.inProgress")}</option>
                <option value="completed">{t("tasks.completed")}</option>
                <option value="cancelled">{t("tasks.cancelled")}</option>
              </select>
            </div>

            {/* Task Type */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                {t("tasks.taskType")}
              </label>
              <select
                value={formData.task_type}
                onChange={(e) => handleChange("task_type", e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="general">{t("tasks.general")}</option>
                <option value="visit">{t("tasks.visit")}</option>
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              {t("tasks.dueDate")}
            </label>
            <Input
              type="date"
              value={formData.due_date}
              onChange={(e) => handleChange("due_date", e.target.value)}
            />
          </div>

          {/* Assigned To */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              {t("tasks.assignedTo")}
            </label>
            <select
              value={formData.assigned_to}
              onChange={(e) => handleChange("assigned_to", e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {assignableUsers.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </div>

          {/* Contact and Deal Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Related Contact */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                {t("tasks.relatedClient")}
              </label>
              <select
                value={formData.contact_id}
                onChange={(e) => handleChange("contact_id", e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{t("tasks.noClient")}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Related Deal */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                {t("tasks.relatedDeal")}
              </label>
              <select
                value={formData.deal_id}
                onChange={(e) => handleChange("deal_id", e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{t("tasks.noDeal")}</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Task Metadata (for edit mode) */}
          {task && (
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-medium text-card-foreground mb-2">
                {t("tasks.taskInformation")}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("tasks.createdAtLabel")}:</span>{" "}
                  <span className="text-card-foreground">
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("tasks.createdByLabel")}:</span>{" "}
                  <span className="text-card-foreground">
                    {task.created_by_name || "Unknown"}
                  </span>
                </div>
                {task.completed_at && (
                  <>
                    <div>
                      <span className="text-muted-foreground">{t("tasks.completedAtLabel")}:</span>{" "}
                      <span className="text-card-foreground">
                        {new Date(task.completed_at).toLocaleDateString()}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-start space-x-2">
              <Icon
                name="AlertCircle"
                size={18}
                className="flex-shrink-0 mt-0.5"
              />
              <span className="text-sm">{errors.submit}</span>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center space-x-2">
                  <Icon name="Loader" size={16} className="animate-spin" />
                  <span>{t("tasks.saving")}</span>
                </span>
              ) : (
                <span className="flex items-center space-x-2">
                  <Icon name="Save" size={16} />
                  <span>{task ? t("tasks.updateTask") : t("tasks.createNewTask")}</span>
                </span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskDetailModal;
