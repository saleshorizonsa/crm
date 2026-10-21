import React from "react";
import Icon from "../../../components/AppIcon";
import { money, FLAG_STYLE } from "../../../components/DrillSheet";
import {
  TIER_KEYS, TIER_LABEL, TIER_EXPLAIN, HEALTHY_COVERAGE,
} from "../../../utils/forecastTiers";

// The sections of the Forecast page (session 31). Every figure arrives from the
// page, which got it from calcDivisionMetrics → computeTiers; nothing here
// computes a forecast of its own.

const FLAG = {
  ...FLAG_STYLE,
  "CHECK VALUE": "bg-red-50 text-red-700 border-red-200",
  "PAST DUE": "bg-red-50 text-red-700 border-red-200",
  "NO CLOSE DATE": "bg-amber-50 text-amber-700 border-amber-200",
  STALLED: "bg-amber-50 text-amber-700 border-amber-200",
};

export function Flags({ flags = [] }) {
  if (!flags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${FLAG[f] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
          {f.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

const pctOf = (v, t) => (t > 0 ? `${Math.round((v / t) * 100)}%` : "—");
const fmtDay = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const STAGE_LABEL = { lead: "Lead", contact_made: "Contact made", proposal_sent: "Proposal sent", negotiation: "Negotiation", won: "Won", lost: "Lost" };
export const stageLabel = (s) => STAGE_LABEL[s] || s || "—";

/* ── Outlier banner ─────────────────────────────────────────────────────── */
export function OutlierBanner({ flagged = [], without = null }) {
  if (!flagged.length) return null;
  const total = flagged.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  return (
    <div data-testid="outlier-banner" className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
      <Icon name="AlertTriangle" size={18} className="flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">
          {flagged.length} deal{flagged.length === 1 ? "" : "s"} flagged — {money(total)} — check before relying on this forecast
        </p>
        <p className="text-xs mt-0.5">
          {flagged.map((d) => `${d.title || "Untitled"} (${money(d.amount)})`).join(" · ")}.{" "}
          Flagged deals are still counted.
          {without && (
            <> Without them: Commit {money(without.commit)}, Most likely {money(without.mostLikely)}, Best case {money(without.bestCase)}.</>
          )}
        </p>
      </div>
    </div>
  );
}

/* ── Tier cards ─────────────────────────────────────────────────────────── */
export function TierCards({ tiers, target, onOpen, periodLabel }) {
  const card = (key, label, value, sub, tone, testid) => (
    <button
      key={key}
      data-testid={testid}
      onClick={() => onOpen?.(key)}
      className={`text-left bg-card border rounded-lg p-4 hover:shadow-md transition-shadow ${tone}`}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1">{money(value)}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </button>
  );
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {card("target", "Target", target, periodLabel, "border-border", "card-target")}
        {card("achieved", "Achieved", tiers.achieved, `invoiced, net of returns · ${pctOf(tiers.achieved, target)}`, "border-border", "card-achieved")}
        {card("wni", "Won, not invoiced", tiers.wni, tiers.containsToday ? `${tiers.wniCount} deals, as of today` : "counts only in the current period", "border-border", "card-wni")}
        {card("commit", "Commit", tiers.commit, `${pctOf(tiers.commit, target)} of target`, "border-emerald-300", "card-commit")}
        {card("mostLikely", "Most likely", tiers.mostLikely, `${pctOf(tiers.mostLikely, target)} of target`, "border-blue-300", "card-mostLikely")}
        {card("bestCase", "Best case", tiers.bestCase, `${pctOf(tiers.bestCase, target)} of target`, "border-violet-300", "card-bestCase")}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Past-due open deals ({tiers.pastDue.length}, {money(tiers.pastDueTotal)}) are in no tier — see Needs re-dating.
        Open deals and plan items are active salespeople's only. Click a card for its rows.
      </p>
    </div>
  );
}

/* ── Time-phased view ───────────────────────────────────────────────────── */
export function PhasedView({ rows = [], onOpen }) {
  return (
    <section className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold">By close month</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Each open deal counts in the month of its expected close date; undated deals in the current month only. Click a row for its Most likely rows.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left py-2 pr-3">Period</th>
              <th className="text-right py-2 px-2">Target</th>
              <th className="text-right py-2 px-2">Commit</th>
              <th className="text-right py-2 px-2">Most likely</th>
              <th className="text-right py-2 px-2">Best case</th>
              <th className="text-right py-2 pl-2">Most likely % of target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`phase-${r.id}`} onClick={() => onOpen?.(r)} className={`border-b border-border/60 hover:bg-muted/40 cursor-pointer ${r.isQuarter ? "font-semibold" : ""}`}>
                <td className="py-2 pr-3">{r.label}</td>
                <td className="text-right px-2 tabular-nums">{money(r.target)}</td>
                <td className="text-right px-2 tabular-nums">{money(r.tiers.commit)}</td>
                <td className="text-right px-2 tabular-nums">{money(r.tiers.mostLikely)}</td>
                <td className="text-right px-2 tabular-nums">{money(r.tiers.bestCase)}</td>
                <td className="text-right pl-2 tabular-nums">{pctOf(r.tiers.mostLikely, r.target)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Forecast vs target (by division / by salesman) ─────────────────────── */
export function VsTargetTable({ title, testid, rows = [], onOpen }) {
  if (!rows.length) return null;
  return (
    <section className="bg-card border border-border rounded-lg p-4" data-testid={testid}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Coverage = (open deals due + open plan) ÷ (target − achieved); {HEALTHY_COVERAGE}× or more is healthy. Click a row for its Most likely rows.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left py-2 pr-3 sticky left-0 bg-card">Name</th>
              {["Target", "Achieved", "Commit", "Most likely", "Best case", "Gap to target", "Coverage"].map((h) => (
                <th key={h} className="text-right py-2 px-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cov = r.coverage;
              const healthy = cov === null || cov >= HEALTHY_COVERAGE;
              return (
                <tr key={r.id} data-testid={`${testid}-row`} onClick={() => onOpen?.(r)} className="border-b border-border/60 hover:bg-muted/40 cursor-pointer">
                  <td className="py-2 pr-3 sticky left-0 bg-card">{r.name}</td>
                  <td className="text-right px-2 tabular-nums">{money(r.target)}</td>
                  <td className="text-right px-2 tabular-nums">{money(r.tiers.achieved)}</td>
                  <td className="text-right px-2 tabular-nums">{money(r.tiers.commit)}</td>
                  <td className="text-right px-2 tabular-nums">{money(r.tiers.mostLikely)}</td>
                  <td className="text-right px-2 tabular-nums">{money(r.tiers.bestCase)}</td>
                  <td className="text-right px-2 tabular-nums">{money(Math.max(0, r.target - r.tiers.mostLikely))}</td>
                  <td className={`text-right px-2 tabular-nums font-semibold ${healthy ? "text-emerald-700" : "text-red-600"}`}>
                    {cov === null ? (r.target > 0 ? "met" : "—") : `${cov.toFixed(1)}×`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Deal tables (top deals, risk list, needs re-dating) ───────────────── */
export function DealTable({ title, explain, testid, rows = [], columns, onOpenDeal, empty }) {
  return (
    <section className="bg-card border border-border rounded-lg p-4" data-testid={testid}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {explain && <p className="text-xs text-muted-foreground mb-3">{explain}</p>}
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{empty}</p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="sticky top-0 bg-card">
              <tr className="text-xs text-muted-foreground border-b border-border">
                {columns.map((c) => (
                  <th key={c.key} className={`py-2 px-2 whitespace-nowrap ${c.num ? "text-right" : "text-left"}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-testid={`${testid}-row`} onClick={() => onOpenDeal?.(r.dealId)} className="border-b border-border/60 hover:bg-muted/40 cursor-pointer">
                  {columns.map((c) => (
                    <td key={c.key} className={`py-2 px-2 ${c.num ? "text-right tabular-nums" : ""}`}>
                      {c.key === "flags" ? <Flags flags={r.flags} />
                        : c.money ? money(r[c.key])
                          : c.date ? fmtDay(r[c.key])
                            : (r[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Since last week + accuracy + take snapshot ────────────────────────── */
export function SnapshotPanel({ state, since, accuracy, canTake, onTake, taking, periodLabel }) {
  const delta = (v) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`;
  return (
    <section className="bg-card border border-border rounded-lg p-4" data-testid="snapshot-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold">Since last week</h3>
          <p className="text-xs text-muted-foreground">This month's tiers against the last weekly snapshot.</p>
        </div>
        {canTake && state.applied && (
          <button onClick={onTake} disabled={taking} data-testid="take-snapshot" className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50 flex items-center gap-1.5">
            <Icon name={taking ? "Loader2" : "Camera"} size={13} className={taking ? "animate-spin" : ""} />
            Take snapshot now
          </button>
        )}
      </div>
      {!state.applied ? (
        <p className="text-xs text-muted-foreground" data-testid="snapshot-not-applied">
          Snapshots need migrations/forecast_snapshots.sql, which is not applied yet. Everything else on this page works without it.
        </p>
      ) : state.message ? (
        <p className="text-xs text-muted-foreground mb-2">{state.message}</p>
      ) : null}
      {state.applied && !since && (
        <p className="text-xs text-muted-foreground" data-testid="since-empty">No earlier snapshot of this scope yet — the first comparison appears a week after the first snapshot.</p>
      )}
      {state.applied && since && (
        <div className="space-y-2 text-sm" data-testid="since">
          <p className="text-xs text-muted-foreground">Compared with the snapshot of {fmtDay(since.snapshotDate)}.</p>
          <div className="flex flex-wrap gap-4">
            {TIER_KEYS.map((k) => (
              <span key={k}>{TIER_LABEL[k]} <b className={since.delta[k] >= 0 ? "text-emerald-700" : "text-red-600"}>{delta(since.delta[k])}</b></span>
            ))}
          </div>
          <p className="text-xs">
            Added {since.added.length} · Slipped {since.slipped.length} · Won {since.won.length} · Lost {since.lost.length}
          </p>
          {[["Added", since.added], ["Slipped (close date moved out)", since.slipped], ["Won", since.won], ["Lost", since.lost]]
            .filter(([, l]) => l.length)
            .map(([label, list]) => (
              <p key={label} className="text-xs text-muted-foreground">
                <b>{label}:</b> {list.slice(0, 8).map((d) => `${d.title || d.id} (${money(d.amount)})`).join(" · ")}{list.length > 8 ? ` · +${list.length - 8} more` : ""}
              </p>
            ))}
        </div>
      )}
      <div className="border-t border-border mt-3 pt-3" data-testid="accuracy">
        <h4 className="text-xs font-semibold mb-1">Accuracy</h4>
        {!state.applied ? (
          <p className="text-xs text-muted-foreground">Needs the snapshots migration.</p>
        ) : accuracy?.status === "ok" ? (
          <p className="text-xs">
            Last month's Most likely, forecast on {fmtDay(accuracy.snapshotDate)}: <b>{money(accuracy.forecast)}</b> · actual Achieved <b>{money(accuracy.actual)}</b> ·{" "}
            {accuracy.errorPct === null ? "—" : `${accuracy.errorPct >= 0 ? "over" : "under"} by ${Math.abs(accuracy.errorPct).toFixed(0)}%`}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="accuracy-collecting">
            Collecting — first result after {accuracy?.firstResultAfter || "the first full month with a week-1 snapshot"}.
          </p>
        )}
      </div>
      {periodLabel && <p className="sr-only">{periodLabel}</p>}
    </section>
  );
}

export const tierExplain = TIER_EXPLAIN;
