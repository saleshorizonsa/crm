import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { leadService } from "../../../services/leadService";

const REGIONS = [
  "riyadh","jeddah","dammam","khobar","makkah","madinah",
  "dubai","abudhabi","kuwait","bahrain","qatar",
];
const REGION_LABELS = {
  riyadh:"Riyadh", jeddah:"Jeddah", dammam:"Dammam", khobar:"Al Khobar",
  makkah:"Makkah", madinah:"Madinah", dubai:"Dubai", abudhabi:"Abu Dhabi",
  kuwait:"Kuwait", bahrain:"Bahrain", qatar:"Qatar",
};
const PRODUCTS   = ["steel", "pvc", "trading"];
const STATUSES   = ["new","contacted","qualified","unqualified","converted"];
const STATUS_LABELS = {
  new:"New", contacted:"Contacted", qualified:"Qualified",
  unqualified:"Unqualified", converted:"Converted",
};
const STATUS_COLORS = {
  new:         { bg: "bg-blue-100",  text: "text-blue-700"  },
  contacted:   { bg: "bg-amber-100", text: "text-amber-700" },
  qualified:   { bg: "bg-green-100", text: "text-green-700" },
  unqualified: { bg: "bg-gray-100",  text: "text-gray-600"  },
  converted:   { bg: "bg-teal-100",  text: "text-teal-700"  },
};
const SOURCES    = ["apollo","manual","import","referral"];
const SOURCE_LABELS = { apollo:"Apollo", manual:"Manual", import:"Import", referral:"Referral" };

const STAGE_ORDER = ["new","contacted","qualified","unqualified","converted"];

const HISTORY_ICONS = {
  create:       { name: "UserPlus",    color: "text-green-600",  bg: "bg-green-50"  },
  stage_change: { name: "ArrowRight",  color: "text-blue-600",   bg: "bg-blue-50"   },
  assignment:   { name: "Users",       color: "text-amber-600",  bg: "bg-amber-50"  },
  update:       { name: "Pencil",      color: "text-gray-500",   bg: "bg-gray-50"   },
  delete:       { name: "Trash2",      color: "text-red-500",    bg: "bg-red-50"    },
};

const EMPTY = {
  first_name:      "",
  last_name:       "",
  email:           "",
  phone:           "",
  title:           "",
  linkedin_url:    "",
  company_name:    "",
  company_website: "",
  company_size:    "",
  industry:        "",
  city:            "",
  country:         "Saudi Arabia",
  region:          "",
  product_interest:[],
  status:          "new",
  source:          "manual",
  notes:           "",
  lead_score:      0,
  creation_date:   "",
};

const selClass =
  "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary";

const fmtStageDate = (d) => {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const fmtHistoryTime = (iso) => {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
};

const truncate = (s, n = 60) =>
  s && s.length > n ? s.slice(0, n) + '…' : s;

const LeadDetailModal = ({
  lead,
  isOpen,
  onSave,
  onDelete,
  onClose,
  onConvert,
  users = [],
  initialTab = "person",
}) => {
  const [form,           setForm]           = useState(EMPTY);
  const [isSaving,       setIsSaving]       = useState(false);
  const [isDeleting,     setIsDeleting]     = useState(false);
  const [converting,     setConverting]     = useState(false);
  const [tab,            setTab]            = useState("person");
  const [error,          setError]          = useState("");
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);

  // History tab state
  const [history,        setHistory]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (lead) {
      setForm({
        first_name:       lead.first_name       || "",
        last_name:        lead.last_name        || "",
        email:            lead.email            || "",
        phone:            lead.phone            || "",
        title:            lead.title            || "",
        linkedin_url:     lead.linkedin_url     || "",
        company_name:     lead.company_name     || "",
        company_website:  lead.company_website  || "",
        company_size:     lead.company_size     || "",
        industry:         lead.industry         || "",
        city:             lead.city             || "",
        country:          lead.country          || "Saudi Arabia",
        region:           lead.region           || "",
        product_interest: lead.product_interest || [],
        status:           lead.status           || "new",
        source:           lead.source           || "manual",
        notes:            lead.notes            || "",
        lead_score:       lead.lead_score       || 0,
        creation_date:    lead.creation_date    || new Date().toISOString().split('T')[0],
      });
    } else {
      setForm({ ...EMPTY, creation_date: new Date().toISOString().split('T')[0] });
    }
    setTab(initialTab || "person");
    setError("");
    setConfirmDelete(false);
    setConfirmConvert(false);
    setHistory([]);
    setShowAllHistory(false);
  }, [lead, isOpen]);

  // Fetch history when history tab opens
  useEffect(() => {
    if (tab === "history" && lead?.id && history.length === 0) {
      setHistoryLoading(true);
      leadService.getLeadHistory(lead.id).then(({ data }) => {
        setHistory(data || []);
        setHistoryLoading(false);
      });
    }
  }, [tab, lead?.id]);

  if (!isOpen) return null;

  const isConverted = lead?.status === "converted";
  const isNew       = !lead?.id;

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleProduct = (p) => {
    set("product_interest",
      form.product_interest.includes(p)
        ? form.product_interest.filter((x) => x !== p)
        : [...form.product_interest, p]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.first_name.trim() && !form.last_name.trim()) {
      setError("At least one of first name or last name is required.");
      return;
    }
    if (!form.creation_date) {
      setError("Creation date is required.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = { ...form };
      if (lead?.id) payload.id = lead.id;
      await onSave(payload);
    } catch (err) {
      setError(err.message || "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setIsDeleting(true);
    try { await onDelete(lead.id); }
    finally { setIsDeleting(false); }
  };

  const handleConvert = async () => {
    if (!confirmConvert) { setConfirmConvert(true); return; }
    setConverting(true);
    try { await onConvert(lead.id); }
    finally { setConverting(false); }
  };

  const resolveUser = (uuid) => {
    if (!uuid || !users.length) return uuid;
    const found = users.find((u) => u.id === uuid);
    return found?.full_name || uuid;
  };

  const visibleTabs = isNew
    ? ["person", "company", "notes"]
    : ["person", "company", "notes", "timeline", "history"];

  const tabLabel = (t) => ({
    person:   "Person",
    company:  "Company",
    notes:    "Notes & Status",
    timeline: "Timeline",
    history:  "History",
  }[t] || t);

  // ── Stage timeline data ────────────────────────────────────────────────────
  const stageDates    = lead?.stage_dates || {};
  const creationDate  = lead?.creation_date || null;
  const currentStatus = lead?.status || "new";

  // ── History display ────────────────────────────────────────────────────────
  const displayedHistory = showAllHistory ? history : history.slice(0, 20);

  const renderOldNew = (row) => {
    const { field_name, old_value, new_value } = row;

    if (field_name === 'status') {
      const oc = STATUS_COLORS[old_value] || STATUS_COLORS.new;
      const nc = STATUS_COLORS[new_value] || STATUS_COLORS.new;
      return (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {old_value ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${oc.bg} ${oc.text}`}>
              {STATUS_LABELS[old_value] || old_value}
            </span>
          ) : (
            <span className="text-xs text-gray-400 italic">—</span>
          )}
          <Icon name="ArrowRight" size={11} className="text-gray-400" />
          {new_value ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${nc.bg} ${nc.text}`}>
              {STATUS_LABELS[new_value] || new_value}
            </span>
          ) : (
            <span className="text-xs text-gray-400 italic">—</span>
          )}
        </div>
      );
    }

    if (field_name === 'assigned_to') {
      const oldName = resolveUser(old_value) || old_value;
      const newName = resolveUser(new_value) || new_value;
      return (
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-600 flex-wrap">
          {old_value
            ? <span className="font-medium">{oldName}</span>
            : <span className="text-green-600">Added</span>}
          <Icon name="ArrowRight" size={11} className="text-gray-400" />
          {new_value
            ? <span className="font-medium">{newName}</span>
            : <span className="text-red-500">Removed</span>}
        </div>
      );
    }

    // Generic field
    if (!old_value && new_value) {
      return (
        <div className="flex items-center gap-1.5 mt-0.5 text-xs flex-wrap">
          <span className="text-green-600 font-medium">
            Added: {truncate(new_value)}
          </span>
        </div>
      );
    }
    if (old_value && !new_value) {
      return (
        <div className="flex items-center gap-1.5 mt-0.5 text-xs flex-wrap">
          <span className="text-red-500 line-through">{truncate(old_value)}</span>
          <span className="text-red-500 font-medium">Removed</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-600 flex-wrap">
        <span className="line-through text-gray-400">{truncate(old_value)}</span>
        <Icon name="ArrowRight" size={11} className="text-gray-400" />
        <span className="font-medium">{truncate(new_value)}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isNew ? "Add New Lead" : isConverted ? "Lead (Converted)" : "Edit Lead"}
            </h2>
            {lead?.company_name && (
              <p className="text-xs text-gray-500 mt-0.5">{lead.company_name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-md">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-gray-200 flex-shrink-0 px-6 overflow-x-auto">
          {visibleTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-4">

            {/* PERSON TAB */}
            {tab === "person" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
                    <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="John" disabled={isConverted} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
                    <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Smith" disabled={isConverted} />
                  </div>
                </div>

                {/* Creation Date — required field, directly below name */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Creation Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.creation_date}
                    onChange={(e) => set("creation_date", e.target.value)}
                    className={`${selClass} ${!form.creation_date ? "border-red-300 ring-1 ring-red-300" : ""}`}
                    disabled={isConverted}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                    <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="john@example.com" disabled={isConverted} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                    <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+966 5x xxx xxxx" disabled={isConverted} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Job Title</label>
                  <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Procurement Manager" disabled={isConverted} />
                </div>
                {form.linkedin_url ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">LinkedIn</label>
                    <div className="flex items-center gap-2">
                      <Input value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} disabled={isConverted} />
                      <a href={form.linkedin_url} target="_blank" rel="noopener noreferrer"
                        className="flex-shrink-0 text-blue-600 hover:text-blue-800">
                        <Icon name="ExternalLink" size={15} />
                      </a>
                    </div>
                  </div>
                ) : !isConverted ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">LinkedIn URL</label>
                    <Input value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />
                  </div>
                ) : null}
              </>
            )}

            {/* COMPANY TAB */}
            {tab === "company" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Company Name</label>
                    <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Acme Corp" disabled={isConverted} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Website</label>
                    <Input value={form.company_website} onChange={(e) => set("company_website", e.target.value)} placeholder="https://acme.com" disabled={isConverted} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Industry</label>
                    <Input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Construction" disabled={isConverted} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Company Size</label>
                    <Input value={form.company_size} onChange={(e) => set("company_size", e.target.value)} placeholder="e.g. 50-200" disabled={isConverted} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                    <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Riyadh" disabled={isConverted} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Region</label>
                    <select value={form.region} onChange={(e) => set("region", e.target.value)} className={selClass} disabled={isConverted}>
                      <option value="">— None —</option>
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>{REGION_LABELS[r]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Country</label>
                  <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Saudi Arabia" disabled={isConverted} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Product Interest</label>
                  <div className="flex gap-2 flex-wrap">
                    {PRODUCTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        disabled={isConverted}
                        onClick={() => toggleProduct(p)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          form.product_interest.includes(p)
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary"
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* NOTES & STATUS TAB */}
            {tab === "notes" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                    <select value={form.status} onChange={(e) => set("status", e.target.value)} className={selClass} disabled={isConverted}>
                      {STATUSES.filter(s => s !== "converted").map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Source</label>
                    <select value={form.source} onChange={(e) => set("source", e.target.value)} className={selClass} disabled={isConverted}>
                      {SOURCES.map((s) => (
                        <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Lead Score (0–100)</label>
                  <input
                    type="number"
                    min={0} max={100}
                    value={form.lead_score}
                    onChange={(e) => set("lead_score", parseInt(e.target.value) || 0)}
                    className={selClass}
                    disabled={isConverted}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    rows={5}
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    className={`${selClass} resize-none`}
                    placeholder="Add notes about this lead…"
                    disabled={isConverted}
                  />
                </div>
              </>
            )}

            {/* TIMELINE TAB */}
            {tab === "timeline" && !isNew && (
              <div className="space-y-4">
                {/* Creation date header */}
                <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-2">
                  <Icon name="CalendarDays" size={15} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Lead created:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {creationDate ? fmtStageDate(creationDate) : "—"}
                  </span>
                </div>

                {/* Stage timeline */}
                <div className="relative pl-6">
                  {/* Vertical line */}
                  <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gray-200" />

                  <div className="space-y-4">
                    {STAGE_ORDER.map((stage) => {
                      const entered = stageDates[stage];
                      const isCurrent = currentStatus === stage;
                      const sc = STATUS_COLORS[stage] || STATUS_COLORS.new;
                      return (
                        <div key={stage} className="relative flex items-start gap-3">
                          {/* Timeline dot */}
                          <div className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            entered
                              ? "border-green-500 bg-green-500"
                              : "border-gray-300 bg-white"
                          }`}>
                            {entered && <Icon name="Check" size={10} className="text-white" />}
                          </div>

                          {/* Content */}
                          <div className={`flex-1 flex items-center justify-between py-2 px-3 rounded-lg border ${
                            isCurrent
                              ? "border-primary/40 bg-primary/5 font-semibold"
                              : "border-transparent"
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                                {STATUS_LABELS[stage]}
                              </span>
                              {isCurrent && (
                                <span className="text-xs text-primary font-medium">← current</span>
                              )}
                            </div>
                            <span className={`text-xs ${entered ? "text-green-700 font-medium" : "text-gray-400"}`}>
                              {entered ? fmtStageDate(entered) : "—"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* HISTORY TAB */}
            {tab === "history" && !isNew && (
              <div>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Icon name="Loader2" size={24} className="text-gray-300 animate-spin" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Icon name="Clock" size={32} className="text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">No changes recorded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {displayedHistory.map((row, idx) => {
                      const hi = HISTORY_ICONS[row.change_type] || HISTORY_ICONS.update;
                      return (
                        <div key={row.id} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                          {/* Icon */}
                          <div className={`mt-0.5 w-7 h-7 rounded-full ${hi.bg} flex items-center justify-center flex-shrink-0`}>
                            <Icon name={hi.name} size={13} className={hi.color} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-gray-800">
                                {row.label}
                              </span>
                              <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                                {fmtHistoryTime(row.changed_at)}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              by {row.changed_by_name}
                            </p>
                            {renderOldNew(row)}
                          </div>
                        </div>
                      );
                    })}

                    {/* Load more */}
                    {!showAllHistory && history.length > 20 && (
                      <button
                        type="button"
                        onClick={() => setShowAllHistory(true)}
                        className="w-full mt-2 py-2 text-xs text-primary hover:underline flex items-center justify-center gap-1"
                      >
                        <Icon name="ChevronDown" size={13} />
                        Show all {history.length} entries
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <Icon name="AlertCircle" size={12} />{error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2 flex-shrink-0">
            {/* Left: Delete */}
            <div className="flex items-center gap-2">
              {!isNew && !isConverted && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className={`gap-1.5 ${confirmDelete ? "text-red-600 bg-red-50" : "text-gray-500"}`}
                >
                  {isDeleting
                    ? <Icon name="Loader2" size={13} className="animate-spin" />
                    : <Icon name="Trash2" size={13} />}
                  {confirmDelete ? "Confirm delete?" : "Delete"}
                </Button>
              )}
              {confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Right: Convert + Save */}
            <div className="flex items-center gap-2">
              {!isNew && !isConverted && (
                <>
                  {confirmConvert ? (
                    <>
                      <span className="text-xs text-gray-500">Move to Contacts?</span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleConvert}
                        disabled={converting}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                      >
                        {converting
                          ? <Icon name="Loader2" size={13} className="animate-spin" />
                          : <Icon name="UserCheck" size={13} />}
                        Yes, Convert
                      </Button>
                      <button
                        type="button"
                        onClick={() => setConfirmConvert(false)}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleConvert}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                    >
                      <Icon name="UserCheck" size={13} />
                      Convert to Contact
                    </Button>
                  )}
                </>
              )}
              {isConverted && (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <Icon name="CheckCircle2" size={13} />
                  Converted to contact
                </span>
              )}
              <Button variant="outline" type="button" onClick={onClose} size="sm">
                {isConverted ? "Close" : "Cancel"}
              </Button>
              {!isConverted && tab !== "timeline" && tab !== "history" && (
                <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5">
                  {isSaving
                    ? <><Icon name="Loader2" size={13} className="animate-spin" />Saving…</>
                    : <><Icon name="Check" size={13} />{isNew ? "Add Lead" : "Save"}</>}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeadDetailModal;
