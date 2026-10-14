// PRE-SALE EFFORT on Insights (session 27, CEO 2026-10-14): the Effort row
// inside the coverage card, and the Effort vs Result card below it. The rules
// live in utils/presaleEffort.js; this file fetches, draws and drills.
//
// Scope is the page's: the level being viewed, within what the viewer may see
// (scopeUserIds — a salesman's page only ever holds himself). The required plan
// behind Plan coverage is the page's own figure, from calcDivisionMetrics for
// one person and one month.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DrillSheet, { STICKY_EDGE, HEAD_WRAP } from "components/DrillSheet";
import {
  INDICATORS, EFFORT_THRESHOLDS, VERDICT, effortPeople, monthsOf, fetchEffortRows,
  computeEffortFor, periodPace, verdictFor, sortByVerdict, effortPct,
} from "utils/presaleEffort";
import { riyadhToday } from "utils/visits";

const SAR = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");

/** What each indicator's sheet says it is (Session 26 style). */
export const INDICATOR_EXPLAIN = {
  coverage: "Plan value this period (open items, and converted ones whose deal is still there) against the required plan — the target not yet achieved ÷ conversion. Counted up to 100%.",
  day7: "Plan items that existed on the 7th and, by the end of the 7th, had become a deal or whose customer the owner had contacted (visit, call, WhatsApp, meeting or contact report).",
  replacement: "Value of deals lost in this period that have a replacement plan item, against all value lost.",
  planToFunnel: "Plan items this period that became a deal that still exists, against all plan items. Moved-to-future items are left out.",
};
const INDICATOR_COLUMNS = {
  coverage: [
    { key: "month", label: "Month", type: "month" },
    { key: "planned", label: "Planned", type: "money" },
    { key: "required", label: "Required plan", type: "money" },
    { key: "counted", label: "Counted", type: "money" },
    { key: "note", label: "Note" },
  ],
  day7: [
    { key: "customer", label: "Customer" },
    { key: "month", label: "Month", type: "month" },
    { key: "value", label: "Planned", type: "money" },
    { key: "convertedBy7", label: "Deal by day 7" },
    { key: "contactedBy7", label: "Contacted by day 7" },
    { key: "qualified", label: "Qualified" },
  ],
  replacement: [
    { key: "customer", label: "Customer" },
    { key: "lostOn", label: "Lost on", type: "date" },
    { key: "value", label: "Value", type: "money" },
    { key: "replaced", label: "Replaced" },
  ],
  planToFunnel: [
    { key: "customer", label: "Customer" },
    { key: "month", label: "Month", type: "month" },
    { key: "value", label: "Planned", type: "money" },
    { key: "status", label: "Status" },
    { key: "counts", label: "Counts as converted" },
  ],
};
// The figure under each tile's %: what over what.
const fraction = (key, ind) => {
  if (key === "coverage" || key === "replacement") return `${SAR(ind.num)} / ${SAR(ind.den)} SAR`;
  return `${ind.num} / ${ind.den} items`;
};

/**
 * Everything both cards need, computed once.
 * @returns {{ loading, failed, people, perPerson: Map, total, months }}
 */
export function useEffort({ companyId, levelIds, raw, divisionId, start, end, enabled = true }) {
  const people = useMemo(() => effortPeople(levelIds, raw?.users), [levelIds, raw?.users]);
  const idKey = people.map((p) => p.id).sort().join(",");
  const [rows, setRows] = useState(null);
  const today = riyadhToday();

  useEffect(() => {
    let alive = true;
    if (!enabled || !companyId || !idKey) { setRows({ opps: [], lostDeals: [], replacedIds: new Set(), contactedItemIds: new Set(), failed: false }); return undefined; }
    setRows(null);
    fetchEffortRows({ companyId, ownerIds: idKey.split(","), start, end, today })
      .then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [companyId, idKey, start, end, enabled, today]);

  return useMemo(() => {
    const months = monthsOf(start, end);
    if (!rows || !raw) return { loading: true, failed: false, people, perPerson: new Map(), total: null, months };
    // The one computation /numbers-check also calls (utils/presaleEffort.js).
    const { perPerson, total } = computeEffortFor({ rows, people, raw, divisionId, start, end, today });
    return { loading: false, failed: rows.failed, people, perPerson, months, total };
  }, [rows, raw, people, divisionId, start, end, today]);
}

/** One indicator's sheet: a person's rows, or the people then their rows. */
function IndicatorSheet({ ind, effort, personId = null, periodLabel, names, onClose }) {
  const navigate = useNavigate();
  const meta = INDICATORS.find((i) => i.key === ind);
  const toPct = (x) => (x.pct === null ? 0 : Math.round(x.pct * 100));
  const one = personId ? effort.perPerson.get(personId) : null;
  const node = one || effort.total;
  const children = personId ? null : effort.people
    .map((p) => ({ id: p.id, name: names(p.id), total: toPct(effort.perPerson.get(p.id)[ind]), rows: effort.perPerson.get(p.id)[ind].rows }))
    .filter((c) => c.rows.length);
  return (
    <DrillSheet
      label={meta.label}
      title={meta.label}
      period={periodLabel}
      place={personId ? [names(personId)] : []}
      explain={INDICATOR_EXPLAIN[ind]}
      levelHints={personId
        ? [ind === "coverage" ? "One row per month." : "Click a row to open it."]
        : ["Click a person to see the rows.", ind === "coverage" ? "One row per month." : "Click a row to open it."]}
      total={toPct(node[ind])}
      unit="%"
      note={node[ind].pct === null ? `n/a — ${node[ind].na}` : fraction(ind, node[ind])}
      columns={INDICATOR_COLUMNS[ind]}
      rows={personId ? node[ind].rows : null}
      onOpenRecord={ind === "coverage" ? undefined : (r) => {
        if (r.dealId) navigate("/sales-pipeline", { state: { openDealId: r.dealId } });
        else if (r.oppId) navigate("/planning");
      }}
      onClose={onClose}
      scopeLabel={meta.label}
    >
      {children}
    </DrillSheet>
  );
}

/** Runs the hook once and hands the result to both cards. */
export function WithEffort({ children, ...props }) {
  const effort = useEffort(props);
  return children(effort);
}

/** The Effort row, inside the coverage card. */
export function EffortRow({ effort, periodLabel, names, isAllTime }) {
  const [open, setOpen] = useState(null);
  if (isAllTime) {
    return <p className="mt-4 text-xs text-gray-600">Pre-sale effort is measured month by month, so it is not shown for All Time.</p>;
  }
  if (effort.loading) return <p className="mt-4 text-xs text-gray-600" data-testid="effort-loading">Pre-sale effort: loading…</p>;
  if (effort.failed) return <p className="mt-4 text-xs text-red-700">Pre-sale effort could not be read — refresh to try again.</p>;
  const t = effort.total;
  return (
    <div className="mt-5 pt-4 border-t border-gray-100" data-testid="effort-row">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Pre-sale effort — {periodLabel}</h3>
          <p className="text-xs text-gray-700">Is the pre-sale work being done? Four indicators, summed over the people in scope.</p>
        </div>
        <div
          className="text-right"
          title={t.naList.length ? `Not available: ${t.naList.join("; ")}. The score averages the others.` : "All four indicators available."}
          data-testid="effort-score"
        >
          <span className="text-2xl font-semibold font-mono text-gray-900">{t.score === null ? "—" : t.score}</span>
          <span className="text-xs text-gray-600"> / 100</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {INDICATORS.map((i) => (
          <button
            key={i.key}
            type="button"
            data-testid={`effort-tile-${i.key}`}
            onClick={() => setOpen(i.key)}
            className="text-left rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50"
          >
            <span className="block text-[11px] font-medium text-gray-700">{i.label}</span>
            <span className="block text-lg font-semibold font-mono text-gray-900">{effortPct(t[i.key])}</span>
            <span className="block text-[11px] font-mono text-gray-600">{t[i.key].pct === null ? " " : fraction(i.key, t[i.key])}</span>
          </button>
        ))}
      </div>
      {open && (
        <IndicatorSheet ind={open} effort={effort} periodLabel={periodLabel} names={names} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

/** Effort vs Result: one row per person in scope. */
export function EffortVsResult({ effort, periodLabel, names, resultFor, start, end, onOpenPerson, isAllTime }) {
  const [open, setOpen] = useState(null);   // { ind, personId }
  if (isAllTime || effort.loading || effort.failed) return null;
  const pace = periodPace(start, end);
  const rows = sortByVerdict(effort.people.map((p) => {
    const e = effort.perPerson.get(p.id);
    const r = resultFor(p.id) || { achieved: 0, target: 0 };
    return {
      id: p.id, name: names(p.id), e, score: e.score,
      achieved: r.achieved, target: r.target,
      pctOfTarget: r.target > 0 ? r.achieved / r.target : null,
      verdict: verdictFor({ score: e.score, target: r.target, achieved: r.achieved, pace }),
    };
  }));
  // The house table style (Session 9): frozen, opaque first column with an
  // edge; other headers wrap within a cap; numbers right-aligned on one line.
  const TH = `px-3 py-2 text-[11px] font-semibold text-gray-700 uppercase tracking-wide text-right ${HEAD_WRAP}`;
  const TH_FIRST = `px-3 py-2 text-[11px] font-semibold text-gray-700 uppercase tracking-wide text-left whitespace-nowrap sticky left-0 z-20 bg-gray-50 ${STICKY_EDGE}`;
  const cell = "px-3 py-2 text-right font-mono whitespace-nowrap";
  const verdictStyle = {
    [VERDICT.attention]: "text-red-700",
    [VERDICT.working]: "text-amber-700",
    [VERDICT.thin]: "text-amber-700",
    [VERDICT.onTrack]: "text-emerald-700",
    [VERDICT.noTarget]: "text-gray-600",
  };
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4" data-testid="effort-vs-result">
      <h2 className="text-base sm:text-lg font-semibold text-gray-900">Effort vs Result — {periodLabel}</h2>
      <p className="mt-1 text-sm text-gray-700">Is each person doing the pre-sale work, and is it turning into invoices?</p>
      <p
        className="mt-0.5 text-xs text-gray-600"
        title={`High effort = score ≥ ${EFFORT_THRESHOLDS.highEffortScore}. High result = % of target ≥ the period's pace (days elapsed ÷ days in the period, ${Math.round(pace * 100)}% now; a past period is 100%).`}
        data-testid="effort-thresholds"
      >
        Click a name for the person; click a figure for its rows. Verdict thresholds: hover here.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className={TH_FIRST}>Name</th>
              <th className={TH}>Effort</th>
              {INDICATORS.map((i) => <th key={i.key} className={TH}>{i.short}</th>)}
              <th className={TH}>Invoiced</th>
              <th className={TH}>% of target</th>
              <th className={TH.replace("text-right", "text-left")}>Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} data-testid="effort-person-row" className="group hover:bg-gray-50">
                <td className={`px-3 py-2 text-left sticky left-0 z-10 bg-white group-hover:bg-gray-50 ${STICKY_EDGE}`}>
                  <button type="button" onClick={() => onOpenPerson(r.id)} className="font-medium text-gray-900 underline decoration-dotted text-left">
                    {r.name}
                  </button>
                </td>
                <td className={`${cell} text-gray-900`} title={r.e.naList.length ? `Not available: ${r.e.naList.join("; ")}` : undefined}>
                  {r.score === null ? "—" : r.score}
                </td>
                {INDICATORS.map((i) => (
                  <td key={i.key} className={cell}>
                    <button type="button" data-testid={`effort-cell-${i.key}`} onClick={() => setOpen({ ind: i.key, personId: r.id })}
                      className="text-gray-900 underline decoration-dotted">
                      {effortPct(r.e[i.key])}
                    </button>
                  </td>
                ))}
                <td className={`${cell} text-gray-900`}>{SAR(r.achieved)}</td>
                <td className={`${cell} text-gray-900`}>{r.pctOfTarget === null ? "—" : `${Math.round(r.pctOfTarget * 100)}%`}</td>
                <td className={`px-3 py-2 text-left font-semibold ${verdictStyle[r.verdict]}`} data-testid="effort-verdict">{r.verdict}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-gray-600">No salesmen in this scope.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <IndicatorSheet ind={open.ind} personId={open.personId} effort={effort} periodLabel={periodLabel} names={names} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
