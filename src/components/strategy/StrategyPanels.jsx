import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../i18n";
import { useAuth } from "../../contexts/AuthContext";
import {
  STRATEGIES, NOT_SET, strategyKey, useCustomerStrategy, fetchStrategyHistory, fetchStrategyChanges,
} from "utils/customerStrategy";
import { StrategyBadge, StrategyControl } from "./StrategyBadge";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** From → to, as two badges ("Not set" shown dashed). */
function Move({ from, to }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StrategyBadge strategy={from} showNotSet />
      <span className="text-gray-400">→</span>
      <StrategyBadge strategy={to} showNotSet />
    </span>
  );
}

/**
 * Customer detail: the strategy, its note, who set it and when, the control
 * (managers and above) and the change history. Nothing until the feature is on.
 */
export function StrategyDetailSection({ contactId }) {
  const { t } = useLanguage();
  const { enabled, info } = useCustomerStrategy(contactId);
  const [history, setHistory] = useState(null);
  const [setByName, setSetByName] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!enabled || !contactId) return undefined;
    fetchStrategyHistory(contactId).then((h) => { if (alive) setHistory(h); });
    return () => { alive = false; };
  }, [enabled, contactId, reload, info?.setAt]);

  useEffect(() => {
    let alive = true;
    if (!info?.setBy) { setSetByName(""); return undefined; }
    supabase.from("users").select("id, full_name, email").eq("id", info.setBy).maybeSingle()
      .then(({ data }) => { if (alive) setSetByName(data?.full_name || data?.email || "—"); });
    return () => { alive = false; };
  }, [info?.setBy]);

  if (!enabled || !contactId) return null;
  return (
    <div className="px-6 pb-4" data-testid="strategy-detail">
      <div className="border border-border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-card-foreground">{t("strategy.label")}</span>
          <StrategyControl contactId={contactId} onChanged={() => setReload((n) => n + 1)} />
        </div>
        {info?.note && <p className="text-sm text-gray-700" data-testid="strategy-detail-note">{info.note}</p>}
        {info?.setAt && (
          <p className="text-xs text-gray-500" data-testid="strategy-detail-setby">
            {t("strategy.setBy")} {setByName || "—"} · {when(info.setAt)}
          </p>
        )}
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-medium text-gray-600 mb-1">{t("strategy.history")}</p>
          {history === null ? null : history.length === 0 ? (
            <p className="text-xs text-gray-400">{t("strategy.noHistory")}</p>
          ) : (
            <ul className="space-y-1" data-testid="strategy-history">
              {history.map((h) => (
                <li key={h.id} className="text-xs text-gray-600 flex flex-wrap items-center gap-1.5">
                  <Move from={h.old_strategy} to={h.new_strategy} />
                  {h.note && <span className="text-gray-700">“{h.note}”</span>}
                  <span className="text-gray-400">{h.changedByName} · {when(h.changed_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Customers page tab "Strategy changes" (manager and above): the latest 50
 * changes the user may see, filterable by company, salesman and strategy.
 */
export function StrategyChangesTab() {
  const { t } = useLanguage();
  const { availableCompanies } = useAuth();
  const [rows, setRows] = useState(null);
  const [owners, setOwners] = useState(new Map());
  const [f, setF] = useState({ company: "", salesman: "", strategy: "" });

  useEffect(() => {
    let alive = true;
    fetchStrategyChanges().then(async (r) => {
      if (!alive) return;
      const ids = [...new Set(r.map((x) => x.ownerId).filter(Boolean))];
      const { data } = ids.length ? await supabase.from("users").select("id, full_name, email").in("id", ids) : { data: [] };
      if (!alive) return;
      setOwners(new Map((data || []).map((u) => [u.id, u.full_name || u.email])));
      setRows(r);
    });
    return () => { alive = false; };
  }, []);

  const companyName = useMemo(() => new Map((availableCompanies || []).map((c) => [c.id, c.name])), [availableCompanies]);
  const companies = useMemo(() => [...new Set((rows || []).map((r) => r.company_id).filter(Boolean))], [rows]);
  const salesmen = useMemo(() => [...new Set((rows || []).map((r) => r.ownerId).filter(Boolean))], [rows]);
  const shown = useMemo(() => (rows || []).filter((r) => (!f.company || r.company_id === f.company)
    && (!f.salesman || r.ownerId === f.salesman)
    && (!f.strategy || strategyKey(r.new_strategy) === f.strategy || strategyKey(r.old_strategy) === f.strategy)).slice(0, 50), [rows, f]);

  const sel = "px-3 py-2 border border-border rounded-md bg-background text-sm";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3" data-testid="strategy-changes">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700 mr-2">{t("strategy.latest50")}</span>
        <select className={sel} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} data-testid="changes-company">
          <option value="">{t("strategy.allCompanies")}</option>
          {companies.map((id) => <option key={id} value={id}>{companyName.get(id) || id.slice(0, 8)}</option>)}
        </select>
        <select className={sel} value={f.salesman} onChange={(e) => setF({ ...f, salesman: e.target.value })} data-testid="changes-salesman">
          <option value="">{t("strategy.allSalesmen")}</option>
          {salesmen.map((id) => <option key={id} value={id}>{owners.get(id) || "—"}</option>)}
        </select>
        <select className={sel} value={f.strategy} onChange={(e) => setF({ ...f, strategy: e.target.value })} data-testid="changes-strategy">
          <option value="">{t("strategy.all")}</option>
          {[...STRATEGIES, NOT_SET].map((k) => <option key={k} value={k}>{t(`strategy.${k === NOT_SET ? "notSet" : k}`)}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-3 py-2">{t("strategy.customer")}</th>
              <th className="text-left px-3 py-2">{t("strategy.from")} → {t("strategy.to")}</th>
              <th className="text-left px-3 py-2">{t("strategy.note")}</th>
              <th className="text-left px-3 py-2">{t("strategy.changedBy")}</th>
              <th className="text-left px-3 py-2">{t("strategy.date")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows === null ? null : shown.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">{t("strategy.noHistory")}</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id} data-testid="strategy-change-row">
                <td className="px-3 py-2 text-gray-900">{r.customer}<div className="text-[11px] text-gray-400">{owners.get(r.ownerId) || ""}</div></td>
                <td className="px-3 py-2"><Move from={r.old_strategy} to={r.new_strategy} /></td>
                <td className="px-3 py-2 text-gray-700">{r.note || "—"}</td>
                <td className="px-3 py-2 text-gray-700">{r.changedByName}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{when(r.changed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
