import React, { useState, useEffect } from "react";
import Select from "components/ui/Select";
import {
  adminService,
  companyService,
} from "../../../services/supabaseService";
import Button from "components/ui/Button";
import Icon from "components/AppIcon";
import Input from "components/ui/Input";

const InviteUserModal = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    role: "salesman",
    company_id: null,
    supervisor_id: null,
  });
  const [companies, setCompanies] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [invitationUrl, setInvitationUrl] = useState(null);
  const [emailSent, setEmailSent] = useState(false);

  const roles = [
    { value: "director", label: "Director" },
    { value: "head", label: "Head" },
    { value: "manager", label: "Manager" },
    { value: "supervisor", label: "Supervisor" },
    { value: "salesman", label: "Salesman" },
  ];

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (formData.company_id && formData.role) {
      loadSupervisors(formData.company_id, formData.role);
    } else {
      setSupervisors([]);
    }
  }, [formData.company_id, formData.role]);

  const loadCompanies = async () => {
    setLoadingData(true);
    const { data, error } = await companyService.getAllCompanies();
    console.log("Companies loaded:", data, error);
    if (!error && data) {
      setCompanies(data);
    }
    setLoadingData(false);
  };

  const loadSupervisors = async (companyId, selectedRole) => {
    const { data, error } = await adminService.getUsersByCompany(companyId);
    console.log("Supervisors loaded for company:", companyId, data, error);
    if (!error && data) {
      // Hierarchy: Director > Head > Manager > Supervisor > Salesman
      // Filter based on the role being invited
      let allowedSuperiorRoles = [];

      switch (selectedRole) {
        case "director":
          // Directors have no superiors in the company hierarchy
          allowedSuperiorRoles = [];
          break;
        case "head":
          // Heads can only report to Directors
          allowedSuperiorRoles = ["director"];
          break;
        case "manager":
          // Managers can report to Directors or Heads
          allowedSuperiorRoles = ["director", "head"];
          break;
        case "supervisor":
          // Supervisors can report to Managers or Heads
          allowedSuperiorRoles = ["manager", "head"];
          break;
        case "salesman":
          // Salesmen can report to Supervisors or Managers
          allowedSuperiorRoles = ["supervisor", "manager"];
          break;
        default:
          allowedSuperiorRoles = [];
      }

      const potentialSupervisors = data.filter((user) =>
        allowedSuperiorRoles.includes(user.role)
      );
      console.log(
        "Potential supervisors for",
        selectedRole,
        ":",
        potentialSupervisors
      );
      setSupervisors(potentialSupervisors);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.full_name || !formData.email || !formData.role || !formData.company_id) {
      alert("Please fill in all required fields");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      alert("Please enter a valid email address");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await adminService.inviteUser(formData);

      if (error) {
        alert("Failed to send invitation: " + error.message);
      } else {
        setInvitationUrl(data.invitation_url);
        setEmailSent(data.email_sent);
        // Don't close immediately, show the URL
      }
    } catch (error) {
      alert("An error occurred: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
      // Reset supervisor when company or role changes
      ...(field === "company_id" && { supervisor_id: null }),
      ...(field === "role" && { supervisor_id: null }),
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon name="UserPlus" className="text-primary" size={20} />
            <h2 className="text-lg font-semibold">Invite New User</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="John Doe"
              value={formData.full_name}
              onChange={(e) => handleChange("full_name", e.target.value)}
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              required
            />
          </div>

          {/* Role */}
          <div>
            <Select
              label="Role"
              options={roles}
              value={formData.role}
              onChange={(value) => handleChange("role", value)}
              required
              placeholder="Select Role"
            />
          </div>

          {/* Company */}
          <div>
            <Select
              label="Company"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              value={formData.company_id}
              onChange={(value) => handleChange("company_id", value)}
              required
              disabled={loadingData}
              loading={loadingData}
              placeholder="Select Company"
            />
          </div>

          {/* Superior */}
          {formData.company_id && formData.role !== "director" && (
            <div>
              <Select
                label="Superior (Optional)"
                options={supervisors.map((s) => ({
                  value: s.id,
                  label: `${s.full_name} (${s.role})`,
                }))}
                value={formData.supervisor_id}
                onChange={(value) => handleChange("supervisor_id", value)}
                placeholder={
                  supervisors.length > 0
                    ? "Select Superior"
                    : "No available superiors"
                }
                description={
                  formData.role === "manager"
                    ? "Select a Director"
                    : formData.role === "supervisor"
                    ? "Select a Manager"
                    : formData.role === "salesman"
                    ? "Select a Supervisor"
                    : "Select a superior"
                }
                disabled={supervisors.length === 0}
                clearable
              />
            </div>
          )}

          {/* Success - Show Invitation URL */}
          {invitationUrl && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Icon
                  name="CheckCircle"
                  size={20}
                  className="text-green-600 dark:text-green-400 mt-0.5"
                />
                <div className="flex-1">
                  <p className="font-medium text-green-800 dark:text-green-200 mb-2">
                    Invitation Created Successfully!
                  </p>
                  {emailSent ? (
                    <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                      <Icon name="Mail" size={14} className="inline mr-1" />
                      An invitation email has been sent to {formData.email}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                      <Icon name="AlertCircle" size={14} className="inline mr-1" />
                      Email not sent. Please share the invitation URL manually with {formData.email}:
                    </p>
                  )}
                  <div className="bg-white dark:bg-gray-900 rounded border border-green-300 dark:border-green-700 p-2">
                    <code className="text-xs break-all">{invitationUrl}</code>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(invitationUrl);
                      alert("Copied to clipboard!");
                    }}
                    className="mt-2 text-xs text-green-700 dark:text-green-300 hover:underline flex items-center gap-1"
                  >
                    <Icon name="Copy" size={12} />
                    Copy to Clipboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          {!invitationUrl && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex gap-2">
                <Icon
                  name="Info"
                  size={16}
                  className="text-blue-600 dark:text-blue-400 mt-0.5"
                />
                <div className="text-xs text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">Invitation Details:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>You'll receive a signup URL to share with the user</li>
                    <li>Invitation link expires in 7 days</li>
                    <li>They'll be assigned to the selected company</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {invitationUrl ? (
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="flex-1"
              >
                <Icon name="Check" size={16} />
                Done
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? (
                  <>
                    <Icon name="Loader2" className="animate-spin" size={16} />
                    Sending...
                  </>
                ) : (
                  <>
                    <Icon name="Send" size={16} />
                    Send Invitation
                  </>
                )}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default InviteUserModal;
