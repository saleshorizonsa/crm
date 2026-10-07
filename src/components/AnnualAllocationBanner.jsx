// Does this manager's monthly assigning add up to his year?
//
// CEO decision 2026-10-07: a manager's MONTHLY targets — the rows he assigns to
// his team AND the rows he assigns to himself — must add up to the YEARLY
// target the director assigned him by the end of that year. Nobody could see
// how far through that they were while assigning, so the allocation was
// tracked in a spreadsheet beside the screen that creates it.
//
// INFORMATION ONLY. Nothing here can block or alter a save: it renders above
// the form, reads, and reports. Over-allocating is allowed and simply shown as
// over-allocated — a manager may deliberately commit more than the year's
// figure, and a screen that refused would be inventing a policy nobody set.
//
// Every number comes from computeAnnualAllocation() in planningCalculations.js,
// which is the same function the Planning annual view reads. The arithmetic is
// not repeated here, and this file contains none of its own.

import React, { useEffect, useMemo, useState } from "react";
import { computeAnnualAllocation } from "utils/planningCalculations";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const money = (v) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));

/** Compact for the 12 strip cells, which are too narrow for a full figure. */
const compact = (v) => {
  const n = Number(v) || 0;
  if (n === 0) return "—";
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
};

/**
 * Share of the year handed out, TRUNCATED rather than rounded: at 99.6%
 * allocated there is still allocation to give, and a banner reading "100%"
 * while `remaining` shows a positive figure invites exactly one bug report.
 */
const pctAllocated = (assigned, annual) =>
  annual > 0 ? Math.floor((assigned / annual) * 100) : 0;

/** "Jan–Oct", or "Oct", or "" when nothing is assigned yet. */
function assignedRangeLabel(byMonth) {
  const used = (byMonth || []).map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  if (!used.length) return "";
  const first = MONTHS[used[0]];
  const last = MONTHS[used[used.length - 1]];
  return first === last ? first : `${first}–${last}`;
}

/**
 * The annual allocation banner plus a 12-month strip.
 *
 * @param {object} p
 * @param {string} p.companyId
 * @param {string} p.managerId   whose year this is — the person holding the
 *   yearly row. Renders nothing when he has none for the year.
 * @param {number} p.year        taken from the period being assigned
 * @param {string} [p.pendingMonth]  'yyyy-MM' of the row being entered
 * @param {number} [p.pendingAmount] its running total, for the live preview
 * @param {number} [p.refreshKey]    bump to re-read after a save
 */
export default function AnnualAllocationBanner({
  companyId,
  managerId,
  year,
  pendingMonth = null,
  pendingAmount = 0,
  refreshKey = 0,
}) {
  const [alloc, setAlloc] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!companyId || !managerId || !year) { setAlloc(null); return () => {}; }
    setLoading(true);
    computeAnnualAllocation({ companyId, managerId, year })
      .then((a) => { if (!cancelled) { setAlloc(a); setLoading(false); } })
      .catch((e) => {
        // A failed read hides the banner. It is an advisory strip above a form
        // that must keep working, so it never surfaces an error of its own.
        console.error("AnnualAllocationBanner:", e);
        if (!cancelled) { setAlloc(null); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [companyId, managerId, year, refreshKey]);

  const pendingIdx = useMemo(() => {
    if (!pendingMonth || !alloc) return -1;
    const [y, m] = String(pendingMonth).split("-");
    if (Number(y) !== alloc.year) return -1;
    const i = Number(m) - 1;
    return i >= 0 && i < 12 ? i : -1;
  }, [pendingMonth, alloc]);

  // No yearly row for the year means there is no allocation to track, which is
  // the normal state for most people — so nothing is drawn at all rather than a
  // banner full of zeros.
  if (loading || !alloc || !(alloc.annual > 0)) return null;

  const entered = Number(pendingAmount) || 0;
  const hasPending = entered > 0 && pendingIdx >= 0;
  // The live figure. An EDIT of a month that already has rows would double
  // count if this simply subtracted, so the preview is stated as "with this
  // row added", which is what it is on the create path, and the strip shows the
  // month's current figure beside it.
  const previewRemaining = alloc.remaining - entered;
  const previewPct = pctAllocated(alloc.assigned + entered, alloc.annual);

  const range = assignedRangeLabel(alloc.byMonth);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 mb-5">
      {/* ── the sentence ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-mono">
        <span className="font-semibold text-gray-900">{alloc.year} allocation</span>
        <span className="font-semibold text-gray-900">{money(alloc.annual)}</span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-600">
          assigned{range ? ` ${range}` : ""}{" "}
          <span className="font-semibold text-gray-900">{money(alloc.assigned)}</span>{" "}
          ({pctAllocated(alloc.assigned, alloc.annual)}%)
        </span>
        <span className="text-gray-300">·</span>
        {alloc.overAllocated ? (
          <span className="text-amber-700">
            over-allocated by{" "}
            <span className="font-semibold">{money(Math.abs(alloc.remaining))}</span>
          </span>
        ) : (
          <span className="text-gray-600">
            remaining <span className="font-semibold text-blue-700">{money(alloc.remaining)}</span>
          </span>
        )}
        {alloc.monthsLeft > 0 && !alloc.overAllocated && (
          <>
            <span className="text-gray-300">·</span>
            <span className="text-gray-600">
              {alloc.monthsLeft} month{alloc.monthsLeft === 1 ? "" : "s"} left →{" "}
              <span className="font-semibold text-gray-900">
                {money(alloc.perMonthNeeded)}
              </span>{" "}
              per month
            </span>
          </>
        )}
        {alloc.monthsLeft === 0 && !alloc.overAllocated && alloc.remaining > 0 && (
          <>
            <span className="text-gray-300">·</span>
            {/* Every month of the year already carries rows, so there is no
                empty month to spread the rest over — dividing by zero months
                would be the only other thing to say. */}
            <span className="text-amber-700">no empty months left to assign into</span>
          </>
        )}
      </div>

      {/* ── live, while a monthly target is being entered ─────────────────── */}
      {hasPending && (
        <div className="mt-2 text-xs font-mono text-gray-700 border-t border-blue-200 pt-2">
          with this {MONTHS[pendingIdx]} row of{" "}
          <span className="font-semibold">{money(entered)}</span>:{" "}
          remaining{" "}
          <span className={`font-semibold ${previewRemaining < 0 ? "text-amber-700" : "text-blue-700"}`}>
            {money(previewRemaining)}
          </span>{" "}
          ({previewPct}% allocated)
          {previewRemaining < 0 && (
            <span className="text-amber-700">
              {" "}— {money(Math.abs(previewRemaining))} over the year's allocation
            </span>
          )}
        </div>
      )}

      {/* ── the 12-month strip ───────────────────────────────────────────── */}
      <div className="mt-3 grid grid-cols-6 sm:grid-cols-12 gap-1">
        {alloc.byMonth.map((v, i) => {
          const isEmpty = v === 0;
          const counted = alloc.emptyMonths.includes(i + 1);
          const isPending = i === pendingIdx && hasPending;
          return (
            <div
              key={MONTHS[i]}
              title={
                isPending
                  ? `${MONTHS[i]}: ${money(v)} assigned, ${money(entered)} being entered`
                  : counted
                    ? `${MONTHS[i]}: nothing assigned yet — one of the ${alloc.monthsLeft} months the per-month figure is spread over`
                    : `${MONTHS[i]}: ${money(v)}`
              }
              className={`rounded-lg px-1.5 py-1 text-center border cursor-help ${
                isPending
                  ? "border-blue-500 bg-blue-100"
                  : counted
                    // Empty AND still assignable — the months the manager has
                    // left. Highlighted because they are the actionable ones.
                    ? "border-amber-300 bg-amber-50"
                    : isEmpty
                      // Empty but in the past: nothing can be assigned into it
                      // now, so it is drawn flat rather than as a prompt.
                      ? "border-gray-200 bg-white"
                      : "border-gray-200 bg-white"
              }`}
            >
              <div className="text-[9px] uppercase tracking-wide text-gray-400">{MONTHS[i]}</div>
              <div
                className={`text-[10px] font-mono font-semibold ${
                  isEmpty ? (counted ? "text-amber-700" : "text-gray-300") : "text-gray-900"
                }`}
              >
                {compact(v)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
