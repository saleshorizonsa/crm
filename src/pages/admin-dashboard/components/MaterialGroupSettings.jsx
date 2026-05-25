import React, { useState, useEffect, useCallback } from "react";
import Icon from "components/AppIcon";
import { adminService } from "services/supabaseService";
import { useAuth } from "contexts/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────

function dispatchGroupsUpdated() {
  window.dispatchEvent(new Event("material-groups-updated"));
}

// ─────────────────────────────────────────────────────────────────────────────

const MaterialGroupSettings = () => {
  const { company } = useAuth();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  // Create group
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Edit group
  const [editingGroup, setEditingGroup] = useState(null);
  const [editGroupValue, setEditGroupValue] = useState("");

  // Sub group — create
  const [addingSubGroupTo, setAddingSubGroupTo] = useState(null); // group id
  const [newSubGroupName, setNewSubGroupName] = useState("");

  // Sub group — edit
  const [editingSubGroup, setEditingSubGroup] = useState(null); // { id, name, groupId, groupName }
  const [editSubGroupValue, setEditSubGroupValue] = useState("");

  // Feedback
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    const { data, error } = await adminService.getMaterialGroups(company.id);
    if (error) showError("Failed to load material groups: " + error.message);
    else setGroups(data || []);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // ── Feedback helpers ───────────────────────────────────────────────────────
  function showSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3500);
  }
  function showError(msg) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 5000);
  }

  // ── Toggle expand ──────────────────────────────────────────────────────────
  function toggleExpand(groupId) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalSubGroups = groups.reduce(
    (s, g) => s + (g.sub_groups?.length || 0),
    0
  );
  const totalProducts = groups.reduce((s, g) => s + (g.productCount || 0), 0);

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP — Create
  // ══════════════════════════════════════════════════════════════════════════
  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    if (groups.find((g) => g.name.toLowerCase() === name.toLowerCase())) {
      showError(`Group "${name}" already exists.`);
      return;
    }
    setCreateLoading(true);
    const { error } = await adminService.createMaterialGroup(company.id, name);
    if (error) {
      showError("Failed to create group: " + error.message);
    } else {
      showSuccess(`Group "${name}" created.`);
      setShowCreateGroup(false);
      setNewGroupName("");
      await loadGroups();
      dispatchGroupsUpdated();
    }
    setCreateLoading(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP — Update
  // ══════════════════════════════════════════════════════════════════════════
  async function handleUpdateGroup(group) {
    const newName = editGroupValue.trim();
    if (!newName || newName === group.name) {
      setEditingGroup(null);
      return;
    }
    if (
      groups.find(
        (g) =>
          g.id !== group.id &&
          g.name.toLowerCase() === newName.toLowerCase()
      )
    ) {
      showError(`Group "${newName}" already exists.`);
      return;
    }
    setSaving(true);
    const { error } = await adminService.updateMaterialGroup(
      group.id,
      group.name,
      newName,
      company.id
    );
    if (error) {
      showError("Failed to rename: " + error.message);
    } else {
      showSuccess(
        `"${group.name}" renamed to "${newName}" — updated across all products.`
      );
      setEditingGroup(null);
      await loadGroups();
      dispatchGroupsUpdated();
    }
    setSaving(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP — Delete
  // ══════════════════════════════════════════════════════════════════════════
  async function handleDeleteGroup(group) {
    const productCount = group.productCount || 0;
    const subGroupCount = group.sub_groups?.length || 0;

    let msg = `Delete group "${group.name}"?\n\n`;
    if (productCount > 0 || subGroupCount > 0) {
      msg += "This will also:\n";
      if (subGroupCount > 0)
        msg += `• Delete ${subGroupCount} sub group(s)\n`;
      if (productCount > 0)
        msg +=
          `• Remove group from ${productCount} product(s)\n` +
          `  (products will NOT be deleted)\n`;
      msg += "\nThis cannot be undone.";
    }

    if (!confirm(msg)) return;

    setSaving(true);
    const { error } = await adminService.deleteMaterialGroup(
      group.id,
      group.name,
      company.id
    );
    if (error) {
      showError("Failed to delete: " + error.message);
    } else {
      showSuccess(
        `Group "${group.name}" deleted.` +
          (productCount > 0
            ? ` Removed from ${productCount} product(s).`
            : "")
      );
      await loadGroups();
      dispatchGroupsUpdated();
    }
    setSaving(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUB GROUP — Create
  // ══════════════════════════════════════════════════════════════════════════
  async function handleCreateSubGroup(group) {
    const name = newSubGroupName.trim();
    if (!name) return;
    if (group.sub_groups?.find((s) => s.name.toLowerCase() === name.toLowerCase())) {
      showError(`Sub group "${name}" already exists in "${group.name}".`);
      return;
    }
    setSaving(true);
    const { error } = await adminService.createSubGroup(
      group.id,
      company.id,
      name
    );
    if (error) {
      showError("Failed to create sub group: " + error.message);
    } else {
      showSuccess(`Sub group "${name}" added to "${group.name}".`);
      setAddingSubGroupTo(null);
      setNewSubGroupName("");
      await loadGroups();
      dispatchGroupsUpdated();
    }
    setSaving(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUB GROUP — Update
  // ══════════════════════════════════════════════════════════════════════════
  async function handleUpdateSubGroup(sub, group) {
    const newName = editSubGroupValue.trim();
    if (!newName || newName === sub.name) {
      setEditingSubGroup(null);
      return;
    }
    setSaving(true);
    const { error } = await adminService.updateSubGroup(
      sub.id,
      sub.name,
      newName,
      group.name,
      company.id
    );
    if (error) {
      showError("Failed to rename sub group: " + error.message);
    } else {
      showSuccess(`Sub group renamed from "${sub.name}" to "${newName}" — products updated.`);
      setEditingSubGroup(null);
      await loadGroups();
      dispatchGroupsUpdated();
    }
    setSaving(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUB GROUP — Delete
  // ══════════════════════════════════════════════════════════════════════════
  async function handleDeleteSubGroup(sub, group) {
    // Estimate affected products from loaded data
    const msg =
      `Delete sub group "${sub.name}" from "${group.name}"?\n\n` +
      `Products assigned to this sub group will have their sub group cleared (not deleted).\n\n` +
      `This cannot be undone.`;
    if (!confirm(msg)) return;

    setSaving(true);
    const { error } = await adminService.deleteSubGroup(
      sub.id,
      sub.name,
      group.name,
      company.id
    );
    if (error) {
      showError("Failed to delete sub group: " + error.message);
    } else {
      showSuccess(`Sub group "${sub.name}" deleted.`);
      await loadGroups();
      dispatchGroupsUpdated();
    }
    setSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Material Groups &amp; Sub Groups</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage the group hierarchy used for products. Renaming a group
            automatically updates all products.
          </p>
        </div>
        <button
          onClick={loadGroups}
          disabled={loading || saving}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-40"
        >
          <Icon name="RefreshCw" size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ── Feedback messages ─────────────────────────────────────────────── */}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-300">
          <Icon name="CheckCircle" size={16} className="text-emerald-500 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          <Icon name="AlertCircle" size={16} className="text-red-500 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* ── Summary stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Product Groups", value: groups.length, icon: "Layers" },
          { label: "Sub Groups", value: totalSubGroups, icon: "GitBranch" },
          { label: "Total Products", value: totalProducts, icon: "Package" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
            <Icon name={icon} size={20} className="mx-auto text-primary mb-2" />
            <div className="text-2xl font-semibold">{loading ? "—" : value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Header + New Group button ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Material Groups</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {groups.length} group{groups.length !== 1 ? "s" : ""} · {totalSubGroups} sub group{totalSubGroups !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => { setShowCreateGroup(true); setNewGroupName(""); }}
          disabled={showCreateGroup || loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          <Icon name="Plus" size={14} />
          New Group
        </button>
      </div>

      {/* ── Create group form ──────────────────────────────────────────────── */}
      {showCreateGroup && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <p className="text-sm font-medium mb-2">New Material Group</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateGroup();
                if (e.key === "Escape") { setShowCreateGroup(false); setNewGroupName(""); }
              }}
              placeholder="Enter group name…"
              maxLength={100}
              autoFocus
              className="flex-1 text-sm px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-lg bg-background focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim() || createLoading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {createLoading ? (
                <Icon name="Loader2" size={14} className="animate-spin" />
              ) : "Create"}
            </button>
            <button
              onClick={() => { setShowCreateGroup(false); setNewGroupName(""); }}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Groups list ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Icon name="Loader2" size={20} className="animate-spin" />
          <span className="text-sm">Loading groups…</span>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Icon name="Layers" size={40} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No material groups yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click "New Group" to create your first group, or add products with a Material Group value.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            const isEditing = editingGroup?.id === group.id;

            return (
              <div key={group.id} className="bg-card border border-border rounded-xl overflow-hidden">

                {/* Group header row */}
                {isEditing ? (
                  /* ── Edit mode ── */
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-800">
                    <input
                      type="text"
                      value={editGroupValue}
                      onChange={(e) => setEditGroupValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateGroup(group);
                        if (e.key === "Escape") setEditingGroup(null);
                      }}
                      maxLength={100}
                      autoFocus
                      className="flex-1 text-sm px-3 py-1.5 border border-blue-300 dark:border-blue-600 rounded-lg bg-background font-medium focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleUpdateGroup(group)}
                      disabled={!editGroupValue.trim() || editGroupValue.trim() === group.name || saving}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
                    >
                      {saving ? <Icon name="Loader2" size={12} className="animate-spin" /> : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingGroup(null)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  /* ── Normal mode ── */
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleExpand(group.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Icon
                          name={isExpanded ? "ChevronDown" : "ChevronRight"}
                          size={16}
                        />
                      </button>
                      <div>
                        <span className="text-sm font-semibold">{group.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {group.productCount || 0} product{(group.productCount || 0) !== 1 ? "s" : ""}
                          {(group.sub_groups?.length || 0) > 0 && (
                            <> · {group.sub_groups.length} sub group{group.sub_groups.length !== 1 ? "s" : ""}</>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Add sub group */}
                      <button
                        onClick={() => {
                          setAddingSubGroupTo(group.id);
                          setNewSubGroupName("");
                          if (!isExpanded) toggleExpand(group.id);
                        }}
                        disabled={saving}
                        className="text-xs px-2.5 py-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors disabled:opacity-40"
                      >
                        + Sub Group
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => {
                          setEditingGroup(group);
                          setEditGroupValue(group.name);
                          setEditingSubGroup(null);
                        }}
                        disabled={saving}
                        className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors disabled:opacity-40"
                        title="Rename group"
                      >
                        <Icon name="Pencil" size={14} />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteGroup(group)}
                        disabled={saving}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-40"
                        title="Delete group"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub groups — shown when expanded */}
                {isExpanded && (
                  <div className="px-4 py-3">
                    {(group.sub_groups?.length || 0) === 0 && addingSubGroupTo !== group.id && (
                      <p className="text-xs text-muted-foreground italic py-1">
                        No sub groups yet — click "+ Sub Group" to add one.
                      </p>
                    )}

                    {group.sub_groups?.length > 0 && (
                      <div className="space-y-0.5 mb-2">
                        {group.sub_groups.map((sub) => {
                          const isEditingSub =
                            editingSubGroup?.id === sub.id;

                          return (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-muted/40 transition-colors"
                            >
                              {isEditingSub ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={editSubGroupValue}
                                    onChange={(e) => setEditSubGroupValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleUpdateSubGroup(sub, group);
                                      if (e.key === "Escape") setEditingSubGroup(null);
                                    }}
                                    autoFocus
                                    maxLength={100}
                                    className="flex-1 text-sm px-2 py-1 border border-primary rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                  <button
                                    onClick={() => handleUpdateSubGroup(sub, group)}
                                    disabled={saving || !editSubGroupValue.trim()}
                                    className="px-2.5 py-1 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 disabled:opacity-40"
                                  >
                                    {saving ? <Icon name="Loader2" size={12} className="animate-spin" /> : "Save"}
                                  </button>
                                  <button
                                    onClick={() => setEditingSubGroup(null)}
                                    className="px-2.5 py-1 text-xs rounded-md border border-border hover:bg-accent"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                                    <span className="text-sm">{sub.name}</span>
                                  </div>
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      onClick={() => {
                                        setEditingSubGroup({ id: sub.id, name: sub.name, groupId: group.id, groupName: group.name });
                                        setEditSubGroupValue(sub.name);
                                        setEditingGroup(null);
                                      }}
                                      disabled={saving}
                                      className="p-1 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded transition-colors"
                                      title="Rename sub group"
                                    >
                                      <Icon name="Pencil" size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteSubGroup(sub, group)}
                                      disabled={saving}
                                      className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                      title="Delete sub group"
                                    >
                                      <Icon name="Trash2" size={13} />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add sub group inline form */}
                    {addingSubGroupTo === group.id && (
                      <div className="flex items-center gap-2 pt-2 border-t border-border mt-1">
                        <input
                          type="text"
                          value={newSubGroupName}
                          onChange={(e) => setNewSubGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateSubGroup(group);
                            if (e.key === "Escape") {
                              setAddingSubGroupTo(null);
                              setNewSubGroupName("");
                            }
                          }}
                          placeholder="Sub group name…"
                          maxLength={100}
                          autoFocus
                          className="flex-1 text-sm px-3 py-1.5 border border-blue-300 dark:border-blue-700 rounded-lg bg-background focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleCreateSubGroup(group)}
                          disabled={!newSubGroupName.trim() || saving}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                        >
                          {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : "Add"}
                        </button>
                        <button
                          onClick={() => { setAddingSubGroupTo(null); setNewSubGroupName(""); }}
                          className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Info footer ───────────────────────────────────────────────────── */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-4 rounded-lg flex items-start gap-3 text-sm">
        <Icon name="Info" size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-blue-800 dark:text-blue-300">How this works</p>
          <p className="text-blue-700 dark:text-blue-400 mt-1">
            Groups are stored in a dedicated table. Renaming a group automatically updates the
            Material Group field on every product assigned to it. Deleting a group clears the
            field on affected products — it does not delete the products. Sub group changes
            propagate to products the same way.
          </p>
        </div>
      </div>

    </div>
  );
};

export default MaterialGroupSettings;
