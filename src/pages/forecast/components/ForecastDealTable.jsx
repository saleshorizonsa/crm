import React, { useState, useMemo, useEffect, useRef } from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const STAGE_CONFIG = {
  lead:          { label: "Lead",          color: "bg-slate-100 text-slate-700"    },
  contact_made:  { label: "Contact Made",  color: "bg-sky-100 text-sky-700"        },
  proposal_sent: { label: "Proposal Sent", color: "bg-violet-100 text-violet-700"  },
  negotiation:   { label: "Negotiation",   color: "bg-amber-100 text-amber-700"    },
  won:           { label: "Won",           color: "bg-emerald-100 text-emerald-700" },
  lost:          { label: "Lost",          color: "bg-red-100 text-red-600"        },
};

const ALL_STAGES = ["all", "lead", "contact_made", "proposal_sent", "negotiation", "won", "lost"];

const formatDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const isOverdue = (iso, stage) => {
  if (!iso || stage === "won" || stage === "lost") return false;
  return new Date(iso) < new Date(new Date().toDateString());
};

const ForecastDealTable = ({ deals = [] }) => {
  const { formatCurrency } = useCurrency();
  const [stageFilter, setStageFilter] = useState("all");
  const [sortKey, setSortKey]         = useState("amount");
  const [sortDir, setSortDir]         = useState("desc");

  // Reset the scroll position to the top whenever the filter or sort changes,
  // so switching stages doesn't leave the list scrolled halfway down.
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [stageFilter, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const base = stageFilter === "all"
      ? deals
      : deals.filter((d) => d.stage === stageFilter);

    return [...base].sort((a, b) => {
      let va, vb;
      if (sortKey === "amount") {
        va = a.amount || 0;
        vb = b.amount || 0;
      } else if (sortKey === "close_date") {
        va = a.expected_close_date ? new Date(a.expected_close_date).getTime() : 0;
        vb = b.expected_close_date ? new Date(b.expected_close_date).getTime() : 0;
      } else {
        va = (a[sortKey] || "").toString().toLowerCase();
        vb = (b[sortKey] || "").toString().toLowerCase();
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [deals, stageFilter, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <Icon name="ChevronsUpDown" size={12} className="text-muted-foreground/50 ml-1" />;
    return (
      <Icon
        name={sortDir === "asc" ? "ChevronUp" : "ChevronDown"}
        size={12}
        className="text-primary ml-1"
      />
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg enterprise-shadow">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-card-foreground">Deal Details</h3>
            {filtered.length > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                {filtered.length} deal{filtered.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stageFilter !== "all"
              ? `Filtered to ${STAGE_CONFIG[stageFilter]?.label}`
              : "All deals in this period"}
          </p>
        </div>

        {/* Stage filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_STAGES.map((s) => {
            const cfg   = s === "all" ? { label: "All" } : STAGE_CONFIG[s];
            const count = s === "all" ? deals.length : deals.filter((d) => d.stage === s).length;
            if (s !== "all" && count === 0) return null;
            return (
              <button
                key={s}
                onClick={() => setStageFilter(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  stageFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cfg?.label} {count > 0 && <span className="opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No deals match this filter
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-auto"
          style={{ maxHeight: "560px", scrollbarWidth: "thin", scrollbarColor: "#E2E8F0 transparent" }}
        >
          <table className="w-full text-sm">
            {/* Sticky header keeps column labels visible while the body scrolls */}
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort("title")}
                    className="flex items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-card-foreground transition-colors"
                  >
                    Deal <SortIcon col="title" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Stage
                  </span>
                </th>
                <th className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleSort("amount")}
                    className="flex items-center justify-end w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-card-foreground transition-colors"
                  >
                    Amount <SortIcon col="amount" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left hidden md:table-cell">
                  <button
                    onClick={() => handleSort("close_date")}
                    className="flex items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-card-foreground transition-colors"
                  >
                    Close Date <SortIcon col="close_date" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left hidden lg:table-cell">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Owner
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((deal) => {
                const stageCfg = STAGE_CONFIG[deal.stage] ?? { label: deal.stage, color: "bg-muted text-muted-foreground" };
                const overdue  = isOverdue(deal.expected_close_date, deal.stage);
                return (
                  <tr key={deal.id} className="hover:bg-muted/30 transition-colors">
                    {/* Deal name */}
                    <td className="px-6 py-3">
                      <p className="font-medium text-card-foreground truncate max-w-[180px]">
                        {deal.title || deal.name || `Deal #${deal.id?.slice(0, 8)}`}
                      </p>
                      {deal.company_name && (
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {deal.company_name}
                        </p>
                      )}
                    </td>

                    {/* Stage */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${stageCfg.color}`}>
                        {stageCfg.label}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold tabular-nums text-card-foreground">
                        {formatCurrency(deal.amount || 0)}
                      </span>
                    </td>

                    {/* Close date */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-xs tabular-nums ${overdue ? "text-orange-600 font-medium" : "text-muted-foreground"}`}>
                        {overdue && <Icon name="AlertCircle" size={11} className="inline mr-1 text-orange-500" />}
                        {formatDate(deal.expected_close_date)}
                      </span>
                    </td>

                    {/* Owner */}
                    <td className="px-6 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {deal.owner_name || deal.users?.full_name || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Scroll hint when the list is capped */}
      {filtered.length > 10 && (
        <div className="px-6 py-3 border-t border-border">
          <p className="text-xs text-center text-muted-foreground">
            Showing all {filtered.length} deals · Scroll to view more
          </p>
        </div>
      )}
    </div>
  );
};

export default ForecastDealTable;
