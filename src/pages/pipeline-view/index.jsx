import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import ViewerHeader from "./ViewerHeader";

const VIEWER_STAGES = ["contact_made", "proposal_sent", "negotiation", "won"];

const STAGE_CONFIG = {
  contact_made:  { label: "Qualified",    bgText: "bg-blue-100 text-blue-700",   pill: "bg-blue-50 text-blue-700"   },
  proposal_sent: { label: "Proposal",     bgText: "bg-amber-100 text-amber-700", pill: "bg-amber-50 text-amber-700" },
  negotiation:   { label: "Negotiation",  bgText: "bg-orange-100 text-orange-700", pill: "bg-orange-50 text-orange-700" },
  won:           { label: "Won",          bgText: "bg-green-100 text-green-700", pill: "bg-green-50 text-green-700" },
};

const StageBadge = ({ stage }) => {
  const cfg = STAGE_CONFIG[stage] || { label: stage, bgText: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bgText}`}>
      {cfg.label}
    </span>
  );
};

const SkeletonRow = () => (
  <tr className="animate-pulse">
    {[80, 120, 64, 140, 80, 96].map((w, i) => (
      <td key={i} className="px-4 py-3">
        <div className={`h-4 bg-gray-200 rounded`} style={{ width: w }} />
      </td>
    ))}
  </tr>
);

const UOM_LABEL = { qty: "pcs", m: "m", ton: "ton" };

const PipelineView = () => {
  const { company, userProfile } = useAuth();

  const today = new Date();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));

  useEffect(() => {
    if (company?.id) {
      fetchPipelineDeals(dateFrom, dateTo);
    }
  }, [company?.id, dateFrom, dateTo]);

  // Defence-in-depth: non-viewers must not reach this page (after all hooks)
  if (userProfile && userProfile.role !== "viewer") {
    return <Navigate to="/" replace />;
  }

  async function fetchPipelineDeals(from, to) {
    setLoading(true);

    const { data } = await supabase
      .from("deals")
      .select(`
        id,
        title,
        stage,
        expected_close_date,
        created_at,
        contact:contacts!contact_id(
          company_name
        ),
        owner:users!owner_id(
          full_name
        ),
        deal_products(
          quantity,
          uom_type,
          uom_value,
          product:products!product_id(
            description
          )
        )
      `)
      .eq("company_id", company.id)
      .in("stage", VIEWER_STAGES)
      .gte("created_at", from)
      .lte("created_at", to + "T23:59:59")
      .order("stage", { ascending: false })
      .order("expected_close_date", { ascending: true });

    setDeals(data || []);
    setLoading(false);
  }

  const filteredDeals = deals.filter((deal) => {
    const q = search.toLowerCase();
    const matchesStage = !stageFilter || deal.stage === stageFilter;
    const matchesSearch =
      !q ||
      (deal.contact?.company_name || "").toLowerCase().includes(q) ||
      (deal.title || "").toLowerCase().includes(q) ||
      (deal.deal_products || []).some((dp) =>
        (dp.product?.description || "").toLowerCase().includes(q)
      );
    return matchesStage && matchesSearch;
  });

  const stageCounts = VIEWER_STAGES.reduce((acc, s) => {
    acc[s] = filteredDeals.filter((d) => d.stage === s).length;
    return acc;
  }, {});

  const formatProduct = (dp) => {
    const desc = dp.product?.description || "Unknown Product";
    const qty  = dp.uom_value != null ? dp.uom_value : (dp.quantity != null ? dp.quantity : "");
    const unit = UOM_LABEL[dp.uom_type] || dp.uom_type || "";
    return `${desc}${qty !== "" ? ` × ${qty}` : ""}${unit ? ` ${unit}` : ""}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ViewerHeader />

      {/* Page title */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Pipeline Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Read-only view · Qualified and above</p>
      </div>

      {/* Stage summary bar */}
      <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center gap-3 flex-wrap">
        {VIEWER_STAGES.map((stage) => {
          const cfg = STAGE_CONFIG[stage];
          return (
            <span
              key={stage}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cfg.pill}`}
            >
              {cfg.label}
              <span className="font-bold">{stageCounts[stage]}</span>
            </span>
          );
        })}
        {!loading && (
          <span className="text-xs text-gray-400 ml-auto">
            {filteredDeals.length} deal{filteredDeals.length !== 1 ? "s" : ""} shown
          </span>
        )}
      </div>

      {/* Filter bar — read-only controls only, no add/export buttons */}
      <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        <input
          type="text"
          placeholder="Search by company or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-gray-200 rounded px-3 py-1.5 w-60 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">All Stages</option>
          <option value="contact_made">Qualified</option>
          <option value="proposal_sent">Proposal</option>
          <option value="negotiation">Negotiation</option>
          <option value="won">Won</option>
        </select>
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Deal Title</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Products & Quantity</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Expected Close</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filteredDeals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <svg
                          className="w-10 h-10"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        <p className="font-medium text-gray-500">No pipeline deals found</p>
                        <p className="text-sm">No deals match your current filters</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDeals.map((deal) => (
                    <tr key={deal.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {deal.contact?.company_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{deal.title || "—"}</td>
                      <td className="px-4 py-3">
                        <StageBadge stage={deal.stage} />
                      </td>
                      <td className="px-4 py-3">
                        {deal.deal_products && deal.deal_products.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {deal.deal_products.map((dp, idx) => (
                              <span key={idx} className="text-gray-700">
                                {formatProduct(dp)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {deal.expected_close_date
                          ? format(new Date(deal.expected_close_date), "d MMM yyyy")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {deal.owner?.full_name || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PipelineView;
