import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Select from "components/ui/Select";
import {
  adminService,
  companyService,
} from "../../../services/supabaseService";

const UserDetailModal = ({ user, onClose, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_id: user?.company_id || null,
    supervisor_id: user?.supervisor_id || null,
  });

  useEffect(() => {
    if (editing) {
      loadCompanies();
      if (formData.company_id) {
        loadSupervisors(formData.company_id);
      }
    }
  }, [editing, formData.company_id]);

  const loadCompanies = async () => {
    const { data } = await companyService.getAllCompanies();
    if (data) setCompanies(data);
  };

  const loadSupervisors = async (companyId) => {
    const { data } = await adminService.getUsersByCompany(companyId);
    if (data) {
      // Hierarchy: Director > Manager > Supervisor > Salesman
      let allowedSuperiorRoles = [];

      switch (user.role) {
        case "director":
          // Directors have no superiors in the company hierarchy
          allowedSuperiorRoles = [];
          break;
        case "manager":
          // Managers can only report to Directors
          allowedSuperiorRoles = ["director"];
          break;
        case "supervisor":
          // Supervisors can report ONLY to Managers
          allowedSuperiorRoles = ["manager"];
          break;
        case "salesman":
          // Salesmen can report ONLY to Supervisors
          allowedSuperiorRoles = ["supervisor"];
          break;
        default:
          allowedSuperiorRoles = [];
      }

      const potentialSupervisors = data.filter(
        (u) => allowedSuperiorRoles.includes(u.role) && u.id !== user.id
      );
      setSupervisors(potentialSupervisors);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    const { error } = await adminService.updateUser(user.id, formData);
    setLoading(false);

    if (error) {
      alert("Failed to update user: " + error.message);
    } else {
      setEditing(false);
      onUpdate?.();
    }
  };

  if (!user) return null;

  const roleConfig = {
    admin: {
      color: "#6366f1",
      icon: "Shield",
      label: "Administrator",
    },
    director: {
      color: "#3b82f6",
      icon: "Crown",
      label: "Director",
    },
    manager: {
      color: "#10b981",
      icon: "Briefcase",
      label: "Manager",
    },
    supervisor: {
      color: "#f59e0b",
      icon: "Users",
      label: "Supervisor",
    },
    salesman: {
      color: "#ef4444",
      icon: "TrendingUp",
      label: "Salesman",
    },
    agent: {
      color: "#64748b",
      icon: "User",
      label: "Agent",
    },
  };

  const config = roleConfig[user.role] || roleConfig.agent;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-semibold text-lg"
                style={{ backgroundColor: config.color }}
              >
                {(user.full_name || "U").substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  {user.full_name || "Unnamed User"}
                </h2>
                <p className="text-sm text-gray-500 mb-2">{user.email}</p>
                <div className="flex items-center gap-2">
                  <span
                    className="px-2.5 py-1 text-xs font-medium rounded"
                    style={{
                      backgroundColor: config.color + "15",
                      color: config.color,
                    }}
                  >
                    {config.label}
                  </span>
                  <span
                    className={`px-2.5 py-1 text-xs font-medium rounded ${
                      user.is_active
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <Icon name="X" size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Organization Details */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-base text-gray-900">
                  Organization Details
                </h3>
                {!editing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(true)}
                    className="gap-2"
                  >
                    <Icon name="Edit" size={14} />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(false);
                        setFormData({
                          company_id: user?.company_id || null,
                          supervisor_id: user?.supervisor_id || null,
                        });
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={loading}>
                      {loading ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Company */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">
                    Company
                  </label>
                  {editing &&
                  user.role !== "admin" &&
                  user.role !== "director" ? (
                    <Select
                      options={companies.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      value={formData.company_id}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          company_id: value,
                          supervisor_id: null,
                        })
                      }
                      placeholder="Select Company"
                    />
                  ) : (
                    <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded text-sm text-gray-900">
                      {user.role === "admin" || user.role === "director"
                        ? "All Companies"
                        : user.company?.name || "N/A"}
                    </div>
                  )}
                </div>

                {/* Superior */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">
                    Reports To
                  </label>
                  {editing && formData.company_id ? (
                    <Select
                      options={supervisors.map((s) => ({
                        value: s.id,
                        label: `${s.full_name} (${s.role})`,
                      }))}
                      value={formData.supervisor_id}
                      onChange={(value) =>
                        setFormData({ ...formData, supervisor_id: value })
                      }
                      placeholder="No Superior"
                      clearable
                    />
                  ) : user.supervisor ? (
                    <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded">
                      <p className="text-sm font-medium text-gray-900">
                        {user.supervisor.full_name}
                      </p>
                      <p className="text-xs text-gray-500 capitalize mt-0.5">
                        {user.supervisor.role}
                      </p>
                    </div>
                  ) : (
                    <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded text-sm text-gray-500">
                      No Superior
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Direct Reports */}
            {user.subordinates && user.subordinates.length > 0 && (
              <div>
                <h3 className="font-semibold text-base text-gray-900 mb-3">
                  Direct Reports ({user.subordinates.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {user.subordinates.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded hover:border-gray-300 transition-colors"
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-xs flex-shrink-0"
                        style={{ backgroundColor: config.color }}
                      >
                        {(sub.full_name || "U").substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate text-gray-900">
                          {sub.full_name}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                          {sub.role}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Information */}
            <div>
              <h3 className="font-semibold text-base text-gray-900 mb-3">
                Additional Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {user.department && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">
                      Department
                    </label>
                    <p className="text-sm text-gray-900">{user.department}</p>
                  </div>
                )}

                {user.territory && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">
                      Territory
                    </label>
                    <p className="text-sm text-gray-900">{user.territory}</p>
                  </div>
                )}

                {user.hire_date && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">
                      Hire Date
                    </label>
                    <p className="text-sm text-gray-900">
                      {new Date(user.hire_date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">
                    Member Since
                  </label>
                  <p className="text-sm text-gray-900">
                    {new Date(user.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDetailModal;
