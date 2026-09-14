// Session persistence for the shared date range (DateRangeContext).
//
// sessionStorage, not localStorage: a selection must survive in-app navigation
// and a refresh, but not closing the tab. sessionStorage is scoped to the tab
// and discarded with it, which gives exactly that lifetime. Logout is still
// cleared explicitly (clearSavedRanges) because a tab can outlive a session —
// one user signs out and another signs in on the same tab.
//
// Keyed per user AND company, so an admin or director switching companies keeps
// a separate selection per company instead of carrying one company's period
// into another company's figures.

const PREFIX = "jasco_date_range:";

// Earlier persistence attempts wrote these to localStorage and never read them
// back. Nothing consumes them, but they survive logout and are shared by every
// user of the browser, so they are purged along with the session keys.
const LEGACY_LOCAL_KEYS = ["jasco_date_range", "jasco_date_picker_v2"];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const storageKeyFor = (userId, companyId) =>
  userId && companyId ? `${PREFIX}${userId}:${companyId}` : null;

// Touching Web Storage can throw (storage disabled, sandboxed frames), so every
// access degrades to "nothing saved" rather than breaking the page.
const sessionStore = () => {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

/** Validates a stored value. Anything malformed is treated as absent. */
export function parseStoredRange(raw) {
  if (!raw) return null;
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  if (v.isAllTime === true) return { from: null, to: null, isAllTime: true };
  if (YMD.test(v.from) && YMD.test(v.to) && v.from <= v.to) {
    return { from: v.from, to: v.to, isAllTime: false };
  }
  return null;
}

export function readSavedRange(key, store = sessionStore()) {
  if (!key || !store) return null;
  try {
    return parseStoredRange(store.getItem(key));
  } catch {
    return null;
  }
}

export function writeSavedRange(key, range, store = sessionStore()) {
  if (!key || !store || !range) return;
  try {
    store.setItem(
      key,
      JSON.stringify({
        from: range.from ?? null,
        to: range.to ?? null,
        isAllTime: Boolean(range.isAllTime),
      }),
    );
  } catch {}
}

/** Removes every user's saved range from this tab, plus the legacy localStorage keys. */
export function clearSavedRanges(store = sessionStore()) {
  try {
    if (store) {
      const keys = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
    }
  } catch {}
  try {
    if (typeof window !== "undefined") {
      LEGACY_LOCAL_KEYS.forEach((k) => window.localStorage.removeItem(k));
    }
  } catch {}
}
