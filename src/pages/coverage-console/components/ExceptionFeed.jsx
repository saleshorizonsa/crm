import React, { useState } from "react";
import { STALE_INVOICE_DAYS } from "utils/planningCalculations";

// Exception feed. Rendered at every level; the list is already scoped to the
// current level's user ids by the caller. Clicking an entry that carries a deal
// jumps straight to the opportunity level with all four nav keys set.
//
// The feed can be grouped by owner or by age, the same two modes as the
// dashboard's Won, Not Yet Invoiced popup (components/dashboard/KPICardsStrip.jsx)
// — display only: the exceptions, their order within a group and their severity
// are exactly what buildExceptions() produced. "List" keeps the original flat
// view and stays the default, so this screen opens as it always has.
const daysOld = (ex) =>
  ex?.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(ex.createdAt)) / 86400000)) : 0;

function groupExceptions(exceptions, mode, userName) {
  if (mode === "age") {
    const old = exceptions.filter((ex) => daysOld(ex) >= STALE_INVOICE_DAYS);
    const recent = exceptions.filter((ex) => daysOld(ex) < STALE_INVOICE_DAYS);
    return [
      { key: "old", label: `${STALE_INVOICE_DAYS}+ days old`, items: old },
      { key: "recent", label: `Within ${STALE_INVOICE_DAYS} days`, items: recent },
    ].filter((g) => g.items.length > 0);
  }
  const byOwner = new Map();
  exceptions.forEach((ex) => {
    const k = ex.ownerId || "none";
    if (!byOwner.has(k)) byOwner.set(k, []);
    byOwner.get(k).push(ex);
  });
  return [...byOwner.entries()]
    .map(([ownerId, items]) => ({
      key: ownerId,
      label: ownerId === "none" ? "Unassigned" : userName(ownerId),
      items,
    }))
    .sort((a, b) => b.items.length - a.items.length);
}

const ExceptionFeed = ({ exceptions = [], userName, onJump }) => {
  const [groupMode, setGroupMode] = useState("list");
  const [collapsed, setCollapsed] = useState([]);

  const renderRow = (ex, i) => {
    const clickable = Boolean(ex.dealId && ex.ownerId);
    return (
      <div
        key={`${ex.type}-${ex.dealId || ""}-${i}`}
        onClick={clickable ? () => onJump(ex) : undefined}
        className={`px-5 py-3 flex items-start gap-3 ${
          clickable ? "cursor-pointer hover:bg-gray-50 transition-colors" : ""
        }`}
      >
        <span
          className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
            ex.sev === "critical" ? "bg-red-500" : "bg-amber-500"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-900">
              {ex.title}
            </span>
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${
                ex.sev === "critical"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {ex.sev}
            </span>
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">
            {userName(ex.ownerId)}
            {ex.createdAt
              ? ` · ${new Date(ex.createdAt).toLocaleDateString("en-GB")}`
              : ""}
          </div>
        </div>
        {clickable && (
          <span className="text-gray-300 text-xs flex-shrink-0 mt-0.5">
            &#9656;
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-800">Exception feed</h3>
        <div className="flex items-center gap-2">
          {exceptions.length > 0 && (
            <div className="flex items-center gap-1">
              {[["list", "List"], ["owner", "By Owner"], ["age", "By Age"]].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setGroupMode(mode); setCollapsed([]); }}
                  className={`text-[10px] font-medium px-2 py-1 rounded-lg border transition-colors ${
                    groupMode === mode
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <span
            className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${
              exceptions.length === 0
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-red-50 text-red-800 border-red-200"
            }`}
          >
            {exceptions.length === 0 ? "All clear" : `${exceptions.length} open`}
          </span>
        </div>
      </div>

      {exceptions.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">No open exceptions at this level</p>
          <p className="text-[11px] text-gray-300 font-mono mt-1">
            Flags, escalations and bounce-backs appear here
          </p>
        </div>
      ) : groupMode === "list" ? (
        <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
          {exceptions.map(renderRow)}
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          {groupExceptions(exceptions, groupMode, userName).map((g) => {
            const open = !collapsed.includes(g.key);
            return (
              <div key={g.key} className="border-b border-gray-100 last:border-0">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) =>
                      prev.includes(g.key) ? prev.filter((k) => k !== g.key) : [...prev, g.key],
                    )
                  }
                  aria-expanded={open}
                  className="w-full px-5 py-2 flex items-center justify-between gap-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
                >
                  <span className="text-[11px] font-semibold text-gray-700 truncate">
                    {open ? "▾" : "▸"} {g.label}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                    {g.items.length} open
                  </span>
                </button>
                {open && <div className="divide-y divide-gray-50">{g.items.map(renderRow)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExceptionFeed;
