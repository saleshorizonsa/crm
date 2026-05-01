import React, { useEffect, useMemo, useState } from "react";
import Icon from "./AppIcon";
import Input from "./ui/Input";
import { productService } from "../services/supabaseService";
import { calculateProductTargetValue } from "../utils/productTargetUtils";

const ProductTargetSelector = ({
  active,
  productTargets,
  setProductTargets,
  formatCurrency,
  accentClass = "text-blue-600",
  selectedBgClass = "bg-blue-50 dark:bg-blue-950",
}) => {
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    const loadProducts = async () => {
      if (!active) return;

      setLoadingProducts(true);
      try {
        const { data, error } = await productService.getProducts();
        if (error) throw error;

        setProducts(data || []);
        setProductTargets((prev) => {
          const previousByProduct = new Map(
            (prev || []).map((target) => [target.product_id, target]),
          );

          return (data || []).map((product) => {
            const previous = previousByProduct.get(product.id);
            return {
              product_id: product.id,
              product,
              enabled: previous?.enabled || false,
              target_quantity: previous?.target_quantity || "",
              unit_price:
                previous?.unit_price ??
                (product.unit_price ? product.unit_price.toString() : ""),
              target_value: previous?.target_value || "",
              target_value_touched: previous?.target_value_touched || false,
            };
          });
        });
      } catch (error) {
        console.error("Error loading products for targets:", error);
      } finally {
        setLoadingProducts(false);
      }
    };

    loadProducts();
  }, [active, setProductTargets]);

  const groupedTargets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (productTargets || [])
      .filter((target) => {
        if (!term) return true;
        const product = target.product || {};
        return (
          product.material?.toLowerCase().includes(term) ||
          product.description?.toLowerCase().includes(term) ||
          product.material_group?.toLowerCase().includes(term)
        );
      })
      .reduce((groups, target) => {
      const groupName = target.product?.material_group || "Ungrouped";
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(target);
      return groups;
    }, {});
  }, [productTargets, searchTerm]);

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      Object.keys(groupedTargets).forEach((group) => {
        if (!(group in next)) next[group] = true;
      });
      return next;
    });
  }, [groupedTargets]);

  const toggleGroup = (group) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  const handleChange = (productId, field, value) => {
    setProductTargets((prev) =>
      (prev || []).map((target) => {
        if (target.product_id !== productId) return target;

        const updated = { ...target, [field]: value };

        if (field === "target_value") {
          updated.target_value_touched = true;
        }

        if (
          field === "target_quantity" &&
          !updated.target_value_touched
        ) {
          const quantity = parseFloat(value);
          const unitPrice = parseFloat(updated.unit_price);

          updated.target_value =
            quantity > 0 && unitPrice > 0 ? (quantity * unitPrice).toFixed(2) : "";
        }

        return updated;
      }),
    );
  };

  const selectedCount = (productTargets || []).filter((target) => target.enabled)
    .length;
  const totalValue = calculateProductTargetValue(productTargets);

  if (!active) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-card-foreground">
          Product Targets
        </label>
        <span className="text-xs text-muted-foreground">
          {products.length} products available
        </span>
      </div>

      <div className="relative">
        <Icon
          name="Search"
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search products or material groups..."
          className="pl-9"
        />
      </div>

      {loadingProducts ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-8 bg-muted/50 rounded-lg border border-dashed border-border">
          <Icon
            name="Package"
            size={32}
            className="mx-auto text-muted-foreground mb-2"
          />
          <p className="text-sm text-muted-foreground">No products found.</p>
        </div>
      ) : Object.keys(groupedTargets).length === 0 ? (
        <div className="text-center py-8 bg-muted/50 rounded-lg border border-dashed border-border">
          <Icon
            name="Search"
            size={32}
            className="mx-auto text-muted-foreground mb-2"
          />
          <p className="text-sm text-muted-foreground">
            No products match your search.
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto border border-border rounded-lg p-3">
          {Object.entries(groupedTargets).map(([group, targets]) => (
            <div key={group} className="space-y-2">
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/60"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    name={expandedGroups[group] ? "ChevronDown" : "ChevronRight"}
                    size={16}
                    className="text-muted-foreground"
                  />
                  <Icon name="Layers" size={16} className={accentClass} />
                  <h4 className="text-sm font-semibold text-card-foreground">
                    {group}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    ({targets.length})
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {targets.filter((target) => target.enabled).length} selected
                </span>
              </button>

              {expandedGroups[group] && (
              <div className="space-y-2">
                {targets.map((target) => (
                  <div
                    key={target.product_id}
                    className={`grid grid-cols-12 gap-3 p-3 rounded-lg border border-border ${
                      target.enabled ? selectedBgClass : "bg-background"
                    }`}
                  >
                    <div className="col-span-12 md:col-span-4 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={target.enabled}
                        onChange={(e) =>
                          handleChange(target.product_id, "enabled", e.target.checked)
                        }
                        className="mt-1 w-4 h-4 rounded border-border"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-card-foreground truncate">
                          {target.product?.material}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {target.product?.description || "No description"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          UOM: {target.product?.base_unit_of_measure || "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="col-span-4 md:col-span-2">
                      <Input
                        type="number"
                        value={target.target_quantity}
                        onChange={(e) =>
                          handleChange(
                            target.product_id,
                            "target_quantity",
                            e.target.value,
                          )
                        }
                        placeholder="Qty"
                        step="0.01"
                        min="0"
                        disabled={!target.enabled}
                        className="text-sm"
                      />
                    </div>

                    <div className="col-span-4 md:col-span-3">
                      <div className="px-3 py-2 border border-input rounded-md bg-muted/50 text-sm text-card-foreground min-h-10">
                        {parseFloat(target.unit_price || 0) > 0 ? (
                          <>
                            <span className="text-xs text-muted-foreground block">
                              Unit Price
                            </span>
                            {Number(target.unit_price).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            No master price
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="col-span-4 md:col-span-3">
                      <Input
                        type="number"
                        value={target.target_value}
                        onChange={(e) =>
                          handleChange(target.product_id, "target_value", e.target.value)
                        }
                        placeholder="Target value"
                        step="0.01"
                        min="0"
                        disabled={!target.enabled}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium text-card-foreground">
            Selected Products: {selectedCount}
          </span>
          <span className={`text-lg font-bold ${accentClass}`}>
            {formatCurrency ? formatCurrency(totalValue) : totalValue.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProductTargetSelector;
