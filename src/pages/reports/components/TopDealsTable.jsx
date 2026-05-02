import React, { useState, useMemo } from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const STAGE_BADGE = {
  lead:          "bg-slate-100 text-slate-700",
  contact_made:  "bg-sky-100 text-sky-700",
  proposal_sent: "bg-violet-100 text-violet-700",
  negotiation:   "bg-amber-100 text-amber-700",
  won:           "bg-emerald-100 text-emerald-700",
  lost:          "bg-red-100 text-red-600",
};
const STAGE_LABELS = {
  lead: "Lead", contact_made: "Qualified", proposal_sent: "Proposal",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};
const PRIORITY_BADGE = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-slate-100 text-slate-600",
};

const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const TopDealsTable = ({ deals = [], limit = 20 }) => {
  const { formatCurrency } = useCurrency();
  const [stageFilter, setStageFilter] = useState("all");

  const filtered = useMemo(() => {
    const base = stageFilter === "all" ? deals : deals.filter((d) => d.stage === stageFilter);
    return [...base].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, limit);
  }, [deals, stageFilter, limit]);

  const stages = [...new Set(deals.map((d) => d.stage))];

  return (
    <div className="bg-card border border-border rounded-lg enterprise-shadow">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Top Deals</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Ranked by value — top {limit}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStageFilter("all")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${stageFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            All ({deals.length})
          </button>
          {stages.map((s) => {
            const cnt = deals.filter((d) => d.stage === s).length;
            return (
              <button
                key={s}
                onClick={() => setStageFilter(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${stageFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {STAGE_LABELS[s] ?? s} ({cnt})
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">No deals match this filter</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deal</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage</th>
                <th className="px-4 py-3 text-left hidden md:table-cell text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell text-xs font-semibold uppercase tracking-wide text-muted-foreground">Close Date</th>
                <th className="px-6 py-3 text-left hidden lg:table-cell text-xs font-semibold uppercase tracking-wide text-muted-foreground">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((deal, i) => (
                <tr key={deal.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-3 text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-card-foreground text-xs truncate max-w-[160px]">
                      {deal.title || `Deal #${deal.id?.slice(0, 8)}`}
                    </p>
                    {deal.contact?.company_name && (
                      <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{deal.contact.company_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${STAGE_BADGE[deal.stage] ?? "bg-muted text-muted-foreground"}`}>
                      {STAGE_LABELS[deal.stage] ?? deal.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {deal.priority && (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${PRIORITY_BADGE[deal.priority] ?? "bg-muted text-muted-foreground"}`}>
                        {deal.priority}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold tabular-nums text-card-foreground text-xs">{formatCurrency(deal.amount || 0)}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground tabular-nums">{fmt(deal.expected_close_date)}</td>
                  <td className="px-6 py-3 hidden lg:table-cell text-xs text-muted-foreground">{deal.owner?.full_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TopDealsTable;
