import React, { useState, useEffect, useMemo } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Input from "components/ui/Input";
import { adminService } from "../../../services/supabaseService";
import { useMaterialGroups } from "../../../hooks/useMaterialGroups";
import ProductModal from "./ProductModal";
import ProductUploadModal from "./ProductUploadModal";
import { useLanguage } from "../../../i18n";

const ProductMaster = () => {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── existing CRUD state (untouched) ──────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [viewingProduct, setViewingProduct] = useState(null);

  // ── filter state ─────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterSubGroup, setFilterSubGroup] = useState("");
  const [filterStatus, setFilterStatus] = useState(""); // '' | 'active' | 'inactive'
  const [filterUOM, setFilterUOM] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadProducts();
    // Reload when MaterialGroupSettings renames/deletes a group
    window.addEventListener("material-groups-updated", loadProducts);
    return () => window.removeEventListener("material-groups-updated", loadProducts);
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    const { data, error } = await adminService.getAllProducts();
    if (error) {
      console.error("Error loading products:", error);
      alert("Failed to load products: " + error.message);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  // ── existing CRUD handlers (untouched) ───────────────────────────────────────
  const handleView = (product) => setViewingProduct(product);

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setShowModal(true);
  };

  const handleDelete = async (productId) => {
    if (!confirm(t("adminProductMaster.deleteConfirm"))) return;
    const { error } = await adminService.deleteProduct(productId);
    if (error) {
      alert(t("adminProductMaster.deleteFailed") + ": " + error.message);
    } else {
      loadProducts();
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  const handleModalSuccess = () => {
    setShowModal(false);
    setEditingProduct(null);
    loadProducts();
  };

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    loadProducts();
  };

  // ── derived filter options ────────────────────────────────────────────────────
  const { groups: uniqueGroups } = useMaterialGroups();

  const uniqueSubGroups = useMemo(() => {
    return [
      ...new Set(
        products
          .filter((p) => !filterGroup || p.material_group === filterGroup)
          .map((p) => p.material_subgroup)
          .filter(Boolean)
      ),
    ].sort();
  }, [products, filterGroup]);

  const uniqueUOMs = useMemo(() => {
    return [
      ...new Set(
        products.map((p) => p.base_unit_of_measure).filter(Boolean)
      ),
    ].sort();
  }, [products]);

  // ── active filter count ───────────────────────────────────────────────────────
  const activeFilterCount = [
    filterGroup,
    filterSubGroup,
    filterStatus,
    filterUOM,
    priceMin,
    priceMax,
  ].filter(Boolean).length;

  // ── comprehensive filter logic ────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search — across all text fields
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchSearch =
          p.item_code?.toLowerCase().includes(term) ||
          p.material?.toLowerCase().includes(term) ||
          p.item_description?.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term) ||
          p.material_group?.toLowerCase().includes(term) ||
          p.material_subgroup?.toLowerCase().includes(term);
        if (!matchSearch) return false;
      }

      // Product Group filter
      if (filterGroup) {
        if (p.material_group !== filterGroup) return false;
      }

      // Sub Group filter
      if (filterSubGroup) {
        if (p.material_subgroup !== filterSubGroup) return false;
      }

      // Status filter
      if (filterStatus === "active" && !p.is_active) return false;
      if (filterStatus === "inactive" && p.is_active) return false;

      // UOM filter
      if (filterUOM && p.base_unit_of_measure !== filterUOM) return false;

      // Price range filter (uses unit_price as the reference price)
      const price = parseFloat(p.unit_price || 0);
      if (priceMin !== "" && price < parseFloat(priceMin)) return false;
      if (priceMax !== "" && price > parseFloat(priceMax)) return false;

      return true;
    });
  }, [
    products,
    searchTerm,
    filterGroup,
    filterSubGroup,
    filterStatus,
    filterUOM,
    priceMin,
    priceMax,
  ]);

  // ── filter helpers ────────────────────────────────────────────────────────────
  function clearAllFilters() {
    setSearchTerm("");
    setFilterGroup("");
    setFilterSubGroup("");
    setFilterStatus("");
    setFilterUOM("");
    setPriceMin("");
    setPriceMax("");
  }

  function handleGroupChange(value) {
    setFilterGroup(value);
    setFilterSubGroup("");
  }

  // ── loading state ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="Loader2" className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* ── Action bar: search + filter toggle + action buttons ──────────────── */}
      <div className="flex items-center gap-3 mb-3">
        {/* Search input */}
        <div className="flex-1 relative">
          <Icon
            name="Search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            placeholder={t("adminProductMaster.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters((f) => !f)}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
            showFilters || activeFilterCount > 0
              ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          <Icon name="SlidersHorizontal" size={15} />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Upload CSV & Add Product — untouched */}
        <Button onClick={() => setShowUploadModal(true)} variant="outline">
          <Icon name="Upload" size={16} />
          {t("adminProductMaster.uploadCSV")}
        </Button>
        <Button onClick={handleAdd}>
          <Icon name="Plus" size={16} />
          {t("adminProductMaster.addProduct")}
        </Button>
      </div>

      {/* ── Filter panel ─────────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="bg-muted/40 rounded-xl p-4 mb-4 border border-border">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {/* Product Group */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Product Group
              </label>
              <select
                value={filterGroup}
                onChange={(e) => handleGroupChange(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Groups</option>
                {uniqueGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Sub Group */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Sub Group
              </label>
              <select
                value={filterSubGroup}
                onChange={(e) => setFilterSubGroup(e.target.value)}
                disabled={!filterGroup && uniqueSubGroups.length === 0}
                className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">All Sub Groups</option>
                {uniqueSubGroups.map((sg) => (
                  <option key={sg} value={sg}>
                    {sg}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* UOM */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Unit of Measure
              </label>
              <select
                value={filterUOM}
                onChange={(e) => setFilterUOM(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All UOM</option>
                {uniqueUOMs.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            {/* Price Min */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Min Price (SAR)
              </label>
              <input
                type="number"
                min="0"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="0"
                className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Price Max */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Max Price (SAR)
              </label>
              <input
                type="number"
                min="0"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="No limit"
                className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Active filter pills + clear all */}
          {activeFilterCount > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <div className="flex flex-wrap gap-2">
                {filterGroup && (
                  <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 px-2 py-1 rounded-full">
                    Group: {filterGroup}
                    <button
                      onClick={() => handleGroupChange("")}
                      className="hover:text-blue-900 dark:hover:text-blue-100 font-bold leading-none"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filterSubGroup && (
                  <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 px-2 py-1 rounded-full">
                    Sub: {filterSubGroup}
                    <button
                      onClick={() => setFilterSubGroup("")}
                      className="hover:text-blue-900 dark:hover:text-blue-100 font-bold leading-none"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filterStatus && (
                  <span className="flex items-center gap-1 text-xs bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 px-2 py-1 rounded-full">
                    {filterStatus === "active" ? "Active only" : "Inactive only"}
                    <button
                      onClick={() => setFilterStatus("")}
                      className="hover:text-green-900 dark:hover:text-green-100 font-bold leading-none"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filterUOM && (
                  <span className="flex items-center gap-1 text-xs bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 px-2 py-1 rounded-full">
                    UOM: {filterUOM}
                    <button
                      onClick={() => setFilterUOM("")}
                      className="hover:text-purple-900 dark:hover:text-purple-100 font-bold leading-none"
                    >
                      ×
                    </button>
                  </span>
                )}
                {(priceMin || priceMax) && (
                  <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-1 rounded-full">
                    Price: {priceMin || "0"} – {priceMax || "∞"} SAR
                    <button
                      onClick={() => {
                        setPriceMin("");
                        setPriceMax("");
                      }}
                      className="hover:text-amber-900 dark:hover:text-amber-100 font-bold leading-none"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
              <button
                onClick={clearAllFilters}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 shrink-0 ml-4"
              >
                <Icon name="X" size={12} />
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Package" size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{products.length}</p>
              <p className="text-sm text-muted-foreground">
                {t("adminProductMaster.totalProducts")}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Icon name="CheckCircle" size={24} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {products.filter((p) => p.is_active).length}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("adminProductMaster.activeProducts")}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Icon name="Archive" size={24} className="text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {products.filter((p) => !p.is_active).length}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("adminProductMaster.inactiveProducts")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results count ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 text-sm text-muted-foreground">
        <span>
          Showing{" "}
          <strong className="text-foreground">{filteredProducts.length}</strong>{" "}
          of <strong>{products.length}</strong> products
          {activeFilterCount > 0 && (
            <span className="text-blue-600 dark:text-blue-400 ml-1">
              ({activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active)
            </span>
          )}
        </span>
        {filterGroup && (
          <span className="font-medium text-foreground">
            {filterGroup}
            {filterSubGroup ? ` › ${filterSubGroup}` : ""}
          </span>
        )}
      </div>

      {/* ── Products Table ────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  {t("adminProductMaster.material")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  {t("common.description")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  {t("adminProductMaster.materialGroup")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  {t("adminProductMaster.baseUOM")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  {t("adminProductMaster.pricePerTon")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  {t("adminProductMaster.pricePerPC")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  {t("adminProductMaster.pricePerMeter")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  {t("common.status")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-12 text-center">
                    {searchTerm || activeFilterCount > 0 ? (
                      <>
                        <Icon
                          name="PackageSearch"
                          size={40}
                          className="mx-auto text-muted-foreground mb-3"
                        />
                        <p className="text-sm font-medium text-muted-foreground">
                          No products match your filters
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Try adjusting or clearing your filters
                        </p>
                        <button
                          onClick={clearAllFilters}
                          className="mt-3 text-xs text-blue-600 hover:underline"
                        >
                          Clear all filters
                        </button>
                      </>
                    ) : (
                      <>
                        <Icon
                          name="Package"
                          size={48}
                          className="mx-auto text-muted-foreground mb-4"
                        />
                        <p className="text-muted-foreground">
                          {t("adminProductMaster.noProductsFound")}
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-accent">
                    <td className="px-4 py-3">
                      <div className="font-medium">{product.material}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                      {product.description || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {product.material_group || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {product.base_unit_of_measure || "N/A"}
                    </td>
                    {["price_per_ton", "price_per_pc", "price_per_meter"].map(
                      (field) => (
                        <td key={field} className="px-4 py-3 text-sm">
                          {product[field] ? (
                            Number(product[field]).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          product.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {product.is_active ? (
                          <>
                            <Icon name="CheckCircle" size={12} />
                            {t("common.active")}
                          </>
                        ) : (
                          <>
                            <Icon name="XCircle" size={12} />
                            {t("common.inactive")}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(product)}
                          title={t("adminProductMaster.viewProduct")}
                        >
                          <Icon name="Eye" size={16} className="text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(product)}
                          title={t("adminProductMaster.editProduct")}
                        >
                          <Icon
                            name="Pencil"
                            size={16}
                            className="text-amber-500"
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product.id)}
                          title={t("adminProductMaster.deleteProduct")}
                        >
                          <Icon name="Trash2" size={16} className="text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals (untouched) ────────────────────────────────────────────────── */}
      {viewingProduct && (
        <ProductModal
          product={viewingProduct}
          onClose={() => setViewingProduct(null)}
          onSuccess={() => setViewingProduct(null)}
          viewOnly
        />
      )}

      {showModal && (
        <ProductModal
          product={editingProduct}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {showUploadModal && (
        <ProductUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
};

export default ProductMaster;
