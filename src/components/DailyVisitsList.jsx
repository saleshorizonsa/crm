import React, { useCallback, useState } from "react";
import VisitSheet from "components/VisitSheet";
import { money } from "components/DrillSheet";
import { NO_CUSTOMER, isDayOff } from "utils/salesMonitor";

/**
 * ONE DAY'S VISITS, CALLS AND WHATSAPPS — the list the Sales Monitor and the
 * Insights Visits panel both render (session 34), from computeSalesMonitor's
 * `dayContacts` and `noVisitPeople`. Nothing is computed here.
 *
 *   per salesman  time · type · customer ("customer not recorded" if none) ·
 *                 In plan + plan value · response · next action · outcome
 *   no contact    the target-holders in scope with nothing that day. On a day
 *                 off (Friday, Saturday) they are listed but not flagged.
 *
 * A row opens the read-only Visit sheet (components/VisitSheet.jsx). It never
 * opens a deal or a customer by itself: the sheet's two links do, when pressed
 * (CEO, 2026-11-12 — a director wants to see the visit, not edit a deal).
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDay = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "—";
};

export default function DailyVisitsList({ model, onOpenPerson = null, noContactTestid = "monitor-no-visit", showOutcome = true }) {
  const dayOff = isDayOff(model.day);
  const [sheet, setSheet] = useState(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const byPerson = new Map();
  model.dayContacts.forEach((r) => {
    if (!byPerson.has(r.ownerId)) byPerson.set(r.ownerId, []);
    byPerson.get(r.ownerId).push(r);
  });
  const groups = [...byPerson.entries()]
    .map(([pid, rows]) => [pid, [...rows].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))])
    .sort((a, b) => a[1][0].person.localeCompare(b[1][0].person));

  return (
    <div className="space-y-4">
      {groups.map(([pid, rows]) => (
        <div key={pid} data-testid={`day-person-${pid}`}>
          <h3 className="text-sm font-semibold text-gray-800">{rows[0].person} <span className="font-normal text-gray-500">· {rows.length}</span></h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs mt-1">
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  return (
                    <tr
                      key={r.id}
                      data-testid={`day-row-${r.id}`}
                      onClick={() => setSheet(r)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSheet(r); } }}
                      tabIndex={0}
                      title="Open the visit"
                      className="cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50"
                    >
                      <td className="py-1.5 pr-2 font-mono text-gray-500 w-12">{r.time || "—"}</td>
                      <td className="py-1.5 pr-2 w-20">{r.kindLabel}</td>
                      <td className={`py-1.5 pr-2 ${r.customerKnown ? "text-gray-900" : "italic text-gray-500"}`}>{r.customerKnown ? r.customer : NO_CUSTOMER}</td>
                      <td className="py-1.5 pr-2">
                        {r.inPlan
                          ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">In plan · {money(r.planValue)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`py-1.5 pr-2 capitalize ${r.response === "negative" ? "text-red-700" : r.response === "positive" ? "text-emerald-700" : "text-gray-600"}`}>{r.response || "—"}</td>
                      <td className="py-1.5 pr-2 text-gray-700">{r.nextAction || "—"}</td>
                      {showOutcome && <td className="py-1.5 text-gray-600">{r.planOutcome || ""}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!model.dayContacts.length && <p className="text-sm text-gray-500">Nothing logged on {shortDay(model.day)}.</p>}
      {sheet && <VisitSheet row={sheet} nameOf={model.userName || (() => null)} onClose={closeSheet} />}
      <div data-testid={noContactTestid}>
        <h3 className="text-sm font-semibold text-gray-800">
          No contact that day ({model.noVisitPeople.length}){dayOff ? " — a day off, not flagged" : ""}
        </h3>
        {model.noVisitPeople.length ? (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {model.noVisitPeople.map((p) => {
              const cls = dayOff
                ? "border-gray-200 bg-gray-50 text-gray-600"
                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100";
              const body = <>{p.name}<span className={dayOff ? "text-gray-400" : "text-red-500"}> · last {shortDay(p.lastVisit)}</span></>;
              return (
                <li key={p.id} data-testid={`no-contact-${p.id}`} data-flagged={dayOff ? "no" : "yes"}>
                  {onOpenPerson
                    ? <button type="button" onClick={() => onOpenPerson(p.id)} className={`text-xs px-2 py-1 rounded border ${cls}`}>{body}</button>
                    : <span className={`inline-block text-xs px-2 py-1 rounded border ${cls}`}>{body}</span>}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-xs text-gray-500 mt-1">Everyone logged at least one.</p>}
      </div>
    </div>
  );
}
