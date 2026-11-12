import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import { adminService } from "../../../services/supabaseService";
import { useAuth } from "contexts/AuthContext";
import { useLanguage } from "../../../i18n";
import { ACCESS_PAGES, pageLabel, roleAllows, PAGE_ACCESS_CHANGED } from "utils/pageAccess";
import {
  fetchCompanyHidden, saveUserHidden, hidePageForAll, showPageForAll,
} from "services/pageAccessService";

/**
 * USER AUTHORIZATION — which pages each user sees (session 35, CEO 2026-11-12).
 *
 * The role is the ceiling (utils/pageAccess.js); this screen can only HIDE a
 * page within it. Pages the selected user's role cannot see at all are shown
 * greyed, "not available for this role". Only View is offered: Create and
 * Edit were stored but nothing ever read them.
 *
 * "Hide for all users" / "Show for all users" act on one page for everyone in
 * the company, after a confirmation. The Admin Dashboard, Settings, Account
 * settings, Notifications and Help are not listed: they cannot be hidden.
 */
const ROLE_LABELS = {
  admin: "Admin",
  director: "Director",
  head: "Head",
  manager: "Manager",
  supervisor: "Supervisor",
  salesman: "Salesman",
  viewer: "Viewer",
};

const UserAuthorization = () => {
  const { t } = useLanguage();
  const { company } = useAuth();

  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [hiddenRows, setHiddenRows] = useState([]);       // the company's hidden rows
  const [draft, setDraft] = useState(new Set());           // the selected user's hidden keys, being edited
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyPage, setBusyPage] = useState(null);
  const [msg, setMsg] = useState(null);
  const [readError, setReadError] = useState(null);

  const loadAll = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    const [{ data: allUsers }, hidden] = await Promise.all([
      adminService.getAllUsers(),
      fetchCompanyHidden(company.id),
    ]);
    // This company's ACTIVE users (the screen manages people who sign in).
    setUsers((allUsers || []).filter((u) => u.company_id === company.id && u.is_active !== false));
    setHiddenRows(hidden.rows);
    setReadError(hidden.error ? hidden.error.message : null);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectedUser = users.find((u) => u.id === selectedUserId) || null;
  const savedHidden = useMemo(
    () => new Set(hiddenRows.filter((r) => r.user_id === selectedUserId).map((r) => r.page)),
    [hiddenRows, selectedUserId],
  );
  useEffect(() => { setDraft(new Set(savedHidden)); }, [savedHidden]);
  const dirty = selectedUser && [...ACCESS_PAGES].some((p) => draft.has(p.key) !== savedHidden.has(p.key));

  const hiddenCount = (key) => hiddenRows.filter((r) => r.page === key && users.some((u) => u.id === r.user_id)).length;
  const eligible = (key) => users.filter((u) => roleAllows(key, u.role));

  const announce = () => window.dispatchEvent(new Event(PAGE_ACCESS_CHANGED));
  const flash = (ok, text) => { setMsg({ ok, text }); if (ok) setTimeout(() => setMsg(null), 3000); };

  const toggle = (key) => setDraft((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const handleSave = async () => {
    if (!selectedUser || !company?.id) return;
    setSaving(true);
    const { error } = await saveUserHidden({
      userId: selectedUser.id, companyId: company.id, role: selectedUser.role, hiddenKeys: [...draft],
    });
    setSaving(false);
    if (error) { flash(false, `${t("adminAuthorization.saveFailed")}: ${error.message}`); return; }
    flash(true, t("adminAuthorization.saveSuccess"));
    announce();
    loadAll();
  };

  const bulk = async (page, hide) => {
    if (!company?.id) return;
    const who = eligible(page.key);
    const label = pageLabel(page, t);
    const question = hide
      ? `Hide "${label}" for all ${who.length} user${who.length === 1 ? "" : "s"} in ${company.name || "this company"} whose role can see it?`
      : `Show "${label}" again for every user in ${company.name || "this company"}? (Users whose role cannot see it stay without it.)`;
    // eslint-disable-next-line no-alert
    if (!window.confirm(question)) return;
    setBusyPage(page.key);
    const { error } = hide
      ? await hidePageForAll({ companyId: company.id, pageKey: page.key, users: who })
      : await showPageForAll({ companyId: company.id, pageKey: page.key });
    setBusyPage(null);
    if (error) { flash(false, `${t("adminAuthorization.saveFailed")}: ${error.message}`); return; }
    flash(true, hide ? `"${label}" is hidden for all ${who.length} user(s).` : `"${label}" is shown for all users.`);
    announce();
    loadAll();
  };

  return (
    <div className="p-6 space-y-6" data-testid="user-authorization">
      <div>
        <h2 className="text-lg font-semibold">{t("adminAuthorization.title")}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Choose which menu pages each user sees. A user&apos;s role decides what is possible; here you can only hide
          pages within it. A page nobody has hidden is visible, as today.
        </p>
      </div>

      {readError && (
        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm" data-testid="authorization-read-error">
          The current settings could not be read ({readError}). Nothing is hidden for anyone while this is so.
        </div>
      )}
      {msg && (
        <div className={`text-sm font-medium ${msg.ok ? "text-emerald-700" : "text-destructive"}`} data-testid="authorization-msg">{msg.text}</div>
      )}

      {/* User selector */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[240px] max-w-sm">
          <label htmlFor="auth-user" className="block text-sm font-medium mb-1">{t("adminAuthorization.selectUser")}</label>
          {loading && !users.length ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="Loader2" size={14} className="animate-spin" /> {t("adminAuthorization.loadingUsers")}
            </div>
          ) : (
            <select
              id="auth-user"
              data-testid="auth-user"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">All users (bulk actions only)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email} ({ROLE_LABELS[u.role] || u.role})</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-testid="auth-table">
            <thead className="bg-muted/60 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("adminAuthorization.page")}</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground">
                  {selectedUser ? `View — ${selectedUser.full_name || selectedUser.email}` : "View"}
                </th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">All users</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ACCESS_PAGES.map((page) => {
                const label = pageLabel(page, t);
                const allowed = selectedUser ? roleAllows(page.key, selectedUser.role) : true;
                const visible = !draft.has(page.key);
                const nHidden = hiddenCount(page.key);
                const nEligible = eligible(page.key).length;
                return (
                  <tr key={page.key} data-testid={`auth-row-${page.key}`} className={allowed ? "" : "opacity-50"}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon name={page.icon} size={14} className="text-primary" />
                        <span className="font-medium">{label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!selectedUser ? (
                        <span className="text-xs text-muted-foreground">choose a user</span>
                      ) : !allowed ? (
                        <span className="text-xs text-muted-foreground" data-testid={`auth-na-${page.key}`}>not available for this role</span>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={visible}
                          aria-label={`${label}: ${visible ? "visible" : "hidden"}`}
                          data-testid={`auth-view-${page.key}`}
                          onClick={() => toggle(page.key)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${visible ? "bg-blue-600" : "bg-gray-300"}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${visible ? "translate-x-5" : "translate-x-0.5"}`} />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-xs text-muted-foreground mr-3" data-testid={`auth-count-${page.key}`}>
                        hidden for {nHidden} of {nEligible}
                      </span>
                      <button
                        type="button"
                        data-testid={`auth-hide-all-${page.key}`}
                        disabled={busyPage === page.key || nEligible === 0}
                        onClick={() => bulk(page, true)}
                        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 mr-1"
                      >
                        Hide for all users
                      </button>
                      <button
                        type="button"
                        data-testid={`auth-show-all-${page.key}`}
                        disabled={busyPage === page.key || nHidden === 0}
                        onClick={() => bulk(page, false)}
                        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                      >
                        Show for all users
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selectedUser && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              On = the page is in {selectedUser.full_name || "this user"}&apos;s menu. Off = hidden; its address takes them to their landing page.
              If everything is hidden, their landing page stays.
            </p>
            <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2" data-testid="auth-save">
              {saving
                ? <><Icon name="Loader2" size={14} className="animate-spin" /> {t("common.saving")}</>
                : <><Icon name="Save" size={14} /> {t("adminAuthorization.saveButton")}</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserAuthorization;
