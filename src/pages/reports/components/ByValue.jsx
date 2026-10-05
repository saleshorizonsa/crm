import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const STAGE_LABELS = {
  lead: "Lead", contact_made: "Qualified", proposal_sent: "Proposal",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};
const STAGE_COLORS = {
  lead: "#93C5FD", contact_made: "#6EE7B7", proposal_sent: "#FCD34D",
  negotiation: "#FDBA74", won: "#16A34A", lost: "#DC2626",
};
const PIE_COLORS = ["#2563EB","#16A34A","#D97706","#7C3AED","#0891B2","#DB2777"];

const fmt = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

const CurrTip = ({ active, payload, label, formatCurrency }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color }}>{e.name}: {formatCurrency(e.value)}</p>
      ))}
    </div>
  );
};

const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  return new Date(+y, +m - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

// INVOICED / RETURNS / NET. The page hands down the shared Achieved split
// (reportService.reportAchievedTotals -> computeAchieved), so this screen shows
// the same revenue as every dashboard instead of its own sum. Where a figure is
// GROSS it says so: "Invoiced (before returns)", with the credit notes and the
// net on their own lines, because a reader comparing this with a dashboard
// needs to see which of the two numbers they are looking at.
//
// `deals` stays the PIPELINE set (dated by closed_at) and still drives every
// count, the stage mix and the monthly bars. Only the money comes from
// `achieved`, which is dated by invoice_date. The two answer different
// questions and the old single sum could only be right about one of them.
const ByValue = ({ deals, achieved = null, formatCurrency, winRate3m = null, openPipeline = null }) => {
  const stats = useMemo(() => {
    let pipeline = 0, lost = 0, wonCount = 0, lostCount = 0;
    deals.forEach((d) => {
      if (d.stage === "won")       { wonCount++; }
      else if (d.stage === "lost") { lost += d.amount || 0; lostCount++; }
      else                         { pipeline += d.amount || 0; }
    });
    const closed = wonCount + lostCount;
    return { pipeline, lost, winRate: closed ? Math.round(wonCount / closed * 100) : 0, wonCount, lostCount };
  }, [deals]);

  // THE revenue figures. Net is what every dashboard calls Achieved.
  const invoiced = achieved?.invoiced ?? 0;
  const returned = achieved?.returns ?? 0;
  const netRevenue = achieved?.net ?? 0;
  const hasReturns = returned > 0;

  // Prefer the dashboard-consistent figures when provided (3-month win rate and
  // all-open pipeline); otherwise fall back to this period's own numbers.
  const displayWinRate = winRate3m != null ? `${winRate3m.toFixed(1)}%` : `${stats.winRate}%`;
  const displayPipeline = openPipeline != null ? openPipeline : stats.pipeline;

  const monthData = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      const key = d.created_at?.slice(0, 7);
      if (!key) return;
      if (!map[key]) map[key] = { month: key, Won: 0, Pipeline: 0, Lost: 0 };
      if (d.stage === "won")       map[key].Won      += d.amount || 0;
      else if (d.stage === "lost") map[key].Lost     += d.amount || 0;
      else                         map[key].Pipeline += d.amount || 0;
    });
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({ ...r, month: monthLabel(r.month) }));
  }, [deals]);

  const stageData = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      const s = d.stage;
      if (!map[s]) map[s] = { name: STAGE_LABELS[s] || s, value: 0, count: 0 };
      map[s].value += d.amount || 0;
      map[s].count++;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [deals]);

  // Shown under the tiles: the gross figure, the credit notes and the net, so
  // the one on the tile is never ambiguous. Hidden when there are no returns,
  // where "invoiced" and "net" are the same number and three lines saying so
  // would be noise.
  const ReturnsBreakdown = () => (!hasReturns ? null : (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="text-gray-500">
          Invoiced (before returns){" "}
          <span className="font-semibold tabular-nums text-gray-800">{formatCurrency(invoiced)}</span>
        </span>
        <span className="text-gray-500">
          Returns{" "}
          <span className="font-semibold tabular-nums text-red-600">− {formatCurrency(returned)}</span>
          {achieved?.returnsCount ? <span className="text-gray-400"> ({achieved.returnsCount})</span> : null}
        </span>
        <span className="text-gray-500">
          Net revenue{" "}
          <span className="font-semibold tabular-nums text-green-700">{formatCurrency(netRevenue)}</span>
        </span>
      </div>
      <p className="mt-1 text-gray-400">
        A credit note reduces the month it was RAISED in, which is often not the
        month of the invoice it credits. Net revenue is the figure the
        dashboards call Achieved.
      </p>
    </div>
  ));

  if (!deals.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <span className="text-5xl mb-3">📊</span>
      <p className="text-sm">No deals in this period.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <ReturnsBreakdown />
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Pipeline", value: formatCurrency(displayPipeline), color: "text-blue-600",  bg: "bg-blue-50"  },
          // "Revenue (net)", not "Won": it is money invoiced in this period less the
    // credit notes raised in it — the same Achieved every dashboard shows — and
    // NOT the value of the deals won in this period, which is what a reader
    // assumes from the word "Won" and what this tile used to be.
    {
      label: hasReturns ? "Revenue (net of returns)" : "Revenue (invoiced)",
      value: formatCurrency(netRevenue),
      color: "text-green-600",
      bg: "bg-green-50",
    },
          { label: "Lost",            value: formatCurrency(stats.lost),     color: "text-red-500",   bg: "bg-red-50"   },
          { label: "Win Rate",        value: displayWinRate,                 color: "text-purple-600",bg: "bg-purple-50", subtitle: winRate3m != null ? "3-month avg" : undefined },
        ].map(({ label, value, color, bg, subtitle }) => (
          <div key={label} className={`${bg} rounded-xl p-4 border border-white/60`}>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        ))}
      </div>

      {/* Monthly bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Month</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={48} />
            <Tooltip content={<CurrTip formatCurrency={formatCurrency} />} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Won"      fill="#16A34A" radius={[3,3,0,0]} />
            <Bar dataKey="Pipeline" fill="#2563EB" radius={[3,3,0,0]} />
            <Bar dataKey="Lost"     fill="#DC2626" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stage breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Stage Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={stageData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                outerRadius={90}
                label={false}
              >
                {stageData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">By Stage</h3>
          <div className="space-y-3">
            {stageData.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <div className="flex-1 text-sm text-gray-700">{s.name}</div>
                <div className="text-sm font-semibold text-gray-900">{formatCurrency(s.value)}</div>
                <div className="text-xs text-gray-400 w-14 text-right">{s.count} deal{s.count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ByValue;
