import React, { useState, useEffect } from "react";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import { Checkbox } from "../../../components/ui/Checkbox";
import Icon from "../../../components/AppIcon";

const UserModal = ({ isOpen, onClose, onSave, user, mode, currentUser }) => {
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    role: "agent",
    is_active: true,
    send_invitation: true,
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (mode === "create") {
        setFormData({
          full_name: "",
          email: "",
          role: "agent",
          is_active: true,
          send_invitation: true,
        });
      } else if (user) {
        setFormData({
          full_name: user.full_name || "",
          email: user.email || "",
          role: user.role || "agent",
          is_active: user.is_active || false,
          send_invitation: false,
        });
      }
      setErrors({});
    }
  }, [isOpen, mode, user]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = "Full name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.role) {
      newErrors.role = "Role is required";
    }

    // Role validation based on current user permissions
    if (currentUser.role === "manager" && formData.role === "admin") {
      newErrors.role = "Managers cannot create admin users";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const submitData = { ...formData };
      delete submitData.send_invitation; // This will be handled by the service

      await onSave({
        ...submitData,
        sendInvitation: formData.send_invitation && mode === "create",
      });

      onClose();
    } catch (error) {
      console.error("Error saving user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  const getModalTitle = () => {
    switch (mode) {
      case "create":
        return "Add New User";
      case "edit":
        return "Edit User";
      case "view":
        return "User Details";
      default:
        return "User";
    }
  };

  const roleOptions = [
    { value: "agent", label: "Agent" },
    ...(currentUser.role === "admin"
      ? [
          { value: "manager", label: "Manager" },
          { value: "admin", label: "Admin" },
        ]
      : []),
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center space-x-2">
            <Icon
              name={
                mode === "create"
                  ? "UserPlus"
                  : mode === "edit"
                  ? "Edit2"
                  : "Eye"
              }
              size={20}
              className="text-primary"
            />
            <h2 className="text-xl font-semibold text-card-foreground">
              {getModalTitle()}
            </h2>
          </div>

          <Button variant="ghost" size="sm" onClick={onClose} iconName="X" />
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Full Name */}
          <Input
            label="Full Name"
            value={formData.full_name}
            onChange={(e) => handleInputChange("full_name", e.target.value)}
            error={errors.full_name}
            placeholder="Enter full name"
            disabled={mode === "view" || isLoading}
            required
          />

          {/* Email */}
          <Input
            label="Email Address"
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            error={errors.email}
            placeholder="Enter email address"
            disabled={mode === "view" || mode === "edit" || isLoading}
            required
            iconName="Mail"
          />

          {/* Role */}
          <Select
            label="Role"
            value={formData.role}
            onChange={(e) => handleInputChange("role", e.target.value)}
            options={roleOptions}
            error={errors.role}
            disabled={mode === "view" || isLoading}
            required
          />

          {/* Status */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-card-foreground">
              Status
            </label>
            <Checkbox
              checked={formData.is_active}
              onChange={(checked) => handleInputChange("is_active", checked)}
              label="Active User"
              disabled={mode === "view" || isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Inactive users cannot log in to the system
            </p>
          </div>

          {/* Send Invitation (Create mode only) */}
          {mode === "create" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-card-foreground">
                Invitation
              </label>
              <Checkbox
                checked={formData.send_invitation}
                onChange={(checked) =>
                  handleInputChange("send_invitation", checked)
                }
                label="Send invitation email"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                An invitation email will be sent to the user's email address
              </p>
            </div>
          )}

          {/* Additional Info in View Mode */}
          {mode === "view" && user && (
            <div className="space-y-3 pt-4 border-t border-border">
              <h4 className="font-medium text-card-foreground">
                Additional Information
              </h4>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">User ID:</span>
                  <p className="font-mono text-xs break-all">{user.id}</p>
                </div>

                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <p>{new Date(user.created_at).toLocaleDateString()}</p>
                </div>

                {user.updated_at && (
                  <div>
                    <span className="text-muted-foreground">Updated:</span>
                    <p>{new Date(user.updated_at).toLocaleDateString()}</p>
                  </div>
                )}

                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className={user.is_active ? "text-success" : "text-error"}>
                    {user.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {mode !== "view" && (
            <div className="flex items-center justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={isLoading}
                iconName={
                  isLoading
                    ? "Loader2"
                    : mode === "create"
                    ? "UserPlus"
                    : "Save"
                }
                iconPosition="left"
              >
                {isLoading
                  ? "Saving..."
                  : mode === "create"
                  ? "Create User"
                  : "Save Changes"}
              </Button>
            </div>
          )}

          {/* Close button for view mode */}
          {mode === "view" && (
            <div className="flex items-center justify-end pt-4">
              <Button type="button" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default UserModal;
