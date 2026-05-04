import React, { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ar, enUS } from "date-fns/locale";
import "react-day-picker/style.css";
import Icon from "../AppIcon";
import { useLanguage } from "../../i18n";

/**
 * DateRangePicker
 *
 * A polished popover-style date range picker with grouped quick-pick presets
 * on the left and a custom from/to date input area on the right.
 *
 * Value contract:
 *   - `value` is a string preset key (e.g. "today", "last-30-days", "this-month",
 *     "this-year", "custom", or "" for "All Time").
 *   - When `value === "custom"`, `customRange` provides { from, to } as
 *     ISO date strings ("YYYY-MM-DD").
 *
 * The component is purely presentational: it does NOT perform any filtering.
 * Use the exported `resolveDateRange(value, customRange)` helper to get the
 * actual { startDate, endDate } Date objects to apply against your data.
 */

export const DATE_RANGE_PRESETS = [
  {
    group: "Special",
    items: [{ value: "", label: "All Time" }],
  },
  {
    group: "Current",
    items: [
      { value: "today", label: "Today" },
      { value: "yesterday", label: "Yesterday" },
      { value: "this-week", label: "This Week" },
      { value: "this-month", label: "This Month" },
      { value: "this-quarter", label: "This Quarter" },
      { value: "this-year", label: "This Year" },
    ],
  },
  {
    group: "Past",
    items: [
      { value: "last-week", label: "Last Week" },
      { value: "last-month", label: "Last Month" },
      { value: "last-quarter", label: "Last Quarter" },
      { value: "last-year", label: "Last Year" },
    ],
  },
  {
    group: "Rolling",
    items: [
      { value: "last-7-days", label: "Last 7 Days" },
      { value: "last-30-days", label: "Last 30 Days" },
      { value: "last-90-days", label: "Last 90 Days" },
      { value: "last-180-days", label: "Last 6 Months" },
      { value: "last-365-days", label: "Last 12 Months" },
    ],
  },
  {
    group: "Forecast",
    items: [
      { value: "next-7-days", label: "Next 7 Days" },
      { value: "next-30-days", label: "Next 30 Days" },
      { value: "next-90-days", label: "Next 90 Days" },
      { value: "next-quarter", label: "Next Quarter" },
    ],
  },
  {
    group: "Other",
    items: [{ value: "custom", label: "Custom Range…" }],
  },
];

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/**
 * Resolves a preset value (and optional customRange) into a concrete
 * { startDate, endDate } pair (or { special } for non-range presets).
 *
 * Returned `special` values:
 *   - "all"      → no date filtering
 */
export const resolveDateRange = (value, customRange = {}) => {
  const now = new Date();

  switch (value) {
    case "":
      return { special: "all" };

    case "today":
      return { startDate: startOfDay(now), endDate: endOfDay(now) };
    case "yesterday": {
      const y = addDays(now, -1);
      return { startDate: startOfDay(y), endDate: endOfDay(y) };
    }
    case "this-week": {
      const day = now.getDay();
      const start = startOfDay(addDays(now, -day));
      const end = endOfDay(addDays(start, 6));
      return { startDate: start, endDate: end };
    }
    case "last-week": {
      const day = now.getDay();
      const thisWeekStart = startOfDay(addDays(now, -day));
      const start = addDays(thisWeekStart, -7);
      const end = endOfDay(addDays(start, 6));
      return { startDate: start, endDate: end };
    }
    case "this-month":
      return {
        startDate: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case "last-month":
      return {
        startDate: startOfDay(
          new Date(now.getFullYear(), now.getMonth() - 1, 1)
        ),
        endDate: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "this-quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return {
        startDate: startOfDay(new Date(now.getFullYear(), q * 3, 1)),
        endDate: endOfDay(new Date(now.getFullYear(), q * 3 + 3, 0)),
      };
    }
    case "last-quarter": {
      const q = Math.floor(now.getMonth() / 3) - 1;
      const year = q < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const adjQ = (q + 4) % 4;
      return {
        startDate: startOfDay(new Date(year, adjQ * 3, 1)),
        endDate: endOfDay(new Date(year, adjQ * 3 + 3, 0)),
      };
    }
    case "next-quarter": {
      const q = Math.floor(now.getMonth() / 3) + 1;
      const year = q > 3 ? now.getFullYear() + 1 : now.getFullYear();
      const adjQ = q % 4;
      return {
        startDate: startOfDay(new Date(year, adjQ * 3, 1)),
        endDate: endOfDay(new Date(year, adjQ * 3 + 3, 0)),
      };
    }
    case "this-year":
      return {
        startDate: startOfDay(new Date(now.getFullYear(), 0, 1)),
        endDate: endOfDay(new Date(now.getFullYear(), 11, 31)),
      };
    case "last-year":
      return {
        startDate: startOfDay(new Date(now.getFullYear() - 1, 0, 1)),
        endDate: endOfDay(new Date(now.getFullYear() - 1, 11, 31)),
      };

    case "last-7-days":
      return { startDate: startOfDay(addDays(now, -6)), endDate: endOfDay(now) };
    case "last-30-days":
      return {
        startDate: startOfDay(addDays(now, -29)),
        endDate: endOfDay(now),
      };
    case "last-90-days":
      return {
        startDate: startOfDay(addDays(now, -89)),
        endDate: endOfDay(now),
      };
    case "last-180-days":
      return {
        startDate: startOfDay(addDays(now, -179)),
        endDate: endOfDay(now),
      };
    case "last-365-days":
      return {
        startDate: startOfDay(addDays(now, -364)),
        endDate: endOfDay(now),
      };

    case "next-7-days":
      return { startDate: startOfDay(now), endDate: endOfDay(addDays(now, 6)) };
    case "next-30-days":
      return {
        startDate: startOfDay(now),
        endDate: endOfDay(addDays(now, 29)),
      };
    case "next-90-days":
      return {
        startDate: startOfDay(now),
        endDate: endOfDay(addDays(now, 89)),
      };

    case "custom": {
      if (!customRange?.from || !customRange?.to) {
        return { special: "all" };
      }
      return {
        startDate: startOfDay(new Date(customRange.from)),
        endDate: endOfDay(new Date(customRange.to)),
      };
    }

    default:
      return { special: "all" };
  }
};

const toYMD = (d) => {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fromYMD = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const formatPretty = (d) =>
  d
    ? d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

const findLabelByValue = (val) => {
  for (const group of DATE_RANGE_PRESETS) {
    const hit = group.items.find((i) => i.value === val);
    if (hit) return hit.label;
  }
  return "All Time";
};

const DateRangePicker = ({
  value = "",
  customRange = { from: "", to: "" },
  onChange,
  className = "",
  triggerClassName = "",
  placeholder = "Date Range",
}) => {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [draftCustom, setDraftCustom] = useState(customRange);
  const containerRef = useRef(null);
  const { language, isRTL } = useLanguage();
  const dpLocale = language === "ar" ? ar : enUS;

  // Sync drafts when popover opens or external value changes
  useEffect(() => {
    setDraftValue(value);
    setDraftCustom(customRange);
  }, [value, customRange?.from, customRange?.to, open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const resolved = useMemo(
    () => resolveDateRange(value, customRange),
    [value, customRange?.from, customRange?.to]
  );

  const previewText = useMemo(() => {
    if (resolved.special === "all") return "All Time";
    if (resolved.startDate && resolved.endDate) {
      return `${formatPretty(resolved.startDate)} – ${formatPretty(
        resolved.endDate
      )}`;
    }
    return "";
  }, [resolved]);

  const triggerLabel = value ? findLabelByValue(value) : placeholder;

  const apply = () => {
    onChange?.(draftValue, draftCustom);
    setOpen(false);
  };

  const cancel = () => {
    setDraftValue(value);
    setDraftCustom(customRange);
    setOpen(false);
  };

  const clear = () => {
    setDraftValue("");
    setDraftCustom({ from: "", to: "" });
    onChange?.("", { from: "", to: "" });
    setOpen(false);
  };

  const isCustomDraft = draftValue === "custom";
  const customValid =
    isCustomDraft &&
    draftCustom?.from &&
    draftCustom?.to &&
    new Date(draftCustom.from) <= new Date(draftCustom.to);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors ${triggerClassName}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            name="Calendar"
            size={16}
            className="text-muted-foreground flex-shrink-0"
          />
          <div className="flex flex-col items-start min-w-0">
            <span className="text-sm text-card-foreground truncate">
              {triggerLabel}
            </span>
            {value && previewText && previewText !== triggerLabel && (
              <span className="text-[11px] text-muted-foreground truncate">
                {previewText}
              </span>
            )}
          </div>
        </div>
        <Icon
          name="ChevronDown"
          size={16}
          className={`text-muted-foreground flex-shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-[600px] max-w-[calc(100vw-2rem)] right-0 bg-white border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex flex-col sm:flex-row max-h-[560px]">
            {/* Left: presets */}
            <div className="flex-1 sm:max-w-[260px] border-b sm:border-b-0 sm:border-r border-border overflow-y-auto p-2">
              {DATE_RANGE_PRESETS.map((group) => (
                <div key={group.group} className="mb-2 last:mb-0">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.group}
                  </div>
                  {group.items.map((item) => {
                    const active = draftValue === item.value;
                    return (
                      <button
                        key={item.value || "all"}
                        type="button"
                        onClick={() => setDraftValue(item.value)}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm rounded-md text-left transition-colors ${
                          active
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-card-foreground hover:bg-accent"
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        {active && (
                          <Icon
                            name="Check"
                            size={14}
                            className="flex-shrink-0"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Right: details / custom range */}
            <div className="flex-1 p-4 flex flex-col gap-4 bg-gray-50/50 overflow-y-auto">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Selected
                </div>
                <div className="text-sm font-semibold text-card-foreground">
                  {findLabelByValue(draftValue)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {(() => {
                    const r = resolveDateRange(draftValue, draftCustom);
                    if (r.special === "all") return "Shows all deals";
                    if (r.startDate && r.endDate)
                      return `${formatPretty(r.startDate)} – ${formatPretty(
                        r.endDate
                      )}`;
                    return "Pick from and to dates below";
                  })()}
                </div>
              </div>

              {isCustomDraft && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white border border-border rounded-md px-2 py-1.5">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase">
                        From
                      </div>
                      <div className="text-sm font-semibold text-card-foreground">
                        {draftCustom?.from
                          ? formatPretty(fromYMD(draftCustom.from))
                          : "—"}
                      </div>
                    </div>
                    <div className="bg-white border border-border rounded-md px-2 py-1.5">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase">
                        To
                      </div>
                      <div className="text-sm font-semibold text-card-foreground">
                        {draftCustom?.to
                          ? formatPretty(fromYMD(draftCustom.to))
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-border rounded-md p-2 flex justify-center">
                    <DayPicker
                      mode="range"
                      locale={dpLocale}
                      dir={isRTL ? "rtl" : "ltr"}
                      weekStartsOn={isRTL ? 6 : 0}
                      selected={{
                        from: fromYMD(draftCustom?.from) || undefined,
                        to: fromYMD(draftCustom?.to) || undefined,
                      }}
                      onSelect={(range) =>
                        setDraftCustom({
                          from: range?.from ? toYMD(range.from) : "",
                          to: range?.to ? toYMD(range.to) : "",
                        })
                      }
                      defaultMonth={fromYMD(draftCustom?.from) || new Date()}
                      showOutsideDays
                      className="!m-0"
                      classNames={{
                        day_button:
                          "h-8 w-8 rounded-full hover:bg-accent text-sm",
                        selected:
                          "[&>button]:!bg-primary [&>button]:!text-primary-foreground [&>button]:!font-semibold",
                        range_start:
                          "[&>button]:!bg-primary [&>button]:!text-primary-foreground [&>button]:!font-semibold rounded-l-full",
                        range_end:
                          "[&>button]:!bg-primary [&>button]:!text-primary-foreground [&>button]:!font-semibold rounded-r-full",
                        range_middle:
                          "[&>button]:!bg-primary/15 [&>button]:!text-primary [&>button]:!rounded-none",
                        today: "[&>button]:ring-1 [&>button]:ring-primary/40",
                        outside: "opacity-40",
                        caption_label:
                          "text-sm font-semibold text-card-foreground",
                        nav_button:
                          "p-1.5 rounded hover:bg-accent text-card-foreground",
                        weekday:
                          "text-[11px] font-medium text-muted-foreground",
                      }}
                    />
                  </div>

                  {!customValid && (
                    <p className="text-xs text-amber-600">
                      Pick a start and end date on the calendar.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-auto flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={clear}
                  className="text-xs text-muted-foreground hover:text-card-foreground underline"
                >
                  Clear
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancel}
                    className="px-3 py-1.5 text-sm rounded-md border border-input bg-white hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={apply}
                    disabled={isCustomDraft && !customValid}
                    className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
