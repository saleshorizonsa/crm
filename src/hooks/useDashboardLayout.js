import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { getDefaultLayout, getAllowedWidgets } from "../utils/dashboardLayouts";

// Column in user_settings that stores dashboard state
const SETTINGS_KEY = "dashboard_layout";

/**
 * Loads, persists, and manages a user's dashboard grid layout.
 *
 * Returns:
 *   layout        – current array of { i, x, y, w, h } grid items
 *   hiddenWidgets – Set of widget IDs currently hidden
 *   isLoading     – true while the initial fetch is in flight
 *   isDirty       – true when there are unsaved local changes
 *   saveLayout    – (newLayout) => Promise  persist layout to DB
 *   toggleWidget  – (widgetId) => void      hide / show a widget
 *   resetLayout   – ()         => Promise  revert to role default
 */
export function useDashboardLayout() {
  const { user, userProfile } = useAuth();
  const role = userProfile?.role ?? "salesman";

  const [layout, setLayout] = useState(() => getDefaultLayout(role));
  const [hiddenWidgets, setHiddenWidgets] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  // Track the last-loaded role so we can reset when role changes
  const loadedRoleRef = useRef(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id || !userProfile) return;

    // If the role changed (e.g. impersonation) wipe local state first
    if (loadedRoleRef.current && loadedRoleRef.current !== role) {
      setLayout(getDefaultLayout(role));
      setHiddenWidgets(new Set());
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (!error && data?.settings?.[SETTINGS_KEY]) {
        const saved = data.settings[SETTINGS_KEY];
        const allowed = new Set(getAllowedWidgets(role));

        // Strip widgets the role can no longer see
        const sanitised = (saved.layout ?? []).filter((item) =>
          allowed.has(item.i)
        );

        if (sanitised.length > 0) setLayout(sanitised);
        setHiddenWidgets(new Set(saved.hidden ?? []));
      }

      loadedRoleRef.current = role;
      setIsLoading(false);
      setIsDirty(false);
    }

    load();
    return () => { cancelled = true; };
  }, [user?.id, role]); // re-run only when user or role changes

  // ── Persist helper ──────────────────────────────────────────────────────────

  const persist = useCallback(
    async (nextLayout, nextHidden) => {
      if (!user?.id) return { error: new Error("No authenticated user") };

      const patch = {
        user_id: user.id,
        settings: {
          // Merge with any other keys that may exist in settings
          [SETTINGS_KEY]: {
            layout: nextLayout,
            hidden: [...nextHidden],
            savedAt: new Date().toISOString(),
            role,
          },
        },
        updated_at: new Date().toISOString(),
      };

      // Fetch existing settings to merge (avoids wiping other keys)
      const { data: existing } = await supabase
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing?.settings) {
        patch.settings = { ...existing.settings, [SETTINGS_KEY]: patch.settings[SETTINGS_KEY] };
      }

      const { error } = await supabase
        .from("user_settings")
        .upsert(patch, { onConflict: "user_id" });

      if (!error) setIsDirty(false);
      return { error };
    },
    [user?.id, role]
  );

  // ── Public API ──────────────────────────────────────────────────────────────

  const saveLayout = useCallback(
    async (newLayout) => {
      setLayout(newLayout);
      setIsDirty(true);
      return persist(newLayout, hiddenWidgets);
    },
    [hiddenWidgets, persist]
  );

  const toggleWidget = useCallback(
    async (widgetId) => {
      setHiddenWidgets((prev) => {
        const next = new Set(prev);
        if (next.has(widgetId)) {
          next.delete(widgetId);
        } else {
          next.add(widgetId);
        }
        // Fire-and-forget the persist; caller can await the returned promise
        persist(layout, next);
        return next;
      });
    },
    [layout, persist]
  );

  const resetLayout = useCallback(async () => {
    const defaultLayout = getDefaultLayout(role);
    setLayout(defaultLayout);
    setHiddenWidgets(new Set());
    setIsDirty(false);
    return persist(defaultLayout, new Set());
  }, [role, persist]);

  // Visible layout = items not in the hidden set
  const visibleLayout = layout.filter((item) => !hiddenWidgets.has(item.i));

  return {
    layout,
    visibleLayout,
    hiddenWidgets,
    isLoading,
    isDirty,
    saveLayout,
    toggleWidget,
    resetLayout,
  };
}
