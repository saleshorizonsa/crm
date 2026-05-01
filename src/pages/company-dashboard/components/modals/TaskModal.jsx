import React, { useState, useEffect } from "react";
import { useAuth } from "../../../../contexts/AuthContext";
import { supabase } from "../../../../lib/supabase";
import Button from "../../../../components/ui/Button";
import Input from "../../../../components/ui/Input";
import Select from "../../../../components/ui/Select";

const TaskModal = ({ isOpen, onClose, onSubmit }) => {
  const { company, user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const priorities = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ];

  const statuses = [
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const taskTypes = [
    { value: "general", label: "General" },
    { value: "visit", label: "Visit" },
  ];

  useEffect(() => {
    const loadData = async () => {
      if (!company?.id) return;
      try {
        const [
          { data: contactsData },
          { data: dealsData },
          { data: usersData },
        ] = await Promise.all([
          supabase
            .from("contacts")
            .select("id, first_name, last_name")
            .eq("company_id", company.id),
          supabase
            .from("deals")
            .select("id, title")
            .eq("company_id", company.id),
          supabase
            .from("users")
            .select("id, full_name")
            .eq("company_id", company.id),
        ]);
        setContacts(contactsData || []);
        setDeals(dealsData || []);
        setUsers(usersData || []);
      } catch (error) {
        console.error("Error loading task related data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [company?.id]);

  const handleChange = (eOrValue, maybeName) => {
    if (eOrValue?.target) {
      const { name, value } = eOrValue.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    } else if (maybeName) {
      setFormData((prev) => ({ ...prev, [maybeName]: eOrValue }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit({
        ...formData,
        company_id: company?.id,
        created_by: user?.id,
        due_date: new Date(formData.due_date).toISOString(),
        assigned_to: formData.assigned_to || user?.id,
      });
      onClose();
    } catch (error) {
      console.error("Error creating task:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in-50">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-muted/30">
          <h2 className="text-lg font-semibold text-foreground">
            Create New Task
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
          {/* Title & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Task Title
              </label>
              <Input
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g. Follow up with client"
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Due Date
              </label>
              <Input
                name="due_date"
                type="datetime-local"
                value={formData.due_date}
                onChange={handleChange}
                required
                className="mt-1"
              />
            </div>
          </div>

          {/* Priority, Status & Task Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Priority
              </label>
              <Select
                name="priority"
                value={formData.priority}
                onChange={(value) => handleChange(value, "priority")}
                options={priorities}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Status
              </label>
              <Select
                name="status"
                value={formData.status}
                onChange={(value) => handleChange(value, "status")}
                options={statuses}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Task Type
              </label>
              <Select
                name="task_type"
                value={formData.task_type}
                onChange={(value) => handleChange(value, "task_type")}
                options={taskTypes}
                required
                className="mt-1"
              />
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Assign To
            </label>
            <Select
              name="assigned_to"
              value={formData.assigned_to}
              onChange={(value) => handleChange(value, "assigned_to")}
              options={users.map((u) => ({
                value: u.id,
                label: u.full_name,
              }))}
              placeholder={
                isLoading ? "Loading team members..." : "Select team member"
              }
              required
              className="mt-1"
            />
          </div>

          {/* Related Contact & Deal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Related Contact
              </label>
              <Select
                name="contact_id"
                value={formData.contact_id}
                onChange={(value) => handleChange(value, "contact_id")}
                options={contacts.map((c) => ({
                  value: c.id,
                  label: `${c.first_name} ${c.last_name}`,
                }))}
                placeholder={
                  isLoading ? "Loading contacts..." : "Select contact"
                }
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Related Deal
              </label>
              <Select
                name="deal_id"
                value={formData.deal_id}
                onChange={(value) => handleChange(value, "deal_id")}
                options={deals.map((d) => ({
                  value: d.id,
                  label: d.title,
                }))}
                placeholder={isLoading ? "Loading deals..." : "Select deal"}
                className="mt-1"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="mt-1 w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-transparent placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Add notes, details or checklist..."
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              className="min-w-[100px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="min-w-[120px] bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Create Task
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
