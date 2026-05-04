import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useAuth } from "../../../contexts/AuthContext";
import {
  currencyService,
  productService,
  dealProductService,
  dealService,
  uomService,
  salesTargetService,
} from "../../../services/supabaseService";

const DealModal = ({
  deal,
  isOpen,
  onClose,
  onSave,
  onDelete,
  contacts = [],
  users = [],
}) => {
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { user, userProfile, company } = useAuth();
  const [formData, setFormData] = useState({
    title: deal?.title || "",
    description: deal?.description || "",
    amount: deal?.amount || 0,
    stage: deal?.stage || "lead",
    expected_close_date: deal?.expected_close_date || "",
    contact_id: deal?.contact_id || null,
    priority: deal?.priority || "medium",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errors, setErrors] = useState({});
  const [dealType, setDealType] = useState("value"); // "value" | "product"
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReferences, setDeleteReferences] = useState(null);
  const [dealProducts, setDealProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]); // For new deals

  // Product selection state
  const [allProducts, setAllProducts] = useState([]);
  const [productGroups, setProductGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [uomType, setUomType] = useState("qty"); // qty, sqm, or ton
  const [uomValue, setUomValue] = useState("");
  const [unitRate, setUnitRate] = useState("");
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [uomTypeOptions, setUomTypeOptions] = useState([]);

  // Load UOM types on mount
  useEffect(() => {
    const loadUomTypes = async () => {
      const { data, error } = await uomService.getUomTypes(true); // Only active
      if (!error && data) {
        setUomTypeOptions(
          data.map((uom) => ({ value: uom.value, label: uom.label })),
        );
        // Set default UOM type if available
        if (data.length > 0 && !uomType) {
          setUomType(data[0].value);
        }
      }
    };
    loadUomTypes();
  }, []);

  // Initialize form data when deal changes or modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset delete state
      setShowDeleteConfirm(false);
      setDeleteReferences(null);
      setErrors({});
      // Auto-detect deal type: if existing deal has products default to product mode
      setDealType(
        deal?.deal_products?.length > 0 ? "product" : "value"
      );
      console.log("🔄 Modal opened with deal:", deal);
      setFormData({
        title: deal?.title || "",
        description: deal?.description || "",
        amount: deal?.amount || 0,
        stage: deal?.stage || "lead",
        expected_close_date: deal?.expected_close_date || "",
        contact_id: deal?.contact_id || null,
        priority: deal?.priority || "medium",
      });

      // Load products for the catalog
      loadProducts();

      // Load deal products if editing existing deal
      if (deal?.id) {
        console.log("🔍 Deal has ID:", deal.id);
        console.log("🔍 Deal object:", deal);
        console.log("🔍 Deal products from deal object:", deal.deal_products);

        // Use deal_products from the deal object if available, otherwise fetch them
        if (deal.deal_products && Array.isArray(deal.deal_products)) {
          console.log(
            "✅ Using deal_products from deal object:",
            deal.deal_products.length,
            "products",
          );
          setDealProducts(deal.deal_products);
        } else {
          console.log("⚠️ No deal_products in deal object, fetching...");
          loadDealProducts();
        }
      } else {
        console.log("🆕 New deal - no ID");
        setDealProducts([]);
        setSelectedProducts([]);
        resetProductForm();
      }
    }
  }, [isOpen, deal]);

  // Filter products based on selected group
  useEffect(() => {
    if (selectedGroup) {
      const filtered = allProducts.filter(
        (product) => product.material_group === selectedGroup,
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts([]);
    }
    // Reset product selection when group changes
    setSelectedProductId("");
  }, [selectedGroup, allProducts]);

  const loadProducts = async () => {
    try {
      const { data, error } = await productService.getProducts();
      if (error) throw error;
      setAllProducts(data || []);

      // Extract unique product groups
      const groups = [
        ...new Set(data?.map((p) => p.material_group).filter(Boolean)),
      ];
      setProductGroups(groups.sort());
    } catch (error) {
      console.error("Error loading products:", error);
    }
  };

  const loadDealProducts = async () => {
    if (!deal?.id) return;
    try {
      console.log("📥 Loading deal products for deal:", deal.id);
      const { data, error } = await dealProductService.getDealProducts(deal.id);
      if (error) throw error;
      console.log("📥 Loaded deal products:", data);
      setDealProducts(data || []);
    } catch (error) {
      console.error("❌ Error loading deal products:", error);
    }
  };

  const handleAddProduct = async () => {
    if (!selectedProductId) {
      alert("Please select a product");
      return;
    }

    if (!uomValue || parseFloat(uomValue) <= 0) {
      alert("Please enter a valid UOM value");
      return;
    }

    if (!unitRate || parseFloat(unitRate) <= 0) {
      alert("Please enter a valid unit rate");
      return;
    }

    const uomVal = parseFloat(uomValue);
    const rate = parseFloat(unitRate);
    const lineTotal = uomVal * rate;

    // If editing existing deal, add to database
    if (deal?.id) {
      // Check if product already exists in this deal
      const existingProduct = dealProducts.find(
        (dp) => dp.product_id === selectedProductId,
      );
      if (existingProduct) {
        alert(
          "This product is already added to the deal. Please edit or remove the existing entry first.",
        );
        return;
      }

      setIsLoadingProducts(true);
      try {
        console.log("🔵 Adding product to existing deal:", {
          dealId: deal.id,
          productId: selectedProductId,
          uomType,
          uomValue: uomVal,
          unitRate: rate,
          lineTotal,
        });

        const { data, error } = await dealProductService.addProductToDeal(
          deal.id,
          selectedProductId,
          uomVal, // quantity = uom_value (so line_total calculates correctly as quantity * unit_price)
          uomType === "sqm" ? uomVal : null, // sqm (for backwards compatibility)
          uomType === "ton" ? uomVal : null, // ton (for backwards compatibility)
          rate, // unitPrice
          null, // notes
          uomType, // uomType
          uomVal, // uomValue
        );

        console.log("🔵 Product add result:", { data, error });

        if (error) throw error;

        // Update deal amount
        const newAmount = parseFloat(formData.amount || 0) + lineTotal;
        setFormData((prev) => ({ ...prev, amount: newAmount }));

        // Clear products error once at least one product is added
        if (errors.products) setErrors((prev) => ({ ...prev, products: "" }));

        // Refresh deal products
        await loadDealProducts();

        // Reset form
        resetProductForm();
      } catch (error) {
        console.error("❌ Error adding product to deal:", error);
        alert("Failed to add product: " + (error.message || error));
      } finally {
        setIsLoadingProducts(false);
      }
    } else {
      // If creating new deal, add to local array
      // Check if product already exists in selectedProducts
      const existingProduct = selectedProducts.find(
        (sp) => sp.productId === selectedProductId,
      );
      if (existingProduct) {
        alert(
          "This product is already added to the deal. Please edit or remove the existing entry first.",
        );
        return;
      }

      console.log("🟢 Adding product to new deal (local state):", {
        productId: selectedProductId,
        uomType,
        uomValue: uomVal,
        unitRate: rate,
        lineTotal,
      });

      const product = allProducts.find((p) => p.id === selectedProductId);
      if (!product) {
        console.error("❌ Product not found in allProducts");
        return;
      }

      const newProduct = {
        product,
        productId: selectedProductId,
        quantity: uomVal, // Set quantity = uom_value so line_total calculates correctly
        sqm: uomType === "sqm" ? uomVal : null,
        ton: uomType === "ton" ? uomVal : null,
        unit_price: rate,
        line_total: lineTotal, // Add the calculated line total
        uom_type: uomType,
        uom_value: uomVal,
      };

      console.log("🟢 New product object:", newProduct);
      setSelectedProducts([...selectedProducts, newProduct]);

      // Update deal amount
      const newAmount = parseFloat(formData.amount || 0) + lineTotal;
      setFormData((prev) => ({ ...prev, amount: newAmount }));

      // Clear products error once at least one product is added
      if (errors.products) setErrors((prev) => ({ ...prev, products: "" }));

      // Reset form
      resetProductForm();
    }
  };

  const resetProductForm = () => {
    setSelectedGroup("");
    setSelectedProductId("");
    setUomType("qty");
    setUomValue("");
    setUnitRate("");
    setFilteredProducts([]);
  };

  const handleRemoveProduct = async (indexOrId, lineTotal) => {
    // If editing existing deal, remove from database
    if (deal?.id) {
      if (!confirm("Remove this product from the deal?")) return;

      setIsLoadingProducts(true);
      try {
        const { error } =
          await dealProductService.removeProductFromDeal(indexOrId);
        if (error) throw error;

        // Update deal amount
        const newAmount =
          parseFloat(formData.amount || 0) - parseFloat(lineTotal || 0);
        setFormData((prev) => ({ ...prev, amount: Math.max(0, newAmount) }));

        await loadDealProducts();
      } catch (error) {
        console.error("Error removing product:", error);
        alert("Failed to remove product");
      } finally {
        setIsLoadingProducts(false);
      }
    } else {
      // If creating new deal, remove from local array
      const productToRemove = selectedProducts[indexOrId];
      const newAmount =
        parseFloat(formData.amount || 0) -
        parseFloat(productToRemove.line_total || 0);
      setFormData((prev) => ({ ...prev, amount: Math.max(0, newAmount) }));

      setSelectedProducts(selectedProducts.filter((_, i) => i !== indexOrId));
    }
  };

  const stages = [
    { value: "lead", label: "Lead" },
    { value: "contact_made", label: "Qualified" },
    { value: "proposal_sent", label: "Proposal" },
    { value: "negotiation", label: "Negotiation" },
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
  ];

  const priorities = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ];

  // Convert contacts to dropdown options
  const contactOptions = contacts.map((contact) => ({
    value: contact.id,
    label: `${contact.first_name} ${contact.last_name} - ${
      contact.company_name || "No Company"
    }`,
  }));

  // Convert users to dropdown options
  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.full_name || user.email,
  }));

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const newErrors = {};
    if (!formData.title?.trim()) {
      newErrors.title = "Deal title is required";
    }
    if (dealType === "product") {
      // Product mode: client + at least one product are required
      if (!formData.contact_id) {
        newErrors.contact_id = "Client is required for product-based deals";
      }
      const productsToCheck = deal?.id ? dealProducts : selectedProducts;
      if (productsToCheck.length === 0) {
        newErrors.products = "Please add at least one product";
      }
    } else {
      // Value mode: client and value are mutually required
      const hasAmount = parseFloat(formData.amount) > 0;
      const hasContact = !!formData.contact_id;
      if (hasAmount && !hasContact) {
        newErrors.contact_id = "Please select a client when entering a deal value";
      }
      if (hasContact && !hasAmount) {
        newErrors.amount = "Please enter a deal value when a client is selected";
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setIsSaving(true);

    try {
      const dealData = {
        ...formData,
        ...(deal?.id && { id: deal.id }),
        amount: parseFloat(formData.amount) || 0,
        owner_id: user?.id,
        currency: preferredCurrency,
        contact_id: formData.contact_id || null,
      };

      const savedDeal = await onSave(dealData);

      console.log("Saved deal:", savedDeal);

      // Add products for new deals
      if (!deal?.id && selectedProducts.length > 0 && savedDeal?.id) {
        for (const product of selectedProducts) {
          const result = await dealProductService.addProductToDeal(
            savedDeal.id,
            product.productId,
            product.uom_value || product.quantity || 0,
            product.sqm || null,
            product.ton || null,
            product.unit_price || null,
            null,
            product.uom_type || null,
            product.uom_value || null,
          );
          if (result.error) {
            console.error("Failed to add product:", result.error);
            throw result.error;
          }
        }
      }

      // Update sales target progress when deal stage becomes "won"
      const isNewWin = dealData.stage === "won" && (!deal || deal.stage !== "won");
      if (isNewWin && savedDeal) {
        try {
          const targetUserId = savedDeal.owner_id || user?.id;
          const companyId = savedDeal.company_id || company?.id;
          const { data: targets } = await salesTargetService.getMyTargets(companyId, targetUserId);
          const closeDate = savedDeal.expected_close_date
            ? new Date(savedDeal.expected_close_date)
            : new Date();
          const activeTargets = (targets || []).filter((t) => {
            if (t.status !== "active") return false;
            const start = new Date(t.period_start);
            const end = new Date(t.period_end);
            return closeDate >= start && closeDate <= end;
          });
          for (const target of activeTargets) {
            const newProgress = parseFloat(target.progress_amount || 0) + parseFloat(savedDeal.amount || 0);
            await salesTargetService.updateTarget(target.id, {
              targetAmount: target.target_amount,
              currency: target.currency,
              periodStart: target.period_start,
              periodEnd: target.period_end,
              targetType: target.target_type,
              status: target.status,
              progressAmount: newProgress,
              notes: target.notes,
            });
            console.log(`Sales target ${target.id}: progress updated to ${newProgress}`);
          }
        } catch (targetErr) {
          console.error("Failed to update sales target (non-fatal):", targetErr);
        }
      }

      onClose();
    } catch (error) {
      console.error("Error saving deal:", error);
      alert("Failed to save deal: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete button click - check for references first
  const handleDeleteClick = async () => {
    if (!deal?.id) return;

    try {
      const { data, error } = await dealService.checkDealReferences(deal.id);
      if (error) throw error;

      setDeleteReferences(data);
      setShowDeleteConfirm(true);
    } catch (error) {
      console.error("Error checking deal references:", error);
      alert("Failed to check deal references: " + error.message);
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!deal?.id) return;

    setIsDeleting(true);
    try {
      // Use cascade delete if there are references
      const { error } =
        deleteReferences?.totalReferences > 0
          ? await dealService.deleteDealWithCascade(deal.id)
          : await dealService.deleteDeal(deal.id);

      if (error) throw error;

      // Call onDelete callback if provided
      if (onDelete) {
        onDelete(deal.id);
      }

      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error("Error deleting deal:", error);
      alert("Failed to delete deal: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-300 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg shadow-enterprise-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Briefcase" size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-card-foreground">
                {deal ? "Edit Deal" : "New Deal"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {!deal && "Create a new sales opportunity"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {deal && (
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-lg font-bold text-card-foreground">
                    {formatCurrency(formData?.amount, preferredCurrency)}
                  </p>
                </div>
                {dealProducts.length > 0 && (
                  <div className="border-l border-border pl-4">
                    <div className="flex items-center space-x-2 px-3 py-1 bg-blue-50 rounded-full">
                      <Icon
                        name="Package"
                        size={16}
                        className="text-blue-600"
                      />
                      <span className="text-sm font-medium text-blue-700">
                        {dealProducts.length}{" "}
                        {dealProducts.length === 1 ? "product" : "products"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <Icon name="X" size={20} />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <Input
                label="Deal Title"
                type="text"
                placeholder="Enter deal title"
                value={formData?.title}
                onChange={(e) => {
                  handleInputChange("title", e?.target?.value);
                  if (errors.title) setErrors((prev) => ({ ...prev, title: "" }));
                }}
                required
              />
              {errors.title && (
                <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                  <Icon name="AlertCircle" size={12} />
                  {errors.title}
                </p>
              )}
            </div>

            {/* Deal Type Toggle */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Deal Type</p>
              <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => {
                    setDealType("value");
                    setErrors({});
                  }}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    dealType === "value"
                      ? "bg-card shadow-sm text-card-foreground"
                      : "text-muted-foreground hover:text-card-foreground"
                  }`}
                >
                  <Icon name="DollarSign" size={14} />
                  By Value
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDealType("product");
                    setErrors({});
                  }}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    dealType === "product"
                      ? "bg-card shadow-sm text-card-foreground"
                      : "text-muted-foreground hover:text-card-foreground"
                  }`}
                >
                  <Icon name="Package" size={14} />
                  By Product
                </button>
              </div>
            </div>

            {/* Contact */}
            <div>
              <Select
                label={
                  <span>
                    Client
                    {dealType === "product" && (
                      <span className="text-destructive ml-0.5">*</span>
                    )}
                    {dealType === "value" && formData?.contact_id && (
                      <span className="ml-1 text-xs text-muted-foreground font-normal">(required with value)</span>
                    )}
                  </span>
                }
                options={[
                  { value: "", label: "Select a client..." },
                  ...contactOptions,
                ]}
                value={formData?.contact_id || ""}
                onChange={(value) => {
                  handleInputChange("contact_id", value);
                  if (errors.contact_id) setErrors((prev) => ({ ...prev, contact_id: "" }));
                }}
              />
              {errors.contact_id && (
                <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                  <Icon name="AlertCircle" size={12} />
                  {errors.contact_id}
                </p>
              )}
            </div>

            {/* Amount — hidden in product mode (auto-calculated) */}
            {dealType === "value" ? (
              <div>
                <Input
                  label={
                    <span>
                      Deal Value ({preferredCurrency})
                      {parseFloat(formData?.amount) > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground font-normal">(required with client)</span>
                      )}
                    </span>
                  }
                  type="number"
                  placeholder="0"
                  value={formData?.amount}
                  onChange={(e) => {
                    handleInputChange("amount", parseFloat(e?.target?.value) || 0);
                    if (errors.amount) setErrors((prev) => ({ ...prev, amount: "" }));
                  }}
                  required
                />
                {errors.amount && (
                  <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                    <Icon name="AlertCircle" size={12} />
                    {errors.amount}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Icon name="Calculator" size={14} />
                  Deal Value (auto-calculated)
                </span>
                <span className="text-lg font-bold text-card-foreground">
                  {formatCurrency(formData?.amount || 0, preferredCurrency)}
                </span>
              </div>
            )}

            {/* Stage, Priority, Close Date */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Stage"
                options={stages}
                value={formData?.stage}
                onChange={(value) => handleInputChange("stage", value)}
              />

              <Select
                label="Priority"
                options={priorities}
                value={formData?.priority}
                onChange={(value) => handleInputChange("priority", value)}
              />

              <Input
                label="Expected Close Date"
                type="date"
                value={formData?.expected_close_date}
                onChange={(e) =>
                  handleInputChange("expected_close_date", e?.target?.value)
                }
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                Description
              </label>
              <textarea
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                rows={3}
                placeholder="Brief description of the deal..."
                value={formData?.description}
                onChange={(e) =>
                  handleInputChange("description", e?.target?.value)
                }
              />
            </div>

            {/* Products Section */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                  <Icon name="Package" size={16} />
                  Deal Products
                  {dealType === "product" && (
                    <span className="text-xs font-medium text-destructive">(required)</span>
                  )}
                </h3>
                {errors.products && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <Icon name="AlertCircle" size={12} />
                    {errors.products}
                  </p>
                )}
              </div>

              <div className="p-4 space-y-4">
                {/* Product Selection */}
                <div className="space-y-3">
                  {/* Product Group Selection */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Product Group
                    </label>
                    <Select
                      options={productGroups.map((group) => ({
                        value: group,
                        label: group,
                      }))}
                      value={selectedGroup}
                      onChange={(value) => {
                        setSelectedGroup(value);
                        setSelectedProductId("");
                      }}
                      placeholder="Select product group..."
                      searchable={true}
                      clearable={true}
                    />
                  </div>

                  {/* Product Name Selection */}
                  {selectedGroup && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Product Name
                      </label>
                      <Select
                        options={filteredProducts.map((product) => ({
                          value: product.id,
                          label: `${product.material} - ${product.description}`,
                        }))}
                        value={selectedProductId}
                        onChange={(value) => setSelectedProductId(value)}
                        placeholder="Select product..."
                        searchable={true}
                        clearable={true}
                      />
                    </div>
                  )}

                  {/* UOM Type, Value and Unit Rate */}
                  {selectedProductId && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          UOM Type
                        </label>
                        <Select
                          options={uomTypeOptions}
                          value={uomType}
                          onChange={(value) => setUomType(value)}
                          placeholder="Select UOM..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          UOM Value
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={uomValue}
                          onChange={(e) => setUomValue(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Unit Rate ({preferredCurrency})
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={unitRate}
                          onChange={(e) => setUnitRate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* Calculated Line Total Display */}
                  {selectedProductId && uomType && uomValue && unitRate && (
                    <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Line Total:
                        </span>
                        <span className="font-bold text-primary text-lg">
                          {formatCurrency(
                            parseFloat(uomValue) * parseFloat(unitRate),
                            preferredCurrency,
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Add Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddProduct}
                    disabled={
                      !selectedProductId ||
                      !uomType ||
                      !uomValue ||
                      !unitRate ||
                      isLoadingProducts
                    }
                    className="w-full"
                  >
                    <Icon name="Plus" size={16} className="mr-2" />
                    {isLoadingProducts ? "Adding..." : "Add Product"}
                  </Button>
                </div>

                {/* Products List */}
                {(() => {
                  const productsToShow = deal ? dealProducts : selectedProducts;
                  console.log("🎨 Rendering products list:", {
                    isDeal: !!deal,
                    dealProducts: dealProducts.length,
                    selectedProducts: selectedProducts.length,
                    productsToShow: productsToShow.length,
                    products: productsToShow,
                  });
                  return (
                    productsToShow.length > 0 && (
                      <div className="border-t border-border pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-card-foreground">
                            Products Added ({productsToShow.length})
                          </h4>
                        </div>

                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {productsToShow.map((item, idx) => {
                            const displayProduct = deal ? item : item;
                            const productData = deal
                              ? item.product
                              : item.product;

                            return (
                              <div
                                key={deal ? item.id : idx}
                                className="bg-muted/30 rounded-md p-3 flex items-center justify-between text-sm"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Icon
                                      name="Package"
                                      size={14}
                                      className="text-primary flex-shrink-0"
                                    />
                                    <span className="font-medium text-card-foreground truncate">
                                      {productData?.material}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 ml-4 text-xs">
                                  {displayProduct.uom_type &&
                                  displayProduct.uom_value ? (
                                    <>
                                      <span className="text-muted-foreground">
                                        {displayProduct.uom_type.toUpperCase()}:{" "}
                                        <span className="font-semibold text-card-foreground">
                                          {parseFloat(
                                            displayProduct.uom_value,
                                          ).toFixed(2)}
                                        </span>
                                      </span>
                                      <span className="text-muted-foreground">
                                        Rate:{" "}
                                        <span className="font-semibold text-card-foreground">
                                          {formatCurrency(
                                            displayProduct.unit_price || 0,
                                            preferredCurrency,
                                          )}
                                        </span>
                                      </span>
                                      <span className="text-primary font-semibold">
                                        Total:{" "}
                                        {formatCurrency(
                                          displayProduct.line_total || 0,
                                          preferredCurrency,
                                        )}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-muted-foreground">
                                        Qty:{" "}
                                        <span className="font-semibold text-card-foreground">
                                          {parseFloat(
                                            displayProduct.quantity || 0,
                                          ).toFixed(0)}
                                        </span>
                                      </span>
                                      {displayProduct.sqm && (
                                        <span className="text-muted-foreground">
                                          SQM:{" "}
                                          <span className="font-semibold text-card-foreground">
                                            {parseFloat(
                                              displayProduct.sqm,
                                            ).toFixed(2)}
                                          </span>
                                        </span>
                                      )}
                                      {displayProduct.ton && (
                                        <span className="text-muted-foreground">
                                          TON:{" "}
                                          <span className="font-semibold text-card-foreground">
                                            {parseFloat(
                                              displayProduct.ton,
                                            ).toFixed(2)}
                                          </span>
                                        </span>
                                      )}
                                    </>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveProduct(deal ? item.id : idx)
                                    }
                                    disabled={isLoadingProducts}
                                    className="text-destructive hover:text-destructive/80 disabled:opacity-50 ml-2"
                                    title="Remove product"
                                  >
                                    <Icon name="Trash2" size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  );
                })()}

                {!deal && selectedProducts.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Icon
                      name="Package"
                      size={24}
                      className="mx-auto mb-2 opacity-50"
                    />
                    <p className="text-sm">No products added yet</p>
                    <p className="text-xs">
                      Search and add products to include them with the deal
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-lg shadow-enterprise-lg w-full max-w-md p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center">
                  <Icon
                    name="AlertTriangle"
                    size={20}
                    className="text-destructive"
                  />
                </div>
                <h3 className="text-lg font-semibold text-card-foreground">
                  Delete Deal
                </h3>
              </div>

              {deleteReferences?.totalReferences > 0 ? (
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    This deal has the following references that will be
                    affected:
                  </p>
                  <ul className="space-y-2 text-sm">
                    {deleteReferences.references.deal_products > 0 && (
                      <li className="flex items-center text-amber-600">
                        <Icon name="Package" size={16} className="mr-2" />
                        {deleteReferences.references.deal_products} product(s)
                        will be removed
                      </li>
                    )}
                    {deleteReferences.references.activities > 0 && (
                      <li className="flex items-center text-amber-600">
                        <Icon name="Activity" size={16} className="mr-2" />
                        {deleteReferences.references.activities} activity(ies)
                        will be deleted
                      </li>
                    )}
                    {deleteReferences.references.tasks > 0 && (
                      <li className="flex items-center text-amber-600">
                        <Icon name="CheckSquare" size={16} className="mr-2" />
                        {deleteReferences.references.tasks} task(s) will be
                        unlinked
                      </li>
                    )}
                  </ul>
                  <p className="text-sm text-destructive mt-3 font-medium">
                    Are you sure you want to delete this deal and all related
                    data?
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to delete this deal? This action cannot
                  be undone.
                </p>
              )}

              <div className="flex justify-end space-x-3">
                <Button
                  variant="ghost"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  loading={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete Deal"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border bg-muted/30">
          <div className="flex items-center space-x-2">
            {deal && (
              <Button
                variant="ghost"
                onClick={handleDeleteClick}
                disabled={isSaving || isDeleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Icon name="Trash2" size={16} className="mr-2" />
                Delete
              </Button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isSaving || isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleSave}
              loading={isSaving}
              disabled={isDeleting}
              iconName="Save"
              iconPosition="left"
            >
              {isSaving
                ? "Saving..."
                : deal
                  ? "Save Deal"
                  : `Create Deal${
                      selectedProducts.length > 0
                        ? ` (${selectedProducts.length} products)`
                        : ""
                    }`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealModal;
