import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';

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
function SalesmanTable({ rows, active, canDrill, onRowClick }) {
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
              onClick={canDrill ? () => onRowClick(s) : undefined}
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

// Individual-salesman drill view (manager/supervisor). Shows that salesman's own
// KPI numbers plus a metric-specific list of their deals / plan items.
function DrillView({ salesman, popup, deals, opps, loading, onBack, showBack = true }) {
  const now = new Date();
  const mS = new Date(now.getFullYear(), now.getMonth(), 1);
  const mE = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const inMonth = (d) => d && new Date(d) >= mS && new Date(d) <= mE;
  const openDeals = deals.filter((d) => !['won', 'lost'].includes(d.stage));
  const wonThisMonth = deals.filter((d) => d.stage === 'won' && inMonth(d.closed_at));
  const history = deals.filter((d) => ['won', 'lost'].includes(d.stage));

  let items = [];
  let listLabel = '';
  switch (popup) {
    case 'achieved':
      items = wonThisMonth.map((d) => ({ id: 'd' + d.id, name: d.title, amount: +(d.final_amount ?? d.amount) || 0, badge: 'Won', tone: 'green' }));
      listLabel = 'Won deals this month'; break;
    case 'deficit':
      items = openDeals.map((d) => ({ id: 'd' + d.id, name: d.title, amount: +d.amount || 0, badge: d.stage?.replace('_', ' '), tone: 'blue' }));
      listLabel = 'Open Funnel deals'; break;
    case 'winRate':
      items = history.map((d) => ({ id: 'd' + d.id, name: d.title, amount: +(d.final_amount ?? d.amount) || 0, badge: d.stage === 'won' ? 'Won' : 'Lost', tone: d.stage === 'won' ? 'green' : 'red' }));
      listLabel = 'Deal history (won / lost)'; break;
    case 'plannedGap':
      items = opps.map((o) => ({ id: 'o' + o.id, name: o.customer_name, amount: +o.planned_amount || 0, badge: 'Plan', tone: 'purple' }));
      listLabel = 'Current Sales Plan items'; break;
    case 'target':
    default:
      items = [
        ...opps.map((o) => ({ id: 'o' + o.id, name: o.customer_name, amount: +o.planned_amount || 0, badge: 'Plan', tone: 'purple' })),
        ...openDeals.map((d) => ({ id: 'd' + d.id, name: d.title, amount: +d.amount || 0, badge: d.stage?.replace('_', ' '), tone: 'blue' })),
      ];
      listLabel = 'Funnel + Current Sales Plan'; break;
  }

  const stat = (label, value, cls) => (
    <div className="bg-muted/50 rounded-lg p-2.5 text-center">
      <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
  const toneCls = {
    green: 'bg-green-100 text-green-700', red: 'bg-red-100 text-red-600',
    blue: 'bg-blue-100 text-blue-700', purple: 'bg-purple-100 text-purple-700',
  };

  return (
    <div>
      {showBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <Icon name="ArrowLeft" size={14} /> Back to team
        </button>
      )}

      <div className="flex items-center gap-3 mb-4 p-3 bg-primary/5 rounded-xl">
        <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">
          {salesman.full_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <p className="font-semibold text-foreground">{salesman.full_name}</p>
          <p className="text-xs text-muted-foreground capitalize">{salesman.role}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
        {stat('Target', fmtSAR(salesman.target), 'text-foreground')}
        {stat('Achieved', fmtSAR(salesman.achieved), 'text-green-600')}
        {stat('Deficit', salesman.deficit <= 0 ? '✓' : fmtSAR(salesman.deficit), salesman.deficit <= 0 ? 'text-green-600' : 'text-red-600')}
        {stat('Win%', `${salesman.winRate3m.toFixed(0)}%`, 'text-purple-600')}
        {stat('Gap', salesman.plannedGap <= 0 ? '✓' : fmtSAR(salesman.plannedGap), salesman.plannedGap <= 0 ? 'text-green-600' : 'text-red-600')}
      </div>

      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        {listLabel} ({items.length})
      </p>
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nothing to show here.</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 p-2.5 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${toneCls[it.tone] || 'bg-muted text-muted-foreground'}`}>
                  {it.badge}
                </span>
                <span className="text-sm text-foreground truncate">{it.name || '—'}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground flex-shrink-0">{fmtSAR(it.amount)} SAR</span>
            </div>
          ))}
        </div>
      )}
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

  // Managers/supervisors can drill into an individual salesman's data. A plain
  // salesman sees their OWN rich view directly (their single row, no team table).
  const canDrill = ['manager', 'supervisor'].includes(role);
  const isSalesman = role === 'salesman';
  const selfRow = isSalesman ? (salesmanData[0] || null) : null;
  const viewSalesman = drillSalesman || selfRow; // whose detail the popup shows

  const [drillDeals, setDrillDeals] = useState([]);
  const [drillOpps, setDrillOpps] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activePopup || !viewSalesman?.id) { setDrillDeals([]); setDrillOpps([]); return; }
      setDrillLoading(true);
      const [dRes, oRes] = await Promise.all([
        supabase
          .from('deals')
          .select('id, title, stage, amount, final_amount, closed_at, created_at')
          .eq('owner_id', viewSalesman.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('opportunities')
          .select('id, customer_name, planned_amount, expected_month, status')
          .eq('owner_id', viewSalesman.id)
          .eq('status', 'open')
          .order('expected_month', { ascending: true })
          .limit(100),
      ]);
      if (!cancelled) {
        setDrillDeals(dRes.data || []);
        setDrillOpps(oRes.data || []);
        setDrillLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewSalesman?.id, activePopup]);

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
                    {POPUP_TITLES[activePopup]}
                    {isSalesman
                      ? ' — My numbers'
                      : ` — ${salesmanData.length} salesman${salesmanData.length === 1 ? '' : 'en'}`}
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
                {viewSalesman ? (
                  <DrillView
                    salesman={viewSalesman}
                    popup={activePopup}
                    deals={drillDeals}
                    opps={drillOpps}
                    loading={drillLoading}
                    showBack={!!drillSalesman}
                    onBack={() => setDrillSalesman(null)}
                  />
                ) : (
                  <SalesmanTable
                    rows={salesmanData}
                    active={activePopup}
                    canDrill={canDrill}
                    onRowClick={setDrillSalesman}
                  />
                )}
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
