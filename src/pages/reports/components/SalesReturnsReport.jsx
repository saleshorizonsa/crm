import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import Icon from "../../../components/AppIcon";
import { useAuth } from "../../../contexts/AuthContext";
import {
  fetchSalesReturns,
  toReturnRow,
  filterReturnRows,
  summariseReturnRows,
  ALL_RETURNS_ROLES,
} from "../../../services/salesReturnsReportService";
import { fmtPct } from "../../../utils/formatPct";

// SALES RETURNS — the register, read-only.
//
// Every credit note the viewer is entitled to see, not the last twenty. The
// Planning widget this complements shows a recent slice and is where returns are
// IMPORTED; nothing on this screen writes.
//
// MATCHED vs UNMATCHED is the column that matters. A matched return is linked to
// a deal and so reduces that salesman's Achieved in the month it was RAISED. An
// unmatched one is linked to nothing: it reduces nobody, and it is money the
// company has credited that no report nets off. Today every return in production
// is unmatched, which is why the tile says so in words rather than leaving a
// reader to infer it from a 0.00 somewhere else.

const monthValue = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const SalesReturnsReport = ({ formatCurrency }) => {
  const { user, company, userProfile } = useAuth();
  const role = userProfile?.role;

  const [raw, setRaw] = useState([]);
  const [scope, setScope] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters. The month range defaults to the whole of the current year, because
  // a credit note is rare and a one-month default would usually show nothing.
  const now = new Date();
  const [fromMonth, setFromMonth] = useState(`${now.getFullYear()}-01`);
  const [toMonth, setToMonth] = useState(monthValue(now));
  const [customer, setCustomer] = useState("");
  const [salesmanId, setSalesmanId] = useState("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    if (!company?.id || !user?.id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await fetchSalesReturns({
        companyId: company.id, userId: user.id, role,
      });
      if (cancelled) return;
      if (res.error) {
        setError(res.error.message || "Sales returns could not be loaded.");
        setRaw([]);
      } else {
        setError(null);
        setRaw((res.rows || []).map(toReturnRow));
      }
      setScope(res.scope);
      setTruncated(res.truncated);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [company?.id, user?.id, role]);

  // The salesmen to offer, taken from the rows themselves: a name only appears
  // when there is a return against one of their deals, which is the only useful
  // list here.
  const salesmen = useMemo(() => {
    const map = new Map();
    raw.forEach((r) => { if (r.salesmanId) map.set(r.salesmanId, r.salesman); });
    return [...map.entries()].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [raw]);

  const rows = useMemo(
    () => filterReturnRows(raw, { fromMonth, toMonth, customer, salesmanId, status }),
    [raw, fromMonth, toMonth, customer, salesmanId, status],
  );
  const totals = useMemo(() => summariseReturnRows(rows), [rows]);

  const onExport = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const sheet = rows.map((r) => ({
      "Return date": r.returnDate,
      "Credit note no": r.creditNoteNo,
      "Invoice no (on the return)": r.invoiceNo,
      "Invoice no (on the deal)": r.dealInvoiceNo,
      Customer: r.customer,
      Salesman: r.salesman,
      Deal: r.dealTitle,
      "Item code": r.itemCode,
      "Item description": r.itemDescription,
      "Materials group": r.materialsGroup,
      Qty: r.qty,
      "Unit price": r.unitPrice,
      "Credit amount": r.amount,
      Status: r.matched ? "Matched" : "Unmatched",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Sales Returns");
    // The totals the screen shows, so a reader of the file can reconcile it
    // against the screen without re-adding the column.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Measure: "Credit notes", Count: totals.count, Amount: totals.total },
      { Measure: "Matched (reduce Achieved)", Count: totals.matchedCount, Amount: totals.matchedTotal },
      { Measure: "Unmatched (reduce nobody)", Count: totals.unmatchedCount, Amount: totals.unmatchedTotal },
      { Measure: "Filter — months", Count: "", Amount: `${fromMonth} .. ${toMonth}` },
      { Measure: "Filter — status", Count: "", Amount: status },
      { Measure: "Filter — customer", Count: "", Amount: customer || "(any)" },
    ]), "Totals");
    XLSX.writeFile(wb, `JASCO_Sales_Returns_${fromMonth}_to_${toMonth}.xlsx`);
  }, [rows, totals, fromMonth, toMonth, status, customer]);

  const seesUnmatched = ALL_RETURNS_ROLES.includes(role);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Icon name="Loader" size={24} className="mb-3 animate-spin" />
        <p className="text-sm">Loading sales returns…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <span className="font-semibold">Sales returns could not be loaded.</span> {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* What this viewer is seeing, in words. A supervisor looking at a short
          list needs to know whether that is all there is or all they may see. */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {seesUnmatched
              ? "You are seeing every credit note in the company, matched and unmatched."
              : "You are seeing matched credit notes on your own team's deals. Unmatched credit notes are not linked to a deal, so they belong to no team and are visible to directors and admins only."}
          </span>
          <button
            type="button"
            onClick={onExport}
            disabled={!rows.length}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 disabled:opacity-50"
          >
            Export to Excel
          </button>
        </div>
        {truncated && (
          <p className="mt-1 text-amber-700">
            More rows exist than were loaded. Narrow the month range.
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">From month</span>
            <input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">To month</span>
            <input type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Customer, credit note or invoice</span>
            <input type="text" value={customer} onChange={(e) => setCustomer(e.target.value)}
              placeholder="search"
              className="min-w-[220px] rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Salesman</span>
            <select value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)}
              className="min-w-[160px] rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="all">All</option>
              {salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="all">All</option>
              <option value="matched">Matched</option>
              <option value="unmatched">Unmatched</option>
            </select>
          </label>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Credit notes", value: String(totals.count), sub: "in the filtered list", color: "text-gray-900" },
          { label: "Total credited", value: formatCurrency(totals.total), sub: "", color: "text-gray-900" },
          {
            label: "Matched",
            value: formatCurrency(totals.matchedTotal),
            sub: `${totals.matchedCount} · reduce Achieved in the month raised`,
            color: "text-green-700",
          },
          {
            label: "Unmatched",
            value: formatCurrency(totals.unmatchedTotal),
            sub: `${totals.unmatchedCount} · linked to no deal, so reduce nobody`,
            color: "text-amber-700",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{c.label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            {c.sub ? <p className="mt-0.5 text-xs text-gray-500">{c.sub}</p> : null}
          </div>
        ))}
      </div>

      {totals.unmatchedCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <span className="font-semibold">
            {formatCurrency(totals.unmatchedTotal)} across {totals.unmatchedCount}{" "}
            credit {totals.unmatchedCount === 1 ? "note" : "notes"} is not linked to a deal
          </span>{" "}
          ({fmtPct(totals.total > 0 ? (totals.unmatchedTotal / totals.total) * 100 : 0, 0)} of the
          credited total). An unmatched return reduces nobody&apos;s Achieved, so this money is
          credited to the customer and still counted as revenue on every report. A return matches
          by INVOICE NUMBER, so the usual cause is a deal whose invoice number does not match the
          credit note&apos;s.
        </div>
      )}

      {/* The list */}
      {!rows.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="mb-3 text-5xl">↩️</span>
          <p className="text-sm">No credit notes match these filters.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Return date</th>
                  <th className="px-4 py-2.5 text-left">Credit note</th>
                  <th className="px-4 py-2.5 text-left">Invoice no</th>
                  <th className="px-4 py-2.5 text-left">Customer</th>
                  <th className="px-4 py-2.5 text-left">Salesman</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 ? "bg-gray-50/40" : undefined}>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-700">{r.returnDate}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-700">{r.creditNoteNo}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-700">
                      {r.invoiceNo}
                      {/* The deal's number only appears when it differs — i.e.
                          when somebody corrected the deal after the import. */}
                      {r.dealInvoiceNo && r.dealInvoiceNo !== r.invoiceNo && (
                        <span className="block text-gray-400">deal: {r.dealInvoiceNo}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{r.customer || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.salesman || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-red-600">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.matched ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">Matched</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Unmatched</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td className="px-4 py-3 font-semibold text-gray-700" colSpan={5}>
                    {totals.count} credit {totals.count === 1 ? "note" : "notes"}
                    <span className="ml-2 font-normal text-gray-500">
                      matched {formatCurrency(totals.matchedTotal)} · unmatched {formatCurrency(totals.unmatchedTotal)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-red-700">
                    {formatCurrency(totals.total)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Read-only. Credit notes are imported on Planning → Sales Returns.
      </p>
    </div>
  );
};

export default SalesReturnsReport;
