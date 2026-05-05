import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";

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
const SOURCES    = ["apollo","manual","import","referral"];
const SOURCE_LABELS = { apollo:"Apollo", manual:"Manual", import:"Import", referral:"Referral" };

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
};

const selClass =
  "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary";

const LeadDetailModal = ({ lead, isOpen, onSave, onDelete, onClose, onConvert }) => {
  const [form,     setForm]     = useState(EMPTY);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [tab,      setTab]      = useState("person");
  const [error,    setError]    = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);

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
      });
    } else {
      setForm(EMPTY);
    }
    setTab("person");
    setError("");
    setConfirmDelete(false);
    setConfirmConvert(false);
  }, [lead, isOpen]);

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
        <div className="flex gap-0 border-b border-gray-200 flex-shrink-0 px-6">
          {["person","company","notes"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "person" ? "Person" : t === "company" ? "Company" : "Notes & Status"}
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
                {form.linkedin_url && (
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
                )}
                {!form.linkedin_url && !isConverted && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">LinkedIn URL</label>
                    <Input value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />
                  </div>
                )}
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
              {!isConverted && (
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
