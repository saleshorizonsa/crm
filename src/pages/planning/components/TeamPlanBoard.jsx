import React, { useMemo, useState } from "react";
import { VerdictPill } from "./WeeklyPacing";

/**
 * THE TEAM PLAN BOARD — one row per person, at the top of Planning.
 *
 * It answers the question a supervisor opens this page with: who has not
 * planned, and who is short. Before this, the only way to find out was to
 * filter to each salesman in turn and read the five cards again.
 *
 * Every figure is computePlanningPageSummary's, called once per person
 * (utils/teamPlanBoard.js) — so the TOTALS row equals the viewer's own cards
 * exactly, because both come out of the same function over the same scope.
 * The totals are the viewer's summary, passed in, NOT a sum of the rows: a
 * team's required plan is its own remaining target ÷ its own conversion, which
 * is not the sum of the members'.
 *
 * Session 9's table style: frozen first column, wrapped headers, numbers right
 * and never wrapping. Clicking a row filters the page to that person.
 */

const STICKY = "sticky left-0 z-10 border-r border-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.10)]";
const HEAD_WRAP = "whitespace-normal break-words max-w-[7rem] align-bottom";

const money = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(0)}%`);

const STATUS_STYLE = {
  "not submitted": "bg-red-50 text-red-700 border-red-200",
  submitted: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const COLUMNS = [
  { key: "name", label: "Name", align: "left" },
  { key: "planStatus", label: "Plan status", align: "left" },
  { key: "target", label: "Target", money: true },
  { key: "requiredPlan", label: "Required plan", money: true },
  { key: "planned", label: "Planned", money: true },
  // DISPLAY ONLY — see utils/teamPlanBoard.js. A converted item is a deal now
  // and is already counted in the funnel and in Achieved; putting it back into
  // Planned would count it twice. It is here because without it a salesman who
  // converted his whole plan read exactly like one who never planned.
  { key: "converted", label: "Converted", converted: true },
  { key: "funnel", label: "Funnel", money: true },
  { key: "coveragePct", label: "Planning coverage %", pct: true },
  { key: "plannedGap", label: "Planned gap", money: true },
  { key: "notConverted", label: "Not-converted items", int: true },
  // The weekly pacing verdict, computed once for the whole scope by
  // utils/weeklyPacing.js and passed in — the same verdict the pacing panel
  // above shows, not a second reading of it.
  { key: "pacing", label: "Pacing", pacing: true },
  { key: "daysLeft", label: "Days left", int: true },
];

export default function TeamPlanBoard({
  rows = [], totals = null, loading = false, onPickPerson, scopeLabel = "",
  // id -> "on pace" | "behind" | "far behind", and the scope's own verdict.
  pacingByPerson = {}, pacingTotal = null,
}) {
  const [sort, setSort] = useState({ key: "plannedGap", dir: "desc" });

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    const val = (r) => {
      const v = r[sort.key];
      if (typeof v === "number") return v;
      return String(v ?? "").toLowerCase();
    };
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === y) return 0;
      const less = x < y ? -1 : 1;
      return sort.dir === "asc" ? less : -less;
      // eslint-disable-next-line no-unused-expressions
      col;
    });
  }, [rows, sort]);

  if (!loading && !rows.length) return null;

  const cell = (r, c) => {
    if (c.pacing) return <VerdictPill verdict={pacingByPerson[r.id] || null} />;
    if (c.converted) {
      if (!r.convertedCount && !r.movedCount) return "—";
      return (
        <span
          title={[
            `${r.convertedCount} plan ${r.convertedCount === 1 ? "item" : "items"} converted to deals, worth ${money(r.convertedValue)}`,
            r.movedCount ? `${r.movedCount} moved to a later month, worth ${money(r.movedValue)}` : null,
            "Already counted as deals in Funnel and Achieved — not added to Planned, Required plan or the gap.",
          ].filter(Boolean).join(". ")}
          className="text-emerald-700"
        >
          {r.convertedCount} · {money(r.convertedValue)}
          {r.movedCount ? (
            <span className="text-muted-foreground font-normal"> (+{r.movedCount} moved)</span>
          ) : null}
        </span>
      );
    }
    if (c.money) return money(r[c.key]);
    if (c.pct) return pct(r[c.key]);
    if (c.int) return r[c.key] == null ? "—" : String(r[c.key]);
    return r[c.key];
  };

  return (
    <section className="bg-card rounded-2xl border border-border overflow-hidden mb-6" data-testid="team-plan-board">
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Team plan board</h2>
          <p className="text-xs text-muted-foreground">
            {scopeLabel ? `${scopeLabel} — ` : ""}who has planned, and who is short. Click a row for that person&apos;s plan.
          </p>
        </div>
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted">
              {COLUMNS.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={[
                    "px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border select-none",
                    i === 0
                      ? `text-left whitespace-nowrap bg-muted ${STICKY} z-20`
                      : `text-right ${HEAD_WRAP}`,
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => setSort((s) => (s.key === c.key
                      ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" }
                      : { key: c.key, dir: "desc" }))}
                    title={`Sort by ${c.label}`}
                    className={`w-full uppercase tracking-wide hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded ${
                      i === 0 ? "text-left" : `text-right ${HEAD_WRAP}`
                    }`}
                  >
                    {c.label}
                    <span aria-hidden="true">
                      {sort.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((r) => (
              <tr
                key={r.id}
                onClick={onPickPerson ? () => onPickPerson(r.id) : undefined}
                className={`group ${onPickPerson ? "cursor-pointer" : ""} hover:bg-muted/50`}
              >
                {COLUMNS.map((c, i) => (
                  <td
                    key={c.key}
                    className={[
                      "px-3 py-2",
                      i === 0
                        ? `text-left bg-card group-hover:bg-muted/50 ${STICKY} font-medium text-foreground`
                        : "text-right whitespace-nowrap tabular-nums",
                      c.key === "plannedGap" && r.plannedGap > 0 ? "text-red-600 font-semibold" : "",
                      c.key === "notConverted" && r.notConverted > 0 ? "text-amber-700 font-semibold" : "",
                    ].join(" ")}
                  >
                    {c.key === "planStatus" ? (
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${STATUS_STYLE[r.planStatus] || ""}`}>
                          {r.planStatus}
                        </span>
                        {/* NO PLAN AT ALL — open and converted both zero. A
                            plan that has all been converted is not an empty
                            plan, and this used to read the same for both. */}
                        {r.emptyPlan && (
                          <span
                            data-testid="board-no-plan"
                            title="Nothing planned for this month: no open items and none converted."
                            className="text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-red-50 text-red-700 border-red-200"
                          >
                            no plan
                          </span>
                        )}
                      </span>
                    ) : cell(r, c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold" data-testid="team-plan-totals">
                <td className={`px-3 py-2 text-left bg-muted/60 ${STICKY}`}>Totals</td>
                <td className="px-3 py-2 text-right text-[10px] text-muted-foreground uppercase">your cards</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.target)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.requiredPlan)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.plannedOpen)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                  {rows.reduce((s, r) => s + (r.convertedCount || 0), 0)}
                  {" · "}
                  {money(rows.reduce((s, r) => s + (r.convertedValue || 0), 0))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.openFunnel)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(totals.coveragePct)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.plannedGap)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {rows.reduce((s, r) => s + (r.notConverted || 0), 0)}
                </td>
                <td className="px-3 py-2 text-right">
                  <VerdictPill verdict={pacingTotal} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {rows[0]?.daysLeft ?? "—"}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
        The totals row is the viewer&apos;s own Planning cards, not a sum of the rows:
        a team&apos;s required plan is its own remaining target ÷ its own conversion,
        which is not the sum of its members&apos;.
        {" "}<b>Converted</b> is shown for information — those items are deals now,
        counted in Funnel and Achieved, and are in none of the figures beside them.
      </p>
    </section>
  );
}
