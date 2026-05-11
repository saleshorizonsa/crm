import React, { createContext, useContext, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";

const DateRangeContext = createContext(null);

const STORAGE_KEY = "jasco_date_range";

const defaultRange = () => {
  const now = new Date();
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
    isAllTime: false,
  };
};

const saveToStorage = (from, to) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to }));
  } catch {}
};

export const DateRangeProvider = ({ children }) => {
  const [dateRange, setDateRangeState] = useState(defaultRange);

  // Accepts { from, to } — called by DateRangePicker's onChange
  const setRange = ({ from, to } = {}) => {
    const next = from && to
      ? { from, to, isAllTime: false }
      : { from: null, to: null, isAllTime: true };
    setDateRangeState(next);
    saveToStorage(from || null, to || null);
  };

  return (
    <DateRangeContext.Provider value={{ dateRange, setRange }}>
      {children}
    </DateRangeContext.Provider>
  );
};

export const useDateRange = () => {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
};
