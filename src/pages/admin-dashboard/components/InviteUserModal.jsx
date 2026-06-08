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

const LOGIN_URL = "crmhorizon.vercel.app";

const InviteUserModal = ({ onClose, onSuccess }) => {
  const { user: adminUser } = useAuth(); // eslint-disable-line no-unused-vars

  const [formData, setFormData] = useState({
    full_name:     "",
    email:         "",
    password:      "",
    role:          "salesman",
    company_id:    null,
    supervisor_id: null,
  });

  const [companies,    setCompanies]    = useState([]);
  const [supervisors,  setSupervisors]  = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [loadingData,  setLoadingData]  = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [createdUser,  setCreatedUser]  = useState(null);
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

    const { full_name, email, password, role, company_id } = formData;
    if (!full_name || !email || !password || !role || !company_id) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-user", {
        body: {
          email:        email.trim().toLowerCase(),
          password,
          fullName:     full_name.trim(),
          role,
          companyId:    company_id,
          supervisorId: formData.supervisor_id || null,
        },
      });

      if (fnError || data?.error) {
        setError(data?.error || fnError?.message || "Failed to create user");
        return;
      }

      setCreatedUser({
        email: email.trim().toLowerCase(),
        password,
        name:  full_name.trim(),
      });
    } catch (err) {
      setError("An unexpected error occurred: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCredentials = () => {
    const text =
      `JASCO CRM Login\n` +
      `URL: ${LOGIN_URL}\n` +
      `Email: ${createdUser.email}\n` +
      `Password: ${createdUser.password}`;
    navigator.clipboard.writeText(text).then(() => {
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
            <h2 className="text-lg font-semibold">
              {createdUser ? "User Created" : "Create New User"}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Icon name="X" size={20} />
          </button>
        </div>

        {createdUser ? (
          /* ── Success / credentials screen ───────────────────────────────── */
          <div className="p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="CheckCircle" size={24} className="text-green-600" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              User Created Successfully
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Share these credentials with {createdUser.name}
            </p>

            <div className="bg-muted/50 rounded-xl p-4 text-left space-y-2 mb-4">
              <div className="flex justify-between text-sm gap-3">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium text-foreground break-all">{createdUser.email}</span>
              </div>
              <div className="flex justify-between text-sm gap-3">
                <span className="text-muted-foreground">Password</span>
                <span className="font-mono font-medium text-foreground break-all">{createdUser.password}</span>
              </div>
              <div className="flex justify-between text-sm gap-3">
                <span className="text-muted-foreground">Login URL</span>
                <span className="text-blue-600 text-xs">{LOGIN_URL}</span>
              </div>
            </div>

            <button
              onClick={handleCopyCredentials}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 mb-2 flex items-center justify-center gap-2"
            >
              <Icon name={copied ? "Check" : "Copy"} size={14} />
              {copied ? "Copied!" : "Copy Credentials"}
            </button>

            <button
              onClick={() => { onSuccess?.(); onClose(); }}
              className="w-full py-2 text-sm text-muted-foreground rounded-xl hover:bg-muted/50"
            >
              Close
            </button>
          </div>
        ) : (
          /* ── Creation form ──────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="p-4 space-y-4">

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

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  value={formData.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <Icon name={showPassword ? "EyeOff" : "Eye"} size={15} />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                User can change this password after first login in Settings.
              </p>
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

            {/* Superior */}
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

            {/* Info box */}
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex gap-2">
                <Icon name="Info" size={16} className="text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="text-xs text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">Direct creation:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>The account is created immediately — no email is sent</li>
                    <li>Share the email &amp; password shown after creation</li>
                    <li>The user can sign in right away and change their password</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? (
                  <><Icon name="Loader2" className="animate-spin" size={16} /> Creating…</>
                ) : (
                  <><Icon name="UserPlus" size={16} /> Create User</>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default InviteUserModal;
