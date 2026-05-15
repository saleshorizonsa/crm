import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import ViewerHeader from "./ViewerHeader";

const VIEWER_STAGES = ["contact_made", "proposal_sent", "negotiation", "won"];
const STAGE_ORDER   = Object.fromEntries(VIEWER_STAGES.map((s, i) => [s, i]));

const STAGE_CONFIG = {
  contact_made:  { label: "Qualified",   bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   pill: "bg-blue-100 text-blue-700"   },
  proposal_sent: { label: "Proposal",    bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  pill: "bg-amber-100 text-amber-700"  },
  negotiation:   { label: "Negotiation", bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", pill: "bg-orange-100 text-orange-700" },
  won:           { label: "Won",         bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  pill: "bg-green-100 text-green-700"  },
};

const UOM_LABEL = { qty: "pcs", m: "m", ton: "ton" };

const fmtDate   = (d) => format(d, "yyyy-MM-dd");
const fmtDisplay = (iso) => { try { return format(new Date(iso), "d MMM yyyy"); } catch { return "—"; } };

const StageBadge = ({ stage }) => {
  const cfg = STAGE_CONFIG[stage] || { label: stage, pill: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.pill}`}>
      {cfg.label}
    </span>
  );
};

const SkeletonRow = () => (
  <tr className="animate-pulse">
    {[100, 140, 70, 180, 90, 110].map((w, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-4 bg-gray-200 rounded" style={{ width: w }} />
      </td>
    ))}
  </tr>
);

const SortIcon = ({ active, dir }) => (
  <span className={`ml-1 inline-block transition-colors ${active ? "text-blue-600" : "text-gray-300"}`}>
    {active && dir === "desc" ? "↓" : "↑"}
  </span>
);

function formatQty(dp) {
  const qty  = dp.quantity ?? dp.uom_value;
  const unit = UOM_LABEL[dp.uom_type] || dp.uom_type || "";
  if (qty == null) return unit || "";
  return `${qty}${unit ? " " + unit : ""}`;
}

// Resolve display name: prefer material code, fall back to description
function productLabel(dp) {
  return dp.product?.material || dp.product?.description || "Unknown Product";
}

function buildProductMap(dealList) {
  const map = new Map();
  dealList.forEach((deal) => {
    (deal.deal_products || []).forEach((dp) => {
      const desc  = productLabel(dp);
      const group = dp.product?.material_group || "";
      const qty   = Number(dp.quantity ?? dp.uom_value ?? 0);
      const unit  = UOM_LABEL[dp.uom_type] || dp.uom_type || "";
      const key   = `${desc}__${unit}`;
      if (map.has(key)) map.get(key).qty += qty;
      else               map.set(key, { desc, group, qty, unit });
    });
  });
  return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
}

const DATE_PRESETS = [
  { label: "This Month",  range: () => { const d = new Date(); return [fmtDate(startOfMonth(d)), fmtDate(endOfMonth(d))]; } },
  { label: "Last Month",  range: () => { const d = subMonths(new Date(), 1); return [fmtDate(startOfMonth(d)), fmtDate(endOfMonth(d))]; } },
  { label: "This Quarter",range: () => { const d = new Date(); return [fmtDate(startOfQuarter(d)), fmtDate(endOfQuarter(d))]; } },
  { label: "YTD",         range: () => [fmtDate(startOfYear(new Date())), fmtDate(new Date())] },
];

// ─── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV(deals) {
  const cols = ["Company", "Deal Title", "Stage", "Products", "Expected Close", "Owner"];
  const esc  = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const rows = deals.map((d) => {
    const products = (d.deal_products || [])
      .map((dp) => {
        const desc = productLabel(dp);
        const qty  = formatQty(dp);
        return qty ? `${desc} x ${qty}` : desc;
      })
      .join("; ");

    return [
      d.contact?.company_name || "",
      d.title || "",
      STAGE_CONFIG[d.stage]?.label || d.stage,
      products,
      d.expected_close_date ? fmtDisplay(d.expected_close_date) : "",
      d.owner?.full_name || "",
    ]
      .map(esc)
      .join(",");
  });

  const csv  = [cols.map(esc).join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `pipeline_${fmtDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ────────────────────────────────────────────────────────────
const PipelineView = () => {
  const { company, userProfile } = useAuth();

  const today = new Date();
  const [deals,          setDeals]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [lastUpdated,    setLastUpdated]    = useState(null);
  const [stageFilter,    setStageFilter]    = useState("");
  const [ownerFilter,    setOwnerFilter]    = useState("");
  const [companySearch,  setCompanySearch]  = useState("");
  const [productSearch,  setProductSearch]  = useState("");
  const [dateFrom,       setDateFrom]       = useState(fmtDate(startOfMonth(today)));
  const [dateTo,         setDateTo]         = useState(fmtDate(endOfMonth(today)));
  const [activePreset,   setActivePreset]   = useState("This Month");
  const [showStageSummary,  setShowStageSummary]  = useState(true);
  const [showProductTotals, setShowProductTotals] = useState(false);
  const [sortBy,  setSortBy]  = useState("");
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => {
    if (company?.id) fetchPipelineDeals(dateFrom, dateTo);
  }, [company?.id, dateFrom, dateTo]);

  // Defence-in-depth: non-viewers must not reach this page
  if (userProfile && userProfile.role !== "viewer") return <Navigate to="/" replace />;

  async function fetchPipelineDeals(from, to) {
    setLoading(true);
    const { data } = await supabase
      .from("deals")
      .select(`
        id, title, stage, expected_close_date, created_at,
        contact:contacts!contact_id(company_name),
        owner:users!owner_id(id, full_name),
        deal_products(
          quantity, uom_type, uom_value,
          product:products!product_id(material, description, material_group)
        )
      `)
      .eq("company_id", company.id)
      .in("stage", VIEWER_STAGES)
      .gte("created_at", from)
      .lte("created_at", to + "T23:59:59")
      .order("stage",               { ascending: false })
      .order("expected_close_date", { ascending: true });

    setDeals(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }

  const handleRefresh = () => fetchPipelineDeals(dateFrom, dateTo);

  const applyPreset = (preset) => {
    const [from, to] = preset.range();
    setActivePreset(preset.label);
    setDateFrom(from);
    setDateTo(to);
  };

  const handleCustomDate = (field, value) => {
    setActivePreset("");
    if (field === "from") setDateFrom(value);
    else                  setDateTo(value);
  };

  const handleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  };

  // Owner options built from loaded deals
  const ownerOptions = useMemo(() => {
    const map = new Map();
    deals.forEach((d) => { if (d.owner?.id) map.set(d.owner.id, d.owner.full_name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [deals]);

  // Filtered + sorted deals
  const filteredDeals = useMemo(() => {
    const co = companySearch.toLowerCase().trim();
    const pq = productSearch.toLowerCase().trim();

    let list = deals.filter((deal) => {
      if (stageFilter && deal.stage !== stageFilter)         return false;
      if (ownerFilter && deal.owner?.id !== ownerFilter)     return false;
      if (co && !(deal.contact?.company_name || "").toLowerCase().includes(co)) return false;
      if (pq) {
        const hit = (deal.deal_products || []).some((dp) =>
          (dp.product?.description || "").toLowerCase().includes(pq) ||
          (deal.title || "").toLowerCase().includes(pq)
        );
        if (!hit) return false;
      }
      return true;
    });

    if (sortBy) {
      list = [...list].sort((a, b) => {
        let va = "", vb = "";
        if (sortBy === "company")    { va = a.contact?.company_name || ""; vb = b.contact?.company_name || ""; }
        if (sortBy === "title")      { va = a.title || ""; vb = b.title || ""; }
        if (sortBy === "stage")      { va = STAGE_ORDER[a.stage] ?? 99; vb = STAGE_ORDER[b.stage] ?? 99; return sortDir === "asc" ? va - vb : vb - va; }
        if (sortBy === "close_date") { va = a.expected_close_date || "9999"; vb = b.expected_close_date || "9999"; }
        if (sortBy === "owner")      { va = a.owner?.full_name || ""; vb = b.owner?.full_name || ""; }
        const cmp = String(va).localeCompare(String(vb), undefined, { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [deals, stageFilter, ownerFilter, companySearch, productSearch, sortBy, sortDir]);

  const stageSummary = useMemo(() =>
    VIEWER_STAGES.map((stage) => {
      const sd = filteredDeals.filter((d) => d.stage === stage);
      return { stage, cfg: STAGE_CONFIG[stage], count: sd.length, products: buildProductMap(sd) };
    }),
  [filteredDeals]);

  const productTotals = useMemo(() => buildProductMap(filteredDeals), [filteredDeals]);

  const hasActiveFilters = stageFilter || ownerFilter || companySearch || productSearch;
  const clearFilters = () => { setStageFilter(""); setOwnerFilter(""); setCompanySearch(""); setProductSearch(""); };

  const thClass = (col) =>
    `text-left px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap`;

  return (
    <>
      {/* ── Print-only header ── */}
      <div className="hidden print:block px-6 py-4 border-b border-gray-300">
        <h1 className="text-xl font-bold">Pipeline Overview — {company?.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {dateFrom} → {dateTo}
          {stageFilter ? ` · Stage: ${STAGE_CONFIG[stageFilter]?.label}` : ""}
          {ownerFilter ? ` · Owner: ${ownerOptions.find(o => o.id === ownerFilter)?.name}` : ""}
          {" "}· Printed {format(new Date(), "d MMM yyyy HH:mm")}
        </p>
      </div>

      <div className="min-h-screen bg-gray-50 print:bg-white">
        <div className="print:hidden">
          <ViewerHeader />
        </div>

        {/* Page title */}
        <div className="px-6 py-4 bg-white border-b border-gray-200 print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Pipeline Overview</h1>
              <p className="text-sm text-gray-500 mt-1">Read-only view · Qualified and above</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Last updated */}
              {lastUpdated && (
                <span className="text-xs text-gray-400">
                  Updated {format(lastUpdated, "HH:mm:ss")}
                </span>
              )}
              {/* Refresh */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50 transition-colors"
              >
                <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              {/* Export CSV */}
              <button
                onClick={() => exportCSV(filteredDeals)}
                disabled={loading || filteredDeals.length === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
              {/* Print */}
              <button
                onClick={() => window.print()}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 pt-4 print:px-0 print:pt-0">

          {/* ── Date presets ── */}
          <div className="flex flex-wrap items-center gap-2 mb-3 print:hidden">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  activePreset === p.label
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600"
                }`}
              >
                {p.label}
              </button>
            ))}
            <span className="text-gray-300 text-xs">|</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium">From</label>
              <input type="date" value={dateFrom} onChange={(e) => handleCustomDate("from", e.target.value)}
                className="text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <label className="text-xs text-gray-500 font-medium">To</label>
              <input type="date" value={dateTo} onChange={(e) => handleCustomDate("to", e.target.value)}
                className="text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>

          {/* ── Stage summary cards ── */}
          <div className="flex items-center justify-between mb-2 print:hidden">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage Summary</h2>
            <button onClick={() => setShowStageSummary((v) => !v)}
              className="text-xs text-gray-400 hover:text-gray-600">
              {showStageSummary ? "Hide" : "Show"}
            </button>
          </div>

          {showStageSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 print:hidden">
              {stageSummary.map(({ stage, cfg, count, products }) => (
                <div key={stage}
                  onClick={() => setStageFilter(stageFilter === stage ? "" : stage)}
                  className={`rounded-lg border p-4 cursor-pointer transition-all ${cfg.bg} ${cfg.border} ${
                    stageFilter === stage ? "ring-2 ring-offset-1 ring-blue-400" : "hover:shadow-sm"
                  }`}
                >
                  <div className={`text-xs font-semibold uppercase tracking-wide ${cfg.text} mb-1`}>{cfg.label}</div>
                  <div className={`text-2xl font-bold ${cfg.text} mb-2`}>{count}</div>
                  {products.length > 0 ? (
                    <div className="space-y-1">
                      {products.slice(0, 4).map((p, i) => (
                        <div key={i} className="flex items-center justify-between gap-1">
                          <span className="text-xs text-gray-600 truncate flex-1 font-mono" title={p.desc}>
                            {p.desc}
                            {p.group && <span className="ml-1 not-italic font-sans text-gray-400">({p.group})</span>}
                          </span>
                          <span className={`text-xs font-semibold whitespace-nowrap ${cfg.text}`}>
                            {p.qty > 0 ? `${p.qty}${p.unit ? " " + p.unit : ""}` : "—"}
                          </span>
                        </div>
                      ))}
                      {products.length > 4 && (
                        <p className="text-xs text-gray-400">+{products.length - 4} more</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No products</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Product totals panel ── */}
          <div className="mb-4 print:hidden">
            <button
              onClick={() => setShowProductTotals((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${showProductTotals ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Product Totals {productTotals.length > 0 ? `(${productTotals.length})` : ""}
            </button>

            {showProductTotals && (
              <div className="mt-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
                {productTotals.length === 0 ? (
                  <p className="text-sm text-gray-400 p-4 italic">No product data for current filters</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Product</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Total Qty</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {productTotals.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-800 font-medium">{p.desc}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700 font-semibold tabular-nums">{p.qty}</td>
                          <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{p.unit || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-gray-200">
                      <tr className="bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-gray-500 font-medium">{productTotals.length} product{productTotals.length !== 1 ? "s" : ""}</td>
                        <td colSpan={2} className="px-4 py-2.5 text-right text-xs text-gray-400">across {filteredDeals.length} deal{filteredDeals.length !== 1 ? "s" : ""}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* ── Filter bar ── */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 print:hidden">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Company</label>
                <input type="text" placeholder="Search company…" value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-3 py-1.5 w-44 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Product</label>
                <input type="text" placeholder="Search product…" value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-3 py-1.5 w-44 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Stage</label>
                <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option value="">All Stages</option>
                  <option value="contact_made">Qualified</option>
                  <option value="proposal_sent">Proposal</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="won">Won</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Owner</label>
                <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}
                  disabled={ownerOptions.length === 0}
                  className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50">
                  <option value="">All Owners</option>
                  {ownerOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              {hasActiveFilters && (
                <button onClick={clearFilters}
                  className="self-end text-sm text-blue-600 hover:text-blue-800 py-1.5 px-2 rounded transition-colors">
                  Clear filters
                </button>
              )}
              {!loading && (
                <span className="self-end ml-auto text-xs text-gray-400">
                  {filteredDeals.length} deal{filteredDeals.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* ── Table ── */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6 print:border-0 print:rounded-none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 print:bg-white">
                    <th className={thClass("company")} onClick={() => handleSort("company")}>
                      Company <SortIcon active={sortBy === "company"} dir={sortDir} />
                    </th>
                    <th className={thClass("title")} onClick={() => handleSort("title")}>
                      Deal Title <SortIcon active={sortBy === "title"} dir={sortDir} />
                    </th>
                    <th className={thClass("stage")} onClick={() => handleSort("stage")}>
                      Stage <SortIcon active={sortBy === "stage"} dir={sortDir} />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Products &amp; Quantity</th>
                    <th className={thClass("close_date")} onClick={() => handleSort("close_date")}>
                      Expected Close <SortIcon active={sortBy === "close_date"} dir={sortDir} />
                    </th>
                    <th className={thClass("owner")} onClick={() => handleSort("owner")}>
                      Owner <SortIcon active={sortBy === "owner"} dir={sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                  ) : filteredDeals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <p className="font-medium text-gray-500">No pipeline deals found</p>
                          <p className="text-sm">
                            {hasActiveFilters ? (
                              <>No deals match your filters.{" "}
                                <button onClick={clearFilters} className="text-blue-500 hover:underline">Clear filters</button>
                              </>
                            ) : "No deals in the selected date range"}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredDeals.map((deal) => (
                      <tr key={deal.id} className="hover:bg-gray-50 print:hover:bg-white">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {deal.contact?.company_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{deal.title || "—"}</td>
                        <td className="px-4 py-3"><StageBadge stage={deal.stage} /></td>
                        <td className="px-4 py-3">
                          {(deal.deal_products || []).length > 0 ? (
                            <div className="flex flex-col gap-1.5">
                              {deal.deal_products.map((dp, idx) => {
                                const label = productLabel(dp);
                                const group = dp.product?.material_group;
                                const qty   = formatQty(dp);
                                return (
                                  <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-gray-800 text-xs font-semibold font-mono">{label}</span>
                                    {group && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-xs font-medium">
                                        {group}
                                      </span>
                                    )}
                                    {qty && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-semibold">
                                        {qty}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {deal.expected_close_date ? fmtDisplay(deal.expected_close_date) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{deal.owner?.full_name || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default PipelineView;
