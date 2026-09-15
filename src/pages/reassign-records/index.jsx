import React, { useCallback, useEffect, useMemo, useState } from "react";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import Button from "../../components/ui/Button";
import Icon from "../../components/AppIcon";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import {
  REASSIGN_ROLES,
  fetchReassignScope,
  fetchOwnedRecords,
  applyReassignment,
} from "../../services/reassignmentService";

// Reassign Records — move a person's open deals, opportunities, future orders and
// contacts to someone else in one audited action. All of the data rules (plain
// UPDATE, counting what actually moved, owner guard) live in reassignmentService.

const SECTIONS = ["deals", "opportunities", "futureOrders", "contacts"];
const SECTION_WORDS = {
  deals: ["deal", "deals"],
  opportunities: ["opportunity", "opportunities"],
  futureOrders: ["future order", "future orders"],
  contacts: ["contact", "contacts"],
};
const RESULT_KEY = { deals: "deals", opportunities: "opportunities", futureOrders: "futureOrders", contacts: "contacts" };

const emptySelection = () => ({
  deals: new Set(),
  opportunities: new Set(),
  futureOrders: new Set(),
  contacts: new Set(),
});

const countPhrase = (n, section) => `${n} ${SECTION_WORDS[section][n === 1 ? 0 : 1]}`;

const monthLabel = (value) => {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString("en-US", { month: "short", year: "numeric" });
};

const dateLabel = (value) => {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric" });
};

const RecordSection = ({ title, icon, rows, columns, selected, onToggle, onToggleAll, emptyText, error, total }) => {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
        <div className="flex items-center gap-2">
          <Icon name={icon} size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            {title} <span className="text-muted-foreground font-normal">({rows.length})</span>
          </h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {total && <span>Total {total}</span>}
          <span className={selected.size ? "text-primary font-medium" : ""}>{selected.size} selected</span>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-border">
          Could not load: {error.message || String(error)}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground text-center">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-2 text-left">
                  <input
                    type="checkbox"
                    aria-label={`Select all ${title}`}
                    checked={allSelected}
                    onChange={() => onToggleAll(rows)}
                  />
                </th>
                {columns.map((c) => (
                  <th key={c.key} className={`px-3 py-2 font-medium whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-border cursor-pointer hover:bg-muted/30 ${selected.has(row.id) ? "bg-primary/5" : ""}`}
                  onClick={() => onToggle(row.id)}
                >
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={selected.has(row.id)}
                      onChange={() => onToggle(row.id)}
                    />
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const ReassignRecords = () => {
  const { user, userProfile, company } = useAuth();
  const { formatCurrency } = useCurrency();
  const role = userProfile?.role;

  const [scope, setScope] = useState({ fromUsers: [], toUsers: [] });
  const [scopeError, setScopeError] = useState(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [records, setRecords] = useState(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selection, setSelection] = useState(emptySelection);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState(null);

  // Scope follows the active company — an admin or director can switch it.
  useEffect(() => {
    let cancelled = false;
    setFromId("");
    setToId("");
    setRecords(null);
    setSummary(null);
    if (!company?.id || !user?.id || !role) return undefined;
    (async () => {
      const res = await fetchReassignScope({ companyId: company.id, actorId: user.id, actorRole: role });
      if (cancelled) return;
      setScope({ fromUsers: res.fromUsers, toUsers: res.toUsers });
      setScopeError(res.error);
    })();
    return () => { cancelled = true; };
  }, [company?.id, user?.id, role]);

  const loadRecords = useCallback(async (ownerId) => {
    if (!ownerId || !company?.id) { setRecords(null); return; }
    setLoadingRecords(true);
    const res = await fetchOwnedRecords({ companyId: company.id, ownerId });
    setRecords(res);
    setLoadingRecords(false);
  }, [company?.id]);

  useEffect(() => {
    setSelection(emptySelection());
    setConfirming(false);
    loadRecords(fromId);
  }, [fromId, loadRecords]);

  const fromUser = scope.fromUsers.find((u) => u.id === fromId) || null;
  const toOptions = scope.toUsers.filter((u) => u.id !== fromId);
  const toUser = toOptions.find((u) => u.id === toId) || null;

  const counts = useMemo(
    () => Object.fromEntries(SECTIONS.map((s) => [s, selection[s].size])),
    [selection],
  );
  const totalSelected = SECTIONS.reduce((sum, s) => sum + counts[s], 0);
  const selectedPhrase = SECTIONS.filter((s) => counts[s]).map((s) => countPhrase(counts[s], s)).join(", ");

  const toggle = (section, id) =>
    setSelection((prev) => {
      const next = new Set(prev[section]);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, [section]: next };
    });

  const toggleAll = (section, rows) =>
    setSelection((prev) => {
      const all = rows.length > 0 && rows.every((r) => prev[section].has(r.id));
      return { ...prev, [section]: all ? new Set() : new Set(rows.map((r) => r.id)) };
    });

  const sumOf = (rows, field) => rows.reduce((s, r) => s + (parseFloat(r[field]) || 0), 0);

  const handleApply = async () => {
    if (!fromUser || !toUser || !totalSelected) return;
    setApplying(true);
    const labels = { from: fromUser.full_name, to: toUser.full_name };
    try {
      const res = await applyReassignment({
        companyId: company.id,
        actor: { id: user.id, full_name: userProfile?.full_name || "A manager", role },
        fromUser,
        toUser,
        selection: Object.fromEntries(SECTIONS.map((s) => [s, [...selection[s]]])),
        dealRows: records?.deals || [],
      });
      setSummary({ ...labels, res });
    } catch (err) {
      setSummary({ ...labels, thrown: err?.message || String(err) });
    } finally {
      setApplying(false);
      setConfirming(false);
      setSelection(emptySelection());
      await loadRecords(fromId);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (role && !REASSIGN_ROLES.includes(role)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-muted-foreground">
          Reassigning records is available to Sales Managers, directors and admins.
        </div>
      </div>
    );
  }

  // ── Summary content ───────────────────────────────────────────────────────
  const renderSummary = () => {
    if (!summary) return null;
    if (summary.thrown) {
      return (
        <div className="border border-destructive/30 bg-destructive/5 rounded-xl px-4 py-3 text-sm text-destructive">
          Reassignment failed before completing: {summary.thrown}. Reload the records below to see what, if anything, moved.
        </div>
      );
    }
    const { res } = summary;
    const moved = Object.fromEntries(SECTIONS.map((s) => [s, res[RESULT_KEY[s]].moved.length]));
    const movedPhrase = SECTIONS.map((s) => countPhrase(moved[s], s)).join(", ");
    const warnings = [];
    SECTIONS.forEach((s) => {
      const r = res[RESULT_KEY[s]];
      if (r.error) warnings.push(`${SECTION_WORDS[s][1]}: ${r.error.message || String(r.error)}`);
      else if (r.requested > r.moved.length) {
        warnings.push(
          `${countPhrase(r.requested - r.moved.length, s)} not moved — outside your permissions, or already reassigned by someone else.`,
        );
      }
    });
    if (res.audit.error) warnings.push(`Audit entries were not written: ${res.audit.error.message || String(res.audit.error)}`);
    if (res.log.error) warnings.push(`The reassignment log was not written: ${res.log.error.message || String(res.log.error)}`);
    if (res.notification.error) warnings.push(`${summary.to} was not notified: ${res.notification.error.message || String(res.notification.error)}`);
    const anyMoved = SECTIONS.some((s) => moved[s]);

    return (
      <div className={`border rounded-xl px-4 py-3 text-sm ${warnings.length ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}>
        <div className="flex items-start gap-2">
          <Icon name={warnings.length ? "Info" : "ShieldCheck"} size={16} className={warnings.length ? "text-amber-600 mt-0.5" : "text-emerald-600 mt-0.5"} />
          <div className="space-y-1">
            <p className="font-medium text-gray-900">
              {movedPhrase} moved from {summary.from} to {summary.to}.
            </p>
            {anyMoved && res.notification.sent && (
              <p className="text-gray-700">{summary.to} has been notified.</p>
            )}
            {res.audit.written > 0 && (
              <p className="text-gray-700">
                {res.audit.written} deal {res.audit.written === 1 ? "entry was" : "entries were"} added to the activity log.
              </p>
            )}
            {warnings.map((w) => (
              <p key={w} className="text-amber-800">• {w}</p>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-5">
        <NavigationBreadcrumbs
          items={[
            { label: "Dashboard", href: "/company-dashboard" },
            { label: "Reassign Records", href: "/reassign-records" },
          ]}
        />

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reassign Records</h1>
          <p className="text-sm text-gray-600 mt-1">
            Move open deals, opportunities, future orders and contacts from one person to another — for example before someone is deactivated.
          </p>
        </div>

        {!company?.id && (
          <div className="text-sm text-muted-foreground">Select a company to continue.</div>
        )}

        {scopeError && (
          <div className="text-sm text-destructive">Could not load team members: {scopeError.message || String(scopeError)}</div>
        )}

        {company?.id && (
          <div className="bg-card border border-border rounded-xl p-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600 block mb-1">Reassign from</span>
              <select
                value={fromId}
                onChange={(e) => { setSummary(null); setFromId(e.target.value); if (e.target.value === toId) setToId(""); }}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
              >
                <option value="">— Select a person —</option>
                {scope.fromUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}{u.id === user?.id ? " (you)" : ""}{u.is_active ? "" : " (Inactive)"} · {u.role}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600 block mb-1">Reassign selected to</span>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                disabled={!fromId}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background disabled:opacity-50"
              >
                <option value="">— Select who takes ownership —</option>
                {toOptions.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}{u.id === user?.id ? " (you)" : ""} · {u.role}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {renderSummary()}

        {fromId && loadingRecords && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="LoaderCircle" size={14} className="animate-spin" /> Loading records…
          </div>
        )}

        {fromId && records && !loadingRecords && (
          <>
            <RecordSection
              title="Open Deals"
              icon="TrendingUp"
              rows={records.deals}
              error={records.errors?.deals}
              emptyText="No open deals."
              total={records.deals.length ? formatCurrency(sumOf(records.deals, "amount")) : null}
              selected={selection.deals}
              onToggle={(id) => toggle("deals", id)}
              onToggleAll={(rows) => toggleAll("deals", rows)}
              columns={[
                { key: "title", label: "Deal", render: (r) => r.title || "—" },
                { key: "customer", label: "Customer", render: (r) => r.contact?.company_name || "—" },
                { key: "stage", label: "Stage", render: (r) => String(r.stage || "").replace(/_/g, " ") },
                { key: "close", label: "Expected close", render: (r) => dateLabel(r.expected_close_date) },
                { key: "amount", label: "Amount", align: "right", render: (r) => formatCurrency(r.amount, r.currency) },
              ]}
            />
            <RecordSection
              title="Opportunities"
              icon="ClipboardList"
              rows={records.opportunities}
              error={records.errors?.opportunities}
              emptyText="No open opportunities."
              total={records.opportunities.length ? formatCurrency(sumOf(records.opportunities, "planned_amount")) : null}
              selected={selection.opportunities}
              onToggle={(id) => toggle("opportunities", id)}
              onToggleAll={(rows) => toggleAll("opportunities", rows)}
              columns={[
                { key: "customer", label: "Customer", render: (r) => r.customer_name || "—" },
                { key: "group", label: "Material group", render: (r) => r.material_group || "—" },
                { key: "month", label: "Month", render: (r) => monthLabel(r.expected_month) },
                { key: "planned", label: "Planned", align: "right", render: (r) => formatCurrency(r.planned_amount) },
              ]}
            />
            <RecordSection
              title="Future Orders"
              icon="CalendarDays"
              rows={records.futureOrders}
              error={records.errors?.futureOrders}
              emptyText="No pending future orders."
              total={records.futureOrders.length ? formatCurrency(sumOf(records.futureOrders, "planned_amount")) : null}
              selected={selection.futureOrders}
              onToggle={(id) => toggle("futureOrders", id)}
              onToggleAll={(rows) => toggleAll("futureOrders", rows)}
              columns={[
                { key: "customer", label: "Customer", render: (r) => r.customer_name || "—" },
                { key: "month", label: "Expected month", render: (r) => monthLabel(r.expected_month) },
                { key: "planned", label: "Planned", align: "right", render: (r) => formatCurrency(r.planned_amount) },
              ]}
            />
            <RecordSection
              title="Contacts"
              icon="Users"
              rows={records.contacts}
              error={records.errors?.contacts}
              emptyText="No contacts."
              selected={selection.contacts}
              onToggle={(id) => toggle("contacts", id)}
              onToggleAll={(rows) => toggleAll("contacts", rows)}
              columns={[
                { key: "company", label: "Company", render: (r) => r.company_name || "—" },
                { key: "name", label: "Contact", render: (r) => [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "—" },
                { key: "type", label: "Type", render: (r) => r.customer_type || "—" },
                { key: "status", label: "Status", render: (r) => r.status || "—" },
              ]}
            />

            <div className="sticky bottom-0 bg-gray-50/95 backdrop-blur border-t border-border -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 py-3">
              {confirming ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-gray-800">
                    Move <strong>{selectedPhrase}</strong> from <strong>{fromUser?.full_name}</strong> to <strong>{toUser?.full_name}</strong>?
                    {" "}Ownership changes immediately{toUser?.id === user?.id ? "." : `; ${toUser?.full_name} will be notified.`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={applying}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleApply} disabled={applying} className="gap-2">
                      {applying && <Icon name="LoaderCircle" size={14} className="animate-spin" />}
                      {applying ? "Reassigning…" : "Confirm reassignment"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-gray-600">
                    {totalSelected
                      ? <>Selected: {selectedPhrase}{toUser ? <> → <strong>{toUser.full_name}</strong></> : " — choose who to reassign to"}</>
                      : "Select the records to reassign."}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setConfirming(true)}
                    disabled={!toUser || !totalSelected}
                  >
                    Apply Reassignment
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default ReassignRecords;
