import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import ContactSearchInput from "../../../components/ui/ContactSearchInput";
import LostReasonModal from "./LostReasonModal";
import ProductLineReconcilePanel from "./ProductLineReconcilePanel";
import ReplacementModal from "../../../components/deals/ReplacementModal";
import MeetingModal from "../../calendar/components/MeetingModal";
import LogActivityModal from "../../../components/LogActivityModal";
import ActivityTimeline from "../../../components/ActivityTimeline";
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
  adminService,
  activityService,
  taskService,
} from "../../../services/supabaseService";
import { useLanguage } from "../../../i18n";
import { useMaterialGroups } from '../../../hooks/useMaterialGroups';

const CHANGE_REASONS = [
  { value: 'price_negotiation',     label: 'Price Negotiation / Discount',   icon: 'TrendingDown'  },
  { value: 'quantity_decrease',     label: 'Quantity Decrease',              icon: 'Minus'         },
  { value: 'quantity_increase',     label: 'Quantity Increase',              icon: 'Plus'          },
  { value: 'additional_items',      label: 'Additional Items Added',         icon: 'PackagePlus'   },
  { value: 'items_removed',         label: 'Items Removed',                  icon: 'PackageMinus'  },
  { value: 'raw_material_increase', label: 'Raw Material Price Increase',    icon: 'TrendingUp'    },
  { value: 'other',                 label: 'Other',                          icon: 'MessageSquare' },
];

// ─── Multi-select product picker components ───────────────────────────────────

function ProductPickerRow({ product, isSelected, price, onToggle, onPriceChange }) {
  const lineTotal = isSelected && price
    ? parseFloat(price.quantity || 0) * parseFloat(price.price || 0)
    : 0;

  // Strip non-ASCII characters that appear when UOM encoding is incorrect (e.g. "1/2â€|")
  const uomDisplay = (product.base_unit_of_measure || 'EA')
    .replace(/[^\x20-\x7E]/g, '').trim() || 'EA';

  return (
    <div className={`border-b border-border last:border-0 transition-colors ${
      isSelected ? 'bg-blue-50' : 'hover:bg-muted/50'
    }`}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="w-4 h-4 rounded mt-0.5 flex-shrink-0 cursor-pointer accent-blue-600"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-card-foreground truncate">{product.material}</p>
              {product.description && (
                <p className="text-xs text-muted-foreground truncate">{product.description}</p>
              )}
              <div className="flex items-center flex-wrap gap-1 mt-0.5">
                {product.material_subgroup && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                    {product.material_subgroup}
                  </span>
                )}
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {uomDisplay}
                </span>
              </div>
            </div>
            {!isSelected && product.unit_price > 0 && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {product.unit_price} SAR
              </span>
            )}
          </div>

          {isSelected && (
            <div className="mt-2 flex gap-2 flex-wrap">
              <div className="min-w-[60px] flex-1">
                <label className="text-xs text-muted-foreground block mb-1">Qty</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price?.quantity ?? 1}
                  onChange={e => onPriceChange('quantity', parseFloat(e.target.value) || 0)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-card text-card-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="w-20">
                <label className="text-xs text-muted-foreground block mb-1">UOM</label>
                <select
                  value={price?.uomType || product.base_unit_of_measure || 'pc'}
                  onChange={e => onPriceChange('uomType', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-card text-card-foreground"
                >
                  <option value="pc">PC</option>
                  <option value="ton">Ton</option>
                  <option value="kg">KG</option>
                  <option value="meter">Meter</option>
                  <option value="sqm">SQM</option>
                  <option value="set">Set</option>
                </select>
              </div>
              <div className="min-w-[80px] flex-1">
                <label className="text-xs text-muted-foreground block mb-1">Unit Price (SAR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price?.price ?? (product.unit_price || '')}
                  onChange={e => onPriceChange('price', parseFloat(e.target.value) || 0)}
                  onClick={e => e.stopPropagation()}
                  placeholder="0.00"
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-card text-card-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="min-w-[70px] flex-1">
                <label className="text-xs text-muted-foreground block mb-1">Total</label>
                <div className="px-2 py-1.5 text-sm font-medium text-card-foreground bg-muted rounded-lg border border-border">
                  {lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductPickerPanel({
  products, productGroups, productGroup, setProductGroup,
  productSearch, setProductSearch,
  selectedProductIds, setSelectedProductIds,
  productPrices, setProductPrices,
  loading, onAddSelected, isLoadingProducts,
}) {
  return (
    <div className="border-t border-border">
      {/* Group selector (required first step) + search */}
      <div className="p-3 border-b border-border space-y-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Select Product Group *
          </label>
          <select
            value={productGroup}
            onChange={e => {
              console.log('Group selected:', e.target.value);
              setProductGroup(e.target.value);
              setProductSearch('');
              setSelectedProductIds(new Set());
              setProductPrices({});
            }}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card text-card-foreground font-medium focus:outline-none focus:border-primary"
          >
            <option value="">— Select a group to browse products —</option>
            {productGroups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {productGroup && (
          <div className="relative">
            <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder={`Search in ${productGroup}…`}
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card text-card-foreground focus:outline-none focus:border-primary"
            />
          </div>
        )}
      </div>

      {/* Select-all bar — only when group selected, loaded, and has results */}
      {productGroup && !loading && products.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-xs text-muted-foreground border-b border-border">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedProductIds.size > 0 && selectedProductIds.size === products.length}
              ref={el => {
                if (el) el.indeterminate = selectedProductIds.size > 0 && selectedProductIds.size < products.length;
              }}
              onChange={e => {
                if (e.target.checked) {
                  setSelectedProductIds(new Set(products.map(p => p.id)));
                  const newPrices = {};
                  products.forEach(p => {
                    newPrices[p.id] = { price: p.unit_price || 0, quantity: 1, uomType: p.base_unit_of_measure || 'pc' };
                  });
                  setProductPrices(pp => ({ ...pp, ...newPrices }));
                } else {
                  setSelectedProductIds(new Set());
                  setProductPrices({});
                }
              }}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span>Select all ({products.length} products in {productGroup})</span>
          </label>
          {selectedProductIds.size > 0 && (
            <span className="text-primary font-medium">{selectedProductIds.size} selected</span>
          )}
        </div>
      )}

      {/* Product list / empty states */}
      <div className="max-h-64 overflow-y-auto">
        {!productGroup ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Icon name="Layers" size={24} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Select a product group</p>
            <p className="text-xs text-muted-foreground mt-1">
              Choose a group above to browse and select products
            </p>
            {productGroups.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                No groups found. Add products with a Material Group in the admin panel first.
              </p>
            )}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
            <span className="ml-2 text-sm text-muted-foreground">Loading {productGroup} products…</span>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {productSearch
              ? `No products match "${productSearch}" in ${productGroup}`
              : `No products in ${productGroup}`}
          </div>
        ) : (
          products.map(product => (
            <ProductPickerRow
              key={product.id}
              product={product}
              isSelected={selectedProductIds.has(product.id)}
              price={productPrices[product.id]}
              onToggle={() => {
                setSelectedProductIds(prev => {
                  const next = new Set(prev);
                  if (next.has(product.id)) {
                    next.delete(product.id);
                    setProductPrices(pp => {
                      const np = { ...pp };
                      delete np[product.id];
                      return np;
                    });
                  } else {
                    next.add(product.id);
                    setProductPrices(pp => ({
                      ...pp,
                      [product.id]: {
                        price: product.unit_price || 0,
                        quantity: 1,
                        uomType: product.base_unit_of_measure || 'pc',
                      },
                    }));
                  }
                  return next;
                });
              }}
              onPriceChange={(field, value) => {
                setProductPrices(pp => ({
                  ...pp,
                  [product.id]: { ...(pp[product.id] || {}), [field]: value },
                }));
              }}
            />
          ))
        )}
      </div>

      {/* Add button */}
      {selectedProductIds.size > 0 && (
        <div className="p-3 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={onAddSelected}
            disabled={isLoadingProducts}
            className="w-full py-2 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Icon name="Plus" size={14} />
            Add {selectedProductIds.size} product{selectedProductIds.size !== 1 ? 's' : ''} to deal
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Original search dropdown (kept for backward-compat) ──────────────────────

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
  initialAction = null,
}) => {
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { user, userProfile, company } = useAuth();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
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

  // Multi-select product picker state
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [allProducts, setAllProducts] = useState([]);

  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [productPrices, setProductPrices] = useState({}); // { productId: { price, quantity, uomType } }
  const [productsLoading, setProductsLoading] = useState(false);
  const [pickerGroup, setPickerGroup] = useState('');

  const { groups: productGroups, reload: reloadGroups } = useMaterialGroups();

  // Feature 1: product validation errors
  const [productErrors, setProductErrors] = useState([]);
  // Feature 2: inline editing state
  // Feature 3: initial vs final value
  const [showFinalValue, setShowFinalValue] = useState(false);
  const [finalAmount, setFinalAmount] = useState('');
  const [changeReason, setChangeReason] = useState('');
  // Quantity-increase reconciliation: the product lines must actually be updated
  // when the final value rises because of a quantity increase. A deal owned by
  // Alseyed drifted exactly this way — final_amount raised, lines untouched,
  // because lines lock after Contact Made — so this step unlocks them here only.
  // The product-line edit session, the ONE way a saved deal's lines change now,
  // at every stage: open the panel, pick a reason, edit a line, save that line.
  const [lineEditorOpen, setLineEditorOpen] = useState(false);
  const [lineEditReason, setLineEditReason] = useState('');
  const [changedLineIds, setChangedLineIds] = useState([]); // ids changed in this session
  // What the reconciliation panel itself changed: the deal amount it produced, and
  // a line-by-line description. Lets the save tell "the amount moved because of
  // THIS panel" apart from any other amount edit — see executeSave.
  const reconcileChangeRef = useRef({ amount: null, notes: [] });
  const [changeNotes, setChangeNotes] = useState('');

  // Amount-change audit: editing an existing deal's amount requires a reason.
  // (Distinct from the won/final-value `changeReason` above.)
  const [showEditReason, setShowEditReason] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [editReasonError, setEditReasonError] = useState('');
  const [changeHistory, setChangeHistory] = useState([]);
  const pendingSaveRef = useRef(null);

  // Move-to-Future-Orders flow: schedule this deal as a future order and remove
  // it from the Funnel. The salesman always picks the target month.
  const [showMoveFuture, setShowMoveFuture] = useState(false);

  // Opened from a card's "Move to Future" quick action: jump straight to the
  // month picker. Everything after that — validation, the mandatory replacement,
  // the removal — is the existing flow, unchanged.
  useEffect(() => {
    if (isOpen && initialAction === 'move_future' && deal?.id) {
      setMoveMonth('');
      setMoveError('');
      setShowMoveFuture(true);
    }
  }, [isOpen, initialAction, deal?.id]);
  const [moveMonth, setMoveMonth]           = useState('');
  const [moveError, setMoveError]           = useState('');
  const [movingFuture, setMovingFuture]     = useState(false);
  const [showReplacement, setShowReplacement] = useState(false); // replacement gate before removal
  const nextMonthStr = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  // Activity Log state
  const [dealActivities,        setDealActivities]        = useState([]);
  const [activitiesLoading,     setActivitiesLoading]     = useState(false);
  const [showActivityLog,       setShowActivityLog]       = useState(false);

  // Tasks state
  const [dealTasks,       setDealTasks]       = useState([]);
  const [loadingTasks,    setLoadingTasks]    = useState(false);
  const [showTaskSection, setShowTaskSection] = useState(false);
  const [showAddTask,     setShowAddTask]     = useState(false);
  const [savingTask,      setSavingTask]      = useState(false);
  const emptyTaskForm = { title: "", description: "", due_date: "", priority: "medium", assigned_to: "" };
  const [taskForm,        setTaskForm]        = useState(emptyTaskForm);
  const [showLogActivityModal,  setShowLogActivityModal]  = useState(false);

  // Filter by search only — group filtering is done at the DB query level
  const filteredProducts = useMemo(() => {
    if (!pickerGroup) return [];
    if (!pickerSearch) return allProducts;
    const q = pickerSearch.toLowerCase();
    return allProducts.filter(p =>
      p.material?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  }, [allProducts, pickerSearch, pickerGroup]);

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
      // Reset multi-select picker
      setShowProductPicker(false);
      setSelectedProductIds(new Set());
      setProductPrices({});
      setPickerSearch('');
      setPickerGroup('');
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

      // Reload groups on every modal open so newly-added groups appear immediately
      reloadGroups();

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
  }, [isOpen, deal, reloadGroups]);


  // Load products for the selected group only (avoids loading all 1000+ products at once)
  useEffect(() => {
    if (!isOpen || !pickerGroup) {
      setAllProducts([]);
      return;
    }
    async function loadGroupProducts() {
      setProductsLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('id, material, description, material_group, material_subgroup, base_unit_of_measure, unit_price, is_active')
        .eq('company_id', company?.id)
        .eq('material_group', pickerGroup)
        .eq('is_active', true)
        .order('material', { ascending: true });
      if (error) {
        console.error('Product fetch error:', error);
      }
      setAllProducts(data || []);
      setProductsLoading(false);
    }
    loadGroupProducts();
  }, [isOpen, pickerGroup]);

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
        .eq('company_id', company?.id)
        .or('is_active.eq.true,is_active.is.null')
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
      .eq('company_id', company?.id)
      .or(`is_active.eq.true,is_active.is.null`)
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

  // Closes the picker and resets selection state
  const resetPicker = () => {
    setShowProductPicker(false);
    setSelectedProductIds(new Set());
    setProductPrices({});
    setPickerSearch('');
  };

  // Called when user clicks "Add X products to deal" inside the picker panel
  const handleAddSelectedProducts = async () => {
    if (selectedProductIds.size === 0) return;

    if (deal?.id) {
      // Existing deal — persist each product to the DB immediately (same as single-add)
      setIsLoadingProducts(true);
      const addedAtNegotiation = [];
      const totalBeforeAdd = dealProducts.reduce((sum, p) => sum + parseFloat(p.line_total || 0), 0);
      try {
        for (const productId of selectedProductIds) {
          const product = allProducts.find(p => p.id === productId);
          if (!product) continue;

          // Skip duplicates already on the deal
          if (dealProducts.find(dp => dp.product_id === productId)) continue;

          const priceData = productPrices[productId] || {};
          const quantity  = parseFloat(priceData.quantity ?? 1);
          const unitPrice = parseFloat(priceData.price    != null ? priceData.price : (product.unit_price || 0));
          const uomType   = priceData.uomType || product.base_unit_of_measure || 'pc';

          const { error } = await dealProductService.addProductToDeal(
            deal.id,
            productId,
            quantity,
            uomType === 'sqm' ? quantity : null,
            uomType === 'ton' ? quantity : null,
            unitPrice,
            null,
            uomType,
            quantity,
            product.cost_price || null,
          );
          if (error) throw error;
          addedAtNegotiation.push(`${product.material} (qty ${quantity}, rate ${unitPrice})`);
        }

        if (errors.products) setErrors(prev => ({ ...prev, products: '' }));

        const { data: freshProducts } = await dealProductService.getDealProducts(deal.id);
        setDealProducts(freshProducts || []);
        const newAmount = (freshProducts || []).reduce(
          (sum, p) => sum + parseFloat(p.line_total || 0), 0
        );
        setFormData(prev => ({ ...prev, amount: newAmount }));
        // Negotiation only: record what was added, as one entry.
        if (addedAtNegotiation.length) {
          logProductLineChange({
            action: addedAtNegotiation.length === 1 ? 'line added' : `${addedAtNegotiation.length} lines added`,
            label: addedAtNegotiation.join('; '),
            before: 'not on deal',
            after: addedAtNegotiation.join('; '),
            oldTotal: totalBeforeAdd, newTotal: newAmount,
          });
        }
      } catch (err) {
        console.error('Error adding products via picker:', err);
        alert('Failed to add some products: ' + (err.message || err));
      } finally {
        setIsLoadingProducts(false);
      }
    } else {
      // New deal — stage products in selectedProducts (same format executeSave expects)
      const newItems = [];

      for (const productId of selectedProductIds) {
        const product = allProducts.find(p => p.id === productId);
        if (!product) continue;

        // Skip duplicates already staged
        if (selectedProducts.find(sp => sp.productId === productId)) continue;

        const priceData = productPrices[productId] || {};
        const quantity  = parseFloat(priceData.quantity ?? 1);
        const unitPrice = parseFloat(priceData.price    != null ? priceData.price : (product.unit_price || 0));
        const uomType   = priceData.uomType || product.base_unit_of_measure || 'pc';
        const lineTotal = quantity * unitPrice;

        newItems.push({
          product:            product,
          productId:          productId,
          product_group_name: product.material_group || '',
          quantity:           quantity,
          sqm:                uomType === 'sqm' ? quantity : null,
          ton:                uomType === 'ton' ? quantity : null,
          unit_price:         unitPrice,
          cost_price:         product.cost_price || null,
          line_total:         lineTotal,
          uom_type:           uomType,
          uom_value:          quantity,
        });
      }

      if (newItems.length > 0) {
        const allProds = [...selectedProducts, ...newItems];
        setSelectedProducts(allProds);
        const newAmount = allProds.reduce((s, p) => s + parseFloat(p.line_total || 0), 0);
        setFormData(prev => ({ ...prev, amount: newAmount }));
        if (errors.products) setErrors(prev => ({ ...prev, products: '' }));
      }
    }

    resetPicker();
  };

  const handleRemoveProduct = async (indexOrId) => {
    // If editing existing deal, remove from database
    if (deal?.id) {
      if (!confirm(t("deals.removeProductConfirm"))) return;

      setIsLoadingProducts(true);
      try {
        const removed = dealProducts.find((p) => p.id === indexOrId);
        const oldTotal = dealProducts.reduce((sum, p) => sum + parseFloat(p.line_total || 0), 0);
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
        // Negotiation only: record the removal.
        logProductLineChange({
          action: 'line removed',
          label: removed?.product?.material || 'line',
          before: removed
            ? `qty ${removed.uom_value ?? removed.quantity}, rate ${removed.unit_price}`
            : null,
          after: 'removed',
          oldTotal, newTotal: newAmount,
        });
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
    { value: "lead", label: t("deals.lead") },
    { value: "contact_made", label: t("deals.qualified") },
    { value: "proposal_sent", label: t("deals.proposal") },
    { value: "negotiation", label: t("deals.negotiation") },
    { value: "won", label: t("deals.won") },
    { value: "lost", label: t("deals.lost") },
  ];

  const priorities = [
    { value: "low", label: t("tasks.low") },
    { value: "medium", label: t("tasks.medium") },
    { value: "high", label: t("tasks.high") },
  ];

  // ── ONE product-line edit flow, every stage ───────────────────────────────
  // A saved deal's lines change in exactly one place now: ProductLineReconcilePanel,
  // opened from "Edit product lines" (any stage) or by the Final Value flow's
  // Quantity Increase step. Both need a reason first, both record every change.
  // The old free inline editing at Lead/Qualified is gone — that was the last way
  // to move a deal's value with nothing recorded.
  //
  // The stage is read from the form, not the saved deal, so switching to Won takes
  // effect immediately rather than after the save.
  const effectiveStage = formData?.stage || deal?.stage;
  const halala = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

  // The Final Value flow's Quantity Increase step is the same panel, pinned to that
  // reason; otherwise the session carries whichever reason the user picked.
  // A Lost deal is closed: its lines are a record of what was quoted and are not
  // edited at all — no panel, no add or remove, not even behind a reason.
  const isLostDeal = effectiveStage === 'lost';
  const finalValueReconcile = showFinalValue && changeReason === 'quantity_increase' && !isLostDeal;
  const activeLineReason = finalValueReconcile ? 'quantity_increase' : lineEditReason;
  const lineEditorVisible = !!deal?.id && !isLostDeal && (lineEditorOpen || finalValueReconcile);
  // Lines can only be added or removed while a reason-backed session is open —
  // at every stage including Proposal Sent, and never on a Lost deal.
  const canAddRemoveProducts = lineEditorVisible && !!activeLineReason;

  // A quantity increase on the Final Value flow MUST touch a line; an ordinary
  // session simply cannot be saved while it is open and nothing has changed yet
  // (close it and nothing is pending). A deal with no lines has nothing to
  // reconcile and is never stuck.
  const reconcileNeeded = finalValueReconcile && !!deal?.id && dealProducts.length > 0;
  const openSessionPending = lineEditorOpen && !isLostDeal && !!lineEditReason && changedLineIds.length === 0;
  const reconcileSatisfied =
    (!reconcileNeeded || changedLineIds.length > 0) && !openSessionPending;

  // Every line change is written to deal_amount_changes — the table the
  // amount-change gate already logs to — so "who changed which line, when and
  // why" is queryable per deal, at every stage:
  //   select * from deal_amount_changes where deal_id = ... and change_type = 'product_line'
  const logProductLineChange = async ({ action, label, before, after, oldTotal, newTotal }) => {
    if (!deal?.id || !activeLineReason) return;
    const reasonLabel = CHANGE_REASONS.find((r) => r.value === activeLineReason)?.label || activeLineReason;
    try {
      await supabase.from('deal_amount_changes').insert({
        deal_id: deal.id,
        company_id: company?.id,
        changed_by: user?.id,
        old_amount: halala(oldTotal),
        new_amount: halala(newTotal),
        change_type: 'product_line',
        old_value: before ?? null,
        new_value: after ?? null,
        reason: `${action} — ${label} [${reasonLabel}]`,
        stage_at_change: effectiveStage || null,
      });
    } catch (err) {
      // Never block the edit itself on the audit write.
      console.error('logProductLineChange:', err);
    }
  };

  // One line was saved by the panel: refresh the lines and the deal amount, mark
  // the session as having changed something, record the audit row, and remember
  // the amount produced so the generic free-text amount prompt can be skipped.
  const handleLineSaved = (updated, info) => {
    setDealProducts(updated);
    const newTotal = updated.reduce((s, p) => s + (parseFloat(p.line_total) || 0), 0);
    setFormData((prev) => ({ ...prev, amount: newTotal }));
    setChangedLineIds((prev) => (prev.includes(info.item.id) ? prev : [...prev, info.item.id]));
    setErrors((prev) => ({ ...prev, finalValue: '' }));
    logProductLineChange({
      action: 'line edited',
      label: info.label,
      before: info.before,
      after: info.after,
      oldTotal: info.oldTotal,
      newTotal: info.newTotal,
    });
    const notes = reconcileChangeRef.current.notes.filter((n) => n.id !== info.item.id);
    notes.push({ id: info.item.id, text: `${info.label}: ${info.before} → ${info.after}` });
    reconcileChangeRef.current = { amount: halala(newTotal), notes };
  };

  // Closing the session, or leaving the Final Value step, clears it: the reason,
  // what it changed, and the record used to skip the amount prompt.
  const endLineEditSession = () => {
    setLineEditorOpen(false);
    setLineEditReason('');
    setChangedLineIds([]);
    reconcileChangeRef.current = { amount: null, notes: [] };
  };
  // Reopening a deal, or switching stage, always starts from no session.
  useEffect(() => { endLineEditSession(); }, [isOpen, deal?.id, effectiveStage]);
  useEffect(() => { if (!finalValueReconcile && !lineEditorOpen) setChangedLineIds([]); }, [finalValueReconcile, lineEditorOpen]);

  // Convert contacts to dropdown options
  const contactOptions = contacts.map((contact) => ({
    value: contact.id,
    label: `${contact.first_name} ${contact.last_name} - ${
      contact.company_name || t("deals.noCompany")
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

  // Feature 1: validate qty > 0 and price > 0 for every product
  function validateProducts(products) {
    const errors = [];
    (products || []).forEach((p, index) => {
      const name = p.product?.description || p.product?.material || `Product ${index + 1}`;
      const qty   = parseFloat(p.uom_value || p.quantity || 0);
      const price = parseFloat(p.unit_price || 0);
      if (!qty   || qty   <= 0) errors.push({ index, field: 'quantity', message: `${name} — quantity is required` });
      if (!price || price <= 0) errors.push({ index, field: 'price',    message: `${name} — unit price is required` });
    });
    return errors;
  }

  // Core save execution — called directly or after LostReasonModal confirms
  // Load the amount-change history for this deal (shown in the modal body).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isOpen || !deal?.id) { setChangeHistory([]); return; }
      const { data } = await supabase
        .from('deal_amount_changes')
        .select(
          'id, change_type, old_amount, new_amount, old_value, new_value, reason, stage_at_change, created_at, changed_by_user:users!changed_by(full_name)'
        )
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: false });
      if (!cancelled) setChangeHistory(data || []);
    })();
    return () => { cancelled = true; };
  }, [isOpen, deal?.id]);

  // Insert the change record + notify the deal owner's manager. Best-effort:
  // a logging/notification failure must never block the (already saved) deal.
  const logAmountChange = async (dealObj, oldAmount, newAmount, reason, stageAtChange) => {
    try {
      await supabase.from('deal_amount_changes').insert({
        deal_id:         dealObj.id,
        company_id:      company?.id,
        changed_by:      user?.id,
        old_amount:      oldAmount,
        new_amount:      newAmount,
        change_type:     'amount',
        old_value:       String(oldAmount),
        new_value:       String(newAmount),
        reason,
        stage_at_change: stageAtChange || dealObj.stage || null,
      });
      await notifyManager(dealObj, oldAmount, newAmount, reason);
    } catch (err) {
      console.error('logAmountChange:', err);
    }
  };

  // Append-only log of expected_close_date being moved OUT to a later date.
  // Nothing before this shipped is recorded — there is no history of past edits
  // anywhere — so the breakdown only describes moves from here on.
  const logCloseDateMove = async (dealObj, nextDate) => {
    const before = dealObj?.expected_close_date ? String(dealObj.expected_close_date).slice(0, 10) : null;
    const after = nextDate ? String(nextDate).slice(0, 10) : null;
    if (!dealObj?.id || !before || !after || after <= before) return;
    try {
      const { error } = await supabase.from('deal_close_date_changes').insert({
        deal_id: dealObj.id,
        company_id: company?.id || null,
        old_date: before,
        new_date: after,
        changed_by: user?.id || null,
      });
      // 42P01 = migrations/add_deal_close_date_changes.sql not applied yet.
      if (error && error.code !== '42P01') console.warn('logCloseDateMove:', error.message);
    } catch (err) {
      console.warn('logCloseDateMove:', err?.message || err);
    }
  };

  const notifyManager = async (dealObj, oldAmount, newAmount, reason) => {
    try {
      const { data: owner } = await supabase
        .from('users')
        .select('id, full_name, reports_to')
        .eq('id', dealObj.owner_id)
        .single();
      if (!owner?.reports_to) return;
      const diff = newAmount - oldAmount;
      const sign = diff > 0 ? '+' : '';
      const desc = `Amount: ${formatCurrency(oldAmount, preferredCurrency)} → ${formatCurrency(
        newAmount, preferredCurrency,
      )} (${sign}${formatCurrency(diff, preferredCurrency)})`;
      await supabase.from('notifications').insert({
        user_id:    owner.reports_to,
        company_id: company?.id,
        type:       'deal_changed',
        title:      '✏️ Deal Modified',
        message: `${owner.full_name} changed deal "${dealObj.title || 'Unknown'}": ${desc}. Reason: "${reason}"`,
        is_read:    false,
        metadata:   { deal_id: dealObj.id, old_amount: oldAmount, new_amount: newAmount, reason },
      });
    } catch (_) { /* notifications are best-effort */ }
  };

  // Confirm the change reason, then resume the paused save with it.
  const handleConfirmEditReason = async () => {
    if (!editReason.trim()) {
      setEditReasonError('Please explain why you are making this change');
      return;
    }
    setEditReasonError('');
    setShowEditReason(false);
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) await executeSave(pending, editReason.trim());
  };

  const executeSave = async (dealData, reasonText = null) => {
    // Amount-change gate: an existing deal whose amount differs from what's stored
    // needs a free-text reason before saving (covers direct amount edits and any
    // product/quantity change that alters the deal total, since amount is
    // recalculated from the line items above).
    // Round to halalas so the product-sum recalculation's float noise can't
    // trigger a spurious "amount changed" prompt on an otherwise-unedited save.
    const oldAmount = Math.round(parseFloat(deal?.amount || 0) * 100) / 100;
    const newAmount = Math.round(parseFloat(dealData.amount || 0) * 100) / 100;
    const amountChanged = !!deal?.id && oldAmount !== newAmount;

    // One exception to that gate: the Quantity Increase reconciliation panel. It
    // already demanded a structured reason — which line, old and new qty/rate —
    // so asking again for free text adds a second prompt and says less. The
    // exception is deliberately narrow: it applies only when the amount being
    // saved is exactly the total that panel produced, so any later edit through
    // any other path (or at Lead/Contact Made, where lines are editable anyway)
    // still asks. The change is still logged and the manager still notified,
    // using the panel's own description instead of typed text.
    const panelChange = reconcileChangeRef.current;
    const fromReconcilePanel =
      amountChanged && panelChange.amount != null && panelChange.amount === newAmount && panelChange.notes.length > 0;
    const effectiveReason =
      reasonText || (fromReconcilePanel ? `Quantity Increase reconciliation — ${panelChange.notes.map((n) => n.text).join('; ')}` : null);

    if (amountChanged && !effectiveReason) {
      pendingSaveRef.current = dealData;
      setEditReason('');
      setEditReasonError('');
      setShowEditReason(true);
      return;
    }

    setIsSaving(true);
    try {
      // Feature 3A: lock initial_amount on first creation — never overwrite after that
      if (!deal?.id) dealData.initial_amount = dealData.amount;
      const savedDeal = await onSave(dealData);

      // Record the amount change + notify the owner's manager (best-effort).
      if (amountChanged && effectiveReason && (savedDeal?.id || deal?.id)) {
        await logAmountChange(deal, oldAmount, newAmount, effectiveReason, dealData.stage);
      }

      // Record a close date pushed to a LATER date, so the Pipeline Origin
      // Breakdown can show the deal as transferred out of its period rather than
      // lost in it. Only later moves are logged — pulling a date forward is not
      // a transfer. Best-effort: logged after the save succeeded, and a failure
      // (including the table not existing yet) never touches the save.
      await logCloseDateMove(deal, dealData.expected_close_date);

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
            product.cost_price || null,
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
          // Credit the DEAL'S OWNER, never whoever happened to close it. The old
          // `|| user?.id` fallback moved a salesman's revenue onto the closer's
          // target — and once the save had already rewritten owner_id, it was not
          // even reached: savedDeal.owner_id WAS the closer. Ownership now
          // survives an edit, so this reads the true owner; with no owner, credit
          // nobody rather than silently crediting whoever clicked.
          const targetUserId = savedDeal.owner_id;
          const companyId = savedDeal.company_id || company?.id;
          if (!targetUserId) throw new Error('Deal has no owner; skipping target credit.');
          const { data: targets } = await salesTargetService.getMyTargets(companyId, targetUserId);
          const closeDate = savedDeal.closed_at
            ? new Date(savedDeal.closed_at)
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
    if (!formData.title?.trim())       newErrors.title         = t("deals.dealTitleRequired");
    if (!formData.description?.trim()) newErrors.description   = t("deals.descriptionRequired");
    if (!formData.creation_date)       newErrors.creation_date = t("deals.creationDateRequired");
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});

    // Ownership is decided by WHICH ACTION this is, never by who is at the screen:
    //
    //   CREATE — the creator becomes the owner.
    //   EDIT   — `owner_id` is omitted ENTIRELY, so the stored value is never
    //            touched, whoever is editing.
    //
    // This read `owner_id: user?.id` unconditionally on both paths. formData
    // carries no owner_id (the real owner was never loaded into form state), so
    // every save by a manager on a team member's deal transferred that deal to
    // the manager — 10 deals, ~1.42M SAR, moved this way before it was caught.
    //
    // Omitting the key is only safe because handleDealSave() sends edits through
    // a real UPDATE. Under the previous upsert it was NOT: an upsert runs as
    // INSERT ... ON CONFLICT, whose INSERT policy WITH CHECK is evaluated against
    // the candidate row, where the omitted owner_id is NULL — failing
    // `owner_id = auth.uid() OR can_manage_user_contacts(auth.uid(), owner_id)`
    // for EVERY user and blocking all deal saves in production. The two changes
    // belong together; do not reintroduce an upsert on the edit path.
    const isEdit = Boolean(deal?.id);
    const dealData = {
      ...formData,
      ...(isEdit ? { id: deal.id } : { owner_id: user?.id }),
      amount:     parseFloat(formData.amount) || 0,
      currency:   preferredCurrency,
      contact_id: formData.contact_id || null,
      // Expected close date is optional — send null (not "") so a blank value
      // doesn't fail the insert on the date column.
      expected_close_date: formData.expected_close_date || null,
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

    // Feature 1: block save if any product has missing qty or price
    const productsToValidate = deal?.id ? dealProducts : selectedProducts;
    if (productsToValidate.length > 0) {
      const prodErrors = validateProducts(productsToValidate);
      if (prodErrors.length > 0) {
        setProductErrors(prodErrors);
        document.querySelector('[data-section="products"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    setProductErrors([]);

    // Feature 3D: when marking Won with no final value yet, prompt user.
    // Compare against dealData.amount — the value being saved NOW (recalculated
    // from the product lines above) — never the `deal` prop, which is the deal as
    // it was before this edit. Reading the prop meant that changing the price and
    // marking Won in one save asked about the OLD price, and "Yes" stored the old
    // price as final_amount (the value Achieved counts) next to the new amount.
    if (formData.stage === 'won' && deal?.id && !deal.final_amount && !showFinalValue) {
      const currentValue = dealData.amount || 0;
      const sameValue = window.confirm(
        `Is the closed value the same as the current deal value?\n${formatCurrency(currentValue, preferredCurrency)}`
      );
      if (sameValue) {
        dealData.final_amount          = currentValue;
        dealData.value_change_reason   = 'no_change';
        dealData.value_changed_at      = new Date().toISOString();
        dealData.value_changed_by      = user?.id;
      } else {
        // Open the final-value section pre-filled with the value just entered, so
        // the user only adjusts it and picks a reason (Feature 3C below) instead
        // of retyping it. Nothing is saved on this pass.
        setFinalAmount(String(Math.round(currentValue * 100) / 100));
        setShowFinalValue(true);
        return;
      }
    }

    // Feature 3C: include final value fields if the section is open
    if (showFinalValue && finalAmount && deal?.id && !dealData.final_amount) {
      if (!changeReason) {
        setErrors(prev => ({ ...prev, finalValue: 'Please select a reason for the value change' }));
        return;
      }
      if (changeReason === 'other' && !changeNotes.trim()) {
        setErrors(prev => ({ ...prev, finalValue: 'Please add a comment for Other reason' }));
        return;
      }
      // A quantity increase must be reflected in the product lines themselves.
      // Without this, final_amount rises while the lines keep the old quantities
      // and the two silently disagree from then on.
      if (!reconcileSatisfied) {
        setErrors(prev => ({
          ...prev,
          finalValue: openSessionPending
            ? 'Product line editing is open: change a line and save it, or press Done to close without changes.'
            : 'Quantity Increase: update the quantity (or rate) on at least one product line below, so the line items match the new value.',
        }));
        document.querySelector('[data-section="qty-reconcile"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      dealData.final_amount          = parseFloat(finalAmount);
      dealData.value_change_reason   = changeReason;
      dealData.value_change_notes    = changeNotes || null;
      dealData.value_changed_at      = new Date().toISOString();
      dealData.value_changed_by      = user?.id;
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

  // Move this deal to Future Orders: create a pending future_orders row for the
  // chosen month, then remove the deal from the Funnel (cascade if it has refs).
  // Validate the target month, then require a replacement opportunity before the
  // deal actually leaves the Funnel (the replacement modal calls completeMoveToFuture).
  const handleMoveToFuture = () => {
    if (!deal?.id) return;
    setMoveError('');
    if (!moveMonth) { setMoveError('Please choose a target month.'); return; }
    const selected = new Date(`${moveMonth}-01`);
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    if (selected <= currentMonth) {
      setMoveError('Choose a future month (next month or later).');
      return;
    }
    setShowMoveFuture(false);
    setShowReplacement(true);
  };

  // Complete the move once the mandatory replacement opportunity is saved.
  const completeMoveToFuture = async () => {
    if (!deal?.id) return;
    setMovingFuture(true);
    try {
      const c = contacts.find((x) => x.id === deal.contact_id);
      const customerName =
        (c && (c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim())) ||
        deal.title || 'Deal';

      const { error: insErr } = await supabase.from('future_orders').insert({
        company_id:     company?.id,
        owner_id:       deal.owner_id || user?.id,
        created_by:     user?.id,
        contact_id:     deal.contact_id || null,
        customer_name:  customerName,
        planned_amount: parseFloat(deal.amount) || 0,
        expected_month: `${moveMonth}-01`,
        status:         'pending',
        source_deal_id: deal.id,
      });
      if (insErr) throw insErr;

      // Remove the deal from the Funnel (cascade delete if it has references).
      const { data: refs } = await dealService.checkDealReferences(deal.id);
      const { error: delErr } = refs?.totalReferences > 0
        ? await dealService.deleteDealWithCascade(deal.id)
        : await dealService.deleteDeal(deal.id);
      if (delErr) throw delErr;

      setShowReplacement(false);
      onDelete?.(deal.id); // funnel drops the card
      onClose();
    } catch (err) {
      console.error('moveToFuture:', err);
      setMoveError(err.message || 'Could not move to Future Orders.');
      setShowReplacement(false);
    } finally {
      setMovingFuture(false);
    }
  };

  // Load activities for existing deals
  async function loadDealActivities() {
    if (!deal?.id) return;
    setActivitiesLoading(true);
    const { data } = await activityService.getActivitiesForDeal(deal.id);
    setDealActivities(data || []);
    setActivitiesLoading(false);
  }

  useEffect(() => {
    if (isOpen && deal?.id && showActivityLog) loadDealActivities();
  }, [isOpen, deal?.id, showActivityLog]); // eslint-disable-line

  // ── Tasks ───────────────────────────────────────────────────────────────────
  async function loadDealTasks() {
    if (!deal?.id) return;
    setLoadingTasks(true);
    const { data } = await taskService.getTasksForDeal(deal.id);
    setDealTasks(data || []);
    setLoadingTasks(false);
  }

  useEffect(() => {
    if (isOpen && deal?.id && showTaskSection) loadDealTasks();
  }, [isOpen, deal?.id, showTaskSection]); // eslint-disable-line

  const openTaskCount = dealTasks.filter((tk) => tk.status !== "completed").length;

  async function handleAddTask(e) {
    e?.preventDefault?.();
    if (!taskForm.title.trim() || !deal?.id) return;
    setSavingTask(true);
    try {
      // upsertTask sets company_id, created_by (on create), updated_at and
      // fires the assignment notifications.
      const { error } = await taskService.upsertTask(
        {
          title:       taskForm.title.trim(),
          description: taskForm.description.trim() || null,
          due_date:    taskForm.due_date || null,
          priority:    taskForm.priority,
          status:      "pending",
          task_type:   "general",
          deal_id:     deal.id,
          contact_id:  deal.contact_id || null,
          assigned_to: taskForm.assigned_to || user?.id,
        },
        user?.id,
        company?.id,
      );
      if (error) throw error;
      setTaskForm(emptyTaskForm);
      setShowAddTask(false);
      await loadDealTasks();
    } catch (err) {
      console.error("handleAddTask:", err);
    } finally {
      setSavingTask(false);
    }
  }

  async function handleToggleTaskStatus(taskId, currentStatus) {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    const { error } = await taskService.updateTask(taskId, {
      status:       newStatus,
      completed_at: newStatus === "completed" ? new Date().toISOString() : null,
    });
    if (!error) loadDealTasks();
  }

  // Feature 3: populate final value fields from existing deal data
  useEffect(() => {
    if (!isOpen || !deal?.id) return;
    if (deal.final_amount) {
      setFinalAmount(String(deal.final_amount));
      setChangeReason(deal.value_change_reason || '');
      setChangeNotes(deal.value_change_notes || '');
      setShowFinalValue(deal.final_amount !== deal.initial_amount);
    } else {
      setFinalAmount('');
      setChangeReason('');
      setChangeNotes('');
      setShowFinalValue(false);
    }
  }, [isOpen, deal?.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-300 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg shadow-enterprise-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Briefcase" size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-card-foreground">
                {deal ? t("deals.editDeal") : t("deals.newDeal")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {!deal && t("deals.createNewOpportunity")}
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
                        {dealProducts.length === 1 ? t("common.product") : t("common.products")}
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
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <Input
                label={t("deals.dealTitle")}
                type="text"
                placeholder={t("deals.enterDealTitle")}
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
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("deals.dealType")}</p>
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
                  {t("pipeline.byValue")}
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
                  {t("deals.byProduct")}
                </button>
              </div>
            </div>

            {/* Contact */}
            <div>
              <ContactSearchInput
                label={t("common.client")}
                contacts={contacts}
                value={formData?.contact_id || null}
                onChange={(contact) => {
                  handleInputChange("contact_id", contact?.id || "");
                  if (errors.contact_id) setErrors((prev) => ({ ...prev, contact_id: "" }));
                }}
                placeholder={t("deals.selectClient")}
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
                  label={`${t("deals.dealValue")} (${preferredCurrency})`}
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
                  {t("deals.autoCalculated")}
                </span>
                <span className="text-lg font-bold text-card-foreground">
                  {formatCurrency(formData?.amount || 0, preferredCurrency)}
                </span>
              </div>
            )}

            {/* Feature 3: Initial Value (locked) + Final Value — only for existing deals */}
            {deal?.id && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
                  <div>
                    <p className="text-xs font-medium text-blue-700">Initial Value</p>
                    <p className="text-xs text-blue-500 mt-0.5">Locked at deal creation</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-blue-700 tabular-nums">
                      {formatCurrency(deal?.initial_amount || deal?.amount || 0, preferredCurrency)}
                    </p>
                    <Icon name="Lock" size={14} className="text-blue-400" />
                  </div>
                </div>

                {!showFinalValue ? (
                  <button
                    type="button"
                    onClick={() => setShowFinalValue(true)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-blue-600 transition-colors"
                  >
                    <Icon name="Plus" size={13} />
                    Add final value (if different from initial)
                  </button>
                ) : (
                  <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-border">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-card-foreground">Final Value</p>
                      <button
                        type="button"
                        onClick={() => { setShowFinalValue(false); setFinalAmount(''); setChangeReason(''); setChangeNotes(''); }}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        Final Amount ({preferredCurrency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={finalAmount}
                        onChange={e => setFinalAmount(e.target.value)}
                        placeholder={String(deal?.initial_amount || deal?.amount || 0)}
                        className="w-full text-sm px-3 py-2 border border-border rounded-xl focus:outline-none focus:border-primary tabular-nums"
                      />
                      {finalAmount && (deal?.initial_amount || deal?.amount) && (() => {
                        const initial = parseFloat(deal.initial_amount || deal.amount);
                        const final   = parseFloat(finalAmount);
                        const diff    = final - initial;
                        const pct     = initial > 0 ? ((diff / initial) * 100).toFixed(1) : 0;
                        return (
                          <p className={`text-xs mt-1 flex items-center gap-1 ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <Icon name={diff >= 0 ? 'TrendingUp' : 'TrendingDown'} size={11} />
                            {diff >= 0 ? '+' : ''}{formatCurrency(diff, preferredCurrency)} ({diff >= 0 ? '+' : ''}{pct}%)
                          </p>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-2">
                        Reason for Change *
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {CHANGE_REASONS.map(reason => (
                          <button
                            key={reason.value}
                            type="button"
                            onClick={() => setChangeReason(reason.value)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors ${
                              changeReason === reason.value
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'border-border text-muted-foreground hover:bg-muted/50'
                            }`}
                          >
                            <Icon name={reason.icon} size={13} className="flex-shrink-0" />
                            <span className="leading-tight">{reason.label}</span>
                          </button>
                        ))}
                      </div>
                      {errors.finalValue && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <Icon name="AlertCircle" size={12} />
                          {errors.finalValue}
                        </p>
                      )}
                    </div>

                    {/* Quantity Increase → reconcile the product lines. The same
                        panel used everywhere else, pinned to this reason and
                        mandatory here: the value cannot rise for a quantity
                        increase while the lines keep the old quantities. */}
                    {finalValueReconcile && deal?.id && (
                      <div
                        data-section="qty-reconcile"
                        className={`rounded-xl border p-3 ${
                          reconcileSatisfied ? 'bg-green-50/60 border-green-200' : 'bg-amber-50 border-amber-300'
                        }`}
                      >
                        <div className="flex items-start gap-2 mb-3">
                          <Icon
                            name={reconcileSatisfied ? 'CheckCircle' : 'AlertTriangle'}
                            size={14}
                            className={`mt-0.5 flex-shrink-0 ${reconcileSatisfied ? 'text-green-600' : 'text-amber-600'}`}
                          />
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold ${reconcileSatisfied ? 'text-green-700' : 'text-amber-800'}`}>
                              {dealProducts.length === 0
                                ? 'No product lines on this deal — nothing to reconcile.'
                                : reconcileSatisfied
                                  ? `Product lines updated (${changedLineIds.length} of ${dealProducts.length}).`
                                  : 'Update the product lines to match the increase'}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Edit only the line(s) that actually changed. Each line saves on its own.
                            </p>
                          </div>
                        </div>
                        <ProductLineReconcilePanel
                          dealId={deal.id}
                          lines={dealProducts}
                          compareTo={parseFloat(finalAmount) || 0}
                          changedIds={changedLineIds}
                          onLineSaved={handleLineSaved}
                          onError={(msg) => setErrors((prev) => ({ ...prev, finalValue: msg }))}
                          formatCurrency={formatCurrency}
                          currency={preferredCurrency}
                        />
                      </div>
                    )}

                    {changeReason === 'other' && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          Comments *
                        </label>
                        <textarea
                          value={changeNotes}
                          onChange={e => setChangeNotes(e.target.value)}
                          rows={2}
                          placeholder="Describe the reason for the value change..."
                          className="w-full text-sm px-3 py-2 border border-border rounded-xl resize-none focus:outline-none focus:border-primary"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Stage, Priority, Creation Date, Close Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Select
                label={t("deals.dealStage")}
                options={stages}
                value={formData?.stage}
                onChange={(value) => {
                  handleInputChange("stage", value);
                  if (value !== "lost" && errors.lost_reason)
                    setErrors((prev) => ({ ...prev, lost_reason: "" }));
                }}
              />

              <Select
                label={t("tasks.priority")}
                options={priorities}
                value={formData?.priority}
                onChange={(value) => handleInputChange("priority", value)}
              />

              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  {t("deals.creationDate")} <span className="text-destructive">*</span>
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
                label={`${t("deals.expectedCloseDate")} (${t("common.optional") || "optional"})`}
                type="date"
                value={formData?.expected_close_date || ""}
                onChange={(e) =>
                  handleInputChange("expected_close_date", e?.target?.value || null)
                }
              />
            </div>

            {/* Lost reason summary — shown when stage is already 'lost' and code is set */}
            {formData?.stage === "lost" && formData?.lost_reason_code && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
                <Icon name="XCircle" size={15} className="flex-shrink-0" />
                <div className="flex-1">
                  <span className="font-medium">{t("deals.lostReasonRecorded")}: </span>
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
                  {t("deals.changeLostReason")}
                </button>
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                {t("common.description")} <span className="text-destructive">*</span>
              </label>
              <textarea
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none ${
                  errors.description ? "border-destructive" : "border-border"
                }`}
                rows={3}
                placeholder={t("deals.addNotes")}
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
            <div data-section="products" className="border border-border rounded-lg overflow-hidden">
              {/* Section header with toggle button */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
                <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                  <Icon name="Package" size={16} />
                  {t("deals.dealProductsSection")}
                  {(deal ? dealProducts : selectedProducts).length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                      {(deal ? dealProducts : selectedProducts).length} added
                    </span>
                  )}
                </h3>
                {/* Adding lines to a SAVED deal needs the same reason-backed
                    session as editing one — this button was previously open at
                    every stage, including Won, which left a way to change a
                    deal's value with nothing recorded. A deal being created is
                    exempt: its lines are not saved yet. */}
                {(!deal?.id || canAddRemoveProducts) && (
                <button
                  type="button"
                  onClick={() => setShowProductPicker(p => !p)}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <Icon name={showProductPicker ? "ChevronUp" : "Plus"} size={14} />
                  {showProductPicker ? 'Hide Products' : 'Select Products'}
                </button>
                )}
              </div>

              {/* Multi-select product picker panel */}
              {showProductPicker && (
                <ProductPickerPanel
                  products={filteredProducts}
                  productGroups={productGroups}
                  productGroup={pickerGroup}
                  setProductGroup={setPickerGroup}
                  productSearch={pickerSearch}
                  setProductSearch={setPickerSearch}
                  selectedProductIds={selectedProductIds}
                  setSelectedProductIds={setSelectedProductIds}
                  productPrices={productPrices}
                  setProductPrices={setProductPrices}
                  loading={productsLoading}
                  onAddSelected={handleAddSelectedProducts}
                  isLoadingProducts={isLoadingProducts}
                />
              )}

              {/* Added products list */}
              <div className="p-4 space-y-4">
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
                            {t("deals.productsAdded")} ({productsToShow.length})
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
                              <span>{t("deals.lowMarginWarning")}</span>
                            </div>
                          ) : null;
                        })()}

                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {productsToShow.map((item, idx) => {
                            const productData  = item.product;
                            const qtyError     = productErrors.find(e => e.index === idx && e.field === 'quantity');
                            const priceError   = productErrors.find(e => e.index === idx && e.field === 'price');
                            const currentQty   = parseFloat(item.uom_value || item.quantity || 0);
                            const currentPrice = parseFloat(item.unit_price || 0);
                            const liveTotal    = parseFloat(item.line_total) || currentQty * currentPrice;
                            const cp = parseFloat(item.cost_price || item.product?.cost_price || 0);
                            const liveQty = currentQty;
                            const mp = liveTotal > 0 ? ((liveTotal - liveQty * cp) / liveTotal) * 100 : null;

                            return (
                              <div
                                key={deal ? item.id : idx}
                                className={`rounded-md p-3 flex items-center justify-between text-sm group ${
                                  qtyError || priceError ? 'border border-red-200 bg-red-50' : 'bg-muted/30'
                                }`}
                              >
                                {/* Product name + group */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Icon name="Package" size={14} className="text-primary flex-shrink-0" />
                                    <span className="font-medium text-card-foreground truncate">{productData?.material}</span>
                                    {(() => {
                                      const grp = item.product_group_name || productData?.material_group;
                                      return grp ? (
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full flex-shrink-0">{grp}</span>
                                      ) : null;
                                    })()}
                                  </div>
                                </div>

                                {/* Values — display only. Lines are changed through
                                    the reason-gated panel below (every stage), never
                                    by clicking a number here. */}
                                <div className="flex items-center gap-2 ml-4 text-xs">
                                  <span className="text-muted-foreground">
                                    {(item.uom_type || 'QTY').toUpperCase()}:{' '}
                                    <span className={`font-semibold ${qtyError ? 'text-red-600' : 'text-card-foreground'}`}>
                                      {currentQty > 0 ? currentQty.toFixed(2) : '—'}
                                    </span>
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t("deals.rate")}:{' '}
                                    <span className={`font-semibold ${priceError ? 'text-red-600' : 'text-card-foreground'}`}>
                                      {currentPrice > 0 ? formatCurrency(currentPrice, preferredCurrency) : '—'}
                                    </span>
                                  </span>
                                  {mp != null && userProfile?.role !== 'salesman' && (
                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                      mp >= 20 ? 'bg-green-100 text-green-700' : mp >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                    }`}>{mp.toFixed(1)}%</span>
                                  )}
                                  <span className="text-primary font-semibold tabular-nums">
                                    {t("common.total")}:{' '}
                                    {formatCurrency(liveTotal, preferredCurrency)}
                                  </span>
                                  {/* Removing a line needs the same reason-backed session
                                      as editing one; a deal being created is exempt,
                                      its lines are not saved yet. */}
                                  {(!deal?.id || canAddRemoveProducts) && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveProduct(deal ? item.id : idx)}
                                      disabled={isLoadingProducts}
                                      className={`text-destructive hover:text-destructive/80 disabled:opacity-50 ml-1 ${deal?.id ? 'opacity-0 group-hover:opacity-100 transition-opacity' : ''}`}
                                      title={t("deals.removeProduct")}
                                    >
                                      <Icon name="Trash2" size={14} />
                                    </button>
                                  )}
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
                              <span>{t("deals.dealGrossMargin")}</span>
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

                {/* Feature 1: product error summary */}
                {productErrors.length > 0 && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    <Icon name="AlertCircle" size={13} className="flex-shrink-0 mt-0.5" />
                    <div>
                      {productErrors.map((e, i) => <p key={i}>{e.message}</p>)}
                    </div>
                  </div>
                )}

                {/* Negotiation — lines stay editable, but only once a reason for
                    this edit session is chosen, and every change is recorded. */}
                {/* One affordance at EVERY stage: product lines change only here,
                    behind a reason, and every change is recorded. The Final Value
                    flow's Quantity Increase step shows the same panel, so this one
                    stays out of the way while that is open. */}
                {deal?.id && isLostDeal && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                    <Icon name="Lock" size={11} />
                    Products are locked — this deal is Lost. Its lines stay as they were quoted.
                  </p>
                )}

                {deal?.id && !isLostDeal && !finalValueReconcile && (
                  <div className="mt-2">
                    {!lineEditorOpen ? (
                      <button
                        type="button"
                        onClick={() => setLineEditorOpen(true)}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <Icon name="Pencil" size={13} />
                        Edit product lines
                      </button>
                    ) : (
                      <div className={`rounded-xl border p-3 ${lineEditReason ? 'bg-green-50/60 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon
                            name={lineEditReason ? 'Unlock' : 'Lock'}
                            size={13}
                            className={lineEditReason ? 'text-green-600' : 'text-blue-600'}
                          />
                          <span className={`text-xs font-semibold ${lineEditReason ? 'text-green-700' : 'text-blue-700'}`}>
                            Why are the product lines changing?
                          </span>
                          <select
                            value={lineEditReason}
                            onChange={(e) => setLineEditReason(e.target.value)}
                            className="text-xs px-2 py-1 border border-border rounded-lg bg-card focus:outline-none focus:border-primary"
                          >
                            <option value="">Select a reason…</option>
                            {CHANGE_REASONS.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={endLineEditSession}
                            className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                          >
                            Done
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 mb-2">
                          {lineEditReason
                            ? 'Edit a qty or rate and save that line, or add/remove products. Each change is recorded against this deal with your name and this reason.'
                            : 'Pick a reason to unlock the lines. Every change is recorded, at every stage.'}
                        </p>
                        {lineEditReason && (
                          <ProductLineReconcilePanel
                            dealId={deal.id}
                            lines={dealProducts}
                            changedIds={changedLineIds}
                            onLineSaved={handleLineSaved}
                            onError={(msg) => setErrors((prev) => ({ ...prev, finalValue: msg }))}
                            formatCurrency={formatCurrency}
                            currency={preferredCurrency}
                          />
                        )}
                        {openSessionPending && (
                          <p className="text-[11px] text-amber-700 mt-2 flex items-center gap-1">
                            <Icon name="AlertTriangle" size={11} />
                            Save is disabled until a line actually changes — or press Done to close without changes.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!deal && selectedProducts.length === 0 && !showProductPicker && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Icon
                      name="Package"
                      size={24}
                      className="mx-auto mb-2 opacity-50"
                    />
                    <p className="text-sm">{t("deals.noProductsYet")}</p>
                    <p className="text-xs">
                      {t("deals.addProductsDescription")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Amount change history — existing deals that have recorded changes */}
          {deal?.id && changeHistory.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 flex items-center gap-2">
                <Icon name="History" size={15} className="text-amber-600" />
                <span className="text-sm font-medium text-card-foreground">Change History</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
                  {changeHistory.length}
                </span>
              </div>
              <div className="p-3 space-y-2">
                {changeHistory.map((change) => {
                  const up = parseFloat(change.new_amount) > parseFloat(change.old_amount);
                  const isAmount = change.change_type === 'amount';
                  return (
                    <div key={change.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-xl">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          isAmount
                            ? up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {isAmount ? (up ? '↑' : '↓') : '✎'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground capitalize mb-0.5">
                          {change.change_type} changed by {change.changed_by_user?.full_name || 'Unknown'}
                        </div>
                        {isAmount ? (
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {formatCurrency(parseFloat(change.old_amount) || 0, preferredCurrency)}
                            {' → '}
                            {formatCurrency(parseFloat(change.new_amount) || 0, preferredCurrency)}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            "{change.old_value}" → "{change.new_value}"
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground italic mt-1">"{change.reason}"</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {new Date(change.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                          {change.stage_at_change && (
                            <> · Stage: <span className="capitalize">{change.stage_at_change}</span></>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity Log — only shown when editing an existing deal */}
          {deal?.id && (
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Toggle header */}
              <button
                type="button"
                onClick={() => setShowActivityLog(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Icon name="Activity" size={15} className="text-blue-600" />
                  <span className="text-sm font-medium text-card-foreground">Activity Log</span>
                  {dealActivities.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                      {dealActivities.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setShowLogActivityModal(true); }}
                    className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-1"
                  >
                    <Icon name="Plus" size={12} /> Log
                  </button>
                  <Icon name={showActivityLog ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground" />
                </div>
              </button>

              {showActivityLog && (
                <div className="p-4 bg-white">
                  {dealActivities.length === 0 && !activitiesLoading ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-muted-foreground">No activities logged yet</p>
                      <button
                        type="button"
                        onClick={() => setShowLogActivityModal(true)}
                        className="mt-2 text-sm text-blue-600 hover:underline"
                      >
                        Log first activity
                      </button>
                    </div>
                  ) : (
                    <ActivityTimeline
                      activities={dealActivities}
                      loading={activitiesLoading}
                      onDelete={async (id) => {
                        await activityService.deleteActivity(id);
                        loadDealActivities();
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tasks — create & view deal-linked tasks inline (existing deals only) */}
          {deal?.id && (
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Toggle header */}
              <button
                type="button"
                onClick={() => setShowTaskSection(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Icon name="CheckSquare" size={15} className="text-blue-600" />
                  <span className="text-sm font-medium text-card-foreground">Tasks</span>
                  {openTaskCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                      {openTaskCount} open
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {showTaskSection && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setShowAddTask(v => !v); }}
                      className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-1"
                    >
                      <Icon name="Plus" size={12} /> Add Task
                    </button>
                  )}
                  <Icon name={showTaskSection ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground" />
                </div>
              </button>

              {showTaskSection && (
                <div className="p-4 bg-white space-y-3">
                  {/* Add task form */}
                  {showAddTask && (
                    <form onSubmit={handleAddTask} className="bg-muted/30 border border-border rounded-xl p-3 space-y-2">
                      <input
                        type="text"
                        placeholder="Task title *"
                        value={taskForm.title}
                        onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                        className="w-full text-sm px-3 py-2 border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={taskForm.due_date}
                          onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
                          className="flex-1 text-sm px-3 py-2 border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400"
                        />
                        <select
                          value={taskForm.priority}
                          onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}
                          className="flex-1 text-sm px-3 py-2 border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => { setShowAddTask(false); setTaskForm(emptyTaskForm); }}
                          className="text-xs px-3 py-1.5 text-muted-foreground hover:text-card-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!taskForm.title.trim() || savingTask}
                          className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium"
                        >
                          {savingTask ? "Saving…" : "Save Task"}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Task list */}
                  {loadingTasks ? (
                    <div className="text-xs text-muted-foreground py-2 text-center">Loading tasks…</div>
                  ) : dealTasks.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-3 text-center bg-muted/30 rounded-lg">
                      No tasks for this deal. Click "Add Task" to create one.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dealTasks.map(task => {
                        const isDone = task.status === "completed";
                        const isOverdue = task.due_date && !isDone && new Date(task.due_date) < new Date();
                        return (
                          <div
                            key={task.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                              isDone ? "bg-muted/40 border-border opacity-60" : "bg-white border-border"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleTaskStatus(task.id, task.status)}
                              className="mt-0.5 flex-shrink-0"
                              title={isDone ? "Mark as pending" : "Mark as completed"}
                            >
                              <Icon
                                name={isDone ? "CheckSquare" : "Square"}
                                size={16}
                                className={isDone ? "text-green-500" : "text-gray-300"}
                              />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : "text-card-foreground"}`}>
                                {task.title}
                              </p>
                              <div className="flex items-center flex-wrap gap-3 mt-1">
                                {task.due_date && (
                                  <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
                                    <Icon name="Calendar" size={11} />
                                    {new Date(task.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                  </span>
                                )}
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                  task.priority === "high"
                                    ? "bg-red-50 text-red-600"
                                    : task.priority === "medium"
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-gray-100 text-gray-500"
                                }`}>
                                  {task.priority}
                                </span>
                                {task.assigned_user && (
                                  <span className="text-xs text-muted-foreground">
                                    {task.assigned_user.full_name?.split(" ")[0]}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Link to full task page, pre-filtered to this deal */}
                  {dealTasks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate(`/task-management?dealId=${deal.id}`)}
                      className="w-full text-center text-xs text-muted-foreground hover:text-blue-600 pt-2 mt-1 border-t border-border transition-colors"
                    >
                      View all tasks for this deal in Task Management →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Log Activity Modal */}
        <LogActivityModal
          isOpen={showLogActivityModal}
          onClose={() => setShowLogActivityModal(false)}
          onSaved={(newActivity) => {
            setDealActivities(prev => [newActivity, ...prev]);
            if (!showActivityLog) setShowActivityLog(true);
          }}
          dealId={deal?.id}
          contactId={deal?.contact_id}
          contactName={deal?.contact?.company_name || deal?.title || ''}
        />

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
                  {t("deals.deleteDeal")}
                </h3>
              </div>

              {deleteReferences?.totalReferences > 0 ? (
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    {t("deals.deleteReferencesAffected")}
                  </p>
                  <ul className="space-y-2 text-sm">
                    {deleteReferences.references.deal_products > 0 && (
                      <li className="flex items-center text-amber-600">
                        <Icon name="Package" size={16} className="mr-2" />
                        {deleteReferences.references.deal_products} {t("deals.productsWillBeRemoved")}
                      </li>
                    )}
                    {deleteReferences.references.activities > 0 && (
                      <li className="flex items-center text-amber-600">
                        <Icon name="Activity" size={16} className="mr-2" />
                        {deleteReferences.references.activities} {t("deals.activitiesWillBeDeleted")}
                      </li>
                    )}
                    {deleteReferences.references.tasks > 0 && (
                      <li className="flex items-center text-amber-600">
                        <Icon name="CheckSquare" size={16} className="mr-2" />
                        {deleteReferences.references.tasks} {t("deals.tasksWillBeUnlinked")}
                      </li>
                    )}
                  </ul>
                  <p className="text-sm text-destructive mt-3 font-medium">
                    {t("deals.deleteWithReferences")}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">
                  {t("deals.cannotUndone")}
                </p>
              )}

              <div className="flex justify-end space-x-3">
                <Button
                  variant="ghost"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  loading={isDeleting}
                >
                  {isDeleting ? t("deals.deleting") : t("deals.deleteDeal")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center space-x-2">
            {deal && (
              <Button
                variant="ghost"
                onClick={handleDeleteClick}
                disabled={isSaving || isDeleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Icon name="Trash2" size={16} className={isRTL ? "ml-2" : "mr-2"} />
                {t("common.delete")}
              </Button>
            )}
            <Button
              variant="ghost"
              type="button"
              onClick={() => setShowMeetingModal(true)}
              disabled={isSaving || isDeleting}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Icon name="CalendarPlus" size={16} className={isRTL ? "ml-2" : "mr-2"} />
              {t("dashboard.scheduleMeeting")}
            </Button>
            {deal?.id && !["won", "lost"].includes(formData.stage) && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => { setMoveMonth(''); setMoveError(''); setShowMoveFuture(true); }}
                disabled={isSaving || isDeleting}
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              >
                <Icon name="CalendarClock" size={16} className={isRTL ? "ml-2" : "mr-2"} />
                Move to Future Orders
              </Button>
            )}
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
              {t("common.cancel")}
            </Button>
            <Button
              variant="default"
              onClick={handleSave}
              loading={isSaving}
              // Blocked until at least one product line is actually reconciled
              // (quantity-increase step only; see reconcileNeeded).
              disabled={isDeleting || !reconcileSatisfied}
              iconName="Save"
              iconPosition="left"
            >
              {isSaving
                ? t("deals.saving")
                : deal
                  ? t("deals.saveDeal")
                  : `${t("deals.createDeal")}${
                      selectedProducts.length > 0
                        ? ` (${selectedProducts.length} ${t("common.products")})`
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

      {/* Move to Future Orders — pick a target month, then remove from the Funnel */}
      {showMoveFuture && (
        <>
          <div
            className="fixed inset-0 z-[700] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowMoveFuture(false)}
          />
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden pointer-events-auto border border-border">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Icon name="CalendarClock" size={16} className="text-amber-600" /> Move to Future Orders
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This removes the deal from the Funnel and schedules it as a future order. It
                  returns to your Current Sales Plan automatically when the month arrives.
                </p>
              </div>
              <div className="px-6 py-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Target month *
                  </label>
                  <input
                    type="month"
                    min={nextMonthStr}
                    value={moveMonth}
                    onChange={(e) => { setMoveMonth(e.target.value); setMoveError(''); }}
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:border-amber-400"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Must be next month or later.</p>
                </div>
                {moveError && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <Icon name="AlertTriangle" size={14} className="text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-700">{moveError}</p>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
                <button
                  onClick={() => setShowMoveFuture(false)}
                  className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMoveToFuture}
                  disabled={!moveMonth || movingFuture}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-500 text-white font-medium rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {movingFuture ? (
                    <Icon name="Loader2" size={14} className="animate-spin" />
                  ) : (
                    <Icon name="ArrowRight" size={14} />
                  )}
                  Move to Future Orders
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mandatory replacement opportunity before moving the deal to Future Orders.
          Cancelling keeps the deal in the Funnel (removal aborted). */}
      {showReplacement && deal && (
        <ReplacementModal
          removedDeal={deal}
          removalType="future_orders"
          onClose={() => setShowReplacement(false)}
          onSaved={completeMoveToFuture}
        />
      )}

      {/* Amount-change reason modal — appears over the deal editor */}
      {showEditReason && (
        <>
          <div
            className="fixed inset-0 z-[700] bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowEditReason(false); pendingSaveRef.current = null; }}
          />
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden pointer-events-auto border border-border">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border bg-amber-50">
                <h2 className="text-base font-semibold text-amber-800 flex items-center gap-2">
                  <Icon name="Pencil" size={16} /> Reason for Change
                </h2>
                <p className="text-xs text-amber-600 mt-0.5">
                  You changed the deal amount. Please explain why before saving.
                </p>
              </div>

              {/* Change summary */}
              <div className="px-6 py-4 border-b border-border bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Change Detected
                </p>
                {(() => {
                  const oldA = parseFloat(deal?.amount || 0);
                  const newA = parseFloat(pendingSaveRef.current?.amount ?? formData.amount ?? 0);
                  const up = newA > oldA;
                  const diff = newA - oldA;
                  return (
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="text-muted-foreground line-through tabular-nums">
                        {formatCurrency(oldA, preferredCurrency)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className={`font-semibold tabular-nums ${up ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(newA, preferredCurrency)} ({up ? '+' : ''}
                        {formatCurrency(diff, preferredCurrency)})
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Reason input */}
              <div className="px-6 py-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Reason for change *
                </label>
                <textarea
                  value={editReason}
                  onChange={(e) => { setEditReason(e.target.value); setEditReasonError(''); }}
                  placeholder="e.g. Customer negotiated a lower price after seeing a competitor quote…"
                  rows={4}
                  autoFocus
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm resize-none bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                    editReasonError ? 'border-destructive' : 'border-border'
                  }`}
                />
                {editReasonError && (
                  <p className="text-xs text-destructive mt-1.5">{editReasonError}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  This reason is visible to your manager and recorded in the deal history.
                </p>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
                <button
                  onClick={() => { setShowEditReason(false); setEditReason(''); setEditReasonError(''); pendingSaveRef.current = null; }}
                  className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                >
                  Go Back
                </button>
                <button
                  onClick={handleConfirmEditReason}
                  disabled={!editReason.trim()}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-500 text-white font-medium rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon name="Check" size={14} /> Save with Reason
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DealModal;
