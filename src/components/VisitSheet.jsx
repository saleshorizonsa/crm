import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { money } from "components/DrillSheet";
import { NO_CUSTOMER } from "utils/salesMonitor";

/**
 * ONE VISIT, READ-ONLY (session 34, CEO 2026-11-12).
 *
 * Clicking a visit used to open the pipeline's Edit Deal window: a director
 * wanted to see the visit, not edit a deal. This sheet shows the visit — the
 * same frame as the shared DrillSheet (a panel from the right, a title, one
 * line of explanation, Esc or a click outside to close) — and writes nothing.
 * Only the two links at the bottom leave it, and only when pressed.
 *
 * `row` is one of computeSalesMonitor's contact rows (dayContacts /
 * mtdContacts), so the Sales Monitor and the Insights Visits panel show the
 * same sheet for the same visit.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
};
const OUTCOME_WORDS = { positive: "positive", neutral: "neutral", followup: "needs follow-up", not_interested: "not interested" };
const titleCase = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function VisitSheet({ row, nameOf = () => null, onClose }) {
  const navigate = useNavigate();
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!row) return null;
  const isActivity = row.source === "activity";
  const when = [day(row.date), row.time].filter(Boolean).join(" · ");
  const title = `${row.kindLabel} — ${day(row.date) || "—"} · ${row.person}`;
  const response = row.response
    ? `${row.response}${isActivity && row.rawOutcome ? ` (activity outcome: ${OUTCOME_WORDS[row.rawOutcome] || row.rawOutcome})` : ""}`
    : "—";
  const audit = isActivity
    ? "— (activity-log entries are not audited)"
    : row.audited
      ? ["Audited", nameOf(row.auditedBy) && `by ${nameOf(row.auditedBy)}`, day(row.auditedAt) && `on ${day(row.auditedAt)}`].filter(Boolean).join(" ")
      : "Not audited";
  const deal = row.deal;
  const fields = [
    ["Salesman", row.person],
    ["Date and time", when || "—"],
    ["Type", row.kindLabel],
    ...(row.durationMinutes ? [["Duration", `${row.durationMinutes} min`]] : []),
    ["Customer", row.customerKnown ? row.customer : NO_CUSTOMER],
    ["Plan", row.inPlan
      ? `In plan · ${money(row.planValue)}${row.planOutcome ? ` · ${row.planOutcome}` : ""}`
      : "Not in this month's plan"],
    ["Customer response", response],
    ["Notes", row.notes || "—"],
    ["Next action", row.nextAction || "—"],
    ["Follow-up date", day(row.followUp) || "—"],
    ["Audit", audit],
    ["Deal", deal
      ? `${deal.title || "—"} · ${titleCase(deal.stage)} · ${money(deal.final_amount ?? deal.amount)} SAR`
      : (row.dealTitle || "No deal")],
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-gray-900/20" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        data-testid="visit-sheet"
        className="fixed z-50 top-0 right-0 bottom-0 w-full sm:w-[min(520px,100vw)] bg-white shadow-2xl flex flex-col focus:outline-none"
      >
        <header className="px-4 py-3 border-b border-gray-200 flex items-start gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 data-testid="visit-sheet-title" className="text-base sm:text-lg font-semibold text-gray-900 leading-snug break-words">{title}</h2>
            <p className="mt-1 text-sm text-gray-700 leading-snug">
              Read-only. {isActivity ? "Logged in the activity log." : "Logged as a contact report."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded hover:bg-gray-100 text-gray-500 text-lg leading-none">×</button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <dl className="divide-y divide-gray-50" data-testid="visit-sheet-fields">
            {fields.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-2.5">
                <dt className="text-xs text-gray-500">{k}</dt>
                <dd className={`text-sm break-words ${v === NO_CUSTOMER ? "italic text-gray-500" : "text-gray-900"}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <footer className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
          {row.dealId && (
            <button
              type="button"
              data-testid="visit-open-deal"
              onClick={() => navigate("/sales-pipeline", { state: { openDealId: row.dealId } })}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
            >
              Open deal
            </button>
          )}
          {row.customerId && (
            <button
              type="button"
              data-testid="visit-open-customer"
              onClick={() => navigate("/contact-management", { state: { openContactId: row.customerId } })}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
            >
              Open customer
            </button>
          )}
          <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-gray-900 text-white">Close</button>
        </footer>
      </aside>
    </>
  );
}
