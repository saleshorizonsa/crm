import React, { useState, useEffect, useCallback } from "react";
import {
  startOfDay, endOfDay,
  startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter,
  startOfYear, endOfYear,
  addDays, addMonths, addQuarters, addYears,
  subDays, subMonths, subQuarters, subYears,
  format, isSameDay, isSameMonth, isSameQuarter, isSameYear,
} from "date-fns";

// ─── Backward-compat exports ──────────────────────────────────────────────────
// These are kept so existing imports (e.g. sales-pipeline/index.jsx) don't break.

export const DATE_RANGE_PRESETS = [];

const _sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const _eod = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const _add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const resolveDateRange = (value, customRange = {}) => {
  const now = new Date();

  // New format: { from, to } object emitted by the new DateRangePicker
  if (value && typeof value === "object" && (value.from || value.to)) {
    if (!value.from || !value.to) return { special: "all" };
    return { startDate: _sod(new Date(value.from)), endDate: _eod(new Date(value.to)) };
  }

  // Legacy string preset keys (kept for any remaining callers)
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

// ─── Period helpers ───────────────────────────────────────────────────────────

const PERIOD_TYPES = ["day", "month", "quarter", "year", "custom"];

const LABEL_MIN_WIDTH = { day: "168px", month: "96px", quarter: "76px", year: "56px" };

const getPeriodLabel = (type, date) => {
  switch (type) {
    case "day":     return format(date, "EEE, MMM d yyyy");
    case "month":   return format(date, "MMM yyyy");
    case "quarter": return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
    case "year":    return String(date.getFullYear());
    default:        return "";
  }
};

const getPeriodRange = (type, date) => {
  switch (type) {
    case "day":     return { from: startOfDay(date),     to: endOfDay(date) };
    case "month":   return { from: startOfMonth(date),   to: endOfMonth(date) };
    case "quarter": return { from: startOfQuarter(date), to: endOfQuarter(date) };
    case "year":    return { from: startOfYear(date),    to: endOfYear(date) };
    default:        return null;
  }
};

const isAtCurrentPeriod = (type, date) => {
  const now = new Date();
  switch (type) {
    case "day":     return isSameDay(date, now);
    case "month":   return isSameMonth(date, now);
    case "quarter": return isSameQuarter(date, now);
    case "year":    return isSameYear(date, now);
    default:        return false;
  }
};

const navigateDate = (type, date, dir) => {
  if (dir === -1) {
    switch (type) {
      case "day":     return subDays(date, 1);
      case "month":   return subMonths(date, 1);
      case "quarter": return subQuarters(date, 1);
      case "year":    return subYears(date, 1);
    }
  } else {
    switch (type) {
      case "day":     return addDays(date, 1);
      case "month":   return addMonths(date, 1);
      case "quarter": return addQuarters(date, 1);
      case "year":    return addYears(date, 1);
    }
  }
  return date;
};

// ─── LocalStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "jasco_date_picker";

const loadSaved = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const savePicker = (periodType, date) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ periodType, dateStr: date.toISOString() }));
  } catch {}
};

// ─── Component ────────────────────────────────────────────────────────────────

const DateRangePicker = ({
  onChange,
  // backward-compat props accepted but not used for display (new component manages own state)
  value,
  customRange,
  className = "",
  triggerClassName = "",
  placeholder,
}) => {
  const saved = loadSaved();

  const [periodType, setPeriodType] = useState(() => saved?.periodType || "month");
  const [currentDate, setCurrentDate] = useState(() => {
    if (saved?.dateStr) {
      const d = new Date(saved.dateStr);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    return new Date();
  });
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Emit { from, to } whenever periodType or currentDate changes (not for Custom)
  useEffect(() => {
    if (periodType === "custom") return;
    const range = getPeriodRange(periodType, currentDate);
    if (range) {
      onChange?.({
        from: format(range.from, "yyyy-MM-dd"),
        to: format(range.to, "yyyy-MM-dd"),
      });
    }
  }, [periodType, currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTypeChange = useCallback((type) => {
    setPeriodType(type);
    if (type !== "custom") savePicker(type, currentDate);
  }, [currentDate]);

  const handleNavigate = useCallback((dir) => {
    const newDate = navigateDate(periodType, currentDate, dir);
    setCurrentDate(newDate);
    savePicker(periodType, newDate);
  }, [periodType, currentDate]);

  const handleApplyCustom = useCallback(() => {
    if (!customFrom || !customTo) return;
    onChange?.({ from: customFrom, to: customTo });
  }, [customFrom, customTo, onChange]);

  const atCurrent = periodType !== "custom" && isAtCurrentPeriod(periodType, currentDate);
  const periodRange = periodType !== "custom" ? getPeriodRange(periodType, currentDate) : null;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-2 flex-wrap">

        {/* ── Segmented period-type control ── */}
        <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex-shrink-0">
          {PERIOD_TYPES.map((type, i) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              className={[
                "px-2.5 py-1.5 text-xs font-medium transition-colors",
                i > 0 ? "border-l border-gray-200" : "",
                periodType === type
                  ? "bg-blue-600 text-white border-blue-600"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              ].join(" ")}
            >
              {type === "day" ? "Day" : type === "month" ? "Month" : type === "quarter" ? "Quarter" : type === "year" ? "Year" : "Custom"}
            </button>
          ))}
        </div>

        {/* ── Period navigator ── */}
        {periodType !== "custom" && (
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg px-1 py-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleNavigate(-1)}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600 text-base leading-none select-none"
              aria-label="Previous period"
            >
              ‹
            </button>

            <span
              className="text-sm font-medium text-gray-800 text-center px-1 select-none"
              style={{ minWidth: LABEL_MIN_WIDTH[periodType] }}
            >
              {getPeriodLabel(periodType, currentDate)}
            </span>

            <button
              type="button"
              onClick={() => !atCurrent && handleNavigate(1)}
              disabled={atCurrent}
              className="w-7 h-7 flex items-center justify-center rounded text-gray-600 text-base leading-none select-none"
              style={{
                opacity: atCurrent ? 0.3 : 1,
                cursor: atCurrent ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => { if (!atCurrent) e.currentTarget.classList.add("bg-gray-200"); }}
              onMouseLeave={(e) => e.currentTarget.classList.remove("bg-gray-200")}
              aria-label="Next period"
              aria-disabled={atCurrent}
            >
              ›
            </button>
          </div>
        )}

        {/* ── Custom range inline inputs ── */}
        {periodType === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-gray-400 text-sm">—</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!customFrom || !customTo || customFrom > customTo}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ── Date range label ── */}
      {periodRange && (
        <p className="text-[11px] text-gray-400 leading-none pl-0.5">
          {format(periodRange.from, "MMM d, yyyy")} – {format(periodRange.to, "MMM d, yyyy")}
        </p>
      )}
    </div>
  );
};

export default DateRangePicker;
