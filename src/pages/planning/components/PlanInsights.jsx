import React, { useEffect, useMemo, useState } from "react";
import DrillSheet from "components/DrillSheet";
import {
  computeSlippingDeals, fetchCompletedMonths, computePlanRealism, realismSentence,
  computeUnplannedBuyers, currentMonthBounds, shortMonth, REALISM_MIN_MONTHS, SLIP_MIN_PUSHES,
} from "utils/planInsights";

/**
 * SLIPPING DEALS, PLAN REALISM, UNPLANNED BUYERS — below Plan accuracy.
 *
 * Every figure is utils/planInsights.js's, which groups the shared rules'
 * own rows (Achieved, the from-plan/unplanned split, isConvertedWithDeal,
 * customerKey). Nothing is computed here but layout.
 *
 * "Add to plan" hands a suggestion to the plan form exactly as the Gap closer
 * does — it opens the form filled in and writes nothing. It is offered only on
 * the viewer's OWN customers: a plan item is always created in the plan of the
 * person who saves it (OpportunitiesModule), so a lead pressing it on a
 * salesman's customer would have put that customer in the lead's plan.
 */

const money = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
const STICKY = "sticky left-0 z-10 border-r border-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.10)]";
const TH = "px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border";
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "the owner";

// The same bands Plan accuracy's hit rate uses, so one colour means one thing.
const tone = (v) => (v == null ? "" : v >= 50 ? "text-green-600" : v >= 20 ? "text-amber-600" : "text-red-600");

function Card({ title, sub, testid, children }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden" data-testid={testid}>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

/** Three small bars, oldest month first: realism per month. */
function Trend({ monthKeys, cells, label }) {
  const vals = monthKeys.map((k) => cells[k]?.realism ?? null);
  const top = Math.max(100, ...vals.filter((v) => v != null));
  return (
    <span className="inline-flex items-end gap-1 h-7" role="img"
      aria-label={`${label}: ${monthKeys.map((k, i) => `${shortMonth(k)} ${pct(vals[i])}`).join(", ")}`}>
      {monthKeys.map((k, i) => (
        <span key={k} className="flex flex-col items-center gap-0.5" title={`${shortMonth(k)}: ${realismSentence(cells[k])}`}>
          <span className={`w-3 rounded-sm ${vals[i] == null ? "bg-muted" : "bg-blue-500"}`}
            style={{ height: `${vals[i] == null ? 3 : Math.max(3, (vals[i] / top) * 22)}px` }} />
          <span className="text-[8px] leading-none text-muted-foreground">{shortMonth(k).slice(0, 1)}</span>
        </span>
      ))}
    </span>
  );
}

export default function PlanInsights({
  companyId, ownerIds = [], activeIds = [], users = [], viewerId = null,
  history = null, onAddToPlan,
}) {
  const [slip, setSlip] = useState(null);
  const [realism, setRealism] = useState(null);
  const [buyers, setBuyers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openSlip, setOpenSlip] = useState(null);
  const idKey = ownerIds.join(",");
  const activeKey = activeIds.join(",");

  useEffect(() => {
    let alive = true;
    if (!companyId || !idKey) { setSlip(null); setRealism(null); setBuyers(null); return undefined; }
    setLoading(true);
    (async () => {
      const ids = idKey.split(",");
      const act = activeKey ? activeKey.split(",") : [];
      const [s, monthsData] = await Promise.all([
        computeSlippingDeals({ companyId, ownerIds: act, users }),
        fetchCompletedMonths({ companyId, ownerIds: ids, users }),
      ]);
      const b = await computeUnplannedBuyers({
        companyId, monthsData, activeIds: act, users, thisMonth: currentMonthBounds(),
      });
      if (!alive) return;
      setSlip(s);
      setRealism(computePlanRealism({ monthsData, activeIds: act }));
      setBuyers(b);
      setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, idKey, activeKey]);

  const slipOpen = openSlip && slip ? slip.rows.find((r) => r.key === openSlip) : null;
  const slipDrillRows = useMemo(() => {
    if (!slipOpen) return [];
    return [
      ...slipOpen.pushes.map((p, i) => ({
        what: `Push ${i + 1} of ${slipOpen.times}`,
        month: p.expected_month,
        amount: Number(p.planned_amount) || 0,
        status: p.status === "pending" ? "pending" : "moved to a plan",
        date: p.moved_at || p.created_at,
      })),
      ...slipOpen.items.map((o) => ({
        what: "Plan item",
        month: o.expected_month,
        amount: Number(o.planned_amount) || 0,
        status: o.status === "moved_to_future" ? "moved to a later month" : o.status,
        date: o.created_at,
      })),
    ];
  }, [slipOpen]);

  if (!companyId || !idKey) return null;
  if (loading && !realism) {
    return <p className="text-xs text-muted-foreground" data-testid="plan-insights-loading">Loading slipping deals, realism and unplanned buyers…</p>;
  }

  return (
    <div className="space-y-5" data-testid="plan-insights">
      {/* ── 1. SLIPPING DEALS ── */}
      {slip && (
        <Card
          testid="slipping-deals"
          title="Slipping deals"
          sub={slip.failed
            ? "Couldn't read the pushed orders — refresh to try again."
            : `${slip.rows.length} ${slip.rows.length === 1 ? "customer" : "customers"} pushed ${SLIP_MIN_PUSHES}+ times, worth ${money(slip.value)}`}
        >
          {slip.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted">
                    {["Person", "Customer", "Value", "Times pushed", "Months", "Where it is now"].map((h, i) => (
                      <th key={h} scope="col" className={`${TH} ${i === 0 ? `text-left bg-muted ${STICKY} z-20` : i >= 2 && i <= 3 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {slip.rows.map((r) => (
                    <tr key={r.key} data-testid="slip-row" onClick={() => setOpenSlip(r.key)} className="group cursor-pointer hover:bg-muted/50">
                      <td className={`px-3 py-2 text-left bg-card group-hover:bg-muted/50 ${STICKY} font-medium text-foreground whitespace-nowrap`}>{r.person}</td>
                      <td className="px-3 py-2">{r.customer}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.times}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.months}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.now.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !slip.failed && <p className="px-4 py-3 text-xs text-muted-foreground">No customer has been pushed {SLIP_MIN_PUSHES} or more times.</p>
          )}
          <p className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
            A push is one move to a later month (a Future Orders row, moved or pending). Value is the latest amount;
            sorted by value × times pushed. Click a row for that person&apos;s items for the customer.
          </p>
        </Card>
      )}

      {/* ── 2. PLAN REALISM ── */}
      {realism && (
        <Card
          testid="plan-realism"
          title="Plan realism"
          sub={`Planned vs invoiced, the last ${realism.monthKeys.length} completed months. Colours only once there are ${REALISM_MIN_MONTHS} months of plan to judge.`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  <th scope="col" className={`${TH} text-left bg-muted ${STICKY} z-20`}>Name</th>
                  {realism.monthKeys.map((k) => (
                    <th key={k} scope="col" className={`${TH} text-left`}>{shortMonth(k)}</th>
                  ))}
                  <th scope="col" className={`${TH} text-right`}>{realism.monthKeys.length} months</th>
                  <th scope="col" className={`${TH} text-left`}>Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {realism.people.map((p) => (
                  <tr key={p.id} data-testid="realism-row">
                    <td className={`px-3 py-2 text-left bg-card ${STICKY} font-medium text-foreground whitespace-nowrap`}>{p.name}</td>
                    {realism.monthKeys.map((k) => {
                      const c = p.months[k];
                      return (
                        <td key={k} className="px-3 py-2 align-top min-w-[11rem]">
                          <div className="text-foreground">{realismSentence(c)}</div>
                          {c && c.invoiced > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              from a plan {money(c.fromPlan)} · unplanned {money(c.unplanned)}
                              {c.ownPlan !== c.fromPlan && ` · from this month's own plan ${money(c.ownPlan)}`}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${p.overall.judged ? tone(p.overall.realism) : ""}`}>
                      {pct(p.overall.realism)}
                    </td>
                    <td className="px-3 py-2"><Trend monthKeys={realism.monthKeys} cells={p.months} label={p.name} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 font-semibold" data-testid="realism-team">
                  <td className={`px-3 py-2 text-left bg-muted/60 ${STICKY}`}>{realism.people.length > 1 ? "Team" : "Total"}</td>
                  {realism.monthKeys.map((k) => {
                    const c = realism.team.months[k];
                    return (
                      <td key={k} className="px-3 py-2 align-top">
                        <div>{realismSentence(c)}</div>
                        {c && c.invoiced > 0 && (
                          <div className="text-[10px] font-normal text-muted-foreground">
                            from a plan {money(c.fromPlan)} · unplanned {money(c.unplanned)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2 text-right tabular-nums ${realism.team.overall.judged ? tone(realism.team.overall.realism) : ""}`}>
                    {pct(realism.team.overall.realism)}
                  </td>
                  <td className="px-3 py-2"><Trend monthKeys={realism.monthKeys} cells={realism.team.months} label="Team" /></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
            Planned = every item filed for the month, whatever became of it. Invoiced = that month&apos;s Achieved
            (gross), = from a plan + unplanned. &quot;From a plan&quot; counts an item from any month, so a deal planned
            in August and invoiced in September is from a plan in September.
            {realism.monthKeys.some((k) => Math.round(realism.team.departed[k]?.invoiced || 0) !== 0) && (
              <span data-testid="realism-departed">
                {" "}The team row includes people no longer with the company:
                {" "}{realism.monthKeys.map((k) => `${shortMonth(k)} ${money(realism.team.departed[k]?.invoiced)}`).join(", ")} invoiced.
              </span>
            )}
          </p>
        </Card>
      )}

      {/* ── 3. UNPLANNED BUYERS ── */}
      {buyers && (
        <Card
          testid="unplanned-buyers"
          title="Unplanned buyers"
          sub={`Customers invoiced in the last ${buyers.months} completed months without coming from any plan item — ${buyers.rows.length} customers, ${money(buyers.total)}; ${buyers.notInPlan} not in this month's plan.`}
        >
          {buyers.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted">
                    {["Customer", "Owner", `Invoiced (${buyers.months} months)`, "Months bought", "In this month's plan?", ""].map((h, i) => (
                      <th key={h || "action"} scope="col" className={`${TH} ${i === 0 ? `text-left bg-muted ${STICKY} z-20` : i === 2 || i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {buyers.rows.map((r) => {
                    const mine = viewerId && r.ownerId === viewerId;
                    const usual = history?.get?.(r.customerKey)?.usualOrder ?? r.usualOrder;
                    return (
                      <tr key={r.key} data-testid="buyer-row">
                        <td className={`px-3 py-2 text-left bg-card ${STICKY} font-medium text-foreground`}>{r.customer}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.owner}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(r.invoiced)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.monthsBought} of {buyers.months}</td>
                        <td className="px-3 py-2">{r.inThisMonthsPlan ? "yes" : "no"}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {!r.inThisMonthsPlan && (mine && onAddToPlan ? (
                            <button
                              type="button"
                              data-testid="buyer-add-to-plan"
                              onClick={() => onAddToPlan({ customer: r.customer, value: usual, contactId: r.contactId })}
                              className="text-[11px] px-2 py-1 rounded-md border border-blue-300 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                            >
                              Add to plan
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground" title="A plan item goes into the plan of whoever saves it, so only the owner can add their own customer.">
                              {firstName(r.owner)}&apos;s to add
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-3 text-xs text-muted-foreground">Every invoiced customer in these months came from a plan item.</p>
          )}
          <p className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
            Invoiced by the shared Achieved rule; &quot;unplanned&quot; = the invoice is linked to no plan item of any month,
            the same split as Plan accuracy above. Add to plan opens the plan form filled in with the usual order — nothing is saved until you confirm.
          </p>
        </Card>
      )}

      {slipOpen && (
        <DrillSheet
          label={`${slipOpen.person} · ${slipOpen.customer}`}
          total={slipOpen.value}
          note={`Pushed ${slipOpen.times} times (${slipOpen.months}). Now: ${slipOpen.now.label}.`}
          columns={[
            { key: "what", label: "What" },
            { key: "month", label: "For month", type: "month" },
            { key: "amount", label: "Amount", type: "money" },
            { key: "status", label: "Status" },
            { key: "date", label: "Date", type: "date" },
          ]}
          rows={slipDrillRows}
          onClose={() => setOpenSlip(null)}
          scopeLabel="Slipping deals"
        />
      )}
    </div>
  );
}
