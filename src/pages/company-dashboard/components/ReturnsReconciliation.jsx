import React, { useState, useEffect, useCallback } from "react";
import Icon from "../../../components/AppIcon";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";

// Every imported credit note for the company, with whether it found its
// invoice. READ ONLY — no upload, no edit, no delete; importing stays on the
// Admin Dashboard, held by Admin alone.
//
// It exists because most returns currently match nothing: the majority of
// invoiced deals carry a placeholder invoice_number rather than the ERP's, so
// a credit note usually has no deal to attach to. Those rows reduce the
// company's Achieved and nobody's individual figure, which is correct but
// invisible — this is where a director can see what they are and why.
//
// No RLS change was needed: a director already reads matched rows through the
// hierarchy branch of the deal_returns SELECT policy and unmatched rows
// through its company branch.

const SAR = (n) => (Number(n) || 0).toLocaleString("en-US", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export default function ReturnsReconciliation({ companyId: companyIdProp }) {
  const { company } = useAuth();
  const companyId = companyIdProp || company?.id;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all"); // all | matched | unmatched

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError("");
    // deals(...) WITHOUT !inner, so unmatched rows still come back — an inner
    // join here is exactly what hid them from every other figure.
    const { data, error: e } = await supabase
      .from("deal_returns")
      .select(
        "id, return_date, credit_note_no, invoice_no, customer_name, return_amount, deal_id, "
        + "deals(invoice_number, title, owner:users!owner_id(full_name))",
      )
      .eq("company_id", companyId)
      .order("return_date", { ascending: false });
    if (e) { setError(e.message || "Could not load returns."); setRows([]); }
    else setRows(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const matched = rows.filter((r) => r.deal_id);
  const unmatched = rows.filter((r) => !r.deal_id);
  const sum = (list) => list.reduce((s, r) => s + Math.abs(parseFloat(r.return_amount) || 0), 0);
  const shown = filter === "matched" ? matched : filter === "unmatched" ? unmatched : rows;

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
              Every imported credit note and whether it found its invoice
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
          ) : rows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No returns have been imported for this company yet.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 py-4 border-b border-border">
                {[
                  ["All returns", rows.length, sum(rows), "all", "text-card-foreground"],
                  ["Matched to an invoice", matched.length, sum(matched), "matched", "text-emerald-700"],
                  ["No matching invoice", unmatched.length, sum(unmatched), "unmatched", "text-amber-700"],
                ].map(([label, count, total, key, cls]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      filter === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className={`text-lg font-bold tabular-nums ${cls}`}>{SAR(total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} row{count === 1 ? "" : "s"}
                    </p>
                  </button>
                ))}
              </div>

              {/* Unmatched rows reduce the company total and nobody's personal
                  figure. Saying so here stops the split looking like a bug. */}
              {unmatched.length > 0 && (
                <p className="px-6 pt-3 text-xs text-muted-foreground">
                  Returns with no matching invoice reduce the company's Achieved, but are not
                  charged to any salesman — there is no deal to attribute them to.
                </p>
              )}

              <div className="max-h-96 overflow-y-auto px-6 py-3">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="text-left font-medium py-2">Date</th>
                      <th className="text-left font-medium py-2">Credit note</th>
                      <th className="text-left font-medium py-2">Invoice</th>
                      <th className="text-left font-medium py-2">Customer</th>
                      <th className="text-left font-medium py-2">Status</th>
                      <th className="text-right font-medium py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 font-mono text-xs whitespace-nowrap">{r.return_date}</td>
                        <td className="py-2 font-mono text-xs">{r.credit_note_no || "—"}</td>
                        <td className="py-2 font-mono text-xs">{r.invoice_no || "—"}</td>
                        <td className="py-2 truncate max-w-[16rem]">{r.customer_name || "—"}</td>
                        <td className="py-2">
                          {r.deal_id ? (
                            <span className="text-xs text-emerald-700">
                              {r.deals?.owner?.full_name || "matched"}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              no matching invoice
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-red-600 whitespace-nowrap">
                          −{SAR(r.return_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
