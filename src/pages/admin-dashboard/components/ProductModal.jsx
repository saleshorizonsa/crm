import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Input from "components/ui/Input";
import Select from "components/ui/Select";
import { Checkbox } from "components/ui/Checkbox";
import { adminService } from "../../../services/supabaseService";

const ProductModal = ({ product, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    material: "",
    description: "",
    material_group: "",
    base_unit_of_measure: "EA",
    unit_price: "",
    price_per_ton: "",
    price_per_pc: "",
    price_per_meter: "",
    maintenance_status: "Active",
    is_active: true,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData({
        material: product.material || "",
        description: product.description || "",
        material_group: product.material_group || "",
        base_unit_of_measure: product.base_unit_of_measure || "EA",
        unit_price: product.unit_price?.toString() || "",
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
        price_per_ton: parsePrice(formData.price_per_ton),
        price_per_pc: parsePrice(formData.price_per_pc),
        price_per_meter: parsePrice(formData.price_per_meter),
      };

      const { data, error } = product
        ? await adminService.updateProduct(product.id, payload)
        : await adminService.createProduct(payload);

      if (error) {
        alert(
          `Failed to ${product ? "update" : "create"} product: ` + error.message
        );
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
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon name="Package" className="text-primary" size={20} />
            <h2 className="text-lg font-semibold">
              {product ? "Edit Product" : "Add New Product"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Material Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Material Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g., Steel Rod 12mm"
              value={formData.material}
              onChange={(e) => handleChange("material", e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              placeholder="Product description..."
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />
          </div>

          {/* Material Group and Base UOM */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Material Group
              </label>
              <Input
                type="text"
                placeholder="e.g., Raw Materials"
                value={formData.material_group}
                onChange={(e) => handleChange("material_group", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Base Unit of Measure
              </label>
              <Select
                value={formData.base_unit_of_measure}
                onChange={(e) =>
                  handleChange("base_unit_of_measure", e.target.value)
                }
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
                />
              </div>
            </div>
          </div>

          {/* Unit Price (legacy default) and Maintenance Status */}
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
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Maintenance Status
              </label>
              <Select
                value={formData.maintenance_status}
                onChange={(e) =>
                  handleChange("maintenance_status", e.target.value)
                }
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Discontinued">Discontinued</option>
                <option value="Under Review">Under Review</option>
              </Select>
            </div>
          </div>

          {/* Is Active Checkbox */}
          <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => handleChange("is_active", checked)}
            />
            <label
              htmlFor="is_active"
              className="text-sm font-medium cursor-pointer"
            >
              Product is active and available for selection
            </label>
          </div>

          {/* Actions */}
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
        </form>
      </div>
    </div>
  );
};

export default ProductModal;
