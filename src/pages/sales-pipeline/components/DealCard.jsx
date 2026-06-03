import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useAuth } from "../../../contexts/AuthContext";
import { dealProductService } from "../../../services/supabaseService";
import { useLanguage } from "../../../i18n";
import { getDealProductSummary, getDealOrigin, getOriginLabel, getWonDealOrigin } from "../../../utils/dealGroupUtils";

// Fallback label map — kept in sync with the default seed list
const LOST_CODE_LABELS = {
  PRICE_HIGH:        "Price too high",
  PRICE_COMPETITOR:  "Competitor price",
  BUDGET_CUT:        "Budget cut",
  CREDIT_TERMS:      "Credit terms",
  LOCAL_COMPETITOR:  "Local competitor",
  IMPORT_COMPETITOR: "Import competitor",
  EXISTING_SUPPLIER: "Existing supplier",
  SPEC_MISMATCH:     "Spec mismatch",
  STOCK_DELAY:       "Stock/lead time",
  MOQ_HIGH:          "MOQ too high",
  QUALITY_CONCERN:   "Quality concern",
  PROJECT_CANCELLED: "Project cancelled",
  NO_RESPONSE:       "No response",
  DECISION_CHANGE:   "Decision changed",
  CUSTOMER_CLOSED:   "Customer closed",
  QUOTE_EXPIRED:     "Quote expired",
  LC_TERMS:          "LC terms",
  MARGIN_LOW:        "Margin too low",
  WITHDREW_OFFER:    "Withdrew offer",
  CAPACITY:          "Capacity",
};

const DealCard = ({ deal, onDealUpdate, onDealClick, showProductSummary = false, periodFrom }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(deal?.amount);
  const [productCount, setProductCount] = useState(0);
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const canSeeMargin = userProfile?.role !== "salesman";

  // Load product count
  useEffect(() => {
    const loadProductCount = async () => {
      const { data } = await dealProductService.getDealProducts(deal.id);
      setProductCount(data?.length || 0);
    };
    loadProductCount();
  }, [deal.id]);

  // --- Utility functions ---
  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year:
        date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  const getDaysUntilClose = (closeDate) => {
    if (!closeDate) return null;
    const today = new Date();
    const close = new Date(closeDate);
    const diff = Math.ceil((close - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // For won/lost deals, use closed_at date (or updated_at if null), otherwise use expected_close_date
  const isClosedDeal = deal?.stage === "won" || deal?.stage === "lost";
  const displayDate = isClosedDeal
    ? deal?.closed_at || deal?.updated_at
    : deal?.expected_close_date;
  const daysUntilClose = isClosedDeal
    ? null
    : getDaysUntilClose(deal?.expected_close_date);

  const getUrgencyColor = () => {
    if (isClosedDeal) return "text-gray-500";
    if (daysUntilClose < 0) return "text-orange-600";
    if (daysUntilClose <= 7) return "text-orange-600";
    if (daysUntilClose <= 30) return "text-blue-600";
    return "text-gray-500";
  };

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", deal.id);
    const dragImage = e.target.cloneNode(true);
    dragImage.style.transform = "rotate(5deg)";
    dragImage.style.width = "300px";
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 150, 30);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = (e) => {
    e.preventDefault();
    const allStages = document.querySelectorAll(".pipeline-stage");
    allStages.forEach((stage) => stage.classList.remove("bg-gray-50"));
  };

  // --- Handlers ---
  const handleAmountEdit = (e) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleAmountSave = () => {
    onDealUpdate(deal.id, { amount: parseFloat(editAmount) });
    setIsEditing(false);
  };

  // --- Render ---
  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
      onClick={() => onDealClick(deal)}
    >
      {/* --- Header --- */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 truncate">
            {deal?.title || t("deals.newDeal")}
          </h3>
          <p className="text-xs text-gray-500 truncate">
            {deal?.contact
              ? `${deal.contact.first_name} ${deal.contact.last_name}`
              : t("deals.selectContact")}
          </p>
          {showProductSummary && (() => {
            const summary = getDealProductSummary(deal);
            return summary ? (
              <div className="flex items-center gap-1 mt-1">
                <Icon name="Package" size={10} className="text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-400 truncate">{summary}</span>
              </div>
            ) : null;
          })()}
          {deal?.stage === "lost" && deal?.lost_reason_code && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                <Icon name="XCircle" size={9} />
                {LOST_CODE_LABELS[deal.lost_reason_code] || deal.lost_reason_code}
              </span>
              {deal?.lost_at && (
                <span className="text-[10px] text-gray-400">
                  {new Date(deal.lost_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          )}
          {/* Origin badge — open deals */}
          {periodFrom && deal.stage !== 'won' && deal.stage !== 'lost' && (() => {
            const origin = getDealOrigin(deal, periodFrom);
            const label  = getOriginLabel(deal, periodFrom);
            return label ? (
              <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded-full font-medium mt-0.5 ${
                origin === 'new' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
              }`}>
                {origin === 'new' ? '✦' : '↻'}{' '}{label}
              </span>
            ) : null;
          })()}
          {/* Origin badge — won deals */}
          {periodFrom && deal.stage === 'won' && (() => {
            const origin = getWonDealOrigin(deal, periodFrom);
            return (
              <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded-full font-medium mt-0.5 ${
                origin === 'won_new' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
              }`}>
                {origin === 'won_new' ? '✦ Won new' : '↻ Won carry'}
              </span>
            );
          })()}
        </div>
      </div>

      {/* --- Amount --- */}
      <div
        className="mb-3 flex items-center justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          <input
            type="number"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            onBlur={handleAmountSave}
            className="text-lg font-bold border-b border-gray-300 focus:border-primary outline-none px-1"
            autoFocus
          />
        ) : (
          <div
            className="flex items-center space-x-1"
            onClick={handleAmountEdit}
          >
            <span className="text-lg font-bold text-gray-900">
              {formatCurrency(
                deal?.amount,
                deal?.currency || preferredCurrency,
              )}
            </span>
            <Icon
              name="Edit2"
              size={12}
              className="text-gray-400 opacity-0 group-hover:opacity-100 transition"
            />
          </div>
        )}
      </div>

      {/* --- Margin Indicator --- */}
      {canSeeMargin && deal?.margin_pct != null && (
        <div className="mb-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            deal.margin_pct >= 20
              ? "bg-green-100 text-green-700"
              : deal.margin_pct >= 10
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700"
          }`}>
            <Icon name="TrendingUp" size={10} />
            {deal.margin_pct.toFixed(1)}% {t("pipeline.margin")}
          </span>
        </div>
      )}

      {/* --- Stage & Expected Close --- */}
      <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
        <div className="flex items-center space-x-1">
          <Icon name="Tag" size={12} className="text-gray-400" />
          <span className="capitalize">{deal?.stage || "unknown"}</span>
        </div>
        <div className="flex items-center space-x-1">
          <Icon name="Calendar" size={12} className="text-gray-400" />
          <span className={getUrgencyColor()}>
            {formatDate(displayDate)}
            {!isClosedDeal && daysUntilClose <= 7 && daysUntilClose >= 0
              ? ` (${daysUntilClose}d)`
              : ""}
            {!isClosedDeal && daysUntilClose < 0 ? ` (${t("pipeline.overdue")})` : ""}
          </span>
        </div>
      </div>

      {/* --- Products --- */}
      {productCount > 0 && (
        <div className="mb-2 flex items-center space-x-1 px-2 py-1 bg-blue-50 rounded text-xs text-blue-700">
          <Icon name="Package" size={12} />
          <span>
            {productCount} {productCount === 1 ? t("common.product") : t("common.products")}
          </span>
        </div>
      )}

      {/* --- Owner --- */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="User" size={10} className="text-primary" />
          </div>
          <span className="text-xs text-gray-500">
            {deal?.owner?.full_name || t("tasks.unassigned")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DealCard;
