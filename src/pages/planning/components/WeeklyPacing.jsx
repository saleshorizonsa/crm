import React from "react";

/**
 * WEEK BY WEEK THROUGH THE MONTH — plan converted, revenue in, against an even
 * pace line.
 *
 * The month-level verdict says "behind" on the 28th. This says it in week two.
 * Both figures are cumulative and both come from utils/weeklyPacing.js, which
 * uses the shared Achieved rule and the Coverage Console's own 15-point
 * tolerance — no second definition of either.
 *
 * Weeks that have not happened yet are drawn as empty: continuing the line
 * past today would show everyone far behind on the 3rd of the month.
 */

const money = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
const short = (v) => {
  const n = Math.abs(Number(v) || 0);
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
};

export const VERDICT_STYLE = {
  "on pace": "bg-green-50 text-green-700 border-green-200",
  behind: "bg-amber-50 text-amber-700 border-amber-200",
  "far behind": "bg-red-50 text-red-700 border-red-200",
};

export function VerdictPill({ verdict, className = "" }) {
  if (!verdict) return <span className="text-muted-foreground text-[11px]">—</span>;
  return (
    <span
      data-testid="pacing-verdict"
      className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold whitespace-nowrap ${VERDICT_STYLE[verdict] || ""} ${className}`}
    >
      {verdict}
    </span>
  );
}

export default function WeeklyPacing({ data, loading = false, scopeLabel = "" }) {
  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading weekly pacing…</p>;
  }
  if (!data || !data.totals || !data.isCurrentMonth) return null;

  const t = data.totals;
  // One scale for both series and the line, so the bars are comparable.
  const peak = Math.max(
    t.target,
    ...t.series.map((s) => Math.max(s.paceLine || 0, s.achieved || 0, s.converted || 0)),
    1,
  );

  return (
    <section className="bg-card rounded-2xl border border-border p-4" data-testid="weekly-pacing">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Weekly pacing</h2>
          <p className="text-xs text-muted-foreground">
            {scopeLabel ? `${scopeLabel} — ` : ""}plan converted and revenue in, against an even pace.
          </p>
        </div>
        <VerdictPill verdict={t.verdict} />
      </div>

      <div className="flex items-end gap-3 h-32">
        {t.series.map((s) => {
          const h = (v) => `${Math.max(0, Math.min(100, ((v || 0) / peak) * 100))}%`;
          return (
            <div key={s.week} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full">
              <div className="flex-1 w-full flex items-end justify-center gap-1 relative">
                {/* the pace line at this week's end */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/60"
                  style={{ bottom: h(s.paceLine) }}
                  aria-hidden="true"
                />
                <div
                  className="w-1/3 bg-indigo-400/70 rounded-t"
                  style={{ height: h(s.converted) }}
                  title={`Plan converted to deals by week ${s.week}: ${money(s.converted)}`}
                />
                <div
                  className="w-1/3 bg-green-600 rounded-t"
                  style={{ height: h(s.achieved) }}
                  title={`Invoiced by week ${s.week}: ${money(s.achieved)} · even pace would be ${money(s.paceLine)}`}
                />
              </div>
              <span className={`text-[10px] font-mono ${s.inPast ? "text-foreground" : "text-muted-foreground/50"}`}>
                {s.label}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {s.achieved == null ? "—" : short(s.achieved)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-border flex-wrap text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400/70" />Plan converted
          <span className="font-mono">{money(t.converted)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-600" />Invoiced
          <span className="font-mono">{money(t.achieved)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-3 border-t border-dashed border-muted-foreground/60" />
          Even pace to {money(t.target)}
        </span>
      </div>

      {data.people.length > 1 && (
        <div className="mt-3 pt-2.5 border-t border-border space-y-1.5">
          {data.people.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate text-foreground">{p.name}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="font-mono text-muted-foreground">
                  {money(p.achieved)} of {money(p.target)}
                </span>
                <VerdictPill verdict={p.verdict} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
