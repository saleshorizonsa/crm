import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Input from "components/ui/Input";
import { uomService } from "services/supabaseService";

const UomSettings = () => {
  const [uomTypes, setUomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ value: "", label: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUom, setNewUom] = useState({ value: "", label: "" });
  const [saving, setSaving] = useState(false);
  const [usageCount, setUsageCount] = useState({});

  useEffect(() => {
    fetchUomTypes();
  }, []);

  const fetchUomTypes = async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await uomService.getUomTypes();

    if (fetchError) {
      setError("Failed to load UOM types");
      console.error("Error fetching UOM types:", fetchError);
    } else {
      setUomTypes(data || []);
      // Fetch usage counts for each UOM type
      const counts = {};
      for (const uom of data || []) {
        const { count } = await uomService.checkUomUsage(uom.value);
        counts[uom.value] = count;
      }
      setUsageCount(counts);
    }

    setLoading(false);
  };

  const handleAddUom = async () => {
    if (!newUom.value.trim() || !newUom.label.trim()) {
      alert("Please fill in both Value and Label fields");
      return;
    }

    // Validate value format (lowercase, no spaces)
    const formattedValue = newUom.value.toLowerCase().replace(/\s+/g, "_");

    setSaving(true);
    const { data, error: createError } = await uomService.createUomType({
      value: formattedValue,
      label: newUom.label.trim(),
      sort_order: uomTypes.length + 1,
      is_active: true,
    });

    if (createError) {
      if (createError.code === "23505") {
        alert("This UOM value already exists");
      } else {
        alert("Failed to create UOM type: " + createError.message);
      }
    } else {
      setUomTypes([...uomTypes, data]);
      setNewUom({ value: "", label: "" });
      setShowAddForm(false);
    }

    setSaving(false);
  };

  const handleEdit = (uom) => {
    setEditingId(uom.id);
    setEditForm({ value: uom.value, label: uom.label });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ value: "", label: "" });
  };

  const handleSaveEdit = async (uom) => {
    if (!editForm.label.trim()) {
      alert("Label cannot be empty");
      return;
    }

    setSaving(true);
    const { data, error: updateError } = await uomService.updateUomType(
      uom.id,
      {
        label: editForm.label.trim(),
      }
    );

    if (updateError) {
      alert("Failed to update UOM type: " + updateError.message);
    } else {
      setUomTypes(
        uomTypes.map((u) =>
          u.id === uom.id ? { ...u, label: editForm.label.trim() } : u
        )
      );
      setEditingId(null);
      setEditForm({ value: "", label: "" });
    }

    setSaving(false);
  };

  const handleToggleActive = async (uom) => {
    setSaving(true);
    const { error: updateError } = await uomService.updateUomType(uom.id, {
      is_active: !uom.is_active,
    });

    if (updateError) {
      alert("Failed to update UOM status: " + updateError.message);
    } else {
      setUomTypes(
        uomTypes.map((u) =>
          u.id === uom.id ? { ...u, is_active: !u.is_active } : u
        )
      );
    }

    setSaving(false);
  };

  const handleDelete = async (uom) => {
    // Check usage
    const count = usageCount[uom.value] || 0;

    if (count > 0) {
      alert(
        `Cannot delete "${uom.label}" - it is being used by ${count} deal product(s). Please deactivate it instead.`
      );
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete "${uom.label}"? This cannot be undone.`
      )
    ) {
      return;
    }

    setSaving(true);
    const { error: deleteError } = await uomService.deleteUomType(uom.id);

    if (deleteError) {
      alert("Failed to delete UOM type: " + deleteError.message);
    } else {
      setUomTypes(uomTypes.filter((u) => u.id !== uom.id));
    }

    setSaving(false);
  };

  const handleMoveUp = async (index) => {
    if (index === 0) return;

    const newOrder = [...uomTypes];
    [newOrder[index - 1], newOrder[index]] = [
      newOrder[index],
      newOrder[index - 1],
    ];

    // Update sort_order for both items
    setSaving(true);
    await Promise.all([
      uomService.updateUomType(newOrder[index - 1].id, {
        sort_order: index,
      }),
      uomService.updateUomType(newOrder[index].id, { sort_order: index + 1 }),
    ]);
    setSaving(false);

    setUomTypes(newOrder);
  };

  const handleMoveDown = async (index) => {
    if (index === uomTypes.length - 1) return;

    const newOrder = [...uomTypes];
    [newOrder[index], newOrder[index + 1]] = [
      newOrder[index + 1],
      newOrder[index],
    ];

    // Update sort_order for both items
    setSaving(true);
    await Promise.all([
      uomService.updateUomType(newOrder[index].id, { sort_order: index + 1 }),
      uomService.updateUomType(newOrder[index + 1].id, {
        sort_order: index + 2,
      }),
    ]);
    setSaving(false);

    setUomTypes(newOrder);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Icon name="Loader2" className="animate-spin text-primary" size={24} />
        <span className="ml-2">Loading UOM settings...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Unit of Measure (UOM) Types</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the unit of measure options available when adding products to
            deals
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm}
          className="gap-2"
        >
          <Icon name="Plus" size={16} />
          Add UOM
        </Button>
      </div>

      {error && (
        <div className="bg-error/10 text-error p-4 rounded-lg flex items-center gap-2">
          <Icon name="AlertCircle" size={20} />
          {error}
        </div>
      )}

      {/* Add New UOM Form */}
      {showAddForm && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-4">Add New UOM Type</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Value (Code)
              </label>
              <Input
                placeholder="e.g., ltr, kg, m"
                value={newUom.value}
                onChange={(e) =>
                  setNewUom({ ...newUom, value: e.target.value })
                }
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lowercase, no spaces. Used internally.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Label (Display Name)
              </label>
              <Input
                placeholder="e.g., LTR (Litres)"
                value={newUom.label}
                onChange={(e) =>
                  setNewUom({ ...newUom, label: e.target.value })
                }
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shown to users in dropdowns.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddForm(false);
                setNewUom({ value: "", label: "" });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddUom} disabled={saving}>
              {saving ? (
                <>
                  <Icon
                    name="Loader2"
                    className="animate-spin mr-2"
                    size={16}
                  />
                  Adding...
                </>
              ) : (
                "Add UOM"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* UOM List */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left p-4 font-medium text-sm w-12">#</th>
              <th className="text-left p-4 font-medium text-sm">Value</th>
              <th className="text-left p-4 font-medium text-sm">Label</th>
              <th className="text-left p-4 font-medium text-sm">Status</th>
              <th className="text-left p-4 font-medium text-sm">Usage</th>
              <th className="text-right p-4 font-medium text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {uomTypes.map((uom, index) => (
              <tr
                key={uom.id}
                className="border-b border-border hover:bg-muted/30 transition-colors"
              >
                <td className="p-4 text-muted-foreground">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0 || saving}
                      className="p-1 hover:bg-muted rounded disabled:opacity-30"
                    >
                      <Icon name="ChevronUp" size={14} />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === uomTypes.length - 1 || saving}
                      className="p-1 hover:bg-muted rounded disabled:opacity-30"
                    >
                      <Icon name="ChevronDown" size={14} />
                    </button>
                  </div>
                </td>
                <td className="p-4">
                  <code className="bg-muted px-2 py-1 rounded text-sm">
                    {uom.value}
                  </code>
                </td>
                <td className="p-4">
                  {editingId === uom.id ? (
                    <Input
                      value={editForm.label}
                      onChange={(e) =>
                        setEditForm({ ...editForm, label: e.target.value })
                      }
                      className="w-48"
                      autoFocus
                    />
                  ) : (
                    <span
                      className={!uom.is_active ? "text-muted-foreground" : ""}
                    >
                      {uom.label}
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <button
                    onClick={() => handleToggleActive(uom)}
                    disabled={saving}
                    className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                      uom.is_active
                        ? "bg-success/10 text-success hover:bg-success/20"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {uom.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="p-4 text-sm text-muted-foreground">
                  {usageCount[uom.value] || 0} products
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2">
                    {editingId === uom.id ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(uom)}
                          disabled={saving}
                        >
                          {saving ? (
                            <Icon
                              name="Loader2"
                              className="animate-spin"
                              size={14}
                            />
                          ) : (
                            "Save"
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(uom)}
                          disabled={saving}
                        >
                          <Icon name="Pencil" size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(uom)}
                          disabled={saving || (usageCount[uom.value] || 0) > 0}
                          className="text-error hover:text-error hover:bg-error/10"
                          title={
                            (usageCount[uom.value] || 0) > 0
                              ? "Cannot delete - in use"
                              : "Delete UOM"
                          }
                        >
                          <Icon name="Trash2" size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {uomTypes.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-8 text-center text-muted-foreground"
                >
                  No UOM types defined. Click "Add UOM" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info */}
      <div className="bg-info/10 p-4 rounded-lg flex items-start gap-3">
        <Icon name="Info" className="text-info mt-0.5" size={20} />
        <div className="text-sm">
          <p className="font-medium text-info">About UOM Types</p>
          <p className="text-muted-foreground mt-1">
            UOM types are used when adding products to deals. Inactive types
            won't appear in the selection dropdown but existing products using
            them will still display correctly. You cannot delete a UOM type that
            is in use - deactivate it instead.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UomSettings;
