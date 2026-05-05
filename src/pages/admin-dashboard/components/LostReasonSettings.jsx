import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Input from "components/ui/Input";
import { adminService } from "../../../services/supabaseService";
import { useAuth } from "contexts/AuthContext";

const CATEGORY_OPTIONS = ["Price", "Competition", "Product", "Customer", "Commercial", "Internal"];

const LostReasonSettings = () => {
  const { company } = useAuth();
  const [reasons,    setReasons]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(null); // id being toggled
  const [seeding,    setSeeding]    = useState(false);
  const [seedMsg,    setSeedMsg]    = useState(null);
  const [dbError,    setDbError]    = useState(false);
  const [showAddForm,setShowAddForm]= useState(false);
  const [addForm,    setAddForm]    = useState({ label: "", category: "Price", code: "" });
  const [addSaving,  setAddSaving]  = useState(false);
  const [addError,   setAddError]   = useState("");

  const loadReasons = async () => {
    if (!company?.id) return;
    setLoading(true);
    setDbError(false);
    const { data, error } = await adminService.getAllLostReasons(company.id);
    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        setDbError(true);
      }
      setReasons([]);
    } else {
      setReasons(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadReasons(); }, [company?.id]);

  const handleToggle = async (id, current) => {
    setSaving(id);
    await adminService.toggleLostReason(id, !current);
    setSaving(null);
    loadReasons();
  };

  const handleSeed = async () => {
    if (!company?.id) return;
    setSeeding(true);
    setSeedMsg(null);
    const { data, error } = await adminService.seedLostReasons(company.id);
    setSeeding(false);
    if (error) {
      setSeedMsg({ ok: false, text: "Seed failed: " + error.message });
    } else {
      setSeedMsg({ ok: true, text: `${data?.length || 0} reason(s) seeded.` });
      loadReasons();
    }
    setTimeout(() => setSeedMsg(null), 4000);
  };

  const handleAdd = async () => {
    setAddError("");
    const label    = addForm.label.trim();
    const code     = addForm.code.trim().toUpperCase().replace(/\s+/g, "_") || label.toUpperCase().replace(/\s+/g, "_").slice(0, 20);
    const category = addForm.category;

    if (!label)    { setAddError("Label is required."); return; }
    if (!category) { setAddError("Category is required."); return; }

    setAddSaving(true);
    const { error } = await adminService.createLostReason(company.id, { code, label, category });
    setAddSaving(false);
    if (error) {
      setAddError(error.message?.includes("duplicate") ? "A reason with this code already exists." : error.message);
    } else {
      setAddForm({ label: "", category: "Price", code: "" });
      setShowAddForm(false);
      loadReasons();
    }
  };

  // Group by category for display
  const grouped = reasons.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});
  const categoryKeys = [...new Set([...CATEGORY_OPTIONS, ...Object.keys(grouped)])].filter((c) => grouped[c]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* DB setup banner */}
      {dbError && (
        <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="AlertTriangle" size={16} />
            Migration required
          </div>
          <p className="text-sm">
            The <code>lost_reason_options</code> table does not exist yet.
            Run <strong>migrations/add_lost_reason_options.sql</strong> in your Supabase SQL editor first, then click
            "Seed Defaults".
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Lost Reason Settings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control which reasons salesmen see when marking a deal lost.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {seedMsg && (
            <span className={`text-xs font-medium ${seedMsg.ok ? "text-emerald-600" : "text-destructive"}`}>
              {seedMsg.text}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding} className="gap-2">
            {seeding
              ? <><Icon name="Loader2" size={13} className="animate-spin" /> Seeding…</>
              : <><Icon name="RefreshCw" size={13} /> Seed Defaults</>}
          </Button>
          <Button size="sm" onClick={() => setShowAddForm((v) => !v)} className="gap-2">
            <Icon name={showAddForm ? "X" : "Plus"} size={13} />
            {showAddForm ? "Cancel" : "Add Reason"}
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">New Lost Reason</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Category</label>
              <select
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={addForm.category}
                onChange={(e) => setAddForm((p) => ({ ...p, category: e.target.value }))}
              >
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Label <span className="text-destructive">*</span></label>
              <Input
                placeholder="e.g. Payment terms issue"
                value={addForm.label}
                onChange={(e) => setAddForm((p) => ({ ...p, label: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Code <span className="text-muted-foreground font-normal">(auto if blank)</span>
              </label>
              <Input
                placeholder="e.g. PAYMENT_TERMS"
                value={addForm.code}
                onChange={(e) => setAddForm((p) => ({ ...p, code: e.target.value }))}
              />
            </div>
          </div>
          {addError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <Icon name="AlertCircle" size={11} />{addError}
            </p>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={handleAdd} disabled={addSaving} className="gap-2">
              {addSaving
                ? <><Icon name="Loader2" size={13} className="animate-spin" /> Saving…</>
                : <><Icon name="Plus" size={13} /> Add</>}
            </Button>
          </div>
        </div>
      )}

      {/* Reasons table */}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Icon name="Loader2" size={18} className="animate-spin" />
          Loading…
        </div>
      ) : reasons.length === 0 && !dbError ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Icon name="XCircle" size={40} className="text-muted-foreground opacity-30 mb-3" />
          <p className="font-medium text-card-foreground">No reasons yet</p>
          <p className="text-sm text-muted-foreground mt-1">Click "Seed Defaults" to load the standard set.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categoryKeys.map((cat) => (
            <div key={cat} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {grouped[cat].map((r) => (
                    <tr key={r.id} className={`${r.is_active ? "" : "opacity-50"}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{r.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono">{r.code}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggle(r.id, r.is_active)}
                          disabled={saving === r.id}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                            r.is_active ? "bg-primary" : "bg-gray-300"
                          } ${saving === r.id ? "opacity-50" : ""}`}
                          title={r.is_active ? "Deactivate" : "Activate"}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                              r.is_active ? "translate-x-[18px]" : "translate-x-[2px]"
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LostReasonSettings;
