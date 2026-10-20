import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import Icon from "components/AppIcon";
import { supabase } from "../../../lib/supabase";
import {
  PRODUCT_FIELDS,
  autoMapColumns,
  buildImportPlan,
  buildSkippedRowsWorkbook,
  executeImportPlan,
  fieldLabel,
  formatFieldValue,
  loadImportContext,
  readProductFile,
} from "../../../utils/productImport";

// The one Product Master upload: CSV or Excel, any columns. Steps:
// upload → map (file column → field) → preview (dry run, nothing written) →
// importing → done (same summary, plus the skipped rows as a file).

const LIST_LIMIT = 300;

const Tile = ({ tone, icon, value, label }) => {
  const tones = {
    green: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400",
    blue:  "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400",
    gray:  "bg-muted/50 border-border text-muted-foreground",
    amber: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400",
    red:   "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400",
  };
  return (
    <div className={`border rounded-xl p-3 text-center ${tones[tone]}`}>
      <Icon name={icon} size={18} className="mx-auto mb-1" />
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
};

const More = ({ total }) =>
  total > LIST_LIMIT ? (
    <p className="text-xs text-muted-foreground mt-1">…and {total - LIST_LIMIT} more</p>
  ) : null;

const ProductImportModal = ({ isOpen, onClose, onSuccess, adminCompany }) => {
  const [step, setStep]         = useState("upload");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet]       = useState(null);   // { headers, rows }
  const [mapping, setMapping]   = useState([]);
  const [plan, setPlan]         = useState(null);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  if (!isOpen) return null;

  function reset() {
    setStep("upload");
    setFileName("");
    setSheet(null);
    setMapping([]);
    setPlan(null);
    setResult(null);
    setError("");
    setBusy(false);
    setProgress(0);
  }

  function close() {
    reset();
    onClose();
  }

  async function processFile(f) {
    if (!f) return;
    setError("");
    try {
      const parsed = await readProductFile(f);
      if (!parsed.headers.length || !parsed.rows.some((r) => r.cells.some(Boolean))) {
        setError("The file has no data rows.");
        return;
      }
      setFileName(f.name);
      setSheet(parsed);
      setMapping(autoMapColumns(parsed.headers));
      setStep("map");
    } catch (err) {
      setError(err.message);
    }
  }

  // One field per column: picking a field already used moves it here.
  function setColumnField(i, key) {
    setMapping((m) => m.map((k, j) => (j === i ? key || null : key && k === key ? null : k)));
  }

  async function runDryRun() {
    setBusy(true);
    setError("");
    try {
      const ctx = await loadImportContext(supabase, adminCompany.id);
      setPlan(buildImportPlan({
        rows: sheet.rows,
        mapping,
        existingProducts: ctx.products,
        existingGroups: ctx.groups,
        availableColumns: ctx.availableColumns,
      }));
      setStep("preview");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setStep("importing");
    setProgress(0);
    const res = await executeImportPlan(plan, {
      client: supabase,
      companyId: adminCompany.id,
      onProgress: setProgress,
    });
    setResult(res);
    setStep("done");
    onSuccess?.();
  }

  function downloadSkipped() {
    const { wb } = buildSkippedRowsWorkbook(sheet.headers, plan, result);
    const base = fileName.replace(/\.[^.]+$/, "") || "products";
    XLSX.writeFile(wb, `${base}_skipped_rows.xlsx`);
  }

  const mappedCount = mapping.filter(Boolean).length;
  const hasIdentifier = mapping.includes("material") || mapping.includes("description");
  const skippedTotal = plan ? plan.skipped.length + (result?.failed.length || 0) : 0;
  const hasSkippedFile = plan && (skippedTotal > 0 || plan.fieldIssues.length > 0);
  const writable = plan ? plan.creates.length + plan.updates.length : 0;

  const sampleFor = (i) => sheet?.rows.find((r) => r.cells[i])?.cells[i] || "";

  // ── Summary shared by the dry run and the result ─────────────────────────────
  function Summary({ done }) {
    const created = done ? result.created.length : plan.creates.length;
    const updated = done ? result.updated.length : plan.updates.length;
    return (
      <div className="space-y-4">
        <div className={`grid grid-cols-2 ${done ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-3`}>
          <Tile tone="green" icon="PlusCircle" value={created} label={done ? "Created" : "Will create"} />
          <Tile tone="blue" icon="RefreshCw" value={updated} label={done ? "Updated" : "Will update"} />
          <Tile tone="gray" icon="Minus" value={plan.unchanged.length} label="Already up to date" />
          <Tile tone="amber" icon="SkipForward" value={plan.skipped.length} label="Skipped" />
          {done && <Tile tone="red" icon="XCircle" value={result.failed.length} label="Failed" />}
        </div>

        {done && result.failed.length > 0 && (
          <section>
            <p className="text-sm font-medium text-red-600 mb-2">Failed to save ({result.failed.length}) — nothing in these rows was written:</p>
            <div className="rounded-xl border border-red-200 overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-xs min-w-[480px]">
                <thead className="bg-red-50 dark:bg-red-950/20 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-red-700">Row</th>
                    <th className="px-3 py-2 text-left text-red-700">Code</th>
                    <th className="px-3 py-2 text-left text-red-700">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {result.failed.slice(0, LIST_LIMIT).map((f, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-medium">{f.rowNum}</td>
                      <td className="px-3 py-1.5 font-mono">{f.material || "—"}</td>
                      <td className="px-3 py-1.5 text-red-600">{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <More total={result.failed.length} />
          </section>
        )}

        {done && result.groupErrors.length > 0 && (
          <p className="text-sm text-amber-700">
            New groups could not be added to the group list ({result.groupErrors.join("; ")}). The products still carry the group name.
          </p>
        )}

        {plan.updates.length > 0 && (
          <section>
            <p className="text-sm font-medium mb-2">{done ? "Updated" : "Will update"} — only these fields change:</p>
            <div className="rounded-xl border border-border overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-xs min-w-[520px]">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {plan.updates.slice(0, LIST_LIMIT).map((u) => (
                    <tr key={u.rowNum} className="align-top">
                      <td className="px-3 py-1.5 font-medium">{u.rowNum}</td>
                      <td className="px-3 py-1.5 font-mono whitespace-nowrap">{u.material}</td>
                      <td className="px-3 py-1.5">
                        {u.changes.map((c) => (
                          <div key={c.field}>
                            <span className="text-muted-foreground">{fieldLabel(c.field)}:</span>{" "}
                            {formatFieldValue(c.field, c.from)} → <span className="font-medium">{formatFieldValue(c.field, c.to)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <More total={plan.updates.length} />
          </section>
        )}

        {plan.creates.length > 0 && (
          <section>
            <p className="text-sm font-medium mb-2">{done ? "Created" : "Will create"}:</p>
            <div className="rounded-xl border border-border overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left">Group</th>
                    <th className="px-3 py-2 text-left">UoM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {plan.creates.slice(0, LIST_LIMIT).map((c) => (
                    <tr key={c.rowNum}>
                      <td className="px-3 py-1.5 font-medium">{c.rowNum}</td>
                      <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                        {c.record.material}
                        {c.auto && <span className="ml-1 text-[10px] text-amber-700 bg-amber-100 rounded px-1">auto</span>}
                      </td>
                      <td className="px-3 py-1.5 max-w-[220px] truncate">{c.record.description || "—"}</td>
                      <td className="px-3 py-1.5">{c.record.material_group || "—"}</td>
                      <td className="px-3 py-1.5">{c.record.base_unit_of_measure}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <More total={plan.creates.length} />
          </section>
        )}

        {plan.skipped.length > 0 && (
          <section>
            <p className="text-sm font-medium text-amber-700 mb-2">Skipped — nothing written for these rows:</p>
            <div className="rounded-xl border border-amber-200 overflow-x-auto max-h-40 overflow-y-auto">
              <table className="w-full text-xs min-w-[420px]">
                <thead className="bg-amber-50 dark:bg-amber-950/20 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-amber-700">Row</th>
                    <th className="px-3 py-2 text-left text-amber-700">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {plan.skipped.slice(0, LIST_LIMIT).map((s) => (
                    <tr key={s.rowNum}>
                      <td className="px-3 py-1.5 font-medium">{s.rowNum}</td>
                      <td className="px-3 py-1.5">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <More total={plan.skipped.length} />
          </section>
        )}

        {plan.fieldIssues.length > 0 && (
          <section>
            <p className="text-sm font-medium text-amber-700 mb-2">
              Values not imported — the rest of each row is imported:
            </p>
            <div className="rounded-xl border border-amber-200 overflow-x-auto max-h-40 overflow-y-auto">
              <table className="w-full text-xs min-w-[420px]">
                <thead className="bg-amber-50 dark:bg-amber-950/20 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-amber-700">Row</th>
                    <th className="px-3 py-2 text-left text-amber-700">Column</th>
                    <th className="px-3 py-2 text-left text-amber-700">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {plan.fieldIssues.slice(0, LIST_LIMIT).map((f, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-medium">{f.rowNum}</td>
                      <td className="px-3 py-1.5">{fieldLabel(f.field)}</td>
                      <td className="px-3 py-1.5">{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <More total={plan.fieldIssues.length} />
          </section>
        )}

        {plan.newGroups.length > 0 && (
          <section>
            <p className="text-sm font-medium mb-2">New groups{done ? " added" : ""}:</p>
            <div className="flex flex-wrap gap-2">
              {plan.newGroups.map((g) => (
                <span key={g} className="text-xs px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">{g}</span>
              ))}
            </div>
          </section>
        )}

        {plan.warnings.length > 0 && (
          <section>
            <p className="text-sm font-medium text-amber-700 mb-1">Warnings:</p>
            <ul className="text-xs text-amber-700 space-y-0.5 max-h-32 overflow-y-auto list-disc pl-5">
              {plan.warnings.slice(0, LIST_LIMIT).map((w, i) => <li key={i}>{w.message}</li>)}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 dark:bg-blue-950/40 rounded-lg flex items-center justify-center">
              <Icon name="Upload" size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Import Products</h3>
              <p className="text-xs text-muted-foreground">
                {adminCompany?.name}{fileName ? ` · ${fileName}` : ""}
              </p>
            </div>
          </div>
          {step !== "importing" && (
            <button onClick={close} className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground">
              <Icon name="X" size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <Icon name="AlertCircle" size={16} className="text-red-500 shrink-0" />
              {error}
            </div>
          )}

          {/* ── Step: upload ────────────────────────────────────── */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Products for <span className="font-semibold text-foreground">{adminCompany?.name}</span>.
                Any columns are accepted. Blank cells never clear existing values, and you see
                exactly what will change before anything is saved.
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  processFile(e.dataTransfer.files[0]);
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
                  Drag & drop your file here, or <span className="text-blue-600">click to browse</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Excel (.xlsx, .xls) or CSV</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => { processFile(e.target.files[0]); e.target.value = ""; }}
                />
              </div>
            </div>
          )}

          {/* ── Step: map columns ───────────────────────────────── */}
          {step === "map" && sheet && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {sheet.rows.length} row{sheet.rows.length !== 1 ? "s" : ""} found. Check what each column
                is imported as. Columns that were not recognised are ignored unless you choose a field.
              </p>
              <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Column in file</th>
                      <th className="px-3 py-2 text-left">Example</th>
                      <th className="px-3 py-2 text-left">Import as</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sheet.headers.map((h, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium">{h}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[220px] truncate">{sampleFor(i) || "—"}</td>
                        <td className="px-3 py-2">
                          <select
                            value={mapping[i] || ""}
                            onChange={(e) => setColumnField(i, e.target.value)}
                            className={`w-full px-2 py-1.5 border rounded-md bg-background text-sm ${mapping[i] ? "border-blue-300" : "border-input text-muted-foreground"}`}
                          >
                            <option value="">Ignore</option>
                            {PRODUCT_FIELDS.map((f) => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappedCount > 0 && !hasIdentifier && (
                <p className="text-sm text-amber-700">
                  No column is imported as Code or Description, so no row can be matched to a product and every row will be skipped.
                </p>
              )}
            </div>
          )}

          {/* ── Step: preview (dry run) ─────────────────────────── */}
          {step === "preview" && plan && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-300">
                <Icon name="Info" size={16} className="shrink-0" />
                Dry run — nothing has been saved yet. Press Import to apply.
              </div>
              <Summary done={false} />
            </div>
          )}

          {/* ── Step: importing ─────────────────────────────────── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Icon name="Loader2" size={40} className="animate-spin text-primary" />
              <p className="text-sm font-medium">Importing products for {adminCompany?.name}…</p>
              <div className="w-full max-w-xs bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{progress}%</p>
            </div>
          )}

          {/* ── Step: done ──────────────────────────────────────── */}
          {step === "done" && result && (
            <div className="space-y-4">
              <h4 className="text-lg font-semibold flex items-center gap-2">
                <Icon
                  name={result.failed.length ? "AlertTriangle" : "CheckCircle2"}
                  size={22}
                  className={result.failed.length ? "text-amber-600" : "text-emerald-600"}
                />
                {result.failed.length ? "Import finished with errors" : "Import complete"}
              </h4>
              <Summary done />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 shrink-0">
          {step === "upload" && (
            <>
              <p className="text-xs text-muted-foreground">Nothing is saved until you press Import.</p>
              <button onClick={close} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors">
                Cancel
              </button>
            </>
          )}
          {step === "map" && (
            <>
              <button onClick={reset} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-2">
                <Icon name="ArrowLeft" size={14} />
                Choose another file
              </button>
              <button
                onClick={runDryRun}
                disabled={busy || mappedCount === 0}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                <Icon name={busy ? "Loader2" : "Search"} size={14} className={busy ? "animate-spin" : ""} />
                Check file
              </button>
            </>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => setStep("map")} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-2">
                <Icon name="ArrowLeft" size={14} />
                Back to columns
              </button>
              <div className="flex items-center gap-2">
                {hasSkippedFile && (
                  <button onClick={downloadSkipped} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-2">
                    <Icon name="Download" size={14} />
                    Skipped rows
                  </button>
                )}
                <button
                  onClick={runImport}
                  disabled={writable === 0}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
                >
                  <Icon name="Upload" size={14} />
                  Import
                </button>
              </div>
            </>
          )}
          {step === "done" && (
            <>
              <div>
                {hasSkippedFile && (
                  <button onClick={downloadSkipped} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-2">
                    <Icon name="Download" size={14} />
                    Download skipped rows
                  </button>
                )}
              </div>
              <button onClick={close} className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductImportModal;
