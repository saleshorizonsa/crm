import React, { useEffect, useMemo, useState } from "react";
import LogVisit from "components/LogVisit";
import { fetchPlanContacts, summarisePlanContacts } from "utils/planContacts";
import { riyadhMonthKeyOf, monthBoundsOf } from "utils/planMonths";

/**
 * PLAN CUSTOMERS: CONTACTED / PENDING — under the person table in the pacing
 * drill (Insights and the Coverage Console).
 *
 * Every figure is utils/planContacts.js's. A summary per person (and a total)
 * on top; clicking a person narrows the customer list to him. Pending rows the
 * logged-in user owns get Log visit with that customer already chosen —
 * the Session 17 flow, so no new write path; anyone else's pending row says
 * whose it is to log. People who have left are never named.
 */
const money = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "the owner";
const shortDate = (ymd) => {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const DEPARTED = "No longer active";
const TH = "px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200";

export default function PlanContactsTracker({
  companyId, scopeIds = [], users = [], viewerId, refreshKey = 0, onLogged,
}) {
  const [data, setData] = useState(null);
  const [owner, setOwner] = useState(null);
  const idKey = scopeIds.join(",");

  useEffect(() => {
    if (!companyId || !idKey) return undefined;
    let alive = true;
    const { start, end } = monthBoundsOf(riyadhMonthKeyOf());
    fetchPlanContacts({ companyId, ownerIds: idKey.split(","), start, end })
      .then((r) => { if (alive) setData(r); });
    return () => { alive = false; };
  }, [companyId, idKey, refreshKey]);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const gone = (id) => byId.get(id)?.is_active === false;
  const nameOf = (id) => (gone(id) ? DEPARTED : byId.get(id)?.full_name || "Unknown");

  const summary = useMemo(() => {
    if (!data) return null;
    const per = summarisePlanContacts(data.rows);
    const named = [];
    const departed = { customers: 0, contacted: 0, pending: 0 };
    per.forEach((p, id) => {
      if (gone(id)) { departed.customers += p.customers; departed.contacted += p.contacted; departed.pending += p.pending; return; }
      named.push({ id, name: nameOf(id), ...p });
    });
    named.sort((a, b) => b.customers - a.customers || a.name.localeCompare(b.name));
    if (departed.customers) named.push({ id: DEPARTED, name: DEPARTED, ...departed });
    const total = named.reduce((t, p) => ({
      customers: t.customers + p.customers, contacted: t.contacted + p.contacted, pending: t.pending + p.pending,
    }), { customers: 0, contacted: 0, pending: 0 });
    return { named, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, byId]);

  if (!data) return <p className="px-4 py-3 text-xs text-gray-500">Loading plan customers…</p>;
  if (data.failed) return <p className="px-4 py-3 text-xs text-gray-600">Plan customers could not be read — refresh to try again.</p>;

  const rows = data.rows.filter((r) => !owner || (owner === DEPARTED ? gone(r.ownerId) : r.ownerId === owner));
  const pct = (p) => (p.customers ? `${Math.round((p.contacted / p.customers) * 100)}%` : "—");

  return (
    <section className="border-t border-gray-200" data-testid="plan-contacts">
      <div className="px-4 pt-3 pb-2">
        <h3 className="text-xs font-semibold text-gray-900">Plan customers — contacted or pending</h3>
        <p className="text-xs text-gray-600" data-testid="plan-contacts-header">
          Contacted {summary.total.contacted} of {summary.total.customers} planned customers this month
        </p>
        <p className="text-[10px] text-gray-400">
          Any visit, call, WhatsApp or meeting by the plan&apos;s owner, from contact reports and activities. Emails, notes and tasks do not count.
        </p>
      </div>

      <div className="overflow-x-auto px-2">
        <table className="w-full text-xs" data-testid="plan-contacts-summary">
          <thead>
            <tr className="bg-gray-50">
              {["Name", "Plan customers", "Contacted", "Pending", "% contacted"].map((h, i) => (
                <th key={h} scope="col" className={`${TH} ${i ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[{ id: null, name: "Total", ...summary.total }, ...summary.named].map((p) => (
              <tr
                key={p.id || "total"}
                onClick={() => setOwner(p.id)}
                aria-selected={owner === p.id}
                className={`cursor-pointer hover:bg-gray-50 ${owner === p.id ? "bg-indigo-50" : ""} ${p.id ? "" : "font-semibold"}`}
              >
                <td className="px-2 py-1.5">{p.name}</td>
                <td className="px-2 py-1.5 text-right font-mono">{p.customers}</td>
                <td className="px-2 py-1.5 text-right font-mono">{p.contacted}</td>
                <td className="px-2 py-1.5 text-right font-mono">{p.pending}</td>
                <td className="px-2 py-1.5 text-right font-mono">{pct(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto px-2 pb-3 mt-2">
        <p className="px-2 pb-1 text-[11px] text-gray-500">
          {owner ? `${owner === DEPARTED ? DEPARTED : nameOf(owner)}'s plan customers` : "All plan customers"} · pending first, then largest planned
          {owner && <button type="button" onClick={() => setOwner(null)} className="ml-2 underline">show everyone</button>}
        </p>
        <table className="w-full text-xs" data-testid="plan-contacts-list">
          <thead>
            <tr className="bg-gray-50">
              {["Customer", "Owner", "Planned", "Plan status", "Contact status", ""].map((h, i) => (
                <th key={h || "action"} scope="col" className={`${TH} ${i === 2 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const mine = viewerId && r.ownerId === viewerId;
              return (
                <tr key={r.key} data-testid="plan-contact-row">
                  <td className="px-2 py-1.5" dir="auto">{r.customer}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{nameOf(r.ownerId)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{money(r.planned)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.planStatus}</td>
                  <td className={`px-2 py-1.5 whitespace-nowrap ${r.contacted ? "text-green-700" : "text-amber-700"}`}>
                    {r.contacted ? `Contacted ${shortDate(r.lastContact.date)} · ${r.lastContact.type}` : "Pending"}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right">
                    {!r.contacted && (mine ? (
                      <LogVisit
                        companyId={companyId}
                        userId={viewerId}
                        testid="log-visit-row"
                        presetContactId={r.contactId}
                        presetQuery={r.contactId ? "" : r.customer}
                        onSaved={onLogged}
                        className="text-[11px] px-2 py-0.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1"
                      />
                    ) : !gone(r.ownerId) && (
                      <span className="text-[10px] text-gray-500">{firstName(nameOf(r.ownerId))}&apos;s to log</span>
                    ))}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={6} className="px-2 py-3 text-xs text-gray-500">No plan customers this month.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
