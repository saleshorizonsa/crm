import React, { useEffect, useMemo, useState } from "react";
import Icon from "components/AppIcon";
import { supabase } from "lib/supabase";
import ContactReportModal from "components/deals/ContactReportModal";
import LogActivityModal from "components/LogActivityModal";
import { riyadhToday } from "utils/visits";

/**
 * LOG VISIT — pick the customer and the day, then the existing form saves it.
 *
 * This component WRITES NOTHING. It reads the logged-in user's own customers
 * and, for the one chosen, his own open deals; then it hands over to one of
 * the two forms that already exist:
 *
 *   the customer has an open deal owned by the user
 *       → ContactReportModal, type preset to visit, on that deal — so the visit
 *         reaches the contact-reports audit
 *   otherwise
 *       → LogActivityModal, type visit, on the customer
 *
 * A contact report is never written without a deal (CEO, 2026-10-11). Both
 * forms save against the logged-in user only, and only when he presses Save.
 */
const contactName = (c) => c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unnamed customer";

export default function LogVisit({ companyId, userId, onSaved, className = "", label = "Log visit", testid = "log-visit" }) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState(null);   // null = still loading
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState("");
  const [date, setDate] = useState(riyadhToday());
  const [deal, setDeal] = useState(undefined);      // undefined = not looked up yet
  const [form, setForm] = useState(null);           // "report" | "activity" | null

  useEffect(() => {
    if (!open || !companyId || !userId) return undefined;
    let alive = true;
    // By OWNER only. contacts.company_id is empty on almost every row (297 of
    // JASCO's 299 on 11 Oct 2026), so a company filter here returned nothing;
    // the rest of the app scopes customers by owner the same way.
    supabase.from("contacts")
      .select("id, company_name, first_name, last_name")
      .eq("owner_id", userId)
      .order("company_name", { ascending: true })
      .then(({ data }) => { if (alive) setContacts(data || []); });
    return () => { alive = false; };
  }, [open, companyId, userId]);
  const list = contacts || [];

  // The user's own open deal for this customer, newest first.
  useEffect(() => {
    if (!contactId) { setDeal(undefined); return undefined; }
    let alive = true;
    setDeal(undefined);
    supabase.from("deals")
      .select("id, title, stage, contact_id, updated_at")
      .eq("company_id", companyId)
      .eq("owner_id", userId)
      .eq("contact_id", contactId)
      .not("stage", "in", '("won","lost")')
      .order("updated_at", { ascending: false })
      .limit(1)
      .then(({ data }) => { if (alive) setDeal((data || [])[0] || null); });
    return () => { alive = false; };
  }, [contactId, companyId, userId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => contactName(c).toLowerCase().includes(q)) : list;
  }, [list, query]);
  const chosen = list.find((c) => c.id === contactId) || null;

  const reset = () => { setOpen(false); setForm(null); setContactId(""); setQuery(""); setDate(riyadhToday()); setContacts(null); };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testid}
        className={className || "flex items-center gap-1.5 text-xs font-medium border border-gray-300 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"}
      >
        <Icon name="MapPin" size={14} />
        {label}
      </button>

      {open && !form && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 p-4" data-testid="log-visit-picker">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Log a visit</h2>
              <button type="button" onClick={reset} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <Icon name="X" size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="log-visit-search" className="text-xs font-medium text-gray-600 block mb-1">Customer</label>
                <input
                  id="log-visit-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your customers"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2"
                />
                <select
                  id="log-visit-customer"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">
                    {contacts === null ? "Loading your customers…"
                      : list.length ? "Select a customer…" : "You have no customers yet"}
                  </option>
                  {shown.map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="log-visit-date" className="text-xs font-medium text-gray-600 block mb-1">Date of the visit</label>
                <input
                  id="log-visit-date"
                  type="date"
                  value={date}
                  max={riyadhToday()}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              {chosen && (
                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2" data-testid="log-visit-route">
                  {deal === undefined
                    ? "Checking for an open deal…"
                    : deal
                      ? `Open deal "${deal.title}" — the visit is filed as a contact report on it, so it reaches the contact-reports audit.`
                      : "No open deal of yours for this customer — the visit is logged as an activity on the customer."}
                </p>
              )}
              <p className="text-[11px] text-gray-500">Next you add the outcome and next action. Nothing is saved until you press Save there.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button type="button" onClick={reset} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                data-testid="log-visit-continue"
                disabled={!chosen || !date || deal === undefined}
                onClick={() => setForm(deal ? "report" : "activity")}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {form === "report" && deal && (
        <ContactReportModal
          deal={{ ...deal, contact_name: contactName(chosen) }}
          initialType="visit"
          initialDate={date}
          onClose={reset}
          onSaved={() => { onSaved?.(); }}
        />
      )}
      {form === "activity" && (
        <LogActivityModal
          isOpen
          onClose={reset}
          onSaved={(a) => { onSaved?.(a); }}
          dealId={null}
          contactId={contactId}
          contactName={contactName(chosen)}
          ownerId={userId}
          visitDate={date}
        />
      )}
    </>
  );
}
