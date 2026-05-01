import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Input from "components/ui/Input";
import { adminService } from "../../../services/supabaseService";
import ProductModal from "./ProductModal";
import ProductUploadModal from "./ProductUploadModal";

const ProductMaster = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [searchTerm, products]);

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

  const filterProducts = () => {
    if (!searchTerm.trim()) {
      setFilteredProducts(products);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = products.filter(
      (product) =>
        product.material?.toLowerCase().includes(term) ||
        product.description?.toLowerCase().includes(term) ||
        product.material_group?.toLowerCase().includes(term)
    );
    setFilteredProducts(filtered);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setShowModal(true);
  };

  const handleDelete = async (productId) => {
    if (!confirm("Are you sure you want to delete this product?")) return;

    const { error } = await adminService.deleteProduct(productId);
    if (error) {
      alert("Failed to delete product: " + error.message);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="Loader2" className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Icon
              name="Search"
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              placeholder="Search products by material, description, or group..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => setShowUploadModal(true)} variant="outline">
            <Icon name="Upload" size={16} />
            Upload CSV
          </Button>
          <Button onClick={handleAdd}>
            <Icon name="Plus" size={16} />
            Add Product
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Package" size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{products.length}</p>
              <p className="text-sm text-muted-foreground">Total Products</p>
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
              <p className="text-sm text-muted-foreground">Active Products</p>
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
              <p className="text-sm text-muted-foreground">Inactive Products</p>
            </div>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Material
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Description
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Material Group
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Base UOM
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Unit Price
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center">
                    <Icon
                      name="Package"
                      size={48}
                      className="mx-auto text-muted-foreground mb-4"
                    />
                    <p className="text-muted-foreground">
                      {searchTerm ? "No products found" : "No products yet"}
                    </p>
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
                    <td className="px-4 py-3 text-sm">
                      {product.unit_price
                        ? Number(product.unit_price).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "N/A"}
                    </td>
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
                            Active
                          </>
                        ) : (
                          <>
                            <Icon name="XCircle" size={12} />
                            Inactive
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(product)}
                          title="Edit Product"
                        >
                          <Icon name="Edit" size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product.id)}
                          title="Delete Product"
                        >
                          <Icon
                            name="Trash2"
                            size={16}
                            className="text-red-500"
                          />
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

      {/* Product Modal */}
      {showModal && (
        <ProductModal
          product={editingProduct}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Upload Modal */}
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
