import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["#2563EB","#16A34A","#D97706","#7C3AED","#0891B2","#DB2777","#EA580C","#65A30D"];

const fmt = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

// INVOICED / RETURNS / NET. The page hands down the shared Achieved split
// (reportService.reportAchievedTotals -> computeAchieved), so this screen shows
// the same revenue as every dashboard instead of its own sum. Where a figure is
// GROSS it says so: "Invoiced (before returns)", with the credit notes and the
// net on their own lines, because a reader comparing this with a dashboard
// needs to see which of the two numbers they are looking at.
//
// WHICH DEALS. This used to break down EVERY deal it was handed, at every
// stage, so "value by product" was a mixture of revenue, open pipeline and
// lost deals presented as one figure. It now breaks down the ACHIEVED deals —
// won, invoiced, dated by invoice_date, over the achievers.
//
// WHY THE COLUMN TOTAL MAY NOT EQUAL ACHIEVED EXACTLY. A product line carries
// its own `line_total`, while Achieved values a deal at final_amount ?? amount.
// Those agree only when the lines were kept in step with a negotiated final
// value, and not every deal has product lines at all. The reconciliation is
// shown on screen rather than hidden: the Achieved total, the sum of the lines,
// and the difference.
const ByProduct = ({ deals, achievedDeals = null, achieved = null, formatCurrency }) => {
  // Fall back to `deals` only when the page has not supplied the revenue rows
  // (older callers, and the first render before the fetch resolves).
  const rows = achievedDeals || deals;
  const { groups, products } = useMemo(() => {
    const gMap = {};
    const pMap = {};

    rows.forEach((deal) => {
      (deal.deal_products || []).forEach((dp) => {
        const p     = dp.product;
        const val   = parseFloat(dp.line_total) || 0;
        const group = p?.material_group || "Uncategorised";
        const name  = p?.material      || "Unknown Product";

        // group level
        if (!gMap[group]) gMap[group] = { name: group, value: 0, count: 0 };
        gMap[group].value += val;
        gMap[group].count++;

        // product level
        const pKey = p?.id || name;
        if (!pMap[pKey]) pMap[pKey] = { id: pKey, material: name, group, value: 0, units: 0, deals: new Set() };
        pMap[pKey].value += val;
        pMap[pKey].units += parseFloat(dp.uom_value) || 0;
        pMap[pKey].deals.add(deal.id);
      });
    });

    const groups   = Object.values(gMap).sort((a, b) => b.value - a.value);
    const products = Object.values(pMap)
      .map((p) => ({ ...p, dealCount: p.deals.size }))
      .sort((a, b) => b.value - a.value);

    return { groups, products };
  }, [rows]);

  // The reconciliation between the line totals above and the shared Achieved.
  const lineTotal = products.reduce((s, p) => s + p.value, 0);
  const achievedNet = achieved?.net ?? null;
  const unexplained = achievedNet === null ? null : achievedNet - lineTotal;

  const hasProducts = products.length > 0;

  // The line totals above come from deal_products; Achieved values a deal at
  // final_amount ?? amount. Stating the gap is the only honest option — a
  // product breakdown that silently fails to add up to the revenue it claims
  // to break down is worse than one that says by how much.
  const Reconciliation = () => (achievedNet === null ? null : (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="text-gray-500">
          Revenue (net){" "}
          <span className="font-semibold tabular-nums text-green-700">{formatCurrency(achievedNet)}</span>
        </span>
        <span className="text-gray-500">
          Sum of product lines{" "}
          <span className="font-semibold tabular-nums text-gray-800">{formatCurrency(lineTotal)}</span>
        </span>
        {Math.abs(unexplained) >= 1 && (
          <span className="text-amber-700">
            Not attributed to a product{" "}
            <span className="font-semibold tabular-nums">{formatCurrency(unexplained)}</span>
          </span>
        )}
      </div>
      <p className="mt-1 text-gray-400">
        Only invoiced deals count, dated by invoice date. A deal with no product
        lines, or whose lines were not updated to a negotiated final value,
        contributes to the revenue but not to the breakdown.
      </p>
    </div>
  ));

  if (!hasProducts) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <span className="text-5xl mb-3">📦</span>
      <p className="text-sm">No product data in this period.</p>
      <p className="text-xs mt-1">Add products to deals to see this report.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Reconciliation />
      {/* Group bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Product Group</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={groups} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
            <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="value" radius={[0,3,3,0]} name="Revenue">
              {groups.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Product table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Product Breakdown</h3>
          <span className="text-xs text-gray-400">{products.length} products</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2.5 text-left">#</th>
                <th className="px-5 py-2.5 text-left">Product</th>
                <th className="px-5 py-2.5 text-left">Group</th>
                <th className="px-5 py-2.5 text-right">Units</th>
                <th className="px-5 py-2.5 text-right">Deals</th>
                <th className="px-5 py-2.5 text-right">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.slice(0, 30).map((p, i) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{p.material}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">{p.group}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">{p.units.toFixed(1)}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{p.dealCount}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ByProduct;
