import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "./AppIcon";

/**
 * The one-line explanation a redirect leaves behind.
 *
 * A route that a role may not open redirects to that role's landing page
 * instead of showing an Access Denied screen, and this is what tells them why
 * they are not where they clicked. ProtectedRoute renders it on every protected
 * route, so the notice survives the redirect wherever it lands — Insights, the
 * Dashboard or /pipeline-view — without each page having to know about it.
 *
 * Fixed and overlaid rather than inline: it must not push a page's own layout
 * around, and a page that is still loading when the redirect arrives would
 * otherwise reflow underneath it.
 *
 * The message is dropped from the browser's copy of the history state as soon
 * as it is read, so a refresh does not re-announce it. React Router keeps
 * location.state in memory for the current entry, which is why the component
 * also tracks location.key: a later navigation to the same page shows nothing.
 */
export default function RouteNotice() {
  const location = useLocation();
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const notice = location.state?.notice;
    if (!notice) {
      setMessage(null);
      return undefined;
    }
    setMessage(notice);
    // Same trick the sales pipeline uses for state.openDealId: clear the
    // browser's copy so a reload starts clean.
    try {
      window.history.replaceState({}, document.title);
    } catch {
      // A history that refuses replaceState is not worth failing a render over.
    }
    const timer = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [location.key, location.state]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="route-notice"
      className="fixed left-1/2 -translate-x-1/2 z-[60] max-w-[min(32rem,calc(100vw-2rem))]"
      style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}
    >
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 shadow-lg">
        <Icon name="Info" size={16} className="mt-0.5 flex-none text-amber-600" />
        <p className="text-sm text-amber-900">{message}</p>
        <button
          type="button"
          onClick={() => setMessage(null)}
          aria-label="Dismiss"
          className="ml-1 flex-none rounded p-0.5 text-amber-700 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <Icon name="X" size={14} />
        </button>
      </div>
    </div>
  );
}
