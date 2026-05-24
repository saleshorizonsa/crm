import React, { useState, useEffect, useCallback } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Input from "components/ui/Input";
import { materialGroupService } from "services/supabaseService";
import { useAuth } from "contexts/AuthContext";

// ── Inline row editor shared by both panels ──────────────────────────────────
const EditableRow = ({ value, onSave, onCancel, saving }) => {
  const [text, setText] = useState(value);
  return (
    <div className="flex gap-2 items-center">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onSave(text); }
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
        className="flex-1 h-8 text-sm"
      />
      <Button size="sm" onClick={() => onSave(text)} disabled={saving || !text.trim()}>
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
        <Icon name="X" size={14} />
      </Button>
    </div>
  );
};

// ── Add-new-item row ──────────────────────────────────────────────────────────
const AddRow = ({ placeholder, onAdd, onCancel, saving }) => {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2 items-center p-3 bg-muted/30 border-t border-border">
      <Input
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onAdd(text); setText(""); }
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
        className="flex-1 h-8 text-sm"
      />
      <Button size="sm" onClick={() => { onAdd(text); setText(""); }} disabled={saving || !text.trim()}>
        {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : "Add"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const MaterialGroupSettings = () => {
  const { company } = useAuth();

  const [groups, setGroups] = useState([]);
  const [subgroups, setSubgroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingSubId, setEditingSubId] = useState(null);

  // ── Load groups ─────────────────────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await materialGroupService.getGroups(company.id);
    if (err) setError("Failed to load material groups.");
    else setGroups(data || []);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // ── Load subgroups when a group is selected ─────────────────────────────────
  useEffect(() => {
    if (!selectedGroup) { setSubgroups([]); return; }
    const load = async () => {
      setLoadingSubs(true);
      const { data } = await materialGroupService.getSubgroups(selectedGroup.id);
      setSubgroups(data || []);
      setLoadingSubs(false);
    };
    load();
  }, [selectedGroup]);

  // ── Group actions ────────────────────────────────────────────────────────────
  const handleAddGroup = async (name) => {
    if (!name.trim()) return;
    setSaving(true);
    const { data, error: err } = await materialGroupService.createGroup(company.id, name);
    if (err) {
      alert(err.code === "23505" ? `"${name}" already exists.` : "Failed to create group: " + err.message);
    } else {
      setGroups((prev) => [...prev, data]);
      setShowAddGroup(false);
    }
    setSaving(false);
  };

  const handleSaveGroupName = async (id, name) => {
    if (!name.trim()) return;
    setSaving(true);
    const { data, error: err } = await materialGroupService.updateGroup(id, { name: name.trim() });
    if (err) alert("Failed to update: " + err.message);
    else {
      setGroups((prev) => prev.map((g) => (g.id === id ? data : g)));
      if (selectedGroup?.id === id) setSelectedGroup(data);
    }
    setEditingGroupId(null);
    setSaving(false);
  };

  const handleToggleGroupActive = async (group) => {
    setSaving(true);
    const { data, error: err } = await materialGroupService.updateGroup(group.id, { is_active: !group.is_active });
    if (err) alert("Failed to update: " + err.message);
    else {
      setGroups((prev) => prev.map((g) => (g.id === group.id ? data : g)));
      if (selectedGroup?.id === group.id) setSelectedGroup(data);
    }
    setSaving(false);
  };

  const handleDeleteGroup = async (group) => {
    const { count } = await materialGroupService.getGroupUsageCount(company.id, group.name);
    if (count > 0) {
      alert(`Cannot delete "${group.name}" — it is assigned to ${count} product(s). Deactivate it instead.`);
      return;
    }
    if (!confirm(`Delete group "${group.name}" and all its subgroups? This cannot be undone.`)) return;
    setSaving(true);
    const { error: err } = await materialGroupService.deleteGroup(group.id);
    if (err) alert("Failed to delete: " + err.message);
    else {
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      if (selectedGroup?.id === group.id) { setSelectedGroup(null); setSubgroups([]); }
    }
    setSaving(false);
  };

  // ── Subgroup actions ─────────────────────────────────────────────────────────
  const handleAddSubgroup = async (name) => {
    if (!name.trim() || !selectedGroup) return;
    setSaving(true);
    const { data, error: err } = await materialGroupService.createSubgroup(selectedGroup.id, company.id, name);
    if (err) {
      alert(err.code === "23505" ? `"${name}" already exists in this group.` : "Failed to create subgroup: " + err.message);
    } else {
      setSubgroups((prev) => [...prev, data]);
      setShowAddSub(false);
    }
    setSaving(false);
  };

  const handleSaveSubName = async (id, name) => {
    if (!name.trim()) return;
    setSaving(true);
    const { data, error: err } = await materialGroupService.updateSubgroup(id, { name: name.trim() });
    if (err) alert("Failed to update: " + err.message);
    else setSubgroups((prev) => prev.map((s) => (s.id === id ? data : s)));
    setEditingSubId(null);
    setSaving(false);
  };

  const handleToggleSubActive = async (sub) => {
    setSaving(true);
    const { data, error: err } = await materialGroupService.updateSubgroup(sub.id, { is_active: !sub.is_active });
    if (err) alert("Failed to update: " + err.message);
    else setSubgroups((prev) => prev.map((s) => (s.id === sub.id ? data : s)));
    setSaving(false);
  };

  const handleDeleteSub = async (sub) => {
    if (!confirm(`Delete subgroup "${sub.name}"?`)) return;
    setSaving(true);
    const { error: err } = await materialGroupService.deleteSubgroup(sub.id);
    if (err) alert("Failed to delete: " + err.message);
    else setSubgroups((prev) => prev.filter((s) => s.id !== sub.id));
    setSaving(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Icon name="Loader2" className="animate-spin text-primary" size={20} />
        <span>Loading material groups…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Material Groups &amp; Subgroups</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the group and subgroup hierarchy used for products.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-lg flex items-center gap-2 text-sm">
          <Icon name="AlertCircle" size={16} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── LEFT: Groups ──────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Icon name="Layers" size={16} className="text-primary" />
              Material Groups
              <span className="ml-1 text-xs text-muted-foreground">({groups.length})</span>
            </div>
            <Button size="sm" onClick={() => { setShowAddGroup(true); setEditingGroupId(null); }} disabled={showAddGroup}>
              <Icon name="Plus" size={14} className="mr-1" />
              New Group
            </Button>
          </div>

          <div className="divide-y divide-border">
            {groups.length === 0 && !showAddGroup && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No material groups yet. Click "New Group" to create one.
              </p>
            )}

            {groups.map((group) => (
              <div
                key={group.id}
                onClick={() => {
                  if (editingGroupId !== group.id) {
                    setSelectedGroup(group);
                    setShowAddSub(false);
                    setEditingSubId(null);
                  }
                }}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  selectedGroup?.id === group.id
                    ? "bg-primary/10 border-l-2 border-primary"
                    : "hover:bg-muted/40"
                }`}
              >
                {editingGroupId === group.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <EditableRow
                      value={group.name}
                      saving={saving}
                      onSave={(v) => handleSaveGroupName(group.id, v)}
                      onCancel={() => setEditingGroupId(null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon name="ChevronRight" size={14} className={`shrink-0 transition-transform ${selectedGroup?.id === group.id ? "rotate-90 text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm font-medium truncate ${!group.is_active ? "text-muted-foreground line-through" : ""}`}>
                        {group.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggleGroupActive(group)}
                        disabled={saving}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          group.is_active
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {group.is_active ? "Active" : "Inactive"}
                      </button>
                      <button
                        onClick={() => { setEditingGroupId(group.id); setSelectedGroup(group); }}
                        disabled={saving}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Rename"
                      >
                        <Icon name="Pencil" size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group)}
                        disabled={saving}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="Delete"
                      >
                        <Icon name="Trash2" size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {showAddGroup && (
              <AddRow
                placeholder="Group name, e.g. UPVC PIPE"
                onAdd={handleAddGroup}
                onCancel={() => setShowAddGroup(false)}
                saving={saving}
              />
            )}
          </div>
        </div>

        {/* ── RIGHT: Subgroups ───────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Icon name="GitBranch" size={16} className="text-primary" />
              {selectedGroup ? (
                <>Subgroups of <span className="text-primary">{selectedGroup.name}</span></>
              ) : (
                "Subgroups"
              )}
              {selectedGroup && (
                <span className="ml-1 text-xs text-muted-foreground">({subgroups.length})</span>
              )}
            </div>
            {selectedGroup && (
              <Button size="sm" onClick={() => { setShowAddSub(true); setEditingSubId(null); }} disabled={showAddSub}>
                <Icon name="Plus" size={14} className="mr-1" />
                New Subgroup
              </Button>
            )}
          </div>

          <div className="divide-y divide-border">
            {!selectedGroup && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Select a material group on the left to manage its subgroups.
              </p>
            )}

            {selectedGroup && loadingSubs && (
              <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="Loader2" size={14} className="animate-spin" /> Loading…
              </div>
            )}

            {selectedGroup && !loadingSubs && subgroups.length === 0 && !showAddSub && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No subgroups yet. Click "New Subgroup" to add one.
              </p>
            )}

            {subgroups.map((sub) => (
              <div key={sub.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                {editingSubId === sub.id ? (
                  <EditableRow
                    value={sub.name}
                    saving={saving}
                    onSave={(v) => handleSaveSubName(sub.id, v)}
                    onCancel={() => setEditingSubId(null)}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${!sub.is_active ? "text-muted-foreground line-through" : ""}`}>
                      {sub.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleSubActive(sub)}
                        disabled={saving}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          sub.is_active
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {sub.is_active ? "Active" : "Inactive"}
                      </button>
                      <button
                        onClick={() => setEditingSubId(sub.id)}
                        disabled={saving}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Rename"
                      >
                        <Icon name="Pencil" size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteSub(sub)}
                        disabled={saving}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="Delete"
                      >
                        <Icon name="Trash2" size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {showAddSub && (
              <AddRow
                placeholder="Subgroup name, e.g. 110mm Series"
                onAdd={handleAddSubgroup}
                onCancel={() => setShowAddSub(false)}
                saving={saving}
              />
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-4 rounded-lg flex items-start gap-3 text-sm">
        <Icon name="Info" size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-blue-800 dark:text-blue-300">How this works</p>
          <p className="text-blue-700 dark:text-blue-400 mt-1">
            Groups and subgroups defined here appear in the Product Master dropdowns when creating or editing products.
            Deactivate a group to hide it from pickers without losing historical data.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MaterialGroupSettings;
