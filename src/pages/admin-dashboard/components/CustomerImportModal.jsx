import React, { useState, useRef } from "react";
import Icon from "components/AppIcon";
import { supabase } from "../../../lib/supabase";
import {
  parseCustomerFile,
  validateCustomerRows,
} from "../../../utils/importExportUtils";

const CustomerImportModal = ({ isOpen, onClose, onSuccess, adminCompany }) => {
  const [step, setStep]               = useState("upload");
  const [file, setFile]               = useState(null);
  const [rows, setRows]               = useState([]);
  const [validRows, setValidRows]     = useState([]);
  const [errors, setErrors]           = useState([]);
  const [warnings, setWarnings]       = useState([]);
  const [parseError, setParseError]   = useState("");
  const [importing, setImporting]     = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult]     = useState(null);
  const [dragOver, setDragOver]       = useState(false);
  const fileRef = useRef(null);

  if (!isOpen) return null;

  function reset() {
    setStep("upload");
    setFile(null);
    setRows([]);
    setValidRows([]);
    setErrors([]);
    setWarnings([]);
    setParseError("");
    setImporting(false);
    setImportProgress(0);
    setImportResult(null);
  }

  async function processFile(f) {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      setParseError("Please upload an .xlsx, .xls, or .csv file.");
      return;
    }
    setFile(f);
    setParseError("");
    try {
      const parsed = await parseCustomerFile(f);
      if (parsed.length === 0) {
        setParseError("File is empty or has no data rows.");
        return;
      }

      const { valid, errors: errs, warnings: warns } = validateCustomerRows(parsed);

      setRows(parsed);
      setValidRows(valid);
      setErrors(errs);
      setWarnings(warns);
      setStep("preview");
    } catch (err) {
      setParseError(err.message);
    }
  }

  async function handleImport() {
    setImporting(true);
    setStep("importing");

    // Resolve salesman emails → user IDs
    const { data: salesmen } = await supabase
      .from("users")
      .select("id, email")
      .eq("company_id", adminCompany.id)
      .eq("is_active", true);

    const emailToId = {};
    (salesmen || []).forEach(s => {
      if (s.email) emailToId[s.email.toLowerCase()] = s.id;
    });

    let imported = 0;
    let skipped  = 0;
    const chunkSize = 50;

    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);
      setImportProgress(Math.round((i / validRows.length) * 100));

      const insertData = chunk.map(row => ({
        company_id:      adminCompany.id,
        company_name:    row.company_name,
        first_name:      row.first_name      || null,
        last_name:       row.last_name       || null,
        email:           row.email           || null,
        phone:           row.phone           || null,
        mobile:          row.mobile          || null,
        city:            row.city            || null,
        region:          row.region          || null,
        country:         row.country         || "Saudi Arabia",
        notes:           row.notes           || null,
        customer_type:   row.customer_type   || "active",
        last_order_date: row.last_order_date || null,
        status:          "active",
        source:          "import",
        owner_id:        row.owner_email
          ? (emailToId[row.owner_email] || null)
          : null,
      }));

      const { data, error } = await supabase
        .from("contacts")
        .upsert(insertData, { onConflict: "company_id,company_name", ignoreDuplicates: false })
        .select("id");

      if (!error) {
        imported += data?.length || 0;
      } else {
        console.error("Import chunk error:", error);
        skipped += chunk.length;
      }
    }

    setImportProgress(100);
    setImportResult({ imported, skipped });
    setStep("done");
    setImporting(false);
    onSuccess?.();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 dark:bg-blue-950/40 rounded-lg flex items-center justify-center">
              <Icon name="Users" size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Import Customers</h3>
              <p className="text-xs text-muted-foreground">{adminCompany?.name}</p>
            </div>
          </div>
          {step !== "importing" && (
            <button onClick={() => { reset(); onClose(); }} className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground">
              <Icon name="X" size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">

          {/* ── Step: upload ─────────────────────────── */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Uploading customers for{" "}
                <span className="font-semibold text-foreground">{adminCompany?.name}</span>.
                Use the Download Template button to get the correct format.
              </p>

              {parseError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <Icon name="AlertCircle" size={16} className="text-red-500 shrink-0" />
                  {parseError}
                </div>
              )}

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) processFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
                    : "border-border hover:border-blue-300 hover:bg-accent"
                }`}
              >
                <Icon name="FileUp" size={36} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">
                  Drag & drop your file here, or{" "}
                  <span className="text-blue-600">click to browse</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Accepts .xlsx, .xls, .csv</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => processFile(e.target.files[0])}
                />
              </div>
            </div>
          )}

          {/* ── Step: preview ────────────────────────── */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
                  <Icon name="CheckCircle" size={20} className="mx-auto text-emerald-600 mb-1" />
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{validRows.length}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500">Ready to import</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
                  <Icon name="AlertTriangle" size={20} className="mx-auto text-amber-600 mb-1" />
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{warnings.length}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-500">Warnings</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
                  <Icon name="XCircle" size={20} className="mx-auto text-red-500 mb-1" />
                  <p className="text-xl font-bold text-red-600">{errors.length}</p>
                  <p className="text-xs text-red-500">Errors (will be skipped)</p>
                </div>
              </div>

              {errors.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-red-600 mb-2">Rows with errors (will be skipped):</p>
                  <div className="rounded-xl border border-red-200 overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50 dark:bg-red-950/20">
                        <tr>
                          <th className="px-3 py-2 text-left text-red-700">Row</th>
                          <th className="px-3 py-2 text-left text-red-700">Issue</th>
                          <th className="px-3 py-2 text-left text-red-700">Company Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {errors.map((e, i) => (
                          <tr key={i} className="bg-red-50/50 dark:bg-red-950/10">
                            <td className="px-3 py-1.5 font-medium text-red-700">{e.row}</td>
                            <td className="px-3 py-1.5 text-red-600">{e.messages.join("; ")}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{e.data?.company_name || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-amber-600 mb-2">Warnings:</p>
                  <div className="rounded-xl border border-amber-200 overflow-hidden max-h-32 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-50 dark:bg-amber-950/20">
                        <tr>
                          <th className="px-3 py-2 text-left text-amber-700">Row</th>
                          <th className="px-3 py-2 text-left text-amber-700">Warning</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {warnings.map((w, i) => (
                          <tr key={i} className="bg-amber-50/50 dark:bg-amber-950/10">
                            <td className="px-3 py-1.5 font-medium text-amber-700">{w.row}</td>
                            <td className="px-3 py-1.5 text-amber-600">{w.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {validRows.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    Preview (first {Math.min(10, validRows.length)} of {validRows.length} valid rows):
                  </p>
                  <div className="rounded-xl border border-border overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Company Name</th>
                          <th className="px-3 py-2 text-left">Contact</th>
                          <th className="px-3 py-2 text-left">Email</th>
                          <th className="px-3 py-2 text-left">City</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {validRows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="hover:bg-accent">
                            <td className="px-3 py-1.5 font-medium">{r.company_name}</td>
                            <td className="px-3 py-1.5">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.email || "—"}</td>
                            <td className="px-3 py-1.5">{r.city || "—"}</td>
                            <td className="px-3 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step: importing ──────────────────────── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Icon name="Loader2" size={40} className="animate-spin text-primary" />
              <p className="text-sm font-medium">Importing customers for {adminCompany?.name}…</p>
              <div className="w-full max-w-xs bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{importProgress}%</p>
            </div>
          )}

          {/* ── Step: done ───────────────────────────── */}
          {step === "done" && importResult && (
            <div className="flex flex-col items-center py-10 gap-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <Icon name="CheckCircle2" size={36} className="text-emerald-600" />
              </div>
              <h4 className="text-lg font-semibold">Import Complete</h4>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-3xl font-bold text-emerald-600">{importResult.imported}</p>
                  <p className="text-xs text-muted-foreground mt-1">Customers imported</p>
                </div>
                {importResult.skipped > 0 && (
                  <div>
                    <p className="text-3xl font-bold text-red-500">{importResult.skipped}</p>
                    <p className="text-xs text-muted-foreground mt-1">Skipped (errors)</p>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Company: <span className="font-medium text-foreground">{adminCompany?.name}</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between shrink-0">
          {step === "upload" && (
            <>
              <p className="text-xs text-muted-foreground">Max 10,000 rows per import</p>
              <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors">
                Cancel
              </button>
            </>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => setStep("upload")} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-2">
                <Icon name="ArrowLeft" size={14} />
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                <Icon name="Upload" size={14} />
                Import {validRows.length} valid row{validRows.length !== 1 ? "s" : ""}
              </button>
            </>
          )}
          {step === "done" && (
            <div className="flex justify-end w-full">
              <button
                onClick={() => { reset(); onClose(); }}
                className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerImportModal;
