import React, { createContext, useCallback, useContext, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useAuth } from "./AuthContext";
import {
  storageKeyFor,
  readSavedRange,
  writeSavedRange,
} from "../utils/dateRangeStorage";

const DateRangeContext = createContext(null);

const defaultRange = () => {
  const now = new Date();
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
    isAllTime: false,
  };
};

// `hasSelection` records whether a range has already been chosen this session —
// restored from storage, or set by anything since. DirectorDashboard applies its
// This Year default only when it is false; otherwise every return to the
// dashboard would overwrite the director's own choice.
const hydrate = (key) => {
  const saved = readSavedRange(key);
  return { key, range: saved || defaultRange(), hasSelection: Boolean(saved) };
};

export const DateRangeProvider = ({ children }) => {
  const { user, company } = useAuth();
  const storageKey = storageKeyFor(user?.id, company?.id);
  const [state, setState] = useState(() => hydrate(storageKey));

  // Re-hydrate DURING RENDER when the key changes — login, the company finishing
  // loading, a company switch, logout — not in an effect. Child effects run
  // before a parent's, so an effect here would land too late: the dashboards
  // would first fetch with the default month and then again with the restored
  // range, and DirectorDashboard's mount default would fire before the restore
  // and overwrite it. React re-renders this provider immediately, before its
  // children, when state is set during render.
  let current = state;
  if (state.key !== storageKey) {
    current = hydrate(storageKey);
    setState(current);
  }

  // Accepts { from, to } — called by DateRangePicker's onChange. No dates means
  // All Time. Written straight to storage so a refresh a moment later keeps it.
  const setRange = useCallback(
    ({ from, to } = {}) => {
      const next =
        from && to
          ? { from, to, isAllTime: false }
          : { from: null, to: null, isAllTime: true };
      setState((prev) => ({ ...prev, range: next, hasSelection: true }));
      writeSavedRange(storageKey, next);
    },
    [storageKey],
  );

  return (
    <DateRangeContext.Provider
      value={{ dateRange: current.range, setRange, hasSelection: current.hasSelection }}
    >
      {children}
    </DateRangeContext.Provider>
  );
};

export const useDateRange = () => {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
};
