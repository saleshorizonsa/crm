import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["#2563EB","#16A34A","#D97706","#7C3AED","#0891B2","#DB2777","#EA580C","#65A30D"];

const fmt = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

const ByProduct = ({ deals, formatCurrency }) => {
  const { groups, products } = useMemo(() => {
    const gMap = {};
    const pMap = {};

    deals.forEach((deal) => {
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
  }, [deals]);

  const hasProducts = products.length > 0;

  if (!hasProducts) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <span className="text-5xl mb-3">📦</span>
      <p className="text-sm">No product data in this period.</p>
      <p className="text-xs mt-1">Add products to deals to see this report.</p>
    </div>
  );

  return (
    <div className="space-y-6">
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
