import React, { useEffect, useState } from "react";
import PacingDrill from "components/PacingDrill";
import LogVisit from "components/LogVisit";
import { fetchVisits, summariseVisits, riyadhToday } from "utils/visits";
import { PACING_TOLERANCE } from "utils/salesDivisionMetrics";

/**
 * THE PACING RAIL AND WHAT SITS UNDER IT — shared by Insights and the
 * Coverage Console.
 *
 *   the rail          clickable; opens the pacing drill (PacingDrill)
 *   one-line legend   "Achieved 0.3% · Should be 35% by today · Grey =
 *                     15-point allowance" — the rail's own pace and elapsed
 *   Log visit         manager, supervisor and salesman only (CEO,
 *                     2026-10-11): it records the LOGGED-IN person's own
 *                     visit through the Session 17 flow (LogVisit) — no new
 *                     write path, and no picking another person
 *   "N this month · last d MMM"   that person's own visits, utils/visits.js
 *
 * One counter ties them together: a save from the button or from inside the
 * drill bumps it, and both the count and an open drill re-read.
 */
export const RAIL_VISIT_ROLES = ["manager", "supervisor", "salesman"];

const shortDate = (ymd) => {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** "Achieved 0.3% · Should be 35% by today · Grey = 15-point allowance" */
export function railLegend(pace, elapsed) {
  if (pace == null || elapsed == null) return null;
  return `Achieved ${(pace * 100).toFixed(1)}% · Should be ${Math.round(elapsed * 100)}% by today`
    + ` · Grey = ${Math.round(PACING_TOLERANCE * 100)}-point allowance`;
}

/** "2 this month · last 6 Sep" / "0 this month · none logged" */
export function visitLine(summary) {
  const n = summary?.thisMonth || 0;
  return `${n} this month · ${summary?.lastVisit ? `last ${shortDate(summary.lastVisit)}` : "none logged"}`;
}

export default function PacingRailBlock({
  metrics, scopeIds = [], users = [], companyId, viewerId, role, scopeLabel = "", children,
}) {
  const [version, setVersion] = useState(0);
  const [mine, setMine] = useState(null);       // null = loading; { failed } on error
  const canLog = RAIL_VISIT_ROLES.includes(role) && !!viewerId && !!companyId;
  const bump = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!canLog) return undefined;
    let alive = true;
    const today = riyadhToday();
    fetchVisits({ companyId, ownerIds: [viewerId], until: today }).then((r) => {
      if (!alive) return;
      if (r.failed) { setMine({ failed: true }); return; }
      setMine(summariseVisits(r.rows, [viewerId], today.slice(0, 7)).get(viewerId));
    });
    return () => { alive = false; };
  }, [canLog, companyId, viewerId, version]);

  const legend = railLegend(metrics?.pace, metrics?.elapsed);

  return (
    <div>
      <PacingDrill
        metrics={metrics}
        scopeIds={scopeIds}
        users={users}
        companyId={companyId}
        viewerId={viewerId}
        scopeLabel={scopeLabel}
        refreshKey={version}
        onVisitSaved={bump}
      >
        {children}
      </PacingDrill>
      {legend && (
        <p className="mt-1.5 text-[10px] font-mono text-gray-500" data-testid="pacing-legend">{legend}</p>
      )}
      {canLog && (
        <div className="mt-2 flex items-center gap-3 flex-wrap" data-testid="rail-visits">
          <LogVisit companyId={companyId} userId={viewerId} testid="log-visit-rail" onSaved={bump} />
          <span className="text-[11px] font-mono text-gray-600" data-testid="rail-visit-count">
            {mine === null ? "Loading your visits…"
              : mine.failed ? "Your visits could not be read"
                : visitLine(mine)}
          </span>
        </div>
      )}
    </div>
  );
}
