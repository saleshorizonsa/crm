import React, { useState, useEffect, useRef } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import LostReasonModal from "./LostReasonModal";
import MeetingModal from "../../calendar/components/MeetingModal";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useAuth } from "../../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";
import {
  currencyService,
  productService,
  dealProductService,
  dealService,
  uomService,
  salesTargetService,
} from "../../../services/supabaseService";

function ProductSearchDropdown({ results, onSelect, onClose, formatCurrency }) {
  return (
    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
      {results.map(product => (
        <div
          key={product.id}
          onClick={() => { onSelect(product); onClose(); }}
          className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0"
        >
          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs">
            📦
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">
              {product.material}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {product.description && (
                <span className="text-xs text-gray-400 truncate max-w-[160px]">
                  {product.description}
                </span>
              )}
              {product.material_group && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded flex-shrink-0">
                  {product.material_group}
                </span>
              )}
            </div>
          </div>
          <div className="text-sm font-medium text-gray-700 flex-shrink-0">
            {formatCurrency(product.unit_price || 0)}
          </div>
        </div>
      ))}
    </div>
  );
}

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
    creation_date: deal?.creation_date || new Date().toISOString().split('T')[0],
    contact_id: deal?.contact_id || null,
    priority: deal?.priority || "medium",
    lost_reason: deal?.lost_reason || "",
    lost_reason_code: deal?.lost_reason_code || "",
    lost_reason_notes: deal?.lost_reason_notes || "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errors, setErrors] = useState({});
  const [showLostModal,    setShowLostModal]    = useState(false);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const pendingDealDataRef = useRef(null);
  const [dealType, setDealType] = useState("value"); // "value" | "product"
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReferences, setDeleteReferences] = useState(null);
  const [dealProducts, setDealProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]); // For new deals

  // Product selection state
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProductData, setSelectedProductData] = useState(null);
  const [uomType, setUomType] = useState("qty");
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
        creation_date: deal?.creation_date || new Date().toISOString().split('T')[0],
        contact_id: deal?.contact_id || null,
        priority: deal?.priority || "medium",
        lost_reason: deal?.lost_reason || "",
        lost_reason_code: deal?.lost_reason_code || "",
        lost_reason_notes: deal?.lost_reason_notes || "",
      });

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
          // Recalculate amount from actual line items in case DB deal.amount is stale
          if (deal.deal_products.length > 0) {
            const correctAmount = deal.deal_products.reduce(
              (sum, p) => sum + parseFloat(
                p.line_total ||
                (parseFloat(p.uom_value || p.quantity || 0) * parseFloat(p.unit_price || 0))
              ), 0
            );
            setFormData(prev => ({ ...prev, amount: correctAmount }));
          }
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

  // Load all products when modal opens
  useEffect(() => {
    if (!isOpen) return;
    async function loadAllProducts() {
      const { data } = await supabase
        .from('products')
        .select('id, material, description, material_group, unit_price, base_unit_of_measure, is_active')
        .eq('is_active', true)
        .order('material', { ascending: true })
        .limit(50);
      setProductResults(data || []);
    }
    loadAllProducts();
  }, [isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('.product-search-container')) {
        setShowProductDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function searchProducts(query) {
    if (!query || query.trim().length === 0) {
      const { data } = await supabase
        .from('products')
        .select('id, material, description, material_group, unit_price, base_unit_of_measure, is_active')
        .eq('is_active', true)
        .order('material', { ascending: true })
        .limit(50);
      setProductResults(data || []);
      setShowProductDropdown(true);
      return;
    }
    setSearchLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('id, material, description, material_group, unit_price, base_unit_of_measure, is_active')
      .eq('is_active', true)
      .or(`material.ilike.%${query}%,description.ilike.%${query}%,material_group.ilike.%${query}%`)
      .order('material', { ascending: true })
      .limit(20);
    setSearchLoading(false);
    if (error || !data) { setProductResults([]); return; }
    setProductResults(data);
    setShowProductDropdown(data.length > 0);
  }

  function handleProductSelect(product) {
    setShowProductDropdown(false);
    setProductSearch('');
    setSelectedProductData(product);
    setUnitRate(product.unit_price ? String(product.unit_price) : '');
  }

  const loadDealProducts = async () => {
    if (!deal?.id) return;
    try {
      console.log("📥 Loading deal products for deal:", deal.id);
      const { data, error } = await dealProductService.getDealProducts(deal.id);
      if (error) throw error;
      console.log("📥 Loaded deal products:", data);
      setDealProducts(data || []);
      // Recalculate amount from actual line items in case DB deal.amount is stale
      if (data?.length > 0) {
        const correctAmount = data.reduce(
          (sum, p) => sum + parseFloat(
            p.line_total ||
            (parseFloat(p.uom_value || p.quantity || 0) * parseFloat(p.unit_price || 0))
          ), 0
        );
        setFormData(prev => ({ ...prev, amount: correctAmount }));
      }
    } catch (error) {
      console.error("❌ Error loading deal products:", error);
    }
  };

  const handleAddProduct = async () => {
    if (!selectedProductData) {
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
      const existingProduct = dealProducts.find(
        (dp) => dp.product_id === selectedProductData.id,
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
          productId: selectedProductData.id,
          uomType,
          uomValue: uomVal,
          unitRate: rate,
          lineTotal,
        });

        const { data, error } = await dealProductService.addProductToDeal(
          deal.id,
          selectedProductData.id,
          uomVal,
          uomType === "sqm" ? uomVal : null,
          uomType === "ton" ? uomVal : null,
          rate,
          null,
          uomType,
          uomVal,
          selectedProductData.cost_price || null,
        );

        console.log("🔵 Product add result:", { data, error });

        if (error) throw error;

        if (errors.products) setErrors((prev) => ({ ...prev, products: "" }));

        // Reload then recalculate from the fresh list to avoid drift
        const { data: freshProducts } = await dealProductService.getDealProducts(deal.id);
        setDealProducts(freshProducts || []);
        const newAmount = (freshProducts || []).reduce(
          (sum, p) => sum + parseFloat(
            p.line_total ||
            (parseFloat(p.uom_value || p.quantity || 0) * parseFloat(p.unit_price || 0))
          ), 0
        );
        setFormData((prev) => ({ ...prev, amount: newAmount }));

        resetProductForm();
      } catch (error) {
        console.error("❌ Error adding product to deal:", error);
        alert("Failed to add product: " + (error.message || error));
      } finally {
        setIsLoadingProducts(false);
      }
    } else {
      const existingProduct = selectedProducts.find(
        (sp) => sp.productId === selectedProductData.id,
      );
      if (existingProduct) {
        alert(
          "This product is already added to the deal. Please edit or remove the existing entry first.",
        );
        return;
      }

      console.log("🟢 Adding product to new deal (local state):", {
        productId: selectedProductData.id,
        uomType,
        uomValue: uomVal,
        unitRate: rate,
        lineTotal,
      });

      const newProduct = {
        product: selectedProductData,
        productId: selectedProductData.id,
        product_group_name: selectedProductData.material_group || '',
        quantity: uomVal,
        sqm: uomType === "sqm" ? uomVal : null,
        ton: uomType === "ton" ? uomVal : null,
        unit_price: rate,
        cost_price: selectedProductData.cost_price || null,
        line_total: lineTotal,
        uom_type: uomType,
        uom_value: uomVal,
      };

      console.log("🟢 New product object:", newProduct);
      const allProds = [...selectedProducts, newProduct];
      setSelectedProducts(allProds);

      const newAmount = allProds.reduce(
        (sum, p) => sum + parseFloat(p.line_total || 0), 0
      );
      setFormData((prev) => ({ ...prev, amount: newAmount }));

      if (errors.products) setErrors((prev) => ({ ...prev, products: "" }));

      resetProductForm();
    }
  };

  const resetProductForm = () => {
    setSelectedProductData(null);
    setProductSearch('');
    setUomType("qty");
    setUomValue("");
    setUnitRate("");
  };

  const handleRemoveProduct = async (indexOrId) => {
    // If editing existing deal, remove from database
    if (deal?.id) {
      if (!confirm("Remove this product from the deal?")) return;

      setIsLoadingProducts(true);
      try {
        const { error } =
          await dealProductService.removeProductFromDeal(indexOrId, deal.id);
        if (error) throw error;

        // Reload then recalculate from remaining products to avoid drift
        const { data: freshProducts } = await dealProductService.getDealProducts(deal.id);
        setDealProducts(freshProducts || []);
        const newAmount = (freshProducts || []).reduce(
          (sum, p) => sum + parseFloat(
            p.line_total ||
            (parseFloat(p.uom_value || p.quantity || 0) * parseFloat(p.unit_price || 0))
          ), 0
        );
        setFormData((prev) => ({ ...prev, amount: Math.max(0, newAmount) }));
      } catch (error) {
        console.error("Error removing product:", error);
        alert("Failed to remove product");
      } finally {
        setIsLoadingProducts(false);
      }
    } else {
      const remaining = selectedProducts.filter((_, i) => i !== indexOrId);
      const newAmount = remaining.reduce(
        (sum, p) => sum + parseFloat(p.line_total || 0), 0
      );
      setFormData((prev) => ({ ...prev, amount: Math.max(0, newAmount) }));
      setSelectedProducts(remaining);
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

  // Core save execution — called directly or after LostReasonModal confirms
  const executeSave = async (dealData) => {
    setIsSaving(true);
    try {
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

  const handleSave = (e) => {
    e.preventDefault();

    const newErrors = {};
    if (!formData.title?.trim())       newErrors.title         = "Deal title is required";
    if (!formData.description?.trim()) newErrors.description   = "Description is required";
    if (!formData.creation_date)       newErrors.creation_date = "Creation date is required";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});

    const dealData = {
      ...formData,
      ...(deal?.id && { id: deal.id }),
      amount:     parseFloat(formData.amount) || 0,
      owner_id:   user?.id,
      currency:   preferredCurrency,
      contact_id: formData.contact_id || null,
    };

    // Always recalculate amount from the actual product line items to prevent drift
    if (deal?.id && dealProducts.length > 0) {
      dealData.amount = dealProducts.reduce(
        (sum, p) => sum + parseFloat(
          p.line_total ||
          (parseFloat(p.uom_value || p.quantity || 0) * parseFloat(p.unit_price || 0))
        ), 0
      );
    } else if (!deal?.id && selectedProducts.length > 0) {
      dealData.amount = selectedProducts.reduce(
        (sum, p) => sum + parseFloat(p.line_total || 0), 0
      );
    }

    // Intercept: when stage is 'lost' and no code chosen yet, show reason modal
    if (formData.stage === "lost" && !formData.lost_reason_code) {
      pendingDealDataRef.current = dealData;
      setShowLostModal(true);
      return;
    }

    // If 'lost' was already set (editing an existing lost deal), carry code through
    if (formData.stage === "lost") {
      dealData.lost_at = dealData.lost_at || new Date().toISOString();
    }

    executeSave(dealData);
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
                label="Client"
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
                  label={`Deal Value (${preferredCurrency})`}
                  type="number"
                  placeholder="0"
                  value={formData?.amount}
                  onChange={(e) =>
                    handleInputChange("amount", parseFloat(e?.target?.value) || 0)
                  }
                />
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

            {/* Stage, Priority, Creation Date, Close Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Select
                label="Stage"
                options={stages}
                value={formData?.stage}
                onChange={(value) => {
                  handleInputChange("stage", value);
                  if (value !== "lost" && errors.lost_reason)
                    setErrors((prev) => ({ ...prev, lost_reason: "" }));
                }}
              />

              <Select
                label="Priority"
                options={priorities}
                value={formData?.priority}
                onChange={(value) => handleInputChange("priority", value)}
              />

              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Creation Date <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={formData?.creation_date}
                  onChange={(e) => {
                    handleInputChange("creation_date", e?.target?.value);
                    if (errors.creation_date) setErrors((prev) => ({ ...prev, creation_date: "" }));
                  }}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm ${
                    errors.creation_date ? "border-destructive" : "border-border"
                  }`}
                />
                {errors.creation_date && (
                  <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                    <Icon name="AlertCircle" size={12} />
                    {errors.creation_date}
                  </p>
                )}
              </div>

              <Input
                label="Expected Close Date"
                type="date"
                value={formData?.expected_close_date}
                onChange={(e) =>
                  handleInputChange("expected_close_date", e?.target?.value)
                }
              />
            </div>

            {/* Lost reason summary — shown when stage is already 'lost' and code is set */}
            {formData?.stage === "lost" && formData?.lost_reason_code && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
                <Icon name="XCircle" size={15} className="flex-shrink-0" />
                <div className="flex-1">
                  <span className="font-medium">Lost reason recorded: </span>
                  {formData.lost_reason_code}
                  {formData.lost_reason_notes && (
                    <span className="text-red-600 ml-1">— {formData.lost_reason_notes}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="text-red-400 hover:text-red-700 text-xs underline"
                  onClick={() => {
                    handleInputChange("lost_reason_code", "");
                    handleInputChange("lost_reason_notes", "");
                  }}
                >
                  Change
                </button>
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                Description <span className="text-destructive">*</span>
              </label>
              <textarea
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none ${
                  errors.description ? "border-destructive" : "border-border"
                }`}
                rows={3}
                placeholder="Brief description of the deal..."
                value={formData?.description}
                onChange={(e) => {
                  handleInputChange("description", e?.target?.value);
                  if (errors.description)
                    setErrors((prev) => ({ ...prev, description: "" }));
                }}
              />
              {errors.description && (
                <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                  <Icon name="AlertCircle" size={12} />
                  {errors.description}
                </p>
              )}
            </div>

            {/* Products Section */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted/30 px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                  <Icon name="Package" size={16} />
                  Deal Products
                </h3>
              </div>

              <div className="p-4 space-y-4">
                {/* Product Selection */}
                <div className="space-y-3">
                  {/* Unified product search */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Search Product
                    </label>
                    <div className="product-search-container relative">
                      <input
                        type="text"
                        placeholder="Search by name, description or group..."
                        value={productSearch}
                        onChange={e => {
                          setProductSearch(e.target.value);
                          searchProducts(e.target.value);
                        }}
                        onFocus={() => {
                          if (productResults.length > 0)
                            setShowProductDropdown(true);
                        }}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      {searchLoading && (
                        <div className="absolute right-3 top-2.5 text-muted-foreground text-xs">
                          ...
                        </div>
                      )}
                      {showProductDropdown && productResults.length > 0 && (
                        <ProductSearchDropdown
                          results={productResults}
                          onSelect={handleProductSelect}
                          onClose={() => setShowProductDropdown(false)}
                          formatCurrency={(v) => formatCurrency(v, preferredCurrency)}
                        />
                      )}
                    </div>
                  </div>

                  {/* Selected product indicator */}
                  {selectedProductData && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                      <Icon name="Package" size={14} className="text-blue-600 flex-shrink-0" />
                      <span className="font-medium text-blue-800 flex-1 truncate">
                        {selectedProductData.material}
                      </span>
                      {selectedProductData.material_group && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded flex-shrink-0">
                          {selectedProductData.material_group}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedProductData(null)}
                        className="text-blue-400 hover:text-blue-700 flex-shrink-0"
                      >
                        <Icon name="X" size={14} />
                      </button>
                    </div>
                  )}

                  {/* UOM Type, Value and Unit Rate */}
                  {selectedProductData && (
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
                  {selectedProductData && uomType && uomValue && unitRate && (
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
                      !selectedProductData ||
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

                        {/* Low-margin warning banner */}
                        {userProfile?.role !== "salesman" && (() => {
                          const hasLowMargin = productsToShow.some(item => {
                            const lt = parseFloat(item.line_total) || (parseFloat(item.uom_value || item.quantity || 0) * parseFloat(item.unit_price || 0));
                            const cp = parseFloat(item.cost_price || item.product?.cost_price || 0);
                            const qty = parseFloat(item.uom_value || item.quantity || 0);
                            const mp = lt > 0 ? ((lt - qty * cp) / lt) * 100 : null;
                            return mp != null && mp < 10;
                          });
                          return hasLowMargin ? (
                            <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                              <Icon name="AlertTriangle" size={13} className="flex-shrink-0" />
                              <span>One or more products have margin below 10% — review pricing before closing.</span>
                            </div>
                          ) : null;
                        })()}

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
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Icon
                                      name="Package"
                                      size={14}
                                      className="text-primary flex-shrink-0"
                                    />
                                    <span className="font-medium text-card-foreground truncate">
                                      {productData?.material}
                                    </span>
                                    {(() => {
                                      const grp = item.product_group_name || productData?.material_group;
                                      return grp ? (
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full flex-shrink-0">
                                          {grp}
                                        </span>
                                      ) : null;
                                    })()}
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
                                                      {(() => {
                                        const lt = parseFloat(displayProduct.line_total) ||
                                          (parseFloat(displayProduct.uom_value || 0) * parseFloat(displayProduct.unit_price || 0));
                                        const cp = parseFloat(item.cost_price || item.product?.cost_price || 0);
                                        const qty2 = parseFloat(displayProduct.uom_value || displayProduct.quantity || 0);
                                        const lc = qty2 * cp;
                                        const mp = lt > 0 ? ((lt - lc) / lt) * 100 : null;
                                        if (mp == null || userProfile?.role === "salesman") return null;
                                        return (
                                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                            mp >= 20 ? "bg-green-100 text-green-700"
                                            : mp >= 10 ? "bg-amber-100 text-amber-700"
                                            : "bg-red-100 text-red-700"
                                          }`}>{mp.toFixed(1)}%</span>
                                        );
                                      })()}
                                      <span className="text-primary font-semibold">
                                        Total:{" "}
                                        {formatCurrency(
                                          parseFloat(displayProduct.line_total) ||
                                          (parseFloat(displayProduct.uom_value || displayProduct.quantity || 0) *
                                           parseFloat(displayProduct.unit_price || 0)),
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

                        {/* Deal-level margin summary */}
                        {userProfile?.role !== "salesman" && (() => {
                          let totalRev = 0, totalCost = 0;
                          productsToShow.forEach(item => {
                            const lt = parseFloat(item.line_total) || (parseFloat(item.uom_value || item.quantity || 0) * parseFloat(item.unit_price || 0));
                            const cp = parseFloat(item.cost_price || item.product?.cost_price || 0);
                            const qty = parseFloat(item.uom_value || item.quantity || 0);
                            totalRev  += lt;
                            totalCost += qty * cp;
                          });
                          const gm  = totalRev - totalCost;
                          const mp  = totalRev > 0 ? (gm / totalRev) * 100 : null;
                          if (mp == null) return null;
                          return (
                            <div className={`mt-2 flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium ${
                              mp >= 20 ? "bg-green-50 border border-green-200 text-green-800"
                              : mp >= 10 ? "bg-amber-50 border border-amber-200 text-amber-800"
                              : "bg-red-50 border border-red-200 text-red-800"
                            }`}>
                              <span>Deal Gross Margin</span>
                              <div className="flex items-center gap-3">
                                <span>{formatCurrency(gm, preferredCurrency)}</span>
                                <span className="font-bold">{mp.toFixed(1)}%</span>
                              </div>
                            </div>
                          );
                        })()}
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
            <Button
              variant="ghost"
              type="button"
              onClick={() => setShowMeetingModal(true)}
              disabled={isSaving || isDeleting}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Icon name="CalendarPlus" size={16} className="mr-2" />
              Schedule Meeting
            </Button>
            {userProfile?.role === 'admin' && deal?.id && (
              <button
                type="button"
                onClick={async () => {
                  const result = await dealProductService.repairDealProductTotals(deal.id);
                  alert('Fixed: ' + JSON.stringify(result.data));
                  const { data: fresh } = await dealProductService.getDealProducts(deal.id);
                  setDealProducts(fresh || []);
                  const repairedAmount = (fresh || []).reduce(
                    (sum, p) => sum + parseFloat(p.line_total || 0), 0
                  );
                  setFormData(prev => ({ ...prev, amount: repairedAmount }));
                }}
                className="text-xs text-red-500 underline ml-2"
              >
                Repair totals
              </button>
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

      {/* Meeting scheduler — opened from footer */}
      <MeetingModal
        isOpen={showMeetingModal}
        onClose={() => setShowMeetingModal(false)}
        onSave={async (data, attendeeIds) => {
          const { meetingService: ms } = await import("../../../services/meetingService");
          const payload = { ...data, company_id: company?.id, created_by: user?.id };
          delete payload.id;
          delete payload.sync_google;
          const { error } = await ms.createMeeting(payload, attendeeIds);
          if (error) throw error;
          setShowMeetingModal(false);
        }}
        onDelete={() => {}}
        prefillDealId={deal?.id || null}
        contacts={contacts}
        users={users}
      />

      {/* Lost Reason Modal — shown when user saves with stage=lost and no code yet */}
      <LostReasonModal
        isOpen={showLostModal}
        deal={deal || { title: formData.title }}
        onConfirm={(code, notes) => {
          setShowLostModal(false);
          const pd = pendingDealDataRef.current;
          if (!pd) return;
          pendingDealDataRef.current = null;
          const enriched = {
            ...pd,
            lost_reason_code:  code,
            lost_reason_notes: notes || null,
            lost_at:           new Date().toISOString(),
            closed_at:         new Date().toISOString(),
          };
          // Keep formData in sync for UI
          handleInputChange("lost_reason_code", code);
          handleInputChange("lost_reason_notes", notes);
          executeSave(enriched);
        }}
        onCancel={() => {
          setShowLostModal(false);
          pendingDealDataRef.current = null;
        }}
      />
    </div>
  );
};

export default DealModal;
