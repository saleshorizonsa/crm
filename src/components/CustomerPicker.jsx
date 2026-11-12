import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "lib/supabase";

/**
 * PICK THE CUSTOMER — for a visit, call or WhatsApp that would otherwise be
 * saved without one (session 34: every such contact names its customer).
 *
 * Lists the owner's own customers, the way Log visit does: by owner only,
 * because contacts.company_id is empty on almost every row (297 of JASCO's 299
 * on 11 Oct 2026), so a company filter returns nothing.
 *
 * Writes nothing; the form it sits in saves the chosen id.
 */
const nameOf = (c) => c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unnamed customer";

export default function CustomerPicker({ ownerId, value, onChange, error = null, id = "customer-picker" }) {
  const [contacts, setContacts] = useState(null);   // null = loading
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!ownerId) { setContacts([]); return undefined; }
    let alive = true;
    supabase.from("contacts")
      .select("id, company_name, first_name, last_name")
      .eq("owner_id", ownerId)
      .order("company_name", { ascending: true })
      .then(({ data }) => { if (alive) setContacts(data || []); });
    return () => { alive = false; };
  }, [ownerId]);

  const list = contacts || [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => nameOf(c).toLowerCase().includes(q)) : list;
  }, [list, query]);

  return (
    <div data-testid="customer-picker">
      <label htmlFor={`${id}-search`} className="text-xs font-medium text-gray-700 mb-1.5 block">Customer *</label>
      <input
        id={`${id}-search`}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your customers"
        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm mb-2"
      />
      <select
        id={id}
        data-testid="customer-picker-select"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white ${error ? "border-red-400" : "border-gray-300"}`}
      >
        <option value="">
          {contacts === null ? "Loading your customers…" : list.length ? "Select the customer…" : "You have no customers yet"}
        </option>
        {shown.map((c) => <option key={c.id} value={c.id}>{nameOf(c)}</option>)}
      </select>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
