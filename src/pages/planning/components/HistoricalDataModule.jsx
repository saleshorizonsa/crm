import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';

// ── Column auto-detection ────────────────────────────────────────────────────
// Common SAP / ERP header variations, English + Arabic.
const COLUMN_MAP = {
  customer_name: [
    'customer', 'customer name', 'client', 'account', 'sold-to party',
    'ship-to party', 'customer_name', 'customername', 'اسم العميل', 'العميل',
  ],
  product_name: [
    'material description', 'product name', 'material', 'product', 'item',
    'description', 'product_name', 'productname', 'المادة', 'المنتج',
  ],
  material_group: [
    'material group', 'mat group', 'product group', 'category',
    'material_group', 'materialgroup', 'مجموعة المواد',
  ],
  amount: [
    'net value', 'net amount', 'sales value', 'sales_amount', 'amount',
    'revenue', 'total', 'value', 'net_value', 'المبلغ', 'القيمة',
  ],
  quantity: [
    'quantity', 'qty', 'volume', 'sales qty', 'quantity_bun', 'الكمية',
  ],
  unit: [
    'unit of measure', 'base unit', 'sales unit', 'unit', 'uom', 'الوحدة',
  ],
  sale_date: [
    'billing date', 'posting date', 'invoice date', 'delivery date',
    'document date', 'sale_date', 'saledate', 'date', 'التاريخ', 'تاريخ',
  ],
  salesman_name: [
    'sales employee', 'sales person', 'sales rep', 'salesman_name',
    'salesmanname', 'salesman', 'employee', 'rep name',
    'البائع', 'مندوب المبيعات',
  ],
};

const FIELDS = [
  { field: 'customer_name',  label: 'Customer Name',  required: true  },
  { field: 'amount',         label: 'Amount (SAR)',   required: true  },
  { field: 'sale_date',      label: 'Sale Date',      required: true  },
  { field: 'salesman_name',  label: 'Salesman Name',  required: false },
  { field: 'product_name',   label: 'Product Name',   required: false },
  { field: 'material_group', label: 'Material Group', required: false },
  { field: 'quantity',       label: 'Quantity',       required: false },
  { field: 'unit',           label: 'Unit',           required: false },
];

const REQUIRED = FIELDS.filter((f) => f.required).map((f) => f.field);
const BATCH_SIZE = 500;

// Longest variants first so "material description" wins over "material".
function autoMapColumns(headers) {
  const mapped = {};
  const lower = headers.map((h) => String(h ?? '').toLowerCase().trim());
  const taken = new Set();

  Object.entries(COLUMN_MAP).forEach(([field, variants]) => {
    // exact match first, then contains
    let idx = lower.findIndex((h, i) => !taken.has(i) && variants.includes(h));
    if (idx === -1) {
      idx = lower.findIndex(
        (h, i) => !taken.has(i) && h && variants.some((v) => h.includes(v)),
      );
    }
    if (idx !== -1) { mapped[field] = headers[idx]; taken.add(idx); }
  });
  return mapped;
}

// ── Value parsing ────────────────────────────────────────────────────────────
// SAP exports often format numbers as "1,234.56", "1.234,56", "SAR 1 234" or
// "(500)" for negatives — plain parseFloat would silently truncate these.
function toNumber(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;

  let s = String(v).trim();
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()]/g, '').replace(/[^\d.,]/g, '');
  if (!s) return NaN;

  if (s.includes(',') && s.includes('.')) {
    // Whichever separator comes last is the decimal one
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    // trailing group of exactly 3 digits → thousands separator
    s = parts[parts.length - 1].length === 3 && parts.length > 1
      ? s.replace(/,/g, '')
      : s.replace(',', '.');
  }

  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return negative ? -Math.abs(n) : n;
}

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function toISODate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return fmtDate(v);

  // Excel date serial
  if (typeof v === 'number') {
    try {
      const p = XLSX.SSF?.parse_date_code?.(v);
      if (p?.y) return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
    } catch { /* fall through */ }
    return null;
  }

  const s = String(v).trim();
  // ISO and US formats parse natively; dd/mm/yyyy does not.
  const native = new Date(s);
  if (!isNaN(native.getTime())) return fmtDate(native);

  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    const d = new Date(Number(y), Number(b) - 1, Number(a)); // dd/mm/yyyy
    if (!isNaN(d.getTime())) return fmtDate(d);
  }
  return null;
}

const newBatchId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `batch-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);

// ── Component ────────────────────────────────────────────────────────────────
export default function HistoricalDataModule({ adminCompany }) {
  const { user, company: authCompany } = useAuth();
  const company = adminCompany || authCompany;
  const fileInputRef = useRef(null);

  const [step, setStep] = useState('upload'); // upload|mapping|preview|importing|done
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [previewRows, setPreviewRows] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState(null);
  const [importHistory, setImportHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');

  const idxOf = (hdrs, col) => (col ? hdrs.indexOf(col) : -1);
  const cell = (row, hdrs, col) => {
    const i = idxOf(hdrs, col);
    return i === -1 ? '' : row[i];
  };

  function resetAll() {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setRawData([]);
    setColumnMapping({});
    setPreviewRows([]);
    setImportProgress(0);
    setImportResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const buildPreview = useCallback((rows, hdrs, mapping) => {
    setPreviewRows(
      rows.slice(0, 5).map((row) => ({
        customer_name:  cell(row, hdrs, mapping.customer_name) || '—',
        product_name:   cell(row, hdrs, mapping.product_name) || '—',
        material_group: cell(row, hdrs, mapping.material_group) || '—',
        amount:         toNumber(cell(row, hdrs, mapping.amount)),
        sale_date:      toISODate(cell(row, hdrs, mapping.sale_date)),
        salesman_name:  cell(row, hdrs, mapping.salesman_name) || '—',
      })),
    );
  }, []);

  // ── File select + parse ───────────────────────────────────────────────────
  function handleFileSelect(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');

    const reader = new FileReader();
    reader.onerror = () => setError('Could not read the file.');
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) { setError('No sheet found in this file.'); return; }

        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (json.length < 2) {
          setError('File appears empty — need a header row and at least one data row.');
          return;
        }

        const hdrs = (json[0] || []).map((h) => String(h ?? '').trim()).filter(Boolean);
        if (!hdrs.length) { setError('Could not read the header row.'); return; }

        const rows = json.slice(1).filter((r) =>
          Array.isArray(r) && r.some((c) => c !== '' && c !== null && c !== undefined),
        );
        if (!rows.length) { setError('No data rows found below the header.'); return; }

        const mapping = autoMapColumns(hdrs);
        setHeaders(hdrs);
        setRawData(rows);
        setColumnMapping(mapping);

        if (REQUIRED.every((f2) => mapping[f2])) {
          buildPreview(rows, hdrs, mapping);
          setStep('preview');
        } else {
          setStep('mapping');
        }
      } catch (err) {
        setError(`Could not read file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(f);
  }

  // ── Import ────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!company?.id) { setError('No company selected.'); return; }
    setStep('importing');
    setImportProgress(0);

    const batchId = newBatchId();
    const str = (v) => {
      const s = String(v ?? '').trim();
      return s || null;
    };

    // Rows missing a valid amount or date can't be used for analytics — skip them.
    const toInsert = rawData.map((row) => {
      const amount   = toNumber(cell(row, headers, columnMapping.amount));
      const saleDate = toISODate(cell(row, headers, columnMapping.sale_date));
      if (!saleDate || isNaN(amount) || amount === 0) return null;

      const qty = toNumber(cell(row, headers, columnMapping.quantity));

      return {
        company_id:     company.id,
        created_by:     user?.id ?? null,
        customer_name:  str(cell(row, headers, columnMapping.customer_name)),
        product_name:   str(cell(row, headers, columnMapping.product_name)),
        material_group: str(cell(row, headers, columnMapping.material_group)),
        amount,
        quantity:       isNaN(qty) ? null : qty,
        unit:           str(cell(row, headers, columnMapping.unit)),
        sale_date:      saleDate,
        salesman_name:  str(cell(row, headers, columnMapping.salesman_name)),
        source:         'sap_import',
        import_batch_id: batchId,
      };
    }).filter(Boolean);

    if (!toInsert.length) {
      setImportResult({
        total: 0, inserted: 0, errors: 0,
        skipped: rawData.length, batchId,
        firstError: 'No rows had both a valid amount and a valid date. Check your column mapping.',
      });
      setStep('done');
      return;
    }

    let inserted = 0;
    let errors = 0;
    let firstError = '';

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error: insErr } = await supabase.from('sales_history').insert(batch);
      if (insErr) {
        console.error('sales_history batch error:', insErr);
        errors += batch.length;
        if (!firstError) firstError = insErr.message || String(insErr);
      } else {
        inserted += batch.length;
      }
      setImportProgress(Math.round(((i + batch.length) / toInsert.length) * 100));
    }

    setImportResult({
      total:   toInsert.length,
      inserted,
      errors,
      skipped: rawData.length - toInsert.length,
      batchId,
      firstError,
    });
    setStep('done');
    fetchImportHistory();
  }

  // ── Import history ────────────────────────────────────────────────────────
  // Discover recent batch ids from a bounded sample, then get an exact count per
  // batch with head-only queries (avoids pulling every historical row).
  const fetchImportHistory = useCallback(async () => {
    if (!company?.id) return;
    setLoadingHistory(true);
    try {
      const { data, error: err } = await supabase
        .from('sales_history')
        .select('import_batch_id, created_at')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (err) { setImportHistory([]); return; }

      const seen = new Map();
      (data || []).forEach((r) => {
        if (r.import_batch_id && !seen.has(r.import_batch_id)) {
          seen.set(r.import_batch_id, r.created_at);
        }
      });

      const batches = await Promise.all(
        [...seen.entries()].slice(0, 10).map(async ([batchId, createdAt]) => {
          const { count } = await supabase
            .from('sales_history')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company.id)
            .eq('import_batch_id', batchId);
          return { batchId, createdAt, count: count ?? 0 };
        }),
      );
      setImportHistory(batches);
    } finally {
      setLoadingHistory(false);
    }
  }, [company?.id]);

  useEffect(() => { fetchImportHistory(); }, [fetchImportHistory]);

  async function handleDeleteBatch(batchId) {
    if (!window.confirm('Delete this import batch? This cannot be undone.')) return;
    const { error: delErr } = await supabase
      .from('sales_history')
      .delete()
      .eq('import_batch_id', batchId)
      .eq('company_id', company?.id);
    if (delErr) { alert(`Could not delete batch: ${delErr.message}`); return; }
    fetchImportHistory();
  }

  const canPreview = REQUIRED.every((f) => columnMapping[f]);
  const nfmt = (n) => Number(n || 0).toLocaleString();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── UPLOAD ── */}
      {step === 'upload' && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-foreground">
              Import Historical Sales Data
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Upload your SAP/ERP export for <strong>{company?.name || 'this company'}</strong>.
              Supported formats: .xlsx, .xls, .csv
            </p>
          </div>

          <div className="flex gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl mb-6">
            <Icon name="Info" size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 space-y-1">
              <p className="font-medium">What columns does the CRM look for?</p>
              <p>Customer name · Product / Material · Amount (SAR) · Date · Salesman name</p>
              <p>
                Common SAP column names are detected automatically. If they can&apos;t be
                matched you&apos;ll get a mapping screen.
              </p>
            </div>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-all duration-150 group"
          >
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
              <Icon name="FileSpreadsheet" size={28} className="text-blue-600" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">
              Click to upload SAP export
            </p>
            <p className="text-xs text-muted-foreground">.xlsx · .xls · .csv supported</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelect}
          />

          {error && (
            <div className="flex items-start gap-2 mt-4 p-3 bg-red-50 border border-red-100 rounded-xl">
              <Icon name="AlertTriangle" size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* ── MAPPING ── */}
      {step === 'mapping' && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">Map Your Columns</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Found {headers.length} columns in <strong>{file?.name}</strong>. Match them
                to the CRM fields below.
              </p>
            </div>
            <button
              onClick={resetAll}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 flex-shrink-0"
            >
              <Icon name="X" size={13} /> Change file
            </button>
          </div>

          <div className="space-y-3">
            {FIELDS.map(({ field, label, required }) => (
              <div key={field} className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <div className="w-36 flex-shrink-0">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  {required && <span className="text-red-500 ml-1 text-xs">*</span>}
                </div>
                <Icon name="ArrowRight" size={14} className="text-muted-foreground flex-shrink-0 hidden sm:block" />
                <select
                  value={columnMapping[field] || ''}
                  onChange={(e) =>
                    setColumnMapping((m) => ({ ...m, [field]: e.target.value }))
                  }
                  className={`flex-1 min-w-0 border rounded-xl px-3 py-2 text-sm bg-card text-foreground focus:outline-none ${
                    columnMapping[field]
                      ? 'border-green-300 bg-green-50'
                      : required
                      ? 'border-red-200'
                      : 'border-border'
                  }`}
                >
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                {columnMapping[field]
                  ? <Icon name="CheckCircle" size={16} className="text-green-500 flex-shrink-0" />
                  : <span className="w-4 flex-shrink-0" />}
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-end mt-6 pt-6 border-t border-border">
            <button
              onClick={resetAll}
              className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { buildPreview(rawData, headers, columnMapping); setStep('preview'); }}
              disabled={!canPreview}
              className="px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview Import →
            </button>
          </div>
        </div>
      )}

      {/* ── PREVIEW ── */}
      {step === 'preview' && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">Preview Import</h2>
              <p className="text-xs text-muted-foreground mt-1">
                First 5 rows of <strong>{nfmt(rawData.length)}</strong> from{' '}
                <strong>{file?.name}</strong>
              </p>
            </div>
            <button
              onClick={() => setStep('mapping')}
              className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              ← Back to mapping
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border mb-6">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  {['Customer', 'Product', 'Material Group', 'Amount (SAR)', 'Date', 'Salesman'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium text-muted-foreground border-b border-border whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 text-foreground font-medium">{row.customer_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.product_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.material_group}</td>
                    <td className={`px-3 py-2.5 font-semibold tabular-nums ${isNaN(row.amount) ? 'text-red-500' : 'text-foreground'}`}>
                      {isNaN(row.amount) ? 'invalid' : row.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`px-3 py-2.5 ${row.sale_date ? 'text-muted-foreground' : 'text-red-500'}`}>
                      {row.sale_date || 'invalid'}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.salesman_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-muted rounded-xl p-4 text-center">
              <p className="text-xl font-bold text-foreground">{nfmt(rawData.length)}</p>
              <p className="text-xs text-muted-foreground mt-1">Rows in file</p>
            </div>
            <div className="bg-muted rounded-xl p-4 text-center">
              <p className="text-base font-bold text-blue-600 truncate">{company?.name || '—'}</p>
              <p className="text-xs text-muted-foreground mt-1">Target company</p>
            </div>
            <div className="bg-muted rounded-xl p-4 text-center">
              <p className="text-base font-bold text-green-600">SAP Import</p>
              <p className="text-xs text-muted-foreground mt-1">Data source</p>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={resetAll}
              className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="px-6 py-2 text-sm bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Icon name="Upload" size={15} />
              Import {nfmt(rawData.length)} rows
            </button>
          </div>
        </div>
      )}

      {/* ── IMPORTING ── */}
      {step === 'importing' && (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <Icon name="RefreshCw" size={28} className="text-blue-600 animate-spin" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">Importing data…</h2>
          <p className="text-xs text-muted-foreground mb-6">Please do not close this tab</p>
          <div className="max-w-xs mx-auto">
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="text-sm font-medium text-blue-600">{importProgress}% complete</p>
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && importResult && (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            importResult.errors > 0 || importResult.inserted === 0 ? 'bg-amber-100' : 'bg-green-100'
          }`}>
            <Icon
              name={importResult.errors > 0 || importResult.inserted === 0 ? 'AlertTriangle' : 'CheckCircle'}
              size={28}
              className={importResult.errors > 0 || importResult.inserted === 0 ? 'text-amber-600' : 'text-green-600'}
            />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">
            {importResult.inserted > 0 ? 'Import Complete' : 'Nothing Imported'}
          </h2>

          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mt-6 mb-6">
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-xl font-bold text-green-600">{nfmt(importResult.inserted)}</p>
              <p className="text-xs text-green-700 mt-1">Imported</p>
            </div>
            <div className="bg-muted rounded-xl p-4">
              <p className="text-xl font-bold text-muted-foreground">{nfmt(importResult.skipped)}</p>
              <p className="text-xs text-muted-foreground mt-1">Skipped</p>
            </div>
            <div className={`rounded-xl p-4 ${importResult.errors > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
              <p className={`text-xl font-bold ${importResult.errors > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {nfmt(importResult.errors)}
              </p>
              <p className={`text-xs mt-1 ${importResult.errors > 0 ? 'text-red-700' : 'text-green-700'}`}>Errors</p>
            </div>
          </div>

          {importResult.firstError && (
            <div className="flex items-start gap-2 p-3 mb-6 bg-red-50 border border-red-100 rounded-xl text-left max-w-lg mx-auto">
              <Icon name="AlertCircle" size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-red-700">Reason</p>
                <p className="text-xs text-red-600 mt-0.5 break-words">{importResult.firstError}</p>
              </div>
            </div>
          )}

          <button
            onClick={resetAll}
            className="px-6 py-2 text-sm bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            Import Another File
          </button>
        </div>
      )}

      {/* ── IMPORT HISTORY ── */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Import History</h3>
          <button
            onClick={fetchImportHistory}
            disabled={loadingHistory}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
          >
            <Icon name="RefreshCw" size={12} className={loadingHistory ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loadingHistory ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : importHistory.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No imports yet for {company?.name || 'this company'}
          </p>
        ) : (
          <div className="space-y-2">
            {importHistory.map((batch) => (
              <div key={batch.batchId} className="flex items-center justify-between gap-3 p-3 bg-muted rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Icon name="FileSpreadsheet" size={14} className="text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {nfmt(batch.count)} rows imported
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(batch.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteBatch(batch.batchId)}
                  title="Delete this batch"
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                >
                  <Icon name="Trash2" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
