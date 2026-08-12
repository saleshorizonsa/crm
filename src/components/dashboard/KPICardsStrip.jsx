import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';

// Whole-SAR integer formatter.
const fmtSAR = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const MONTH_LABEL = () =>
  new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

// The five KPI cards. `accent` drives the coloured top strip + value colour.
function cardDefs(totals) {
  const t = totals || {};
  const onTrack = (t.plannedGap || 0) <= 0;
  const targetMet = (t.deficit || 0) <= 0;
  return [
    {
      key: 'target', label: 'Target', strip: 'bg-blue-600',
      value: `${fmtSAR(t.target)} SAR`, valueClass: 'text-foreground',
      sub: MONTH_LABEL(),
    },
    {
      key: 'achieved', label: 'Achieved', strip: 'bg-green-500',
      value: `${fmtSAR(t.achieved)} SAR`, valueClass: 'text-green-600',
      sub: 'Won this month',
    },
    {
      key: 'deficit', label: 'Deficit', strip: targetMet ? 'bg-green-500' : 'bg-red-500',
      value: targetMet ? 'Target met ✓' : `${fmtSAR(t.deficit)} SAR`,
      valueClass: targetMet ? 'text-green-600' : 'text-red-600',
      sub: 'Target − Achieved',
    },
    {
      key: 'winRate', label: 'Win Rate', strip: 'bg-purple-500',
      value: `${(t.winRate3m || 0).toFixed(1)}%`, valueClass: 'text-purple-600',
      sub: `3-month avg${t.winRateIsDefault ? ' (default)' : ''}`,
    },
    {
      key: 'plannedGap', label: 'Planned Gap', strip: onTrack ? 'bg-green-500' : 'bg-red-500',
      value: onTrack ? 'On Track ✓' : `${fmtSAR(t.plannedGap)} SAR`,
      valueClass: onTrack ? 'text-green-600' : 'text-red-600',
      sub: onTrack ? `Planned: ${fmtSAR(t.planned)} SAR` : 'Required − Planned',
    },
  ];
}

const POPUP_TITLES = {
  target: 'Target', achieved: 'Achieved', deficit: 'Deficit',
  winRate: 'Win Rate', plannedGap: 'Planned Gap',
};

// Per-salesman breakdown table shown inside every popup. The active metric column
// is emphasised.
function SalesmanTable({ rows, active, role, onDrillDown }) {
  const canDrill = ['manager', 'supervisor'].includes(role) && typeof onDrillDown === 'function';
  const cell = (key, node) => (
    <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${
      active === key ? 'font-semibold text-foreground' : 'text-muted-foreground'
    }`}>{node}</td>
  );
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">No data for this scope.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Salesman</th>
            <th className="px-3 py-2 text-right font-medium">Target</th>
            <th className="px-3 py-2 text-right font-medium">Achieved</th>
            <th className="px-3 py-2 text-right font-medium">Deficit</th>
            <th className="px-3 py-2 text-right font-medium">Win%</th>
            <th className="px-3 py-2 text-right font-medium">Planned Gap</th>
            {canDrill && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.id}
              onClick={canDrill ? () => onDrillDown(s) : undefined}
              className={`border-b border-border last:border-0 ${
                canDrill ? 'cursor-pointer hover:bg-accent/40 transition-colors' : ''
              }`}
            >
              <td className="px-3 py-2.5 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {s.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <span className="truncate text-foreground font-medium max-w-[9rem]">{s.full_name}</span>
                </div>
              </td>
              {cell('target', `${fmtSAR(s.target)}`)}
              {cell('achieved', `${fmtSAR(s.achieved)}`)}
              {cell('deficit', s.deficit <= 0 ? '✓' : fmtSAR(s.deficit))}
              {cell('winRate', `${s.winRate3m.toFixed(0)}%`)}
              {cell('plannedGap', s.plannedGap <= 0 ? '✓' : fmtSAR(s.plannedGap))}
              {canDrill && (
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <span className="text-[11px] text-blue-500">View details →</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Reusable 5-KPI strip. The parent passes already role-scoped data.
//   salesmanData — per-salesman rows for the scope
//   totals       — scope totals for the cards
//   role         — current user role (drives popup behaviour in later phases)
//   loading      — skeletons while data loads
//   onDrillDown  — (salesman) => void  (manager/supervisor drill-down; optional)
export default function KPICardsStrip({ salesmanData = [], totals, role, loading = false, onDrillDown }) {
  const [activePopup, setActivePopup] = useState(null);
  const [drillSalesman, setDrillSalesman] = useState(null);

  // Reset any drill-down when switching popups or closing.
  useEffect(() => { setDrillSalesman(null); }, [activePopup]);

  // Close the popup on Escape.
  useEffect(() => {
    if (!activePopup) return;
    const onKey = (e) => { if (e.key === 'Escape') setActivePopup(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activePopup]);

  const cards = cardDefs(totals);

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => setActivePopup(c.key)}
            className="bg-card rounded-2xl border border-border p-4 relative overflow-hidden text-left hover:shadow-md hover:border-blue-300 transition-all"
          >
            <div className={`absolute top-0 left-0 right-0 h-1 ${c.strip}`} />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {c.label}
            </p>
            {loading ? (
              <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            ) : (
              <p className={`text-xl font-bold tabular-nums ${c.valueClass}`}>{c.value}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1 truncate">{c.sub}</p>
          </button>
        ))}
      </div>

      {/* Popup */}
      {activePopup && (
        <>
          <div
            className="fixed inset-0 z-[600] bg-black/50 backdrop-blur-sm"
            onClick={() => setActivePopup(null)}
          />
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden pointer-events-auto border border-border">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {POPUP_TITLES[activePopup]} — {salesmanData.length} salesman{salesmanData.length === 1 ? '' : 'en'}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activePopup === 'winRate'
                      ? `Team 3-month average: ${(totals?.winRate3m || 0).toFixed(1)}%`
                      : activePopup === 'target'
                      ? `Total target: ${fmtSAR(totals?.target)} SAR`
                      : activePopup === 'achieved'
                      ? `Total achieved: ${fmtSAR(totals?.achieved)} SAR`
                      : activePopup === 'deficit'
                      ? `Total deficit: ${fmtSAR(totals?.deficit)} SAR`
                      : `Total planned gap: ${fmtSAR(totals?.plannedGap)} SAR`}
                  </p>
                </div>
                <button
                  onClick={() => setActivePopup(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Icon name="X" size={16} className="text-muted-foreground" />
                </button>
              </div>

              {/* Body */}
              <div className="px-4 py-4 overflow-y-auto flex-1">
                <SalesmanTable
                  rows={salesmanData}
                  active={activePopup}
                  role={role}
                  onDrillDown={onDrillDown}
                />
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-border flex justify-end flex-shrink-0">
                <button
                  onClick={() => setActivePopup(null)}
                  className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
