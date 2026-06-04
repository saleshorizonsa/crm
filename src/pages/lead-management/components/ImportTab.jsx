import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import Icon from '../../../components/AppIcon';

const REQUIRED_FIELDS = [
  { key: 'customer_name',   label: 'Customer Name',    hints: ['customer name','customer','اسم العميل','client'] },
  { key: 'salesman_name',   label: 'Salesman',         hints: ['salesman','sales rep','المندوب','rep'] },
  { key: 'invoice_number',  label: 'Invoice Number',   hints: ['invoice number','invoice no','رقم الفاتورة','inv no','invoice#'] },
  { key: 'invoice_date',    label: 'Invoice Date',     hints: ['invoice date','date','التاريخ'] },
  { key: 'amount_excl_vat', label: 'Amount Excl VAT',  hints: ['amount excl vat','amount','المبلغ','total','excl vat'] },
];
const OPTIONAL_FIELDS = [
  { key: 'item_description', label: 'Item Description', hints: ['item description','description','البيان','item'] },
  { key: 'product_group',    label: 'Product Group',    hints: ['product group','group','المجموعة'] },
];

function autoMap(headers) {
  const mapping = {};
  const all = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
  headers.forEach(h => {
    const hl = (h || '').toLowerCase().trim();
    for (const field of all) {
      if (field.hints.some(hint => hl.includes(hint) || hint.includes(hl))) {
        if (!Object.values(mapping).includes(field.key)) mapping[h] = field.key;
        break;
      }
    }
  });
  return mapping;
}

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
        resolve(data);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

function downloadTemplate() {
  const template = [
    { 'Customer Name': 'Namaa Building Materials Co.', 'Salesman': 'Amer Sulaiman Alburaym', 'Invoice Number': 'INV-2026-001', 'Invoice Date': '01/05/2026', 'Amount Excl VAT': '82300.72', 'Item Description': 'UPVC Pipes 4 inch', 'Product Group': 'UPIP' },
    { 'Customer Name': 'Ali Al Hamdi Est.',            'Salesman': 'Mohamed Hussein',         'Invoice Number': 'INV-2026-002', 'Invoice Date': '05/05/2026', 'Amount Excl VAT': '13545.79', 'Item Description': 'UPVC Fittings',     'Product Group': 'UPFT' },
    { 'Customer Name': 'Ghazer United Company',        'Salesman': 'Alseyed Mohammed Diba',   'Invoice Number': 'INV-2026-003', 'Invoice Date': '10/05/2026', 'Amount Excl VAT': '44916.70', 'Item Description': 'Corrugated Sheet',  'Product Group': 'USHT' },
  ];
  const ws = XLSX.utils.json_to_sheet(template);
  ws['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 30 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customer History');
  XLSX.writeFile(wb, 'JASCO_Customer_History_Template.xlsx');
}

export default function ImportTab({ onImport, importBatches, onDeleteBatch, role }) {
  const [step,       setStep]       = useState(1); // 1=upload 2=mapping 3=validate 4=result
  const [rawData,    setRawData]    = useState([]);
  const [headers,    setHeaders]    = useState([]);
  const [mapping,    setMapping]    = useState({});
  const [validation, setValidation] = useState(null);
  const [importing,  setImporting]  = useState(false);
  const [result,     setResult]     = useState(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [filename,   setFilename]   = useState('');
  const fileRef = useRef(null);

  const handleFile = async file => {
    if (!file) return;
    setFilename(file.name);
    const data = await parseExcelFile(file);
    if (!data.length) return;
    setRawData(data);
    const hdrs = Object.keys(data[0]);
    setHeaders(hdrs);
    setMapping(autoMap(hdrs));
    setStep(2);
  };

  const handleDrop = e => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const mappedRecords = () => rawData.map(row => {
    const rec = {};
    Object.entries(mapping).forEach(([header, field]) => { if (field) rec[field] = row[header]; });
    return rec;
  });

  const runValidation = () => {
    const records = mappedRecords();
    const errors = []; const warnings = []; const seenInvoices = new Set();
    records.forEach((r, i) => {
      const rowErrors = []; const rowWarnings = [];
      if (!r.customer_name?.trim()) rowErrors.push('Customer name missing');
      const amt = parseFloat((r.amount_excl_vat || '').replace(/,/g, ''));
      if (isNaN(amt) || amt <= 0) rowErrors.push('Invalid amount');
      if (r.invoice_date && isNaN(new Date(r.invoice_date).getTime())) rowWarnings.push('Check date format');
      if (r.invoice_number) {
        if (seenInvoices.has(r.invoice_number)) rowErrors.push('Duplicate invoice in file');
        seenInvoices.add(r.invoice_number);
      }
      if (rowErrors.length)   errors.push({ row: i + 2, errors: rowErrors, data: r });
      else if (rowWarnings.length) warnings.push({ row: i + 2, warnings: rowWarnings, data: r });
    });
    setValidation({ total: records.length, errors, warnings, valid: records.length - errors.length });
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    const records = mappedRecords().filter((_, i) => !validation.errors.some(e => e.row === i + 2));
    // Normalise amounts
    records.forEach(r => { r.amount_excl_vat = parseFloat((r.amount_excl_vat || '').replace(/,/g, '')) || 0; });
    const res = await onImport({ filename, records });
    setResult(res);
    setImporting(false);
    setStep(4);
  };

  const reset = () => { setStep(1); setRawData([]); setHeaders([]); setMapping({}); setValidation(null); setResult(null); setFilename(''); };

  const allFieldsMapped = REQUIRED_FIELDS.every(f => Object.values(mapping).includes(f.key));
  const canDelete = ['admin', 'director', 'manager'].includes(role);

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {['Upload', 'Map Columns', 'Validate', 'Import'].map((label, i) => (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-2 text-xs font-medium ${step === i + 1 ? 'text-blue-600' : step > i + 1 ? 'text-green-600' : 'text-gray-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === i + 1 ? 'bg-blue-600 text-white' : step > i + 1 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{step > i + 1 ? '✓' : i + 1}</span>
              {label}
            </div>
            {i < 3 && <div className={`flex-1 h-0.5 ${step > i + 1 ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
          >
            <Icon name="Upload" size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-600">Drop your Excel or CSV file here</p>
            <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv</p>
            <button type="button" className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium">Browse Files</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
          </div>
          <div className="flex justify-center">
            <button onClick={downloadTemplate} className="flex items-center gap-2 text-sm text-green-700 border border-green-200 bg-green-50 px-4 py-2 rounded-lg hover:bg-green-100 font-medium">
              <Icon name="Download" size={15} /> Download Template
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Column mapping */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Column Mapping — {filename}</h3>
            <span className="text-xs text-gray-400">{rawData.length} rows detected</span>
          </div>
          <div className="p-5 space-y-3">
            {[...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map(field => (
              <div key={field.key} className="flex items-center gap-4">
                <div className="w-40 text-xs font-medium text-gray-700">
                  {field.label}{REQUIRED_FIELDS.find(f => f.key === field.key) ? <span className="text-red-500 ml-1">*</span> : ''}
                </div>
                <select value={Object.entries(mapping).find(([, v]) => v === field.key)?.[0] || ''}
                  onChange={e => {
                    const newMap = { ...mapping };
                    Object.keys(newMap).forEach(k => { if (newMap[k] === field.key) delete newMap[k]; });
                    if (e.target.value) newMap[e.target.value] = field.key;
                    setMapping(newMap);
                  }}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option value="">— Not mapped —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                {Object.entries(mapping).find(([, v]) => v === field.key) && <span className="text-green-500 text-xs">✓</span>}
              </div>
            ))}
          </div>
          {/* Preview first 3 rows */}
          <div className="px-5 pb-4">
            <p className="text-xs text-gray-400 mb-2">Preview (first 3 rows)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-gray-100 rounded">
                <thead className="bg-gray-50">
                  <tr>{headers.map(h => <th key={h} className="px-2 py-1 text-left text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rawData.slice(0, 3).map((row, i) => <tr key={i} className="border-t border-gray-100">{headers.map(h => <td key={h} className="px-2 py-1 text-gray-700">{String(row[h] || '').slice(0, 30)}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <div className="px-5 pb-4 flex gap-2">
            <button onClick={reset} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">← Back</button>
            <button onClick={runValidation} disabled={!allFieldsMapped} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50">Validate →</button>
          </div>
        </div>
      )}

      {/* Step 3: Validation */}
      {step === 3 && validation && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-green-700">{validation.valid}</p><p className="text-xs text-green-600 mt-1">✅ Valid rows</p></div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-amber-700">{validation.warnings.length}</p><p className="text-xs text-amber-600 mt-1">⚠️ Warnings</p></div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-red-700">{validation.errors.length}</p><p className="text-xs text-red-600 mt-1">❌ Errors (will skip)</p></div>
          </div>
          {validation.errors.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-red-50 border-b border-red-100"><p className="text-xs font-medium text-red-700">Error rows (will be skipped)</p></div>
              <table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Row</th><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Error</th></tr></thead>
                <tbody className="divide-y divide-gray-50">{validation.errors.slice(0, 20).map((e, i) => <tr key={i}><td className="px-3 py-1.5 text-gray-400">{e.row}</td><td className="px-3 py-1.5 text-gray-700">{e.data?.customer_name || '—'}</td><td className="px-3 py-1.5 text-red-600">{e.errors.join(', ')}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">← Back</button>
            <button onClick={handleImport} disabled={importing || validation.valid === 0}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2">
              {importing ? <><Icon name="Loader2" size={14} className="animate-spin" />Importing...</> : `Import ${validation.valid} records →`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 4 && result && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto"><Icon name="CheckCircle" size={32} className="text-green-600" /></div>
          <h3 className="text-lg font-semibold text-gray-800">Import Complete</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-left max-w-lg mx-auto">
            <div className="bg-green-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-green-700">{result.imported}</p><p className="text-xs text-green-600">Imported</p></div>
            <div className="bg-blue-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-blue-700">{result.matched}</p><p className="text-xs text-blue-600">Matched contacts</p></div>
            <div className="bg-purple-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-purple-700">{result.imported - result.matched}</p><p className="text-xs text-purple-600">New customers</p></div>
            <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-gray-700">{result.skipped}</p><p className="text-xs text-gray-500">Skipped</p></div>
          </div>
          <button onClick={reset} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Import Another File</button>
        </div>
      )}

      {/* Import history */}
      {importBatches.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Import History ({importBatches.length} batches)</h3>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Filename</th>
                <th className="px-4 py-2.5 text-center">Records</th>
                <th className="px-4 py-2.5 text-left">Imported By</th>
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                {canDelete && <th className="px-4 py-2.5 text-center">Delete</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {importBatches.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800 truncate max-w-xs">{b.filename}</td>
                  <td className="px-4 py-2.5 text-center">{b.record_count}</td>
                  <td className="px-4 py-2.5 text-gray-500">{b.importer?.full_name || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{b.imported_at ? new Date(b.imported_at).toLocaleDateString('en-GB') : '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${b.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{b.status}</span>
                  </td>
                  {canDelete && (
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete batch "${b.filename}" and all ${b.record_count} records?`)) onDeleteBatch(b.id);
                        }}
                        className="text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                      >
                        <Icon name="Trash2" size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
