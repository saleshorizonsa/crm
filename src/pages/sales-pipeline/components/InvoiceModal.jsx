import React from "react";
import Icon from "../../../components/AppIcon";
import {
  parseInvoiceNumbers,
  formatInvoiceNumbers,
  isPlaceholderInvoice,
} from "../../../utils/invoiceNumber";

// THE invoice form — the only one. It was inline in the pipeline page, reachable
// only from "Mark as Invoiced", which meant that once a deal was invoiced its
// number could never be changed again: the card only printed it, and the deal
// modal has no invoice field at all. 42 invoiced JASCO PVC deals since 1 August
// 2026 (3,026,094 SAR) carry a number no credit note can match.
//
// So the same form now answers both questions, switched by `mode`:
//   'mark'    — record the invoice on a won deal (also sets is_invoiced)
//   'correct' — change the number on an already-invoiced deal
// Reusing it rather than copying it is the point: the validation, the
// normalisation preview and the refusal messages cannot drift apart, and
// utils/invoiceNumber.js stays the single definition of what a number is.

/** The refusal messages, named so both modes and the tests use one spelling. */
export const INVOICE_MESSAGES = {
  required: "Invoice number is required",
  placeholder:
    "PRE-CRM placeholders are history only. Enter the ERP invoice number, e.g. 93002906",
  junk: "Enter the ERP invoice number, e.g. 93002906",
  date: "Invoice date is required",
  reason: "A reason for the correction is required",
};

/**
 * One validator for both modes. Returns a field -> message object; empty means
 * valid.
 *
 * @param {{invoice_number?: string, invoice_date?: string, reason?: string}} form
 * @param {{requireReason?: boolean}} options
 */
export function validateInvoiceForm(form, { requireReason = false } = {}) {
  const errors = {};
  const typed = String(form?.invoice_number ?? "");

  // A real ERP number, not just "something". The old check accepted "1", "gg"
  // and "J5412"; a credit note can only find a deal BY its invoice number, so
  // each of those is permanently unmatchable. Several numbers are fine — one
  // deal can cover several invoices.
  if (!typed.trim()) errors.invoice_number = INVOICE_MESSAGES.required;
  else if (isPlaceholderInvoice(typed)) errors.invoice_number = INVOICE_MESSAGES.placeholder;
  else if (!parseInvoiceNumbers(typed).length) errors.invoice_number = INVOICE_MESSAGES.junk;

  if (!form?.invoice_date) errors.invoice_date = INVOICE_MESSAGES.date;

  // Only the correction asks for this. A number being changed after the fact
  // moves money between months and between people's Achieved, so "why" is part
  // of the record, not an optional note.
  if (requireReason && !String(form?.reason ?? "").trim()) {
    errors.reason = INVOICE_MESSAGES.reason;
  }

  return errors;
}

const SAR = (n) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n) || 0);

export default function InvoiceModal({
  deal,
  mode = "mark",
  form,
  errors = {},
  saving = false,
  result = null,
  onChange,
  onCancel,
  onConfirm,
}) {
  if (!deal) return null;
  const correcting = mode === "correct";

  // What the typed text normalises to, recomputed as they type so the modal can
  // show it before anything is saved.
  const parsed = parseInvoiceNumbers(form?.invoice_number);

  const field =
    "w-full border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-green-500/20";

  return (
    <>
      <div className="fixed inset-0 z-[700] bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden pointer-events-auto border border-border">
          <div className={`px-6 py-4 border-b border-border ${correcting ? "bg-amber-50" : "bg-green-50"}`}>
            <h2
              className={`text-base font-semibold flex items-center gap-2 ${
                correcting ? "text-amber-800" : "text-green-800"
              }`}
            >
              <Icon name={correcting ? "PencilLine" : "Receipt"} size={16} />
              {correcting ? "Correct invoice number" : "Mark as Invoiced"}
            </h2>
            <p
              className={`text-xs mt-0.5 font-medium truncate ${
                correcting ? "text-amber-600" : "text-green-600"
              }`}
            >
              {deal.title || deal.contact?.company_name || "Deal"}
            </p>
          </div>

          {/* After a correction: what actually happened to the returns, rather
              than closing and leaving the salesman to guess. */}
          {result ? (
            <div className="px-6 py-5 space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-sm font-medium text-emerald-900 flex items-center gap-2">
                  <Icon name="CheckCircle" size={14} /> Invoice number saved
                </p>
                <p className="text-xs text-emerald-800 mt-1 font-mono break-all">
                  {result.stored}
                </p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                {result.linked > 0 && (
                  <li className="text-emerald-700">
                    {result.linked} sales return{result.linked === 1 ? "" : "s"} now matched to this
                    deal and subtracted from Achieved in the month it was returned.
                  </li>
                )}
                {result.blocked > 0 && (
                  <li className="text-amber-700">
                    {result.blocked} matching return{result.blocked === 1 ? "" : "s"} found, but your
                    role cannot link returns — ask an admin or director to re-run the match.
                  </li>
                )}
                {result.ambiguous > 0 && (
                  <li className="text-amber-700">
                    {result.ambiguous} return{result.ambiguous === 1 ? "" : "s"} name an invoice that
                    another deal also carries, so {result.ambiguous === 1 ? "it was" : "they were"}{" "}
                    left alone rather than guessed at.
                  </li>
                )}
                {result.linked === 0 && result.blocked === 0 && result.ambiguous === 0 && (
                  <li>No unmatched sales return names these invoices.</li>
                )}
                {result.relinkError && (
                  <li className="text-destructive">
                    The number is saved, but re-matching returns failed: {result.relinkError}
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <div className="px-6 py-5 space-y-4">
              {correcting ? (
                <div className="p-3 bg-muted/40 border border-border rounded-xl">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Stored now
                  </p>
                  <p className="text-sm font-mono font-medium text-foreground break-all">
                    {deal.invoice_number || "(blank)"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Only the invoice number and date change. The amount, the stage, the owner and
                    whether the deal is invoiced are untouched.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-green-50 border border-green-100 rounded-xl flex items-center gap-3">
                  <Icon name="CheckCircle" size={16} className="text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-green-800">
                      Won Amount: {SAR(deal.final_amount || deal.amount || 0)} SAR
                    </p>
                    <p className="text-xs text-green-600">
                      This deal counts as Achievement once invoiced.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  ERP Invoice Number *
                </label>
                <input
                  type="text"
                  value={form?.invoice_number ?? ""}
                  onChange={(e) => onChange?.({ invoice_number: e.target.value })}
                  /* The old placeholder read "e.g. INV-2026-001", a format the
                     ERP has never used — it taught the shape this field is now
                     full of. */
                  placeholder="e.g. 93002906"
                  className={`${field} ${errors.invoice_number ? "border-destructive" : "border-border"}`}
                />
                {errors.invoice_number ? (
                  <p className="text-xs text-destructive mt-1">{errors.invoice_number}</p>
                ) : parsed.length > 0 ? (
                  /* What will actually be stored, before saving: the ERP's own
                     10-digit form, which is how the returns file writes it. */
                  <p data-testid="invoice-preview" className="text-xs text-green-700 mt-1">
                    {parsed.length === 1
                      ? "Will be saved as"
                      : `Will be saved as ${parsed.length} invoices:`}{" "}
                    <span className="font-mono font-medium">{formatInvoiceNumbers(parsed)}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    8–10 digits. Several invoices on one deal: separate them with{" "}
                    <span className="font-mono">/</span> or <span className="font-mono">,</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Invoice Date *
                </label>
                <input
                  type="date"
                  value={form?.invoice_date ?? ""}
                  onChange={(e) => onChange?.({ invoice_date: e.target.value })}
                  className={`${field} ${errors.invoice_date ? "border-destructive" : "border-border"}`}
                />
                {errors.invoice_date && (
                  <p className="text-xs text-destructive mt-1">{errors.invoice_date}</p>
                )}
              </div>

              {correcting && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Reason for correction *
                  </label>
                  <textarea
                    rows={2}
                    value={form?.reason ?? ""}
                    onChange={(e) => onChange?.({ reason: e.target.value })}
                    placeholder="e.g. the real ERP number was not available when the deal was invoiced"
                    className={`${field} resize-none ${
                      errors.reason ? "border-destructive" : "border-border"
                    }`}
                  />
                  {errors.reason ? (
                    <p className="text-xs text-destructive mt-1">{errors.reason}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Recorded on the deal's activity log with the old and new value.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors"
            >
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button
                onClick={onConfirm}
                disabled={saving}
                className={`flex items-center gap-2 px-5 py-2 text-sm text-white font-medium rounded-xl transition-colors disabled:opacity-50 ${
                  correcting ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {saving ? (
                  <Icon name="Loader2" size={14} className="animate-spin" />
                ) : (
                  <Icon name={correcting ? "Save" : "Receipt"} size={14} />
                )}
                {correcting ? "Save correction" : "Confirm Invoice"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
