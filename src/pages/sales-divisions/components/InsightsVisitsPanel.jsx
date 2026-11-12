import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DailyVisitsList, { shortDay } from "components/DailyVisitsList";
import { loadSalesMonitor } from "utils/salesMonitorData";
import { computeSalesMonitor, lastWorkingDayOn } from "utils/salesMonitor";
import { riyadhToday } from "utils/visits";

/**
 * VISITS ON INSIGHTS (session 34, CEO 2026-11-12) — what the field logged on
 * one day, for the people who manage salesmen.
 *
 * NO NEW DATA RULES. The rows are the Sales Monitor's daily visits: the same
 * loader (loadSalesMonitor) and the same model (computeSalesMonitor) for the
 * same viewer, the day's month and Insights' current division — so the
 * panel and /sales-monitor cannot disagree about a day. It reads on its own
 * and never touches an Insights figure; a failure shows here as one line.
 *
 * DEFAULT DAY: today in Riyadh, or — when the Insights period is over — the
 * last working day of its last month.
 */
export function defaultVisitDay(rangeEnd, now = new Date()) {
  const today = riyadhToday(now);
  return rangeEnd && rangeEnd < today ? lastWorkingDayOn(rangeEnd) : today;
}

export default function InsightsVisitsPanel({
  companyId, viewerId, role, divisionId = null, rangeEnd,
}) {
  const [day, setDay] = useState(() => defaultVisitDay(rangeEnd));
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);     // phones: collapsed to the summary
  const monthKey = day.slice(0, 7);
  const today = riyadhToday();

  // A new Insights period moves the day to that period's default.
  useEffect(() => { setDay(defaultVisitDay(rangeEnd)); }, [rangeEnd]);

  useEffect(() => {
    if (!companyId || !viewerId) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    loadSalesMonitor({ companyId, viewerId, role, monthKey, now: new Date() })
      .then((r) => { if (alive) setRaw(r); })
      .catch((e) => {
        console.error("Insights visits panel:", e);
        if (alive) { setRaw(null); setError(e?.message || String(e)); }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [companyId, viewerId, role, monthKey]);

  const model = useMemo(() => {
    if (!raw || raw.monthKey !== monthKey) return null;
    try {
      return computeSalesMonitor(raw, { divisionId, visitDay: day });
    } catch (e) {
      console.error("Insights visits panel:", e);
      return null;
    }
  }, [raw, monthKey, divisionId, day]);

  const rows = model?.dayContacts || [];
  const WORDS = { visit: ["visit", "visits"], call: ["call", "calls"], whatsapp: ["WhatsApp", "WhatsApps"] };
  const kinds = Object.keys(WORDS)
    .map((k) => [k, rows.filter((r) => r.kind === k).length])
    .filter(([, nn]) => nn > 0)
    .map(([k, nn]) => `${nn} ${WORDS[k][nn === 1 ? 0 : 1]}`);
  const inPlan = rows.filter((r) => r.inPlan).length;
  const summary = model
    ? `${kinds.length ? kinds.join(" · ") : "No visits, calls or WhatsApps"} on ${shortDay(model.day)} · ${inPlan} with planned customers`
    : null;
  const monitorLink = `/sales-monitor?day=${day}${divisionId ? `&division=${encodeURIComponent(divisionId)}` : ""}`;

  return (
    <section className="bg-white rounded-2xl border border-gray-200" aria-label="Visits" data-testid="insights-visits">
      <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">Visits</h3>
          <p className="text-xs text-gray-600" data-testid="insights-visits-summary">
            {error ? "Visits could not be loaded." : loading && !model ? "Loading visits…" : summary}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-600 flex items-center gap-1.5">
            Day
            <input
              type="date"
              data-testid="insights-visits-day"
              value={day}
              max={today}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
            />
          </label>
          <Link to={monitorLink} data-testid="insights-visits-link" className="text-xs text-indigo-700 hover:underline whitespace-nowrap">
            Open in Sales Monitor →
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            data-testid="insights-visits-toggle"
            className="sm:hidden text-xs border border-gray-200 rounded-lg px-2 py-1"
          >
            {open ? "Hide" : "Show"} list
          </button>
        </div>
      </div>
      <div className={`${open ? "" : "hidden"} sm:block p-5`} data-testid="insights-visits-body">
        {error ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="insights-visits-error">
            Visits could not be loaded ({error}). The rest of Insights is unaffected.
          </p>
        ) : model ? (
          <>
            {model.notes.length > 0 && (
              <div className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5" data-testid="insights-visits-notes">
                {model.notes.map((n) => <p key={n}>{n}</p>)}
              </div>
            )}
            <DailyVisitsList model={model} noContactTestid="insights-visits-no-contact" />
          </>
        ) : (
          <p className="text-xs text-gray-500">Loading visits…</p>
        )}
      </div>
    </section>
  );
}
