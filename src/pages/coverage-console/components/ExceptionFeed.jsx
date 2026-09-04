import React from "react";

// Exception feed. Rendered at every level; the list is already scoped to the
// current level's user ids by the caller. Clicking an entry that carries a deal
// jumps straight to the opportunity level with all four nav keys set.
const ExceptionFeed = ({ exceptions = [], userName, onJump }) => {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Exception feed</h3>
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

      {exceptions.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">No open exceptions at this level</p>
          <p className="text-[11px] text-gray-300 font-mono mt-1">
            Flags, escalations and bounce-backs appear here
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
          {exceptions.map((ex, i) => {
            const clickable = Boolean(ex.dealId && ex.ownerId);
            return (
              <div
                key={`${ex.type}-${i}`}
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
                      ? ` \u00b7 ${new Date(ex.createdAt).toLocaleDateString("en-GB")}`
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
          })}
        </div>
      )}
    </div>
  );
};

export default ExceptionFeed;
