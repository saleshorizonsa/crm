import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "lib/supabase";
import { useAuth } from "contexts/AuthContext";
import { computeAccess, DEFAULT_ACCESS, PAGE_ACCESS_CHANGED } from "utils/pageAccess";

/**
 * The signed-in user's page access (utils/pageAccess.js), read ONCE at sign-in
 * and again when the admin saves (PAGE_ACCESS_CHANGED). Every navigation in
 * the menu is a full page load, so a change reaches everyone else on their
 * next page.
 *
 * DEGRADES TO TODAY. A failed read — the table missing, a policy refusing —
 * is treated as "no rows", which is exactly how the app behaves without this
 * feature. Nothing is hidden because a read failed.
 */
const PageAccessContext = createContext(null);

export function PageAccessProvider({ children }) {
  const { user, userProfile, company } = useAuth();
  const role = userProfile?.role || null;
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id || !company?.id) { setRows([]); setReady(!!userProfile || !user); return; }
    try {
      const { data, error } = await supabase
        .from("user_page_permissions")
        .select("page, can_view")
        .eq("user_id", user.id)
        .eq("company_id", company.id);
      if (error) {
        console.warn("page access: not read, nothing hidden:", error.message);
        setRows([]);
      } else {
        setRows(data || []);
      }
    } catch (e) {
      console.warn("page access: not read, nothing hidden:", e?.message || e);
      setRows([]);
    } finally {
      setReady(true);
    }
  }, [user?.id, company?.id, userProfile]);

  useEffect(() => { setReady(false); load(); }, [load]);
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener(PAGE_ACCESS_CHANGED, onChange);
    return () => window.removeEventListener(PAGE_ACCESS_CHANGED, onChange);
  }, [load]);

  const value = useMemo(() => ({ ...computeAccess({ role, rows }), ready, refresh: load, rows }), [role, rows, ready, load]);
  return <PageAccessContext.Provider value={value}>{children}</PageAccessContext.Provider>;
}

/**
 * The access for the signed-in user. Outside a provider (a test mounting one
 * page, an old entry point) it is today's behaviour: everything the role allows.
 */
export function usePageAccess() {
  const ctx = useContext(PageAccessContext);
  const { userProfile } = useAuth();
  return ctx || { ...DEFAULT_ACCESS(userProfile?.role || null), ready: true, refresh: () => {}, rows: [] };
}
