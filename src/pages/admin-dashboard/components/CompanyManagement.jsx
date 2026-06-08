import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import { companyService } from "../../../services/supabaseService";

const CompanyManagement = () => {
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", tagline: "", primary_color: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    setLoading(true);
    const { data } = await companyService.getAllCompanies(false); // include inactive
    setCompanies(data || []);

    const statsMap = {};
    await Promise.all(
      (data || []).map(async (c) => {
        statsMap[c.id] = await companyService.getCompanyStats(c.id);
      })
    );
    setStats(statsMap);
    setLoading(false);
  }

  function showSuccessMsg(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  }

  function startEdit(company) {
    setEditingId(company.id);
    setEditForm({
      name: company.name || "",
      tagline: company.tagline || "",
      primary_color: company.primary_color || "#2563EB",
    });
    setError("");
  }

  async function handleSave(companyId) {
    if (!editForm.name.trim()) {
      setError("Company name is required");
      return;
    }
    const duplicate = companies.find(
      (c) =>
        c.id !== companyId &&
        (c.name || "").toLowerCase().trim() === editForm.name.toLowerCase().trim()
    );
    if (duplicate) {
      setError(`"${editForm.name}" already exists`);
      return;
    }

    setSaving(true);
    const { error: err } = await companyService.updateCompany(companyId, {
      name: editForm.name.trim(),
      tagline: editForm.tagline.trim(),
      primary_color: editForm.primary_color,
    });
    setSaving(false);

    if (err) {
      setError("Failed to save: " + err.message);
      return;
    }

    setCompanies((prev) =>
      prev.map((c) =>
        c.id === companyId
          ? {
              ...c,
              name: editForm.name.trim(),
              tagline: editForm.tagline.trim(),
              primary_color: editForm.primary_color,
            }
          : c
      )
    );
    setEditingId(null);
    showSuccessMsg("Company updated successfully");
  }

  async function handleToggleActive(company) {
    const newStatus = !company.is_active;
    const action = newStatus ? "activate" : "deactivate";

    if (
      !confirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} "${company.name}"?\n\n` +
          (newStatus
            ? ""
            : "Users in this company will not be able to log in while it is inactive.")
      )
    )
      return;

    const { error: err } = await companyService.updateCompanyStatus(company.id, newStatus);
    if (!err) {
      setCompanies((prev) =>
        prev.map((c) => (c.id === company.id ? { ...c, is_active: newStatus } : c))
      );
      showSuccessMsg(`"${company.name}" ${action}d`);
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Company Management</h2>
          <p className="text-xs text-text-tertiary mt-0.5">
            {companies.length} companies · Manage names, branding and status
          </p>
        </div>
      </div>

      {/* Success message */}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">
          <Icon name="CheckCircle" size={16} className="text-green-500 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Company cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        companies.map((company) => {
          const companyStats = stats[company.id] || {};
          const isEditing = editingId === company.id;

          return (
            <div
              key={company.id}
              className={`bg-white rounded-xl border overflow-hidden transition-all ${
                isEditing ? "border-blue-300 shadow-sm" : "border-gray-200"
              }`}
            >
              {/* Header row */}
              <div className="flex items-center gap-4 p-4">
                {/* Logo */}
                <div className="w-14 h-14 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {company.logo_url ? (
                    <img src={company.logo_url} alt={company.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-sm font-bold text-gray-400">
                      {(company.name || "?").charAt(0)}
                    </span>
                  )}
                </div>

                {/* Info / edit fields */}
                <div className="flex-1 min-w-0">
                  {!isEditing ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-text-primary">{company.name}</h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            company.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {company.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {company.tagline && (
                        <p className="text-xs text-text-tertiary mt-0.5">{company.tagline}</p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs font-medium text-text-secondary block mb-1">
                          Company Name *
                        </label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full text-sm px-3 py-1.5 border border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
                          autoFocus
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-text-secondary block mb-1">
                            Tagline
                          </label>
                          <input
                            type="text"
                            value={editForm.tagline}
                            onChange={(e) => setEditForm((f) => ({ ...f, tagline: e.target.value }))}
                            placeholder="e.g. Strength in Steel"
                            className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-text-secondary block mb-1">
                            Brand Color
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={editForm.primary_color}
                              onChange={(e) => setEditForm((f) => ({ ...f, primary_color: e.target.value }))}
                              className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
                            />
                            <input
                              type="text"
                              value={editForm.primary_color}
                              onChange={(e) => setEditForm((f) => ({ ...f, primary_color: e.target.value }))}
                              className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-400"
                            />
                          </div>
                        </div>
                      </div>
                      {error && <p className="text-xs text-red-600">{error}</p>}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isEditing ? (
                    <>
                      <button
                        onClick={() => startEdit(company)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-text-secondary hover:bg-gray-50 transition-colors"
                      >
                        <Icon name="Pencil" size={13} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(company)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          company.is_active
                            ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                            : "border-green-200 text-green-600 hover:bg-green-50"
                        }`}
                      >
                        <Icon name={company.is_active ? "EyeOff" : "Eye"} size={13} />
                        {company.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSave(company.id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        <Icon name="Save" size={13} />
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setError("");
                        }}
                        className="px-3 py-1.5 text-xs text-text-secondary rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Stats row */}
              {!isEditing && (
                <div className="grid grid-cols-4 border-t border-gray-100 divide-x divide-gray-100">
                  {[
                    { label: "Users", value: companyStats.users, icon: "Users" },
                    { label: "Deals", value: companyStats.deals, icon: "Briefcase" },
                    { label: "Contacts", value: companyStats.contacts, icon: "Building2" },
                    { label: "Products", value: companyStats.products, icon: "Package" },
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/50">
                      <Icon name={stat.icon} size={14} className="text-text-tertiary" />
                      <div>
                        <div className="text-sm font-semibold text-text-primary leading-none">
                          {stat.value ?? "—"}
                        </div>
                        <div className="text-xs text-text-tertiary mt-0.5">{stat.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Deletion note */}
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-start gap-3">
        <Icon name="AlertTriangle" size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-amber-700">Company deletion is not available</p>
          <p className="text-xs text-amber-600 mt-1">
            Deleting a company would permanently remove all its deals, contacts, targets, products,
            and user accounts. Use Deactivate instead to hide a company without losing data. Contact
            your system administrator if you need a full deletion.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CompanyManagement;
