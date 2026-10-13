import React, { useEffect, useState } from "react";
import { useAuth } from "contexts/AuthContext";
import {
  MANAGE_EXPORT_ROLES, readContactExport, writeContactExport, forgetExportFlag,
} from "utils/exportCustomers";

/**
 * "EXPORT CUSTOMER" — the one switch that decides an export customer's
 * division (session 22). Manager and above only; nobody else sees it, and the
 * database refuses anyone else who tries (migrations/export_customers.sql).
 *
 * Saves itself, apart from the customer form's own Save: the flag is not in
 * that form's payload, so the form keeps working whether or not the migration
 * that adds the column has been applied. Until it has, this shows disabled.
 */
export default function ExportCustomerToggle({ contactId }) {
  const { userProfile } = useAuth();
  const allowed = MANAGE_EXPORT_ROLES.includes(userProfile?.role);
  const [state, setState] = useState({ value: false, available: true, loading: true });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    if (!allowed || !contactId) return undefined;
    readContactExport(contactId).then((r) => { if (alive) setState({ ...r, loading: false }); });
    return () => { alive = false; };
  }, [allowed, contactId]);

  if (!allowed || !contactId) return null;

  const toggle = async (e) => {
    const next = e.target.checked;
    setSaving(true);
    setNote("");
    const { error } = await writeContactExport(contactId, next);
    setSaving(false);
    if (error) { setNote(`Not saved: ${error.message || error}`); return; }
    forgetExportFlag(contactId);
    setState((s) => ({ ...s, value: next }));
    setNote(next
      ? "Saved. Its open deals, plan items and future orders now count in Export."
      : "Saved. It follows the usual division rule again.");
  };

  return (
    <div className="sm:col-span-2" data-testid="export-customer-toggle">
      <label className="flex items-center gap-2 text-sm font-medium text-card-foreground">
        <input
          type="checkbox"
          id="contact-is-export"
          checked={state.value}
          disabled={state.loading || saving || !state.available}
          onChange={toggle}
          className="h-4 w-4"
        />
        Export customer
      </label>
      <p className="text-xs text-muted-foreground mt-1">
        {!state.available
          ? "Available once the export-customers database update is applied."
          : "Its deals, plan items and future orders always count in the Export division, whoever owns them."}
      </p>
      {note && <p className="text-xs mt-1 text-foreground" role="status">{note}</p>}
    </div>
  );
}
