import React from "react";

// Achievement pace against month elapsed. The marker is "where you should be"
// by today; the bar is "where you actually are". Amber tolerance band is 15
// points behind elapsed, matching the pacingOk rule in the page metrics.
const PacingRail = ({
  pace = 0,
  elapsed = 0,
  dayOfMonth,
  totalDays,
  pctFmt,
}) => {
  const paceClamped = Math.min(Math.max(pace, 0), 1) * 100;
  const elapsedClamped = Math.min(Math.max(elapsed, 0), 1) * 100;
  const behind = pace < elapsed - 0.15;
  const onTrack = pace >= elapsed;

  const barColor = onTrack ? "#059669" : behind ? "#ef4444" : "#f59e0b";

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
          Pacing rail
        </span>
        <span className="text-[11px] font-mono text-gray-500">
          Day {dayOfMonth} of {totalDays} &middot; {pctFmt(elapsed)} elapsed
        </span>
      </div>

      <div className="relative h-5 w-full rounded-lg bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-l-lg transition-all"
          style={{ width: `${paceClamped}%`, background: barColor }}
        />

        {/* Tolerance band: elapsed-15pts .. elapsed */}
        <div
          className="absolute top-0 bottom-0 bg-gray-900/5"
          style={{
            left: `${Math.max(elapsedClamped - 15, 0)}%`,
            width: `${Math.min(15, elapsedClamped)}%`,
          }}
        />

        {/* Elapsed marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-gray-900"
          style={{ left: `${elapsedClamped}%` }}
          title={`Month elapsed: ${pctFmt(elapsed)}`}
        />
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] font-mono text-gray-500">
          Achieved{" "}
          <span
            className="font-semibold"
            style={{ color: barColor }}
          >
            {pctFmt(pace)}
          </span>{" "}
          of target
        </span>
        <span className="text-[10px] font-mono font-semibold" style={{ color: barColor }}>
          {onTrack ? "On track" : behind ? "Behind pace" : "Within tolerance"}
        </span>
      </div>
    </div>
  );
};

export default PacingRail;
