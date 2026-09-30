import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../../../components/AppIcon";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { groupReturnsByInvoice, summariseReturns } from "../../../utils/returnsReconciliation";

// Every imported credit note for the company, rolled up by INVOICE. READ ONLY —
// no upload, no edit, no delete; importing stays on the Admin Dashboard, held
// by Admin alone.
//
// It exists because most returns currently match nothing: the majority of
// invoiced deals carry a placeholder invoice_number rather than the ERP's, so a
// credit note usually has no deal to attach to. Those rows reduce the company's
// Achieved and nobody's individual figure, which is correct but invisible —
// this is where a director can see what they are and why.
//
// No RLS change was needed: a director already reads matched rows through the
// hierarchy branch of the deal_returns SELECT policy and unmatched rows through
// its company branch.

const SAR = (n) => (Number(n) || 0).toLocaleString("en-US", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
// Quantities are a bare number by decision — deal_returns has no unit column,
// and the ERP export mixes pieces and tons in one field.
const QTY = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 3 }));
const DATE = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function ReturnsReconciliation({ companyId: companyIdProp }) {
  const { company } = useAuth();
  const companyId = companyIdProp || company?.id;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");      // all | matched | unmatched
  const [expanded, setExpanded] = useState({});     // invoiceNo -> bool

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError("");
    // deals(...) WITHOUT !inner, so unmatched rows still come back — an inner
    // join here is exactly what hid them from every other figure.
    const { data, error: e } = await supabase
      .from("deal_returns")
      .select(
        "id, return_date, credit_note_no, invoice_no, item_code, item_description, "
        + "return_qty, unit_price, return_amount, customer_name, deal_id, "
        + "deals(invoice_number, title, amount, final_amount, owner:users!owner_id(full_name))",
      )
      .eq("company_id", companyId)
      .order("return_date", { ascending: false });
    if (e) { setError(e.message || "Could not load returns."); setRows([]); }
    else setRows(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const groups = useMemo(() => groupReturnsByInvoice(rows), [rows]);
  const stats = useMemo(() => summariseReturns(groups), [groups]);
  const shown = useMemo(() => (
    filter === "matched" ? groups.filter((g) => g.matched)
      : filter === "unmatched" ? groups.filter((g) => !g.matched)
        : groups
  ), [groups, filter]);

  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="bg-card border border-border rounded-lg enterprise-shadow mb-8">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
            <Icon name="Undo2" size={16} className="text-orange-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">Returns reconciliation</h3>
            <p className="text-xs text-muted-foreground">
              Credit notes grouped by invoice, and whether each one found its deal
            </p>
          </div>
        </div>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={18} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="border-t border-border">
          {loading ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Loading returns…</p>
          ) : error ? (
            <p className="px-6 py-4 text-sm text-red-600">{error}</p>
          ) : groups.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No returns have been imported for this company yet.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 py-4 border-b border-border">
                {[
                  ["All invoices with returns", stats.invoices, stats.total, "all", "text-card-foreground"],
                  ["Matched to a deal", stats.matchedInvoices, stats.matchedTotal, "matched", "text-emerald-700"],
                  ["Unmatched (company total only)", stats.unmatchedInvoices, stats.unmatchedTotal, "unmatched", "text-orange-700"],
                ].map(([label, count, value, key, tone]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                      filter === key ? "border-orange-300 bg-orange-50/60" : "border-border hover:bg-muted"
                    }`}
                  >
                    <p className={`text-lg font-bold tabular-nums ${tone}`}>{SAR(value)}</p>
                    <p className="text-xs text-muted-foreground">
                      {label} · {count} invoice{count === 1 ? "" : "s"}
                    </p>
                  </button>
                ))}
              </div>

              <div className="px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-b border-border">
                <span>{stats.creditNoteCount} credit note{stats.creditNoteCount === 1 ? "" : "s"}</span>
                <span>{stats.lineCount} line{stats.lineCount === 1 ? "" : "s"}</span>
                {stats.overReturnedCount > 0 && (
                  <span className="text-red-600 font-medium">
                    {stats.overReturnedCount} invoice{stats.overReturnedCount === 1 ? "" : "s"} fully or over-returned
                  </span>
                )}
              </div>

              <div className="divide-y divide-border">
                {shown.map((g) => {
                  const isOpen = !!expanded[g.invoiceNo];
                  return (
                    <div key={g.invoiceNo}>
                      <button
                        onClick={() => toggle(g.invoiceNo)}
                        className="w-full text-left px-6 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={14} className="text-muted-foreground" />
                              <span className="text-sm font-semibold text-card-foreground">
                                Invoice {g.invoiceNo}
                              </span>
                              {g.matched ? (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  matched
                                </span>
                              ) : (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                                  unmatched
                                </span>
                              )}
                              {/* Only ever set for matched invoices — an unmatched
                                  credit note has no invoiced value to compare to. */}
                              {g.overReturned && (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                  returned in full or more — check
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 pl-5">
                              {g.customerName || "Unknown customer"}
                              {" · "}
                              {g.creditNoteCount} credit note{g.creditNoteCount === 1 ? "" : "s"}
                              {" · "}
                              {g.lineCount} line{g.lineCount === 1 ? "" : "s"}
                              {g.firstDate && ` · ${DATE(g.firstDate)}`}
                              {g.lastDate && g.lastDate !== g.firstDate && ` → ${DATE(g.lastDate)}`}
                            </p>
                            {g.matched && (
                              <p className="text-xs text-muted-foreground pl-5">
                                {g.dealTitle || "Deal"}
                                {g.ownerName && ` · ${g.ownerName}`}
                                {g.dealInvoiced != null && ` · invoiced ${SAR(g.dealInvoiced)} SAR`}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold tabular-nums text-card-foreground">
                              {SAR(g.total)} <span className="text-xs font-normal text-muted-foreground">returned</span>
                            </p>
                            {g.matched && g.remainingAfterReturns != null && (
                              <p className={`text-xs tabular-nums ${g.overReturned ? "text-red-600" : "text-muted-foreground"}`}>
                                {g.remainingAfterReturns >= 0
                                  ? `${SAR(g.remainingAfterReturns)} SAR of the invoice left`
                                  : `${SAR(Math.abs(g.remainingAfterReturns))} SAR more than invoiced`}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-6 pb-4 pl-11 space-y-3">
                          {g.creditNotes.map((cn) => (
                            <div key={cn.creditNoteNo} className="border border-border rounded-lg overflow-hidden">
                              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/50">
                                <p className="text-xs font-medium text-card-foreground">
                                  Credit note {cn.creditNoteNo}
                                  <span className="text-muted-foreground font-normal"> · {DATE(cn.date)}</span>
                                </p>
                                <p className="text-xs tabular-nums text-card-foreground">
                                  {SAR(cn.total)}
                                  {/* Running total, so a second instalment on the
                                      same invoice reads as cumulative. */}
                                  {g.creditNoteCount > 1 && (
                                    <span className="text-muted-foreground font-normal">
                                      {" "}· {SAR(cn.cumulative)} cumulative
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground border-b border-border">
                                      <th className="text-left font-medium px-3 py-1.5">Item</th>
                                      <th className="text-right font-medium px-3 py-1.5">Qty</th>
                                      <th className="text-right font-medium px-3 py-1.5">Unit price</th>
                                      <th className="text-right font-medium px-3 py-1.5">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cn.lines.map((ln) => (
                                      <tr key={ln.id} className="border-b border-border last:border-0">
                                        <td className="px-3 py-1.5">
                                          <span className="text-card-foreground">
                                            {ln.itemDescription || ln.itemCode || "—"}
                                          </span>
                                          {ln.itemCode && ln.itemDescription && (
                                            <span className="text-muted-foreground"> · {ln.itemCode}</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{QTY(ln.qty)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">
                                          {ln.unitPrice == null ? "—" : SAR(ln.unitPrice)}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-card-foreground">
                                          {SAR(ln.amount)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
