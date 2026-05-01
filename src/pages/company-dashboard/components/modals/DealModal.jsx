import React, { useState, useEffect } from "react";
import { useAuth } from "../../../../contexts/AuthContext";
import { useCurrency } from "../../../../contexts/CurrencyContext";
import { supabase } from "../../../../lib/supabase";
import {
  productService,
  dealProductService,
} from "../../../../services/supabaseService";
import Button from "../../../../components/ui/Button";
import Input from "../../../../components/ui/Input";
import Select from "../../../../components/ui/Select";
import Icon from "../../../../components/AppIcon";

const DealModal = ({ isOpen, onClose, onSubmit }) => {
  const { company, user } = useAuth();
  const { preferredCurrency } = useCurrency();
  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    stage: "lead",
    expected_close_date: "",
    description: "",
    contact_id: "",
  });

  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Product state
  const [allProducts, setAllProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]); // Local products list
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [sqm, setSqm] = useState("");
  const [ton, setTon] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, first_name, last_name, company_id")
          .eq("company_id", company?.id);

        if (error) throw error;
        setContacts(data || []);
      } catch (error) {
        console.error("Error loading contacts:", error);
      } finally {
        setIsLoading(false);
      }
    };

    const loadProducts = async () => {
      try {
        const { data, error } = await productService.getProducts();
        if (error) throw error;
        setAllProducts(data || []);
        setFilteredProducts(data || []);
      } catch (error) {
        console.error("Error loading products:", error);
      }
    };

    if (company?.id) {
      loadContacts();
      loadProducts();
    }
  }, [company?.id]);

  // Filter products based on search
  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = allProducts.filter(
        (product) =>
          product.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(allProducts);
    }
  }, [searchTerm, allProducts]);

  const stages = [
    { value: "lead", label: "Lead" },
    { value: "contact_made", label: "Contact Made" },
    { value: "proposal_sent", label: "Proposal Sent" },
    { value: "negotiation", label: "Negotiation" },
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
  ];

  const handleChange = (eOrValue, maybeName) => {
    if (eOrValue?.target) {
      const { name, value } = eOrValue.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    } else if (maybeName) {
      setFormData((prev) => ({ ...prev, [maybeName]: eOrValue }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const dealData = {
        ...formData,
        company_id: company?.id,
        owner_id: user?.id,
        stage: formData.stage || "lead",
        amount: parseFloat(formData.amount) || 0,
        currency: preferredCurrency, // Use global currency
      };

      const result = await onSubmit(dealData);

      // If deal was created successfully and has products, add them
      if (result?.id && selectedProducts.length > 0) {
        for (const product of selectedProducts) {
          await dealProductService.addProductToDeal(
            result.id,
            product.productId,
            product.quantity,
            product.sqm,
            product.ton
          );
        }
      }

      // Reset and close
      setFormData({
        title: "",
        amount: "",
        stage: "lead",
        expected_close_date: "",
        description: "",
        contact_id: "",
      });
      setSelectedProducts([]);
      onClose();
    } catch (error) {
      console.error("Error creating deal:", error);
    }
  };

  const handleAddProductToList = () => {
    if (!selectedProductId) {
      alert("Please select a product");
      return;
    }

    const product = allProducts.find((p) => p.id === selectedProductId);
    if (!product) return;

    const newProduct = {
      productId: selectedProductId,
      product: product,
      quantity: parseFloat(quantity) || 1,
      sqm: sqm ? parseFloat(sqm) : null,
      ton: ton ? parseFloat(ton) : null,
    };

    setSelectedProducts([...selectedProducts, newProduct]);

    // Reset form
    setSelectedProductId("");
    setQuantity(1);
    setSqm("");
    setTon("");
    setSearchTerm("");
    setShowDropdown(false);
  };

  const handleRemoveProductFromList = (index) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in-50">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-muted/30">
          <h2 className="text-lg font-semibold text-foreground">
            Create New Deal
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="px-6 py-6 space-y-6 max-h-[calc(90vh-150px)] overflow-y-auto"
        >
          {/* Deal Title & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Deal Title
              </label>
              <Input
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g. Website Redesign"
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Deal Value ({preferredCurrency})
              </label>
              <Input
                name="amount"
                type="number"
                value={formData.amount}
                onChange={handleChange}
                placeholder="e.g. 5000"
                required
                className="mt-1"
              />
            </div>
          </div>

          {/* Contact & Stage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Contact
              </label>
              <Select
                name="contact_id"
                value={formData.contact_id}
                onChange={(value) => handleChange(value, "contact_id")}
                options={contacts.map((c) => ({
                  value: c.id,
                  label: `${c.first_name} ${c.last_name}`,
                }))}
                placeholder={
                  isLoading ? "Loading contacts..." : "Select contact"
                }
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Stage
              </label>
              <Select
                name="stage"
                value={formData.stage}
                onChange={(value) => handleChange(value, "stage")}
                options={stages}
                required
                className="mt-1"
              />
            </div>
          </div>

          {/* Expected Close Date */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Expected Close Date
            </label>
            <Input
              name="expected_close_date"
              type="date"
              value={formData.expected_close_date}
              onChange={handleChange}
              className="mt-1"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="mt-1 w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-transparent placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Add any deal details or notes..."
            />
          </div>

          {/* Products Section */}
          <div className="border-t border-border pt-6">
            <div className="bg-muted/30 p-4 rounded-lg space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Icon name="Package" size={16} />
                Add Products (Optional)
              </h3>

              {/* Search */}
              <div className="relative">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Select Product
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Search products by material or description..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedProductId("");
                        setShowDropdown(false);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Icon name="X" size={16} />
                    </button>
                  )}

                  {/* Dropdown */}
                  {showDropdown && filteredProducts.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {filteredProducts.slice(0, 10).map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setSearchTerm(product.material);
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 flex flex-col border-b border-border last:border-0"
                        >
                          <span className="font-medium text-sm">
                            {product.material}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {product.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quantity, SQM, TON */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Quantity
                  </label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    SQM (Square Metres)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={sqm}
                    onChange={(e) => setSqm(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    TON (Tonnage)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={ton}
                    onChange={(e) => setTon(e.target.value)}
                  />
                </div>
              </div>

              {/* Add Button */}
              <Button
                type="button"
                onClick={handleAddProductToList}
                disabled={!selectedProductId}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Icon name="Plus" size={16} className="mr-2" />
                Add Product to List
              </Button>
            </div>

            {/* Products List */}
            {selectedProducts.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-semibold">
                  Products to Add ({selectedProducts.length})
                </h4>
                <div className="space-y-2">
                  {selectedProducts.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-card border border-border rounded-md p-3 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Icon
                            name="Package"
                            size={14}
                            className="text-primary"
                          />
                          <span className="font-medium text-sm">
                            {item.product?.material}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.product?.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 ml-4">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Qty</p>
                          <p className="font-semibold text-sm">
                            {item.quantity.toFixed(0)}
                          </p>
                        </div>
                        {item.sqm && parseFloat(item.sqm) > 0 && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">SQM</p>
                            <p className="font-semibold text-sm">
                              {parseFloat(item.sqm).toFixed(2)}
                            </p>
                          </div>
                        )}
                        {item.ton && parseFloat(item.ton) > 0 && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">TON</p>
                            <p className="font-semibold text-sm">
                              {parseFloat(item.ton).toFixed(2)}
                            </p>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveProductFromList(idx)}
                          className="text-destructive hover:text-destructive/80"
                          title="Remove product"
                        >
                          <Icon name="Trash2" size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-primary/10 border border-primary/20 rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Total Products: {selectedProducts.length}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border sticky bottom-0 bg-card">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              className="min-w-[100px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="min-w-[120px] bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Create Deal{" "}
              {selectedProducts.length > 0 &&
                `(${selectedProducts.length} products)`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DealModal;
