import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { dealService } from "../../../services/supabaseService";
import { useAuth } from "../../../contexts/AuthContext";

// Hardcoded fallback used when the DB table doesn't exist yet
const FALLBACK_REASONS = [
  { code: "PRICE_HIGH",        label: "Price too high",                        category: "Price"       },
  { code: "PRICE_COMPETITOR",  label: "Competitor offered lower price",         category: "Price"       },
  { code: "BUDGET_CUT",        label: "Customer budget cut or frozen",          category: "Price"       },
  { code: "CREDIT_TERMS",      label: "Better credit terms elsewhere",          category: "Price"       },
  { code: "LOCAL_COMPETITOR",  label: "Lost to local competitor",               category: "Competition" },
  { code: "IMPORT_COMPETITOR", label: "Lost to cheaper imported product",       category: "Competition" },
  { code: "EXISTING_SUPPLIER", label: "Customer stayed with existing supplier", category: "Competition" },
  { code: "SPEC_MISMATCH",     label: "Specification did not match",            category: "Product"     },
  { code: "STOCK_DELAY",       label: "Stock unavailable or lead time too long",category: "Product"     },
  { code: "MOQ_HIGH",          label: "Minimum order quantity too high",        category: "Product"     },
  { code: "QUALITY_CONCERN",   label: "Quality concern raised",                 category: "Product"     },
  { code: "PROJECT_CANCELLED", label: "Project cancelled or postponed",         category: "Customer"    },
  { code: "NO_RESPONSE",       label: "Customer went silent",                   category: "Customer"    },
  { code: "DECISION_CHANGE",   label: "Decision maker changed",                 category: "Customer"    },
  { code: "CUSTOMER_CLOSED",   label: "Customer closed or restructured",        category: "Customer"    },
  { code: "QUOTE_EXPIRED",     label: "Quote expired before decision",          category: "Commercial"  },
  { code: "LC_TERMS",          label: "LC payment terms not accepted",          category: "Commercial"  },
  { code: "MARGIN_LOW",        label: "Margin too low to proceed",              category: "Commercial"  },
  { code: "WITHDREW_OFFER",    label: "We withdrew the offer",                  category: "Internal"    },
  { code: "CAPACITY",          label: "Capacity not available",                 category: "Internal"    },
];

const groupByCategory = (flat) =>
  flat.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

const CATEGORY_ORDER = ["Price", "Competition", "Product", "Customer", "Commercial", "Internal"];

const LostReasonModal = ({ isOpen, deal, onConfirm, onCancel }) => {
  const { company } = useAuth();
  const [grouped,      setGrouped]      = useState({});
  const [selectedCode, setSelectedCode] = useState("");
  const [notes,        setNotes]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [loadingReasons, setLoadingReasons] = useState(true);
  const [error,        setError]        = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSelectedCode("");
    setNotes("");
    setError("");

    const load = async () => {
      setLoadingReasons(true);
      if (company?.id) {
        const { grouped: g, flat, error: e } = await dealService.getLostReasons(company.id);
        if (!e && flat.length > 0) {
          setGrouped(g);
        } else {
          // Table not set up yet or empty — use fallback
          setGrouped(groupByCategory(FALLBACK_REASONS));
        }
      } else {
        setGrouped(groupByCategory(FALLBACK_REASONS));
      }
      setLoadingReasons(false);
    };
    load();
  }, [isOpen, company?.id]);

  const handleConfirm = async () => {
    if (!selectedCode) {
      setError("Please select a reason before confirming.");
      return;
    }
    setLoading(true);
    await onConfirm(selectedCode, notes.trim());
    setLoading(false);
  };

  if (!isOpen) return null;

  const categoryKeys = CATEGORY_ORDER.filter((c) => grouped[c]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
              <Icon name="XCircle" size={18} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Mark deal as lost</h2>
              {deal?.title && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                  {deal.title}
                </p>
              )}
            </div>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <div>
            <p className="text-sm font-medium text-foreground mb-3">
              Reason for loss <span className="text-red-500">*</span>
            </p>

            {loadingReasons ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
                <Icon name="Loader2" size={16} className="animate-spin" />
                Loading reasons…
              </div>
            ) : (
              <div className="space-y-3">
                {categoryKeys.map((cat) => (
                  <div key={cat}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                      {cat}
                    </div>
                    <div className="space-y-1">
                      {grouped[cat].map((opt) => {
                        const active = selectedCode === opt.code;
                        return (
                          <label
                            key={opt.code}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer border transition-colors ${
                              active
                                ? "bg-red-50 border-red-300 text-red-800"
                                : "border-transparent hover:bg-muted/60 text-foreground"
                            }`}
                          >
                            <input
                              type="radio"
                              name="lost_reason"
                              value={opt.code}
                              checked={active}
                              onChange={() => {
                                setSelectedCode(opt.code);
                                setError("");
                              }}
                              className="accent-red-600 flex-shrink-0"
                            />
                            <span className="text-sm">{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <Icon name="AlertCircle" size={12} />
                {error}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Additional notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Any extra context…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedCode || loading}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            {loading
              ? <><Icon name="Loader2" size={14} className="animate-spin" /> Saving…</>
              : <><Icon name="XCircle" size={14} /> Confirm Lost</>}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LostReasonModal;
