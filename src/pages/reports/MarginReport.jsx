import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// ── What one product line costs ─────────────────────────────────────────────
//
// line_cost when it was written; otherwise the PER-UNIT cost_price times the
// quantity the line was priced at — uom_value when there is one, else quantity,
// the same effectiveQty that dealProductService.addProductToDeal multiplies by
// when it writes line_cost in the first place.
//
// With neither, the cost is UNKNOWN — not zero. This used to read
// `dp.cost_total || dp.cost_price || 0`: cost_total is not a column at all, and
// cost_price is a per-unit price being added to line totals. For this database,
// where no line carries either figure, it resolved to 0 on every line, so every
// deal and every product group reported a 100% margin and the "low margin"
// warning could never fire.
export function lineCostOf(dp) {
  const revenue = parseFloat(dp?.line_total) || 0;
  const direct = parseFloat(dp?.line_cost);
  if (Number.isFinite(direct) && direct > 0) return { known: true, cost: direct, revenue };

  const perUnit = parseFloat(dp?.cost_price);
  const qty = parseFloat(dp?.uom_value) || parseFloat(dp?.quantity) || 0;
  if (Number.isFinite(perUnit) && perUnit > 0 && qty > 0) {
    return { known: true, cost: perUnit * qty, revenue };
  }
  return { known: false, cost: 0, revenue };
}

// ── One deal's margin, over its COSTED lines only ───────────────────────────
//
// `revenue` is every line, because that is the deal's value. The margin, and the
// revenue the margin percentage is taken against, come only from lines whose cost
// is known: mixing a costed line's cost with an uncosted line's revenue would
// report the missing cost as profit. A deal with no costed line has
// marginPct null — no number at all, rather than 100%.
export function dealMarginOf(deal) {
  const lines = deal?.deal_products || [];
  let revenue = 0;
  let costedRevenue = 0;
  let cost = 0;
  let costedLines = 0;

  lines.forEach((dp) => {
    const line = lineCostOf(dp);
    revenue += line.revenue;
    if (!line.known) return;
    costedLines += 1;
    costedRevenue += line.revenue;
    cost += line.cost;
  });

  const hasCost = costedLines > 0 && costedRevenue > 0;
  return {
    revenue,
    costedRevenue,
    cost,
    costedLines,
    lineCount: lines.length,
    margin: hasCost ? costedRevenue - cost : null,
    marginPct: hasCost ? ((costedRevenue - cost) / costedRevenue) * 100 : null,
  };
}

const MarginReport = ({ deals, formatCurrency }) => {
  const rows = useMemo(
    () => (deals || [])
      .filter((d) => d.deal_products?.length)
      .map((d) => ({ ...d, _m: dealMarginOf(d) })),
    [deals],
  );

  // Only deals that actually have a margin can be ranked by one.
  const costedDeals = useMemo(
    () => rows.filter((r) => r._m.marginPct !== null).sort((a, b) => b._m.marginPct - a._m.marginPct),
    [rows],
  );

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    revenue: acc.revenue + r._m.revenue,
    costedRevenue: acc.costedRevenue + r._m.costedRevenue,
    cost: acc.cost + r._m.cost,
    lines: acc.lines + r._m.lineCount,
    costedLines: acc.costedLines + r._m.costedLines,
  }), { revenue: 0, costedRevenue: 0, cost: 0, lines: 0, costedLines: 0 }), [rows]);

  const grossMargin = totals.costedRevenue - totals.cost;
  const avgMarginPct = totals.costedRevenue > 0 ? (grossMargin / totals.costedRevenue) * 100 : null;
  const revenueCoveragePct = totals.revenue > 0 ? (totals.costedRevenue / totals.revenue) * 100 : 0;
  const hasAnyCost = totals.costedLines > 0 && totals.costedRevenue > 0;

  // By material group — costed lines only, and a group with none is left out
  // rather than drawn as a 100% bar.
  const byGroup = useMemo(() => {
    const map = {};
    (deals || []).forEach((d) => {
      d.deal_products?.forEach((dp) => {
        const line = lineCostOf(dp);
        if (!line.known) return;
        const g = dp.product?.material_group || 'No Group';
        if (!map[g]) map[g] = { revenue: 0, cost: 0 };
        map[g].revenue += line.revenue;
        map[g].cost += line.cost;
      });
    });
    return Object.entries(map)
      .filter(([, s]) => s.revenue > 0)
      .map(([group, s]) => ({
        group,
        marginPct: Math.round(((s.revenue - s.cost) / s.revenue) * 100),
        revenue: s.revenue,
      }))
      .sort((a, b) => b.marginPct - a.marginPct);
  }, [deals]);

  const lowMarginDeals = costedDeals.filter((d) => d._m.marginPct < 10 && d._m.marginPct >= 0);

  // ── Nothing is costed: say so, and say what to do about it ────────────────
  if (!hasAnyCost) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm font-semibold text-gray-800">No cost data yet</p>
        <p className="text-xs text-gray-500 mt-2">
          Add cost prices to the Product Master to see margins.
        </p>
        <p className="text-xs text-gray-400 mt-4">
          {totals.lines} product line{totals.lines === 1 ? '' : 's'} in this period
          {totals.revenue > 0 ? `, ${formatCurrency(totals.revenue)} of revenue` : ''}
          , none with a cost price.
        </p>
      </div>
    );
  }

  const kpis = [
    { label: 'Total Revenue',   value: formatCurrency(totals.revenue),      color: 'bg-blue-50  text-blue-700  border-blue-100'  },
    { label: 'Costed Revenue',  value: formatCurrency(totals.costedRevenue), color: 'bg-gray-50  text-gray-700  border-gray-200'  },
    { label: 'Total Cost',      value: formatCurrency(totals.cost),          color: 'bg-gray-50  text-gray-700  border-gray-200'  },
    { label: 'Gross Margin',    value: formatCurrency(grossMargin),          color: 'bg-green-50 text-green-700 border-green-100' },
    { label: 'Avg Margin %',    value: `${avgMarginPct.toFixed(1)}%`,        color: avgMarginPct >= 20 ? 'bg-green-50 text-green-700 border-green-100' : avgMarginPct >= 10 ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-red-50 text-red-700 border-red-100' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-xl p-4 border ${k.color}`}>
            <p className="text-xs font-medium opacity-80">{k.label}</p>
            <p className="text-xl font-bold mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* How much of the period these margins actually describe. Without this,
          a margin computed over 3 of 400 lines looks like the whole picture. */}
      <p className="text-xs text-gray-500">
        Cost known for {totals.costedLines} of {totals.lines} lines
        ({revenueCoveragePct.toFixed(0)}% of revenue).
        {' '}Margin figures above cover only those lines.
      </p>

      {/* Margin % by material group */}
      {byGroup.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Margin % by Product Group</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGroup} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="group" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={v => [`${v}%`, 'Margin']} />
                <Bar dataKey="marginPct" name="Margin %" radius={[0, 4, 4, 0]}>
                  {byGroup.map((entry, i) => (
                    <Cell key={i} fill={entry.marginPct >= 20 ? '#16A34A' : entry.marginPct >= 10 ? '#D97706' : '#DC2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Low margin warnings */}
      {lowMarginDeals.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-3">⚠️ Low Margin Deals (&lt;10%) — {lowMarginDeals.length} deals</h3>
          <div className="space-y-2">
            {lowMarginDeals.slice(0, 10).map(d => (
              <div key={d.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2">
                <span className="font-medium text-gray-800 truncate max-w-[200px]">{d.title}</span>
                <span className="text-gray-500">{d.owner?.full_name}</span>
                <span className="text-red-600 font-semibold">{d._m.marginPct.toFixed(1)}%</span>
                <span className="text-gray-600">{formatCurrency(d._m.costedRevenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deals that have a margin at all */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">
            Deals with Margin Data ({costedDeals.length})
            {rows.length > costedDeals.length && (
              <span className="font-normal text-gray-500">
                {' '}· {rows.length - costedDeals.length} without cost prices
              </span>
            )}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Deal</th>
                <th className="px-4 py-2.5 text-left">Salesman</th>
                <th className="px-4 py-2.5 text-right">Revenue</th>
                <th className="px-4 py-2.5 text-right">Costed Revenue</th>
                <th className="px-4 py-2.5 text-right">Cost</th>
                <th className="px-4 py-2.5 text-right">Margin</th>
                <th className="px-4 py-2.5 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {costedDeals.slice(0, 50).map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800 max-w-[180px] truncate">{d.title || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{d.owner?.full_name || '—'}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(d._m.revenue)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">
                    {formatCurrency(d._m.costedRevenue)}
                    {d._m.costedLines < d._m.lineCount && (
                      <span className="ml-1 text-gray-400">({d._m.costedLines}/{d._m.lineCount})</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">{formatCurrency(d._m.cost)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(d._m.margin)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${d._m.marginPct >= 20 ? 'bg-green-100 text-green-700' : d._m.marginPct >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {d._m.marginPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MarginReport;
