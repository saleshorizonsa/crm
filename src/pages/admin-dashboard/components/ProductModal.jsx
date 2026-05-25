import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Input from "components/ui/Input";
import Select from "components/ui/Select";
import { Checkbox } from "components/ui/Checkbox";
import { adminService } from "../../../services/supabaseService";
import { useAuth } from "contexts/AuthContext";

const ProductModal = ({ product, onClose, onSuccess, viewOnly = false }) => {
  const { company } = useAuth();

  const [formData, setFormData] = useState({
    material: "",
    description: "",
    material_group: "",
    material_subgroup: "",
    base_unit_of_measure: "EA",
    unit_price: "",
    cost_price: "",
    price_per_ton: "",
    price_per_pc: "",
    price_per_meter: "",
    maintenance_status: "Active",
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [subgroups, setSubgroups] = useState([]);
  const [addingNewGroup, setAddingNewGroup] = useState(false);
  const [newGroupInput, setNewGroupInput] = useState("");

  // Load groups — getMaterialGroups returns array directly with products fallback built in
  const loadGroups = async () => {
    if (!company?.id) return;
    const fetched = await adminService.getMaterialGroups(company.id);
    if (fetched && fetched.length > 0) {
      setGroups(fetched.map((g) => ({ name: g.name })));
    } else {
      // Last-resort fallback: scan products table directly
      const { data: products } = await adminService.getAllProducts();
      if (products) {
        const names = [
          ...new Set(
            products.map((p) => (p.material_group || "").trim()).filter(Boolean)
          ),
        ].sort();
        setGroups(names.map((name) => ({ name })));
      }
    }
  };

  useEffect(() => {
    loadGroups();
    window.addEventListener("material-groups-updated", loadGroups);
    return () => window.removeEventListener("material-groups-updated", loadGroups);
  }, [company?.id]);

  // Subgroups: from material_sub_groups table, with localStorage fallback
  useEffect(() => {
    const groupName = formData.material_group;
    if (!groupName || !company?.id) { setSubgroups([]); return; }

    const load = async () => {
      const allGroups = await adminService.getMaterialGroups(company.id);
      const group = (allGroups || []).find((g) => g.name === groupName);
      if (group?.sub_groups?.length) {
        setSubgroups(group.sub_groups.map((s) => ({ name: s.name })));
        return;
      }
      // Fallback: derive from products
      const { data: products } = await adminService.getAllProducts();
      const subs = [
        ...new Set(
          (products || [])
            .filter((p) => (p.material_group || "").trim() === groupName)
            .map((p) => (p.material_subgroup || "").trim())
            .filter(Boolean)
        ),
      ].sort();
      setSubgroups(subs.map((name) => ({ name })));
    };
    load();
  }, [formData.material_group, company?.id]);

  useEffect(() => {
    if (product) {
      setFormData({
        material: product.material || "",
        description: product.description || "",
        material_group: product.material_group || "",
        material_subgroup: product.material_subgroup || "",
        base_unit_of_measure: product.base_unit_of_measure || "EA",
        unit_price: product.unit_price?.toString() || "",
        cost_price: product.cost_price?.toString() || "",
        price_per_ton: product.price_per_ton?.toString() || "",
        price_per_pc: product.price_per_pc?.toString() || "",
        price_per_meter: product.price_per_meter?.toString() || "",
        maintenance_status: product.maintenance_status || "Active",
        is_active: product.is_active ?? true,
      });
    }
  }, [product]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.material?.trim()) {
      alert("Material name is required");
      return;
    }

    setLoading(true);

    try {
      const parsePrice = (v) => (v === "" || v === null ? null : parseFloat(v));
      const payload = {
        ...formData,
        unit_price: parsePrice(formData.unit_price),
        cost_price: parsePrice(formData.cost_price),
        price_per_ton: parsePrice(formData.price_per_ton),
        price_per_pc: parsePrice(formData.price_per_pc),
        price_per_meter: parsePrice(formData.price_per_meter),
      };

      const { data, error } = product
        ? await adminService.updateProduct(product.id, payload)
        : await adminService.createProduct(payload);

      if (error) {
        alert(`Failed to ${product ? "update" : "create"} product: ` + error.message);
      } else {
        alert(`Product ${product ? "updated" : "created"} successfully!`);
        onSuccess();
      }
    } catch (error) {
      alert("An error occurred: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleGroupSelect = (value) => {
    if (value === "__new__") {
      setAddingNewGroup(true);
      setNewGroupInput("");
      handleChange("material_group", "");
    } else {
      setAddingNewGroup(false);
      handleChange("material_group", value);
      handleChange("material_subgroup", "");
    }
  };

  const handleNewGroupConfirm = () => {
    const trimmed = newGroupInput.trim();
    if (!trimmed) return;
    handleChange("material_group", trimmed);
    setAddingNewGroup(false);
  };

  const selectValue = addingNewGroup ? "__new__" : formData.material_group || "";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon name="Package" className="text-primary" size={20} />
            <h2 className="text-lg font-semibold">
              {viewOnly ? "Product Details" : product ? "Edit Product" : "Add New Product"}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={viewOnly ? (e) => e.preventDefault() : handleSubmit} className="p-4 space-y-4">
          {/* Material Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Material Name {!viewOnly && <span className="text-red-500">*</span>}
            </label>
            <Input
              type="text"
              placeholder="e.g., Steel Rod 12mm"
              value={formData.material}
              onChange={(e) => handleChange("material", e.target.value)}
              required={!viewOnly}
              disabled={viewOnly}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-default"
              rows={3}
              placeholder="Product description..."
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              disabled={viewOnly}
            />
          </div>

          {/* Material Group and Base UOM */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Material Group — select from existing or add new */}
            <div>
              <label className="block text-sm font-medium mb-1">Material Group</label>
              <select
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm disabled:opacity-60"
                value={selectValue}
                onChange={(e) => handleGroupSelect(e.target.value)}
                disabled={viewOnly}
              >
                <option value="">— Select a group —</option>
                {groups.map((g) => (
                  <option key={g.name} value={g.name}>{g.name}</option>
                ))}
                {!viewOnly && <option value="__new__">+ Type a new group name…</option>}
              </select>

              {addingNewGroup && !viewOnly && (
                <div className="mt-2 flex gap-2">
                  <Input
                    type="text"
                    placeholder="New group name"
                    value={newGroupInput}
                    onChange={(e) => setNewGroupInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleNewGroupConfirm(); }
                      if (e.key === "Escape") setAddingNewGroup(false);
                    }}
                    autoFocus
                    className="flex-1"
                  />
                  <Button type="button" size="sm" onClick={handleNewGroupConfirm} disabled={!newGroupInput.trim()}>
                    Use
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAddingNewGroup(false)}>
                    <Icon name="X" size={14} />
                  </Button>
                </div>
              )}

              {!viewOnly && groups.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  No groups defined yet — go to Admin → Material Groups to create them.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Base Unit of Measure</label>
              <Select
                value={formData.base_unit_of_measure}
                onChange={(e) => handleChange("base_unit_of_measure", e.target.value)}
                disabled={viewOnly}
              >
                <option value="EA">Each (EA)</option>
                <option value="PC">Piece (PC)</option>
                <option value="KG">Kilogram (KG)</option>
                <option value="LB">Pound (LB)</option>
                <option value="M">Meter (M)</option>
                <option value="FT">Foot (FT)</option>
                <option value="M2">Square Meter (M2)</option>
                <option value="M3">Cubic Meter (M3)</option>
                <option value="L">Liter (L)</option>
                <option value="GAL">Gallon (GAL)</option>
                <option value="TON">Ton (TON)</option>
                <option value="BOX">Box (BOX)</option>
                <option value="ROLL">Roll (ROLL)</option>
                <option value="SET">Set (SET)</option>
              </Select>
            </div>
          </div>

          {/* Material Subgroup */}
          {(formData.material_group || viewOnly) && (
            <div>
              <label className="block text-sm font-medium mb-1">Material Subgroup</label>
              {subgroups.length > 0 ? (
                <select
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm disabled:opacity-60"
                  value={formData.material_subgroup}
                  onChange={(e) => handleChange("material_subgroup", e.target.value)}
                  disabled={viewOnly}
                >
                  <option value="">— None —</option>
                  {subgroups.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type="text"
                  placeholder="e.g., 110mm Series"
                  value={formData.material_subgroup}
                  onChange={(e) => handleChange("material_subgroup", e.target.value)}
                  disabled={viewOnly}
                />
              )}
              {!viewOnly && subgroups.length === 0 && formData.material_group && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No subgroups for this group yet — add them in Admin → Material Groups, or type freely above.
                </p>
              )}
            </div>
          )}

          {/* Prices by UOM */}
          <div>
            <label className="block text-sm font-medium mb-2">Pricing by Unit of Measure</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Price per TON</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.price_per_ton}
                  min="0"
                  step="0.01"
                  onChange={(e) => handleChange("price_per_ton", e.target.value)}
                  disabled={viewOnly}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Price per PC / Each</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.price_per_pc}
                  min="0"
                  step="0.01"
                  onChange={(e) => handleChange("price_per_pc", e.target.value)}
                  disabled={viewOnly}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Price per Meter</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.price_per_meter}
                  min="0"
                  step="0.01"
                  onChange={(e) => handleChange("price_per_meter", e.target.value)}
                  disabled={viewOnly}
                />
              </div>
            </div>
          </div>

          {/* Default Unit Price, Cost Price and Maintenance Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Default Unit Price <span className="text-xs text-muted-foreground">(fallback)</span>
              </label>
              <Input
                type="number"
                placeholder="Optional fallback price"
                value={formData.unit_price}
                min="0"
                step="0.01"
                onChange={(e) => handleChange("unit_price", e.target.value)}
                disabled={viewOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Cost Price <span className="text-xs text-muted-foreground">(internal)</span>
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={formData.cost_price}
                min="0"
                step="0.01"
                onChange={(e) => handleChange("cost_price", e.target.value)}
                disabled={viewOnly}
              />
              {(() => {
                const sale = parseFloat(formData.unit_price);
                const cost = parseFloat(formData.cost_price);
                if (!isNaN(sale) && !isNaN(cost) && sale > 0) {
                  const pct = ((sale - cost) / sale) * 100;
                  const color = pct >= 20 ? "text-green-600" : pct >= 10 ? "text-amber-600" : "text-red-600";
                  return <p className={`mt-1 text-xs font-medium ${color}`}>Margin: {pct.toFixed(1)}%</p>;
                }
                return null;
              })()}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Maintenance Status</label>
            <Select
              value={formData.maintenance_status}
              onChange={(e) => handleChange("maintenance_status", e.target.value)}
              disabled={viewOnly}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Discontinued">Discontinued</option>
              <option value="Under Review">Under Review</option>
            </Select>
          </div>

          {/* Is Active Checkbox */}
          <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => !viewOnly && handleChange("is_active", checked)}
              disabled={viewOnly}
            />
            <label htmlFor="is_active" className={`text-sm font-medium ${viewOnly ? "cursor-default" : "cursor-pointer"}`}>
              Product is active and available for selection
            </label>
          </div>

          {/* Actions */}
          {viewOnly ? (
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Close
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
                    {product ? "Updating..." : "Creating..."}
                  </>
                ) : (
                  <>
                    <Icon name={product ? "Save" : "Plus"} size={16} />
                    {product ? "Update Product" : "Create Product"}
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

export default ProductModal;
