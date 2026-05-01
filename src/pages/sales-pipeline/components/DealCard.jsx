import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { dealProductService } from "../../../services/supabaseService";

const DealCard = ({ deal, onDealUpdate, onDealClick }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(deal?.amount);
  const [productCount, setProductCount] = useState(0);
  const { formatCurrency, preferredCurrency } = useCurrency();

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
    if (daysUntilClose < 0) return "text-red-600";
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
            {deal?.title || "Untitled Deal"}
          </h3>
          <p className="text-xs text-gray-500 truncate">
            {deal?.contact
              ? `${deal.contact.first_name} ${deal.contact.last_name}`
              : "No contact assigned"}
          </p>
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
            {!isClosedDeal && daysUntilClose < 0 ? " (Overdue)" : ""}
          </span>
        </div>
      </div>

      {/* --- Products --- */}
      {productCount > 0 && (
        <div className="mb-2 flex items-center space-x-1 px-2 py-1 bg-blue-50 rounded text-xs text-blue-700">
          <Icon name="Package" size={12} />
          <span>
            {productCount} {productCount === 1 ? "product" : "products"}
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
            {deal?.owner?.full_name || "Unassigned"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DealCard;
