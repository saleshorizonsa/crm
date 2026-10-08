import React, { useEffect, useMemo, useState } from "react";
import Icon from "components/AppIcon";
import DrillSheet from "components/DrillSheet";
import {
  computePlanAccuracy, lastCompletedMonths, monthRange, PLAN_ACCURACY_COLUMNS,
} from "utils/planAccuracy";

/**
 * DID THE PLAN HAPPEN? — the completed months, per person.
 *
 * A plan that is never looked at again is a ritual. This is the look back:
 * what was planned, how much of it became a deal, was won, was invoiced — and
 * what share of the month's revenue came from the plan at all.
 *
 * Every figure is utils/planAccuracy.js's, which in turn uses the shared
 * Achieved rule. Nothing is computed here.
 *
 * Clicking a person opens their plan items with what became of each, in the
 * same sheet the cards use.
 */

const money = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
const monthLabel = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};

const STICKY = "sticky left-0 z-10 border-r border-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.10)]";
const HEAD_WRAP = "whitespace-normal break-words max-w-[7rem] align-bottom";

/** One stage of the funnel, as a bar whose width is its share of what was planned. */
function FunnelBar({ label, value, of, count, tone }) {
  const share = of > 0 ? Math.min(100, (value / of) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] text-muted-foreground w-28 flex-shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-muted rounded overflow-hidden min-w-0">
        <div className={`h-full ${tone}`} style={{ width: `${share}%` }} />
      </div>
      <span className="text-[11px] font-mono tabular-nums w-24 text-right flex-shrink-0">
        {money(value)}
      </span>
      <span className="text-[10px] text-muted-foreground w-14 text-right flex-shrink-0">
        {count == null ? "" : `${count} items`}
      </span>
    </div>
  );
}

export default function PlanAccuracyModule({
  companyId, ownerIds = [], users = [], scopeLabel = "",
}) {
  const months = useMemo(() => lastCompletedMonths(3), []);
  const [monthKey, setMonthKey] = useState(months[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openPerson, setOpenPerson] = useState(null);
  const idKey = ownerIds.join(",");

  useEffect(() => {
    let alive = true;
    if (!companyId || !idKey) { setData(null); return undefined; }
    setLoading(true);
    computePlanAccuracy({
      companyId, ownerIds: idKey.split(","), monthKey, users,
    }).then((r) => { if (alive) { setData(r); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, idKey, monthKey]);

  const t = data?.totals;
  const person = openPerson && data
    ? data.people.find((p) => p.id === openPerson)
    : null;

  return (
    <section className="space-y-5" data-testid="plan-accuracy">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Plan accuracy</h2>
          <p className="text-xs text-muted-foreground">
            {scopeLabel ? `${scopeLabel} — ` : ""}what was planned, and what came of it.
            Completed months only: an unfinished month&apos;s plan is still open by design.
          </p>
        </div>
        <div className="flex items-center gap-1" data-testid="accuracy-months">
          {months.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { setMonthKey(k); setOpenPerson(null); }}
              aria-current={monthKey === k}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                monthKey === k
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {monthLabel(k)}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Loading {monthLabel(monthKey)}…</p>}

      {!loading && data && !data.people.length && (
        <div className="bg-card rounded-2xl border border-border p-10 text-center">
          <Icon name="CalendarX" size={20} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Nothing was planned for {monthLabel(monthKey)} in this scope.
          </p>
        </div>
      )}

      {!loading && t && data.people.length > 0 && (
        <>
          {/* ── the funnel, for the whole scope ── */}
          <div className="bg-card rounded-2xl border border-border p-4 space-y-2.5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {monthLabel(monthKey)} · the plan, stage by stage
              </p>
              <p className="text-xs">
                <span className="text-muted-foreground">Plan hit rate </span>
                <span className={`font-mono font-semibold ${
                  (t.hitRate ?? 0) >= 50 ? "text-green-600"
                    : (t.hitRate ?? 0) >= 20 ? "text-amber-600" : "text-red-600"
                }`}>
                  {pct(t.hitRate)}
                </span>
              </p>
            </div>
            <FunnelBar label="Planned" value={t.plannedValue} of={t.plannedValue} count={t.plannedItems} tone="bg-blue-500" />
            <FunnelBar label="Became a deal" value={t.convertedValue} of={t.plannedValue} count={t.convertedItems} tone="bg-indigo-500" />
            <FunnelBar label="Won" value={t.wonValue} of={t.plannedValue} count={t.wonItems} tone="bg-teal-500" />
            <FunnelBar label="Invoiced" value={t.invoicedValue} of={t.plannedValue} count={t.invoicedItems} tone="bg-green-600" />
            <p className="text-[11px] text-muted-foreground pt-1.5 border-t border-border">
              Invoiced {money(t.invoicedValue)} of {money(t.plannedValue)} planned.
              {t.movedItems > 0 && ` ${t.movedItems} ${t.movedItems === 1 ? "item was" : "items were"} moved to a later month.`}
            </p>
          </div>

          {/* ── where the month's revenue came from ── */}
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
              Where {monthLabel(monthKey)}&apos;s revenue came from
            </p>
            <div className="flex h-6 rounded overflow-hidden bg-muted" role="img"
              aria-label={`From the plan ${money(t.achievedFromPlan)}, unplanned ${money(t.achievedUnplanned)}`}>
              <div className="bg-green-600 h-full" style={{ width: `${t.achievedGross > 0 ? (t.achievedFromPlan / t.achievedGross) * 100 : 0}%` }} />
              <div className="bg-amber-400 h-full" style={{ width: `${t.achievedGross > 0 ? (t.achievedUnplanned / t.achievedGross) * 100 : 0}%` }} />
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-600" />
                From a plan item <span className="font-mono">{money(t.achievedFromPlan)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
                Unplanned <span className="font-mono">{money(t.achievedUnplanned)}</span>
                <span className="text-muted-foreground">({t.unplannedInvoices} invoices)</span>
              </span>
              <span className="text-muted-foreground">
                = Achieved {money(t.achievedGross)}
                {t.returns > 0 && ` gross, ${money(t.achievedNet)} net of returns`}
              </span>
            </div>
          </div>

          {/* ── per person ── */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted">
                    {["Name", "Planned", "Items", "Became a deal", "Invoiced", "Plan hit rate", "From plan", "Unplanned"]
                      .map((h, i) => (
                        <th
                          key={h}
                          scope="col"
                          className={`px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border ${
                            i === 0 ? `text-left whitespace-nowrap bg-muted ${STICKY} z-20` : `text-right ${HEAD_WRAP}`
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.people.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setOpenPerson(p.id)}
                      data-testid="accuracy-person"
                      className="group cursor-pointer hover:bg-muted/50"
                    >
                      <td className={`px-3 py-2 text-left bg-card group-hover:bg-muted/50 ${STICKY} font-medium text-foreground`}>
                        {p.name}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(p.plannedValue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.plannedItems}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.convertedItems}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(p.invoicedValue)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        (p.hitRate ?? 0) >= 50 ? "text-green-600"
                          : (p.hitRate ?? 0) >= 20 ? "text-amber-600" : "text-red-600"
                      }`}>
                        {pct(p.hitRate)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(p.achievedFromPlan)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(p.achievedUnplanned)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/60 font-semibold" data-testid="accuracy-totals">
                    <td className={`px-3 py-2 text-left bg-muted/60 ${STICKY}`}>Totals</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(t.plannedValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.plannedItems}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.convertedItems}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(t.invoicedValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(t.hitRate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(t.achievedFromPlan)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(t.achievedUnplanned)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
              From plan + Unplanned = that month&apos;s Achieved, gross of credit notes —
              the two halves of where the revenue came from, which is a different cut
              from the funnel above: that follows this month&apos;s plan items wherever
              they ended up. Click a row for the items.
            </p>
          </div>
        </>
      )}

      {person && (
        <DrillSheet
          label={`${person.name} · ${monthLabel(monthKey)}`}
          total={person.invoicedValue}
          note={`${person.plannedItems} items planned, worth ${money(person.plannedValue)}. ${person.invoicedItems} invoiced, worth ${money(person.invoicedValue)} — a hit rate of ${pct(person.hitRate)}.`}
          columns={PLAN_ACCURACY_COLUMNS}
          rows={person.items}
          onClose={() => setOpenPerson(null)}
          scopeLabel={monthLabel(monthKey)}
        />
      )}
    </section>
  );
}
