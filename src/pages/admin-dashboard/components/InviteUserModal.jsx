import React, { useState, useEffect } from "react";
import Select from "components/ui/Select";
import { companyService, adminService } from "../../../services/supabaseService";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import Button from "components/ui/Button";
import Icon from "components/AppIcon";
import Input from "components/ui/Input";

const ROLES = [
  { value: "director",  label: "Director" },
  { value: "head",      label: "Head" },
  { value: "manager",   label: "Manager" },
  { value: "supervisor",label: "Supervisor" },
  { value: "salesman",  label: "Salesman" },
  { value: "viewer",    label: "Pipeline Viewer" },
];

const SUPERIOR_ROLES = {
  director:   [],
  head:       ["director"],
  manager:    ["director", "head"],
  supervisor: ["manager", "head"],
  salesman:   ["supervisor", "manager"],
  viewer:     [],
};

const InviteUserModal = ({ onClose, onSuccess }) => {
  const { user: adminUser } = useAuth();

  const [formData, setFormData] = useState({
    full_name:    "",
    email:        "",
    role:         "salesman",
    company_id:   null,
    supervisor_id: null,
  });

  const [companies,    setCompanies]    = useState([]);
  const [supervisors,  setSupervisors]  = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [loadingData,  setLoadingData]  = useState(true);
  const [invitationUrl, setInvitationUrl] = useState(null);
  const [copied,       setCopied]       = useState(false);
  const [error,        setError]        = useState(null);

  useEffect(() => { loadCompanies(); }, []);

  useEffect(() => {
    if (formData.company_id && formData.role) {
      loadSupervisors(formData.company_id, formData.role);
    } else {
      setSupervisors([]);
    }
  }, [formData.company_id, formData.role]);

  const loadCompanies = async () => {
    setLoadingData(true);
    const { data } = await companyService.getAllCompanies();
    if (data) setCompanies(data);
    setLoadingData(false);
  };

  const loadSupervisors = async (companyId, role) => {
    const allowed = SUPERIOR_ROLES[role] || [];
    if (!allowed.length) { setSupervisors([]); return; }
    const { data } = await adminService.getUsersByCompany(companyId);
    setSupervisors((data || []).filter(u => allowed.includes(u.role)));
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      ...(field === "company_id" && { supervisor_id: null }),
      ...(field === "role"       && { supervisor_id: null }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const { full_name, email, role, company_id } = formData;
    if (!full_name || !email || !role || !company_id) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const token     = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error: insertError } = await supabase
        .from("user_invitations")
        .insert({
          email,
          full_name,
          role,
          company_id,
          supervisor_id: formData.supervisor_id || null,
          invited_by:    adminUser?.id || null,
          token,
          status:     "pending",
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        setError("Failed to create invitation: " + insertError.message);
        return;
      }

      setInvitationUrl(`${window.location.origin}/accept-invitation?token=${token}`);
    } catch (err) {
      setError("An unexpected error occurred: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(invitationUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const needsSuperior =
    formData.company_id &&
    (SUPERIOR_ROLES[formData.role] || []).length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon name="UserPlus" className="text-primary" size={20} />
            <h2 className="text-lg font-semibold">Invite New User</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <Icon name="AlertCircle" size={16} className="mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="Jane Smith"
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
              options={ROLES}
              value={formData.role}
              onChange={(value) => handleChange("role", value)}
              required
              placeholder="Select Role"
            />
            {formData.role === "viewer" && (
              <p className="text-xs text-muted-foreground mt-1">
                Pipeline Viewer can only see deals from Qualified stage and above.
                No deal values, targets, or financial data. Read-only access only.
              </p>
            )}
          </div>

          {/* Company */}
          <div>
            <Select
              label="Company"
              options={companies.map(c => ({ value: c.id, label: c.name }))}
              value={formData.company_id}
              onChange={(value) => handleChange("company_id", value)}
              required
              disabled={loadingData}
              loading={loadingData}
              placeholder="Select Company"
            />
          </div>

          {/* Superior — only for roles with a hierarchy parent */}
          {needsSuperior && (
            <div>
              <Select
                label="Superior (Optional)"
                options={supervisors.map(s => ({
                  value: s.id,
                  label: `${s.full_name} (${s.role})`,
                }))}
                value={formData.supervisor_id}
                onChange={(value) => handleChange("supervisor_id", value)}
                placeholder={supervisors.length ? "Select Superior" : "No available superiors"}
                disabled={!supervisors.length}
                clearable
              />
            </div>
          )}

          {/* Success block */}
          {invitationUrl ? (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Icon name="CheckCircle" size={20} className="text-green-600 dark:text-green-400 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-green-800 dark:text-green-200 mb-1">
                    Invitation created!
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                    Share this link with <strong>{formData.email}</strong>:
                  </p>
                  <div className="bg-white dark:bg-gray-900 rounded border border-green-300 dark:border-green-700 p-2 mb-2">
                    <code className="text-xs break-all">{invitationUrl}</code>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-xs text-green-700 dark:text-green-300 hover:underline flex items-center gap-1"
                  >
                    <Icon name={copied ? "Check" : "Copy"} size={12} />
                    {copied ? "Copied!" : "Copy to Clipboard"}
                  </button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Link expires in 7 days.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Info box */
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex gap-2">
                <Icon name="Info" size={16} className="text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="text-xs text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">How it works:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>You'll get a signup link to share with the user</li>
                    <li>They set their own password on first login</li>
                    <li>Link expires in 7 days</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {invitationUrl ? (
            <Button type="button" onClick={() => { onSuccess(); onClose(); }} className="w-full">
              <Icon name="Check" size={16} />
              Done
            </Button>
          ) : (
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? (
                  <><Icon name="Loader2" className="animate-spin" size={16} /> Creating…</>
                ) : (
                  <><Icon name="Send" size={16} /> Create Invitation</>
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
