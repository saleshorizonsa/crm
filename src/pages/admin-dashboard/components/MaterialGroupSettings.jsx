import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import { adminService } from "services/supabaseService";
import { useAuth } from "contexts/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function lsKey(companyId, groupName) {
  return `subgroups_${companyId}_${groupName}`;
}

function readLocalSubs(companyId, groupName) {
  try {
    return JSON.parse(
      localStorage.getItem(lsKey(companyId, groupName)) || "[]"
    );
  } catch {
    return [];
  }
}

function writeLocalSubs(companyId, groupName, subs) {
  localStorage.setItem(lsKey(companyId, groupName), JSON.stringify(subs));
}

// Build the groups hierarchy from a flat products array
function buildGroups(products, companyId) {
  const map = {};

  (products || []).forEach((p) => {
    const groupName = (p.product_group || p.material_group || "").trim();
    if (!groupName) return;

    if (!map[groupName]) {
      map[groupName] = { name: groupName, productSubs: new Set(), itemCount: 0 };
    }
    map[groupName].itemCount++;

    const sub = (p.material_subgroup || p.sub_group || "").trim();
    if (sub) map[groupName].productSubs.add(sub);
  });

  return Object.values(map)
    .map((g) => {
      const localSubs = readLocalSubs(companyId, g.name);
      const allSubs = [...new Set([...g.productSubs, ...localSubs])].sort();
      return { name: g.name, subGroups: allSubs, itemCount: g.itemCount };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────────────────

const MaterialGroupSettings = () => {
  const { company } = useAuth();

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [addingSubGroupTo, setAddingSubGroupTo] = useState(null);
  const [newSubGroupName, setNewSubGroupName] = useState("");
  const [editingSubGroup, setEditingSubGroup] = useState(null); // { groupName, sgName }
  const [editSubGroupValue, setEditSubGroupValue] = useState("");

  // ── Derived groups from products ─────────────────────────────────────────────
  const groups = useMemo(
    () => buildGroups(allProducts, company?.id),
    [allProducts, company?.id]
  );

  // ── Load products ────────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await adminService.getAllProducts();
    if (err) {
      setError("Failed to load products: " + err.message);
    } else {
      setAllProducts(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // ── Summary stats ────────────────────────────────────────────────────────────
  const totalSubGroups = useMemo(
    () => groups.reduce((s, g) => s + g.subGroups.length, 0),
    [groups]
  );

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function flash(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  function countProductsInSubGroup(groupName, sgName) {
    return allProducts.filter(
      (p) =>
        (p.product_group || p.material_group || "").trim() === groupName &&
        (p.material_subgroup || p.sub_group || "").trim() === sgName
    ).length;
  }

  function toggleGroup(groupName) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupName) ? next.delete(groupName) : next.add(groupName);
      return next;
    });
  }

  // ── Add sub group ────────────────────────────────────────────────────────────
  async function handleAddSubGroup(groupName) {
    const name = newSubGroupName.trim();
    if (!name) return;

    const group = groups.find((g) => g.name === groupName);
    if (group?.subGroups.includes(name)) {
      alert(`"${name}" already exists in "${groupName}".`);
      return;
    }

    const existing = readLocalSubs(company?.id, groupName);
    if (!existing.includes(name)) {
      writeLocalSubs(company?.id, groupName, [...existing, name].sort());
    }

    setAllProducts((prev) => [...prev]); // trigger useMemo re-derive
    // Force refresh from localStorage by toggling state
    setAllProducts((prev) => [...prev]);
    // Re-load to get fresh data merged with localStorage
    await loadProducts();

    setAddingSubGroupTo(null);
    setNewSubGroupName("");
    flash(`Sub group "${name}" added to "${groupName}"`);
  }

  // ── Delete sub group ─────────────────────────────────────────────────────────
  async function handleDeleteSubGroup(groupName, sgName) {
    const count = countProductsInSubGroup(groupName, sgName);

    if (count > 0) {
      const ok = confirm(
        `${count} product(s) are assigned to "${sgName}".\n` +
          `Deleting this sub group will clear it from those products.\n\nContinue?`
      );
      if (!ok) return;

      setSaving(true);
      const toUpdate = allProducts.filter(
        (p) =>
          (p.product_group || p.material_group || "").trim() === groupName &&
          (p.material_subgroup || p.sub_group || "").trim() === sgName
      );

      await Promise.all(
        toUpdate.map((p) =>
          adminService.updateProduct(p.id, { material_subgroup: null })
        )
      );
      setSaving(false);
    }

    // Remove from localStorage
    const existing = readLocalSubs(company?.id, groupName);
    writeLocalSubs(
      company?.id,
      groupName,
      existing.filter((s) => s !== sgName)
    );

    await loadProducts();
    flash(`Sub group "${sgName}" removed.`);
  }

  // ── Rename sub group ─────────────────────────────────────────────────────────
  function startEditSubGroup(groupName, sgName) {
    setEditingSubGroup({ groupName, sgName });
    setEditSubGroupValue(sgName);
  }

  async function handleRenameSubGroup(groupName, oldName, newName) {
    newName = newName.trim();
    if (!newName || newName === oldName) {
      setEditingSubGroup(null);
      return;
    }

    setSaving(true);

    const toUpdate = allProducts.filter(
      (p) =>
        (p.product_group || p.material_group || "").trim() === groupName &&
        (p.material_subgroup || p.sub_group || "").trim() === oldName
    );

    await Promise.all(
      toUpdate.map((p) =>
        adminService.updateProduct(p.id, { material_subgroup: newName })
      )
    );

    // Update localStorage
    const existing = readLocalSubs(company?.id, groupName);
    writeLocalSubs(
      company?.id,
      groupName,
      existing.map((s) => (s === oldName ? newName : s)).sort()
    );

    setSaving(false);
    setEditingSubGroup(null);
    await loadProducts();
    flash(`Renamed "${oldName}" → "${newName}" (${toUpdate.length} product(s) updated).`);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Icon name="Loader2" className="animate-spin text-primary" size={20} />
        <span className="text-sm text-muted-foreground">Loading material groups…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Material Groups &amp; Sub Groups</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Derived from your product master. Add sub groups to organise products further.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadProducts} disabled={loading || saving} className="gap-2">
          <Icon name="RefreshCw" size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* ── Error / Success ───────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-lg flex items-center gap-2 text-sm">
          <Icon name="AlertCircle" size={16} /> {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 p-3 rounded-lg flex items-center gap-2 text-sm border border-emerald-200 dark:border-emerald-800">
          <Icon name="CheckCircle" size={16} /> {successMsg}
        </div>
      )}

      {/* ── Summary stats ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-semibold text-foreground">{groups.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Product Groups</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-semibold text-foreground">{totalSubGroups}</div>
          <div className="text-xs text-muted-foreground mt-1">Sub Groups</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-semibold text-foreground">{allProducts.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Products</div>
        </div>
      </div>

      {/* ── Group list ────────────────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Icon name="Layers" size={40} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No material groups found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add products with a Material Group value in the Product Master to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.name);
            return (
              <div
                key={group.name}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleGroup(group.name)}
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
                        {group.itemCount} product{group.itemCount !== 1 ? "s" : ""}
                        {group.subGroups.length > 0 && (
                          <> · {group.subGroups.length} sub group{group.subGroups.length !== 1 ? "s" : ""}</>
                        )}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setAddingSubGroupTo(
                        addingSubGroupTo === group.name ? null : group.name
                      );
                      setNewSubGroupName("");
                      if (!isExpanded) toggleGroup(group.name);
                    }}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 dark:text-blue-400 transition-colors"
                  >
                    <Icon name="Plus" size={12} />
                    Add Sub Group
                  </button>
                </div>

                {/* Sub groups — shown when expanded */}
                {isExpanded && (
                  <div className="px-4 py-2">
                    {group.subGroups.length === 0 && addingSubGroupTo !== group.name && (
                      <p className="text-xs text-muted-foreground py-2 italic">
                        No sub groups yet — click "Add Sub Group" to create one.
                      </p>
                    )}

                    {group.subGroups.length > 0 && (
                      <div className="space-y-0.5 mb-2">
                        {group.subGroups.map((sg) => {
                          const isEditing =
                            editingSubGroup?.groupName === group.name &&
                            editingSubGroup?.sgName === sg;
                          const itemCount = countProductsInSubGroup(group.name, sg);

                          return (
                            <div
                              key={sg}
                              className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-muted/40 transition-colors"
                            >
                              {isEditing ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={editSubGroupValue}
                                    onChange={(e) => setEditSubGroupValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        handleRenameSubGroup(group.name, sg, editSubGroupValue);
                                      if (e.key === "Escape") setEditingSubGroup(null);
                                    }}
                                    autoFocus
                                    className="flex-1 text-sm px-2 py-1 border border-primary rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                  <button
                                    onClick={() => handleRenameSubGroup(group.name, sg, editSubGroupValue)}
                                    disabled={saving || !editSubGroupValue.trim()}
                                    className="px-2.5 py-1 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 disabled:opacity-40"
                                  >
                                    {saving ? <Icon name="Loader2" size={12} className="animate-spin" /> : "Save"}
                                  </button>
                                  <button
                                    onClick={() => setEditingSubGroup(null)}
                                    className="px-2.5 py-1 text-xs rounded-md border border-border hover:bg-muted"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                                    <span className="text-sm">{sg}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {itemCount} item{itemCount !== 1 ? "s" : ""}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => startEditSubGroup(group.name, sg)}
                                      disabled={saving}
                                      className="p-1 text-muted-foreground hover:text-blue-600 transition-colors rounded"
                                      title="Rename sub group"
                                    >
                                      <Icon name="Pencil" size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteSubGroup(group.name, sg)}
                                      disabled={saving}
                                      className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
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

                    {/* Inline add form */}
                    {addingSubGroupTo === group.name && (
                      <div className="flex items-center gap-2 mt-1 pt-2 border-t border-border">
                        <input
                          type="text"
                          value={newSubGroupName}
                          onChange={(e) => setNewSubGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddSubGroup(group.name);
                            if (e.key === "Escape") {
                              setAddingSubGroupTo(null);
                              setNewSubGroupName("");
                            }
                          }}
                          placeholder="Sub group name…"
                          autoFocus
                          className="flex-1 text-sm px-3 py-1.5 border border-blue-300 dark:border-blue-700 rounded-lg bg-background focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleAddSubGroup(group.name)}
                          disabled={!newSubGroupName.trim() || saving}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                        >
                          {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : "Add"}
                        </button>
                        <button
                          onClick={() => {
                            setAddingSubGroupTo(null);
                            setNewSubGroupName("");
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
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

      {/* ── Info footer ───────────────────────────────────────────────────────── */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-4 rounded-lg flex items-start gap-3 text-sm">
        <Icon name="Info" size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-blue-800 dark:text-blue-300">How this works</p>
          <p className="text-blue-700 dark:text-blue-400 mt-1">
            Groups are derived from the Material Group field on your products — no separate table needed.
            Sub groups you add here are saved locally and appear immediately in the Product form.
            Renaming or deleting a sub group updates all products assigned to it.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MaterialGroupSettings;
