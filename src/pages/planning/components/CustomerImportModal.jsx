import React, { useState, useRef, useCallback } from 'react';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import { parseCustomerFile, validateCustomerRows } from 'utils/importExportUtils';

export default function CustomerImportModal({ isOpen, onClose, onSuccess, adminCompany }) {
  const { user } = useAuth();

  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [validRows, setValidRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState({ imported: 0, unassigned: 0, skipped: 0 });
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setRows([]);
    setValidRows([]);
    setErrors([]);
    setWarnings([]);
    setParseError(null);
    setImporting(false);
    setImportProgress(0);
    setImportResult({ imported: 0, unassigned: 0, skipped: 0 });
    setDragOver(false);
  }, []);

  const processFile = useCallback(async (f) => {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      setParseError('Only .xlsx and .xls files are accepted.');
      return;
    }
    setParseError(null);
    setFile(f);
    try {
      const parsed = await parseCustomerFile(f);
      const { valid, errors: errs, warnings: warns } = validateCustomerRows(parsed);
      setRows(parsed);
      setValidRows(valid);
      setErrors(errs);
      setWarnings(warns);
      setStep('preview');
    } catch (err) {
      setParseError(err?.message || 'Failed to parse file. Please check the format.');
    }
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = '';
  };

  const handleImport = async () => {
    setStep('importing');
    setImporting(true);
    setImportProgress(0);

    let imported = 0;
    let unassigned = 0;
    let skipped = 0;

    try {
      const { data: salesmen } = await supabase
        .from('users')
        .select('id,email')
        .eq('company_id', adminCompany.id)
        .eq('is_active', true);

      const emailToId = {};
      (salesmen || []).forEach((s) => {
        if (s.email) emailToId[s.email.toLowerCase()] = s.id;
      });

      const chunkSize = 50;
      const total = validRows.length;

      for (let i = 0; i < total; i += chunkSize) {
        const chunk = validRows.slice(i, i + chunkSize);
        const insertData = chunk.map((row) => {
          const ownerId = (row.owner_email && emailToId[row.owner_email.toLowerCase()]) || null;
          if (!ownerId) unassigned++;
          return {
            company_id: adminCompany.id,
            company_name: row.company_name,
            first_name: row.first_name || null,
            last_name: row.last_name || null,
            phone: row.phone || null,
            mobile: row.mobile || null,
            email: row.email || null,
            city: row.city || null,
            region: row.region || null,
            country: row.country || 'Saudi Arabia',
            customer_type: row.customer_type || 'active',
            last_order_date: row.last_order_date || null,
            notes: row.notes || null,
            owner_id: ownerId,
            assigned_by: ownerId ? user.id : null,
            assigned_at: ownerId ? new Date().toISOString() : null,
            source: 'import',
            status: 'active',
            updated_at: new Date().toISOString(),
          };
        });

        const { data, error } = await supabase
          .from('contacts')
          .upsert(insertData, { onConflict: 'company_id,company_name', ignoreDuplicates: false });

        if (error) {
          skipped += chunk.length;
        } else {
          imported += data?.length || chunk.length;
        }

        setImportProgress(Math.round(((i + chunk.length) / total) * 100));
      }
    } catch (err) {
      skipped += validRows.length - imported;
    }

    setImportResult({ imported, unassigned, skipped });
    setImporting(false);
    setStep('done');
    onSuccess?.();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card text-card-foreground rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Import Customers</h2>
            {adminCompany && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {adminCompany.name}
              </p>
            )}
          </div>
          {step !== 'importing' && (
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              <Icon name="X" size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">

          {/* STEP: upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Uploading customers for <strong>{adminCompany?.name}</strong>
              </p>

              {parseError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                  <Icon name="AlertCircle" size={16} className="mt-0.5 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent/30'
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <Icon name="Upload" size={28} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {dragOver ? 'Drop your file here' : 'Drag & drop your Excel file'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      or <span className="text-primary underline">click to browse</span>
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">Accepts .xlsx and .xls</p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />

              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-accent/40 rounded-lg px-4 py-2">
                  <Icon name="FileSpreadsheet" size={16} className="text-green-600" />
                  <span className="truncate">{file.name}</span>
                </div>
              )}
            </div>
          )}

          {/* STEP: preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{validRows.length}</p>
                  <p className="text-xs text-emerald-600 mt-1 font-medium">Ready to import</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{warnings.length}</p>
                  <p className="text-xs text-amber-600 mt-1 font-medium">Warnings</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{errors.length}</p>
                  <p className="text-xs text-red-600 mt-1 font-medium">Will be skipped</p>
                </div>
              </div>

              {/* Error table */}
              {errors.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1.5">
                    <Icon name="XCircle" size={14} />
                    Rows with errors (will be skipped)
                  </p>
                  <div className="border border-red-200 rounded-lg overflow-hidden">
                    <div className="overflow-auto max-h-40">
                      <table className="w-full text-xs">
                        <thead className="bg-red-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-red-700 w-16">Row #</th>
                            <th className="px-3 py-2 text-left font-medium text-red-700">Issues</th>
                            <th className="px-3 py-2 text-left font-medium text-red-700">Company Name</th>
                          </tr>
                        </thead>
                        <tbody>
                          {errors.map((err, idx) => (
                            <tr key={idx} className="border-t border-red-100">
                              <td className="px-3 py-1.5 text-red-600">{err.row}</td>
                              <td className="px-3 py-1.5 text-red-600">{err.messages?.join('; ')}</td>
                              <td className="px-3 py-1.5 text-red-600">{err.data?.company_name || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings table */}
              {warnings.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1.5">
                    <Icon name="AlertTriangle" size={14} />
                    Warnings
                  </p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden">
                    <div className="overflow-auto max-h-32">
                      <table className="w-full text-xs">
                        <thead className="bg-amber-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-amber-700 w-16">Row #</th>
                            <th className="px-3 py-2 text-left font-medium text-amber-700">Warning</th>
                          </tr>
                        </thead>
                        <tbody>
                          {warnings.map((w, idx) => (
                            <tr key={idx} className="border-t border-amber-100">
                              <td className="px-3 py-1.5 text-amber-700">{w.row}</td>
                              <td className="px-3 py-1.5 text-amber-700">{w.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview table */}
              {validRows.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Icon name="Eye" size={14} />
                    Preview (first {Math.min(10, validRows.length)} rows)
                  </p>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="overflow-auto max-h-48">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Company Name</th>
                            <th className="px-3 py-2 text-left font-medium">Contact</th>
                            <th className="px-3 py-2 text-left font-medium">Phone</th>
                            <th className="px-3 py-2 text-left font-medium">City</th>
                            <th className="px-3 py-2 text-left font-medium">Type</th>
                            <th className="px-3 py-2 text-left font-medium">Salesman Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validRows.slice(0, 10).map((r, idx) => (
                            <tr key={idx} className="border-t border-border hover:bg-muted/30">
                              <td className="px-3 py-1.5 font-medium truncate max-w-[140px]">{r.company_name}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.phone || r.mobile || '—'}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.city || '—'}</td>
                              <td className="px-3 py-1.5 capitalize">{r.customer_type || 'active'}</td>
                              <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[140px]">
                                {r.owner_email || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP: importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <Icon name="Loader2" size={40} className="text-primary animate-spin" />
              <div className="text-center">
                <p className="font-medium">Importing for {adminCompany?.name}...</p>
                <p className="text-sm text-muted-foreground mt-1">Please do not close this window</p>
              </div>
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP: done */}
          {step === 'done' && (
            <div className="flex flex-col items-center py-8 gap-6">
              <div className="p-4 bg-emerald-100 rounded-full">
                <Icon name="CheckCircle2" size={40} className="text-emerald-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold">Import Complete</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  The import process has finished for {adminCompany?.name}.
                </p>
              </div>
              <div className="flex gap-8 text-center">
                <div>
                  <p className="text-3xl font-bold text-emerald-600">{importResult.imported}</p>
                  <p className="text-sm text-muted-foreground mt-1">Imported</p>
                </div>
                {importResult.unassigned > 0 && (
                  <div>
                    <p className="text-3xl font-bold text-red-600">{importResult.unassigned}</p>
                    <p className="text-sm text-muted-foreground mt-1">No salesman assigned</p>
                  </div>
                )}
                {importResult.skipped > 0 && (
                  <div>
                    <p className="text-3xl font-bold text-orange-600">{importResult.skipped}</p>
                    <p className="text-sm text-muted-foreground mt-1">Skipped</p>
                  </div>
                )}
              </div>
              {importResult.unassigned > 0 && (
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  {importResult.unassigned} customer(s) were imported without a salesman because the provided email
                  was not found in the system. You can assign them manually later.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
          {step === 'upload' && (
            <>
              <p className="text-xs text-muted-foreground">Max 10,000 rows</p>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => { setStep('upload'); setParseError(null); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-xl hover:bg-accent transition-colors"
              >
                <Icon name="ArrowLeft" size={14} />
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="Upload" size={14} />
                Import {validRows.length} valid row{validRows.length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === 'done' && (
            <div className="flex w-full justify-end">
              <button
                onClick={handleClose}
                className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
