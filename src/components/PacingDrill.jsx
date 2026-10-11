import React, { useEffect, useMemo, useState } from "react";
import DrillSheet from "components/DrillSheet";
import LogVisit from "components/LogVisit";
import { fetchVisits, summariseVisits, riyadhToday } from "utils/visits";
import { buildPacingDrill, PACING_COLUMNS, VISIT_COLUMNS } from "utils/pacingDrill";

/**
 * THE PACING RAIL, CLICKABLE — shared by Insights and the Coverage Console.
 *
 * Wraps whichever rail the page draws (children) in a button. Opening it reads
 * the scope's visits (utils/visits.js, owner-filtered in the query) and shows
 * one row per person — Target and Achieved are the rail's own per-person maps,
 * so the rows add up to the rail. A person opens onto his visits.
 *
 * Zero visits is a FACT, not a failure: every person shows 0 and "none
 * logged", and the sheet says "No visits logged this month" beside the Log
 * visit button. A failed read says so instead.
 */
export default function PacingDrill({
  metrics, scopeIds = [], users = [], companyId, viewerId, scopeLabel = "", children,
}) {
  const [open, setOpen] = useState(false);
  const [visits, setVisits] = useState(null);       // { rows, failed }
  const [person, setPerson] = useState(null);
  const [reload, setReload] = useState(0);
  const idKey = scopeIds.join(",");
  const monthKey = riyadhToday().slice(0, 7);

  useEffect(() => {
    if (!open || !companyId || !idKey) return undefined;
    let alive = true;
    setVisits(null);
    fetchVisits({ companyId, ownerIds: idKey.split(","), until: riyadhToday() })
      .then((r) => { if (alive) setVisits(r); });
    return () => { alive = false; };
  }, [open, companyId, idKey, reload]);

  const built = useMemo(() => {
    if (!visits) return null;
    const summary = summariseVisits(visits.rows, idKey.split(","), monthKey);
    return buildPacingDrill({ metrics, scopeIds: idKey.split(","), users, visitSummary: summary });
  }, [visits, metrics, users, idKey, monthKey]);

  const close = () => { setOpen(false); setPerson(null); };
  const logButton = viewerId ? (
    <LogVisit companyId={companyId} userId={viewerId} testid="log-visit-drill" onSaved={() => setReload((n) => n + 1)} />
  ) : null;

  const footer = built && (
    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap" data-testid="pacing-drill-visits">
      <p className="text-xs text-gray-600">
        {visits.failed
          ? "Visits could not be read — refresh to try again."
          : built.total.visitsThisMonth === 0
            ? "No visits logged this month."
            : `${built.total.visitsThisMonth} visit${built.total.visitsThisMonth === 1 ? "" : "s"} logged this month.`}
      </p>
      {logButton}
    </div>
  );

  const sel = person ? [built?.total, ...(built?.rows || [])].find((r) => r?.id === person) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="pacing-rail-open"
        className="block w-full text-left rounded-lg hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        title="Open pacing by person, with visits"
      >
        {children}
      </button>

      {open && !built && (
        <span className="sr-only" role="status">Loading pacing and visits…</span>
      )}

      {open && built && !sel && (
        <DrillSheet
          label="Pacing"
          total={built.total.achieved}
          note={`Achieved against target, by person, with visits (contact reports + activities, Riyadh dates). ${
            built.total.visitsThisMonth === 0 ? "0 visits logged this month." : ""}`}
          columns={PACING_COLUMNS}
          rows={[built.total, ...built.rows]}
          onOpenRecord={(r) => setPerson(r.id)}
          onClose={close}
          scopeLabel={scopeLabel}
          footerHint="first row is the total"
          extra={footer}
        />
      )}

      {open && sel && (
        <DrillSheet
          label={`Pacing › ${sel.name}`}
          total={sel.achieved}
          note={`${sel.visitsThisMonth} visit${sel.visitsThisMonth === 1 ? "" : "s"} this month, ${sel.visitsLastMonth} last month. Last visit: ${sel.lastVisit}.`}
          columns={VISIT_COLUMNS}
          rows={sel.visits}
          onClose={close}
          scopeLabel={scopeLabel}
          extra={(
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <button type="button" onClick={() => setPerson(null)} data-testid="pacing-drill-back"
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                ← Everyone
              </button>
              {sel.visits.length === 0 && <span className="text-xs text-gray-600">No visits logged.</span>}
              {logButton}
            </div>
          )}
        />
      )}
    </>
  );
}
