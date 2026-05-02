import React, { useMemo, useState } from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const TeamPerformanceTable = ({ deals = [], teamMembers = [] }) => {
  const { formatCurrency } = useCurrency();
  const [sortKey, setSortKey] = useState("revenue");
  const [sortDir, setSortDir] = useState("desc");

  const rows = useMemo(() => {
    const map = {};

    // Seed from teamMembers so even reps with zero deals appear
    teamMembers.forEach((m) => {
      map[m.id] = { id: m.id, name: m.full_name || m.email || "Unknown", won: 0, lost: 0, open: 0, revenue: 0, pipeline: 0 };
    });

    deals.forEach((d) => {
      const ownerId = d.owner_id;
      const ownerName = d.owner?.full_name || "Unknown";
      if (!map[ownerId]) map[ownerId] = { id: ownerId, name: ownerName, won: 0, lost: 0, open: 0, revenue: 0, pipeline: 0 };
      const r = map[ownerId];
      r.name = ownerName;
      if (d.stage === "won")  { r.won++;  r.revenue  += d.amount || 0; }
      else if (d.stage === "lost") { r.lost++; }
      else                    { r.open++; r.pipeline += d.amount || 0; }
    });

    return Object.values(map).map((r) => {
      const closed  = r.won + r.lost;
      const winRate = closed > 0 ? Math.round((r.won / closed) * 100) : 0;
      return { ...r, closed, winRate, total: r.won + r.lost + r.open };
    });
  }, [deals, teamMembers]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [rows, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <Icon name="ChevronsUpDown" size={11} className="text-muted-foreground/50 ml-1" />;
    return <Icon name={sortDir === "asc" ? "ChevronUp" : "ChevronDown"} size={11} className="text-primary ml-1" />;
  };

  if (rows.length === 0) return null;

  const maxRevenue = Math.max(...rows.map((r) => r.revenue), 1);

  return (
    <div className="bg-card border border-border rounded-lg enterprise-shadow">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-card-foreground">Team Performance</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{rows.length} reps · sortable</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rep</th>
              {[
                { key: "total",    label: "Deals" },
                { key: "won",      label: "Won"   },
                { key: "winRate",  label: "Win %" },
                { key: "revenue",  label: "Revenue" },
                { key: "pipeline", label: "Pipeline" },
              ].map(({ key, label }) => (
                <th key={key} className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleSort(key)}
                    className="flex items-center justify-end w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-card-foreground transition-colors"
                  >
                    {label}<SortIcon col={key} />
                  </button>
                </th>
              ))}
              <th className="px-6 py-3 text-left hidden lg:table-cell">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revenue Bar</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((rep, i) => (
              <tr key={rep.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {rep.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-medium text-card-foreground text-xs">{rep.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums font-medium text-card-foreground">{rep.total}</td>
                <td className="px-4 py-3 text-right text-xs tabular-nums">
                  <span className="font-semibold text-emerald-600">{rep.won}</span>
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums">
                  <span className={`font-semibold ${rep.winRate >= 40 ? "text-emerald-600" : rep.winRate >= 20 ? "text-amber-600" : "text-red-500"}`}>
                    {rep.winRate}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums font-semibold text-card-foreground">{formatCurrency(rep.revenue)}</td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">{formatCurrency(rep.pipeline)}</td>
                <td className="px-6 py-3 hidden lg:table-cell">
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${(rep.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TeamPerformanceTable;
