import React, { useState, useEffect, useCallback } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import { adminService, permissionsService } from "../../../services/supabaseService";
import { useAuth } from "contexts/AuthContext";

// ── Pages available for permission management ─────────────────────────────────

const PAGES = [
  { id: "company-dashboard",  label: "Dashboard",         icon: "LayoutDashboard" },
  { id: "sales-pipeline",     label: "Sales Pipeline",    icon: "TrendingUp"      },
  { id: "lead-management",    label: "Lead Management",   icon: "UserPlus"        },
  { id: "contact-management", label: "Contacts",          icon: "Users"           },
  { id: "task-management",    label: "Tasks",             icon: "ListTodo"        },
  { id: "reports",            label: "Reports",           icon: "FileBarChart"    },
  { id: "forecast",           label: "Forecast",          icon: "LineChart"       },
];

const DEFAULT_PERMS = { can_view: true, can_create: false, can_edit: false };

const ROLE_LABELS = {
  admin:      "Admin",
  director:   "Director",
  head:       "Head",
  manager:    "Manager",
  supervisor: "Supervisor",
  salesman:   "Salesman",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildDefaultPerms = () =>
  Object.fromEntries(PAGES.map((p) => [p.id, { ...DEFAULT_PERMS }]));

const rowsToMap = (rows) => {
  const map = buildDefaultPerms();
  (rows || []).forEach((r) => {
    if (map[r.page]) {
      map[r.page] = { can_view: r.can_view, can_create: r.can_create, can_edit: r.can_edit };
    }
  });
  return map;
};

// ── Component ─────────────────────────────────────────────────────────────────

const UserAuthorization = () => {
  const { company } = useAuth();

  const [users,           setUsers]           = useState([]);
  const [selectedUserId,  setSelectedUserId]  = useState("");
  const [perms,           setPerms]           = useState(buildDefaultPerms());
  const [loadingUsers,    setLoadingUsers]    = useState(true);
  const [loadingPerms,    setLoadingPerms]    = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [saveMsg,         setSaveMsg]         = useState(null);
  const [dbError,         setDbError]         = useState(false);

  // Load all users for this company
  useEffect(() => {
    const load = async () => {
      setLoadingUsers(true);
      const { data, error } = await adminService.getAllUsers();
      if (!error && data) {
        // Filter to current company (admin can see all users)
        const companyUsers = company?.id
          ? data.filter((u) => u.company_id === company.id || !company.id)
          : data;
        setUsers(companyUsers);
      }
      setLoadingUsers(false);
    };
    load();
  }, [company?.id]);

  // Load permissions when a user is selected
  const loadUserPerms = useCallback(async (userId) => {
    if (!userId || !company?.id) return;
    setLoadingPerms(true);
    setDbError(false);
    const { data, error } = await permissionsService.getUserPermissions(userId, company.id);
    if (error) {
      // Table may not exist yet — show setup message
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        setDbError(true);
      }
      setPerms(buildDefaultPerms());
    } else {
      setPerms(rowsToMap(data));
    }
    setLoadingPerms(false);
  }, [company?.id]);

  useEffect(() => {
    if (selectedUserId) loadUserPerms(selectedUserId);
    else setPerms(buildDefaultPerms());
  }, [selectedUserId, loadUserPerms]);

  // Toggle a single permission cell
  const toggle = (pageId, field) => {
    setPerms((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], [field]: !prev[pageId][field] },
    }));
  };

  // Select-all helper per column
  const setAllForField = (field, value) => {
    setPerms((prev) => {
      const next = { ...prev };
      PAGES.forEach((p) => { next[p.id] = { ...next[p.id], [field]: value }; });
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedUserId || !company?.id) return;
    setSaving(true);
    setSaveMsg(null);
    const rows = PAGES.map((p) => ({ page: p.id, ...perms[p.id] }));
    const { error } = await permissionsService.saveUserPermissions(selectedUserId, company.id, rows);
    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        setDbError(true);
        setSaveMsg({ ok: false, text: "Table not created yet — see setup instructions below." });
      } else {
        setSaveMsg({ ok: false, text: "Failed to save: " + error.message });
      }
    } else {
      setSaveMsg({ ok: true, text: "Permissions saved successfully." });
      setTimeout(() => setSaveMsg(null), 3000);
    }
    setSaving(false);
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* DB setup banner */}
      {dbError && (
        <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="AlertTriangle" size={16} />
            One-time setup required
          </div>
          <p className="text-sm">
            Run the following SQL in your Supabase SQL editor to create the permissions table,
            then refresh this page:
          </p>
          <pre className="text-xs bg-amber-100 rounded p-3 overflow-x-auto whitespace-pre-wrap">{`CREATE TABLE user_page_permissions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  page        TEXT NOT NULL,
  can_view    BOOLEAN NOT NULL DEFAULT TRUE,
  can_create  BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company_id, page)
);
ALTER TABLE user_page_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage permissions" ON user_page_permissions
  USING (true) WITH CHECK (true);`}</pre>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">User Authorization</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Assign per-page access rights to each user. Changes take effect on the user's next page load.
        </p>
      </div>

      {/* User Selector */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[240px] max-w-sm">
          <label className="block text-sm font-medium mb-1">Select User</label>
          {loadingUsers ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="Loader2" size={14} className="animate-spin" />
              Loading users…
            </div>
          ) : (
            <select
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">— Choose a user —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email} ({ROLE_LABELS[u.role] || u.role})
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedUser && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-sm">
            <Icon name="User" size={14} className="text-primary" />
            <span className="font-medium">{selectedUser.full_name || selectedUser.email}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{ROLE_LABELS[selectedUser.role] || selectedUser.role}</span>
          </div>
        )}
      </div>

      {/* Permissions Table */}
      {selectedUserId && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {loadingPerms ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <Icon name="Loader2" size={18} className="animate-spin" />
              Loading permissions…
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-1/2">
                        Page
                      </th>
                      {[
                        { field: "can_view",   label: "View"   },
                        { field: "can_create", label: "Create" },
                        { field: "can_edit",   label: "Edit"   },
                      ].map(({ field, label }) => {
                        const allOn  = PAGES.every((p) => perms[p.id]?.[field]);
                        const someOn = PAGES.some((p) => perms[p.id]?.[field]);
                        return (
                          <th key={field} className="px-4 py-3 text-center font-semibold text-muted-foreground">
                            <div className="flex flex-col items-center gap-1">
                              <span>{label}</span>
                              <button
                                type="button"
                                onClick={() => setAllForField(field, !allOn)}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                                  allOn
                                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                                    : someOn
                                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                    : "bg-muted text-muted-foreground hover:bg-accent"
                                }`}
                                title={allOn ? "Uncheck all" : "Check all"}
                              >
                                {allOn ? "All On" : someOn ? "Mixed" : "All Off"}
                              </button>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {PAGES.map((page) => {
                      const p = perms[page.id] || DEFAULT_PERMS;
                      return (
                        <tr key={page.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Icon name={page.icon} size={14} className="text-primary" />
                              </div>
                              <span className="font-medium">{page.label}</span>
                            </div>
                          </td>

                          {[
                            { field: "can_view",   color: "blue"   },
                            { field: "can_create", color: "green"  },
                            { field: "can_edit",   color: "amber"  },
                          ].map(({ field, color }) => (
                            <td key={field} className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => toggle(page.id, field)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-colors ${
                                  p[field]
                                    ? color === "blue"
                                      ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                                      : color === "green"
                                      ? "bg-green-100 text-green-600 hover:bg-green-200"
                                      : "bg-amber-100 text-amber-600 hover:bg-amber-200"
                                    : "bg-muted text-muted-foreground hover:bg-accent"
                                }`}
                                title={p[field] ? "Click to revoke" : "Click to grant"}
                              >
                                <Icon
                                  name={p[field] ? "Check" : "X"}
                                  size={14}
                                />
                              </button>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 inline-flex items-center justify-center">
                      <Icon name="Check" size={9} />
                    </span>
                    View — can see the page
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-green-100 text-green-600 inline-flex items-center justify-center">
                      <Icon name="Check" size={9} />
                    </span>
                    Create — can add new records
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 inline-flex items-center justify-center">
                      <Icon name="Check" size={9} />
                    </span>
                    Edit — can modify existing records
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {saveMsg && (
                    <span className={`text-xs font-medium ${saveMsg.ok ? "text-emerald-600" : "text-destructive"}`}>
                      {saveMsg.text}
                    </span>
                  )}
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving
                      ? <><Icon name="Loader2" size={14} className="animate-spin" /> Saving…</>
                      : <><Icon name="Save" size={14} /> Save Permissions</>}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!selectedUserId && !loadingUsers && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Icon name="ShieldCheck" size={48} className="text-muted-foreground mb-3" />
          <p className="text-base font-medium text-card-foreground">Select a user to manage their permissions</p>
          <p className="text-sm text-muted-foreground mt-1">
            You can grant or revoke view, create, and edit access per page
          </p>
        </div>
      )}
    </div>
  );
};

export default UserAuthorization;
