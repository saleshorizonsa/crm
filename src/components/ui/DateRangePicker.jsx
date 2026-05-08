import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  format,
  startOfDay, endOfDay,
  startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter,
  startOfYear, endOfYear,
  subDays, subMonths, subQuarters, subYears,
  addDays, addMonths, addQuarters, addYears,
  isSameDay, isSameMonth, isSameQuarter, isSameYear,
} from "date-fns";

// ─── Backward-compat exports ──────────────────────────────────────────────────
// Kept so existing imports (sales-pipeline/index.jsx etc.) don't break.

export const DATE_RANGE_PRESETS = [];

const _sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const _eod = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const _add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const resolveDateRange = (value, customRange = {}) => {
  const now = new Date();
  if (value && typeof value === "object" && (value.from || value.to)) {
    if (!value.from || !value.to) return { special: "all" };
    return { startDate: _sod(new Date(value.from)), endDate: _eod(new Date(value.to)) };
  }
  switch (value) {
    case "": return { special: "all" };
    case "today": return { startDate: _sod(now), endDate: _eod(now) };
    case "yesterday": { const y = _add(now, -1); return { startDate: _sod(y), endDate: _eod(y) }; }
    case "this-week": { const d = now.getDay(); const s = _sod(_add(now, -d)); return { startDate: s, endDate: _eod(_add(s, 6)) }; }
    case "last-week": { const d = now.getDay(); const ws = _sod(_add(now, -d)); const s = _add(ws, -7); return { startDate: s, endDate: _eod(_add(s, 6)) }; }
    case "this-month": return { startDate: _sod(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: _eod(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
    case "last-month": return { startDate: _sod(new Date(now.getFullYear(), now.getMonth() - 1, 1)), endDate: _eod(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "this-quarter": { const q = Math.floor(now.getMonth() / 3); return { startDate: _sod(new Date(now.getFullYear(), q * 3, 1)), endDate: _eod(new Date(now.getFullYear(), q * 3 + 3, 0)) }; }
    case "last-quarter": { const q = Math.floor(now.getMonth() / 3) - 1; const y = q < 0 ? now.getFullYear() - 1 : now.getFullYear(); const aq = (q + 4) % 4; return { startDate: _sod(new Date(y, aq * 3, 1)), endDate: _eod(new Date(y, aq * 3 + 3, 0)) }; }
    case "next-quarter": { const q = Math.floor(now.getMonth() / 3) + 1; const y = q > 3 ? now.getFullYear() + 1 : now.getFullYear(); const aq = q % 4; return { startDate: _sod(new Date(y, aq * 3, 1)), endDate: _eod(new Date(y, aq * 3 + 3, 0)) }; }
    case "this-year": return { startDate: _sod(new Date(now.getFullYear(), 0, 1)), endDate: _eod(new Date(now.getFullYear(), 11, 31)) };
    case "last-year": return { startDate: _sod(new Date(now.getFullYear() - 1, 0, 1)), endDate: _eod(new Date(now.getFullYear() - 1, 11, 31)) };
    case "last-7-days": return { startDate: _sod(_add(now, -6)), endDate: _eod(now) };
    case "last-30-days": return { startDate: _sod(_add(now, -29)), endDate: _eod(now) };
    case "last-90-days": return { startDate: _sod(_add(now, -89)), endDate: _eod(now) };
    case "last-180-days": return { startDate: _sod(_add(now, -179)), endDate: _eod(now) };
    case "last-365-days": return { startDate: _sod(_add(now, -364)), endDate: _eod(now) };
    case "next-7-days": return { startDate: _sod(now), endDate: _eod(_add(now, 6)) };
    case "next-30-days": return { startDate: _sod(now), endDate: _eod(_add(now, 29)) };
    case "next-90-days": return { startDate: _sod(now), endDate: _eod(_add(now, 89)) };
    case "custom": {
      if (!customRange?.from || !customRange?.to) return { special: "all" };
      return { startDate: _sod(new Date(customRange.from)), endDate: _eod(new Date(customRange.to)) };
    }
    default: return { special: "all" };
  }
};

// ─── Preset definitions ───────────────────────────────────────────────────────

const PRESETS = [
  { key: "today",        label: "Today",          periodType: "day"     },
  null,
  { key: "thisMonth",    label: "This Month",     periodType: "month"   },
  { key: "thisQuarter",  label: "This Quarter",   periodType: "quarter" },
  { key: "thisYear",     label: "This Year",      periodType: "year"    },
  null,
  { key: "lastMonth",    label: "Last Month",     periodType: "month"   },
  { key: "lastQuarter",  label: "Last Quarter",   periodType: "quarter" },
  { key: "lastYear",     label: "Last Year",      periodType: "year"    },
  null,
  { key: "custom",       label: "Custom range...", periodType: "custom" },
];

const PRESET_MAP = Object.fromEntries(
  PRESETS.filter(Boolean).map((p) => [p.key, p])
);

const CURRENT_PRESETS = new Set(["today", "thisMonth", "thisQuarter", "thisYear"]);
const LAST_PRESETS    = new Set(["lastMonth", "lastQuarter", "lastYear"]);

// ─── Pure date helpers ────────────────────────────────────────────────────────

const getQuarterNum = (date) => Math.floor(date.getMonth() / 3) + 1;

const getPeriodType = (presetKey) =>
  PRESET_MAP[presetKey]?.periodType || "month";

const calculateDates = (presetKey) => {
  const now = new Date();
  switch (presetKey) {
    case "today":
      return { from: format(startOfDay(now), "yyyy-MM-dd"), to: format(endOfDay(now), "yyyy-MM-dd") };
    case "thisMonth":
      return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
    case "thisQuarter":
      return { from: format(startOfQuarter(now), "yyyy-MM-dd"), to: format(endOfQuarter(now), "yyyy-MM-dd") };
    case "thisYear":
      return { from: format(startOfYear(now), "yyyy-MM-dd"), to: format(endOfYear(now), "yyyy-MM-dd") };
    case "lastMonth": {
      const d = subMonths(now, 1);
      return { from: format(startOfMonth(d), "yyyy-MM-dd"), to: format(endOfMonth(d), "yyyy-MM-dd") };
    }
    case "lastQuarter": {
      const d = subQuarters(now, 1);
      return { from: format(startOfQuarter(d), "yyyy-MM-dd"), to: format(endOfQuarter(d), "yyyy-MM-dd") };
    }
    case "lastYear": {
      const d = subYears(now, 1);
      return { from: format(startOfYear(d), "yyyy-MM-dd"), to: format(endOfYear(d), "yyyy-MM-dd") };
    }
    default:
      return null;
  }
};

const getRepresentativeDate = (presetKey) => {
  const now = new Date();
  switch (presetKey) {
    case "lastMonth":   return subMonths(now, 1);
    case "lastQuarter": return subQuarters(now, 1);
    case "lastYear":    return subYears(now, 1);
    default:            return now;
  }
};

const getDatesForPeriod = (periodType, date) => {
  switch (periodType) {
    case "day":
      return { from: format(startOfDay(date), "yyyy-MM-dd"), to: format(endOfDay(date), "yyyy-MM-dd") };
    case "month":
      return { from: format(startOfMonth(date), "yyyy-MM-dd"), to: format(endOfMonth(date), "yyyy-MM-dd") };
    case "quarter":
      return { from: format(startOfQuarter(date), "yyyy-MM-dd"), to: format(endOfQuarter(date), "yyyy-MM-dd") };
    case "year":
      return { from: format(startOfYear(date), "yyyy-MM-dd"), to: format(endOfYear(date), "yyyy-MM-dd") };
    default:
      return null;
  }
};

const getPeriodLabel = (periodType, date) => {
  switch (periodType) {
    case "day":     return format(date, "EEE, MMM d");
    case "month":   return format(date, "MMM yyyy");
    case "quarter": return `Q${getQuarterNum(date)} ${format(date, "yyyy")}`;
    case "year":    return format(date, "yyyy");
    default:        return "";
  }
};

const isAtCurrentPeriod = (periodType, date) => {
  const now = new Date();
  switch (periodType) {
    case "day":     return isSameDay(date, now);
    case "month":   return isSameMonth(date, now);
    case "quarter": return isSameQuarter(date, now);
    case "year":    return isSameYear(date, now);
    default:        return false;
  }
};

const doNavigate = (periodType, date, dir) => {
  switch (periodType) {
    case "day":     return dir === -1 ? subDays(date, 1)     : addDays(date, 1);
    case "month":   return dir === -1 ? subMonths(date, 1)   : addMonths(date, 1);
    case "quarter": return dir === -1 ? subQuarters(date, 1) : addQuarters(date, 1);
    case "year":    return dir === -1 ? subYears(date, 1)    : addYears(date, 1);
    default:        return date;
  }
};

// Returns the preset key that matches the navigated date, or null if none.
const findMatchingPreset = (periodType, date) => {
  const now = new Date();
  if (periodType === "day") {
    if (isSameDay(date, now))             return "today";
  }
  if (periodType === "month") {
    if (isSameMonth(date, now))           return "thisMonth";
    if (isSameMonth(date, subMonths(now, 1))) return "lastMonth";
  }
  if (periodType === "quarter") {
    if (isSameQuarter(date, now))              return "thisQuarter";
    if (isSameQuarter(date, subQuarters(now, 1))) return "lastQuarter";
  }
  if (periodType === "year") {
    if (isSameYear(date, now))           return "thisYear";
    if (isSameYear(date, subYears(now, 1))) return "lastYear";
  }
  return null;
};

// ─── LocalStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "jasco_date_picker_v2";

const loadSaved = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const saveState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
};

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

const CalendarIcon = ({ size = 13, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={className}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8"  y1="2" x2="8"  y2="6"/>
    <line x1="3"  y1="10" x2="21" y2="10"/>
  </svg>
);

const ChevronDown = ({ size = 11, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={className}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const CheckIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

const DateRangePicker = ({
  onChange,
  // These props are accepted for backward compat but the component manages its own state
  value,
  customRange,
  className = "",
  triggerClassName = "",
  placeholder,
}) => {
  const saved = loadSaved();

  // Resolve initial activePreset — null means "free navigation" (no preset highlighted)
  const initPreset = saved && "activePreset" in saved ? saved.activePreset : "thisMonth";

  // Resolve initial activePeriodType
  const initPeriodType = saved?.activePeriodType
    ?? (initPreset ? getPeriodType(initPreset) : "month");

  // Resolve initial navigatedDate
  const initNavigatedDate = (() => {
    if (CURRENT_PRESETS.has(initPreset)) return new Date();
    if (LAST_PRESETS.has(initPreset))    return getRepresentativeDate(initPreset);
    // null (free nav) or unknown: restore saved date
    if (saved?.navigatedDate) {
      const d = new Date(saved.navigatedDate);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  })();

  const [open, setOpen]                   = useState(false);
  const [activePreset, setActivePreset]   = useState(initPreset);      // string | null
  const [activePeriodType, setActivePeriodType] = useState(initPeriodType);
  const [navigatedDate, setNavigatedDate] = useState(initNavigatedDate);
  const [showCustom, setShowCustom]       = useState(initPreset === "custom");
  const [customFrom, setCustomFrom]       = useState(saved?.customFrom || "");
  const [customTo, setCustomTo]           = useState(saved?.customTo   || "");
  const [customError, setCustomError]     = useState("");

  const wrapperRef = useRef(null);

  // ── On mount: emit initial dates so pages load with correct data ──
  useEffect(() => {
    if (activePreset === "custom") {
      if (customFrom && customTo) onChange?.({ from: customFrom, to: customTo });
      return;
    }
    if (CURRENT_PRESETS.has(activePreset)) {
      const dates = calculateDates(activePreset);
      if (dates) onChange?.(dates);
      return;
    }
    if (LAST_PRESETS.has(activePreset)) {
      const repDate = getRepresentativeDate(activePreset);
      const dates = getDatesForPeriod(activePeriodType, repDate);
      if (dates) onChange?.(dates);
      return;
    }
    // null / free navigation
    const dates = getDatesForPeriod(activePeriodType, navigatedDate);
    if (dates) onChange?.(dates);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close on outside click ──
  useEffect(() => {
    function handleOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // ── Preset click ──
  const handlePresetClick = useCallback((key) => {
    const pType = getPeriodType(key);
    setActivePreset(key);

    if (key === "custom") {
      setActivePeriodType("custom");
      setShowCustom(true);
      return; // keep panel open for date inputs
    }

    setActivePeriodType(pType);
    setShowCustom(false);

    const repDate = getRepresentativeDate(key);
    setNavigatedDate(repDate);

    const dates = calculateDates(key);
    if (dates) onChange?.(dates);

    setOpen(false);
    saveState({
      activePreset: key,
      activePeriodType: pType,
      navigatedDate: repDate.toISOString(),
      customFrom,
      customTo,
    });
  }, [onChange, customFrom, customTo]);

  // ── Navigator ──
  const atCurrent = activePreset !== "custom" &&
    isAtCurrentPeriod(activePeriodType, navigatedDate);

  const handleNavigate = useCallback((dir) => {
    if (dir === 1 && atCurrent) return;
    const newDate = doNavigate(activePeriodType, navigatedDate, dir);
    setNavigatedDate(newDate);

    const match = findMatchingPreset(activePeriodType, newDate);
    setActivePreset(match); // may be null — that's fine

    const dates = getDatesForPeriod(activePeriodType, newDate);
    if (dates) onChange?.(dates);

    saveState({
      activePreset: match,
      activePeriodType,
      navigatedDate: newDate.toISOString(),
      customFrom,
      customTo,
    });
  }, [activePeriodType, navigatedDate, atCurrent, onChange, customFrom, customTo]);

  // ── Custom apply ──
  const handleApplyCustom = useCallback(() => {
    if (!customFrom || !customTo) {
      setCustomError("Please select both dates.");
      return;
    }
    if (customFrom > customTo) {
      setCustomError("Start date must be before end date.");
      return;
    }
    setCustomError("");
    onChange?.({ from: customFrom, to: customTo });
    setOpen(false);
    saveState({
      activePreset: "custom",
      activePeriodType: "custom",
      navigatedDate: new Date().toISOString(),
      customFrom,
      customTo,
    });
  }, [customFrom, customTo, onChange]);

  // ── Trigger label ──
  const triggerLabel = (() => {
    if (activePreset === "custom") {
      if (customFrom && customTo) {
        try {
          const f = new Date(customFrom + "T00:00:00");
          const t = new Date(customTo + "T00:00:00");
          return `${format(f, "d MMM")} – ${format(t, "d MMM")}`;
        } catch { return "Custom"; }
      }
      return "Custom";
    }
    if (activePeriodType === "custom") return "Custom";
    return getPeriodLabel(activePeriodType, navigatedDate);
  })();

  const navLabel = activePeriodType !== "custom"
    ? getPeriodLabel(activePeriodType, navigatedDate)
    : "";

  return (
    <div ref={wrapperRef} className={`relative inline-block ${className}`}>

      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "inline-flex items-center gap-1.5",
          "text-xs font-medium px-2.5 py-1.5",
          "bg-background border border-border rounded-md",
          "hover:bg-muted text-foreground whitespace-nowrap",
          "max-w-[150px]",
          triggerClassName,
        ].join(" ")}
      >
        <CalendarIcon size={13} className="text-muted-foreground flex-shrink-0" />
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          size={11}
          className={`text-muted-foreground flex-shrink-0 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-[300] bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
          style={{ minWidth: "180px" }}
        >
          {/* Section 1 — Preset list */}
          <div className="py-1">
            {PRESETS.map((preset, i) => {
              if (!preset) {
                return (
                  <div
                    key={`div-${i}`}
                    className="mx-3 my-0.5 border-t border-border/50"
                  />
                );
              }
              const isActive = activePreset === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handlePresetClick(preset.key)}
                  className={[
                    "w-full flex items-center justify-between",
                    "px-3 h-8 text-[13px] text-left transition-colors",
                    isActive
                      ? "text-blue-600 font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")}
                >
                  <span>{preset.label}</span>
                  {isActive && <CheckIcon size={13} />}
                </button>
              );
            })}
          </div>

          {/* Section 2 — Navigator (hidden for custom) */}
          {activePeriodType !== "custom" && (
            <div className="border-t border-border/50 px-2 py-2">
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => handleNavigate(-1)}
                  className="w-[26px] h-[26px] flex items-center justify-center rounded hover:bg-muted text-muted-foreground text-base leading-none select-none"
                  aria-label="Previous period"
                >
                  ‹
                </button>
                <span className="text-[13px] font-medium text-foreground text-center truncate px-1 select-none">
                  {navLabel}
                </span>
                <button
                  type="button"
                  onClick={() => !atCurrent && handleNavigate(1)}
                  disabled={atCurrent}
                  className={[
                    "w-[26px] h-[26px] flex items-center justify-center rounded",
                    "text-base leading-none select-none",
                    atCurrent
                      ? "opacity-30 cursor-not-allowed text-muted-foreground"
                      : "hover:bg-muted text-muted-foreground cursor-pointer",
                  ].join(" ")}
                  aria-label="Next period"
                  aria-disabled={atCurrent}
                >
                  ›
                </button>
              </div>
            </div>
          )}

          {/* Section 3 — Custom date range */}
          {showCustom && (
            <div className="border-t border-border/50 px-3 py-2.5">
              <div className="text-xs text-muted-foreground mb-2">Custom range</div>
              <div className="flex items-center gap-2 mb-2.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setCustomError("");
                  }}
                  className="flex-1 text-xs px-2 py-1.5 border border-border rounded-md bg-background text-foreground min-w-0"
                />
                <span className="text-xs text-muted-foreground flex-shrink-0">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setCustomError("");
                  }}
                  className="flex-1 text-xs px-2 py-1.5 border border-border rounded-md bg-background text-foreground min-w-0"
                />
              </div>
              {customError && (
                <p className="text-[11px] text-red-500 mb-2">{customError}</p>
              )}
              <button
                type="button"
                onClick={handleApplyCustom}
                className="w-full text-xs font-medium py-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
