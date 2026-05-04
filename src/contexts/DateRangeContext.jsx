import React, { createContext, useContext, useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { resolveDateRange } from "../components/ui/DateRangePicker";

const DateRangeContext = createContext(null);

const STORAGE_KEY = "jasco_date_range";
const DEFAULT_PRESET = "this-month";

const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const saveToStorage = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
};

export const DateRangeProvider = ({ children }) => {
  const [preset, setPresetState] = useState(
    () => loadFromStorage()?.preset || DEFAULT_PRESET,
  );
  const [customRange, setCustomRangeState] = useState(
    () => loadFromStorage()?.customRange || { from: "", to: "" },
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const period = useMemo(() => resolveDateRange(preset, customRange), [
    preset,
    customRange.from,
    customRange.to,
  ]);

  const dateRange = useMemo(() => {
    if (period.special === "all") {
      return { from: null, to: null, isAllTime: true };
    }
    if (period.startDate && period.endDate) {
      return {
        from: format(period.startDate, "yyyy-MM-dd"),
        to: format(period.endDate, "yyyy-MM-dd"),
        isAllTime: false,
      };
    }
    const now = new Date();
    return {
      from: format(startOfMonth(now), "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
      isAllTime: false,
    };
  }, [period]);

  const setRange = (newPreset, newCustomRange) => {
    const cr = newCustomRange || { from: "", to: "" };
    setPresetState(newPreset);
    setCustomRangeState(cr);
    saveToStorage({ preset: newPreset, customRange: cr });
  };

  return (
    <DateRangeContext.Provider value={{ dateRange, preset, customRange, setRange }}>
      {children}
    </DateRangeContext.Provider>
  );
};

export const useDateRange = () => {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
};
