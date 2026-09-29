import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Icon from 'components/AppIcon';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import {
  mapHeaders, missingRequired, buildReturnRows, groupByDeal,
  dedupeWithinFile, toDbRow, RETURN_COLUMNS,
} from 'utils/salesReturnsImport';

// Recurring import of the ERP's sales-returns (credit note) export.
//
// Follows Historical Data's upload -> preview -> confirm shape, with one
// addition that matters here: nothing is silently dropped. Every row lands in
// one of four buckets the user can see before committing — matched, unmatched,
// ambiguous, unreadable — because a return that quietly fails to apply is a
// number that will not reconcile with the ERP later, with no trace of why.
//
// Re-importing the same file is safe: rows upsert against the natural key
// (credit note + invoice + item), so overlapping weekly and monthly exports
// cannot double-count.

const SAR = (n) => (Number(n) || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const dealLabel = (deal) => {
  const c = deal?.contacts;
  const name = c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(' ');
  return name || deal?.title || '(no customer on deal)';
};

export default function SalesReturnsModule({ adminCompany }) {
  const { user, company: authCompany } = useAuth();
  const company = adminCompany || authCompany;
  const fileInputRef = useRef(null);

  const [step, setStep] = useState('upload');   // upload|preview|importing|done
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const loadRecent = useCallback(async () => {
    if (!company?.id) return;
    setLoadingRecent(true);
    const { data, error: e } = await supabase
      .from('deal_returns')
      .select('id, return_date, invoice_no, credit_note_no, return_amount, customer_name, deal_id, created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!e) setRecent(data || []);
    setLoadingRecent(false);
  }, [company?.id]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const reset = () => {
    setStep('upload');
    setParsed(null);
    setFileName('');
    setError('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file || !company?.id) return;
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onerror = () => setError('Could not read the file.');
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!json.length) { setError('The sheet is empty.'); return; }

        const headerMap = mapHeaders(json[0]);
        const missing = missingRequired(headerMap);
        if (missing.length) {
          setError(`The sheet is missing required column(s): ${missing.join(', ')}. `
            + `Expected the ERP export's headers: ${RETURN_COLUMNS.join(', ')}.`);
          return;
        }

        // Every invoiced deal in the company, so a return can be matched to an
        // invoice from any month — a credit note usually credits an older one.
        const { data: deals, error: dErr } = await supabase
          .from('deals')
          .select('id, title, invoice_number, owner_id, contact_id, amount, final_amount, invoice_date, contacts!contact_id(first_name, last_name, company_name)')
          .eq('company_id', company.id)
          .eq('stage', 'won')
          .eq('is_invoiced', true);
        if (dErr) { setError(`Could not load invoices to match against: ${dErr.message}`); return; }

        const built = buildReturnRows({ rows: json.slice(1), headerMap, deals: deals || [], XLSX });
        setParsed({ ...built, groups: groupByDeal(built.matched) });
        setStep('preview');
      } catch (err) {
        setError(err?.message || 'Could not parse the file.');
      }
    };
    reader.readAsBinaryString(file);
  }

  async function commit() {
    if (!parsed || !company?.id) return;
    setStep('importing');
    setError('');
    try {
      // Unmatched rows are stored too (deal_id null): they are real credit
      // notes, and keeping them means the next import can show what never
      // reconciled. They reduce nobody's Achieved. Ambiguous rows are NOT
      // stored — storing them would imply we had chosen an invoice.
      const toStore = [...parsed.matched, ...parsed.unmatched];
      const { kept, dropped } = dedupeWithinFile(toStore);
      const rows = kept.map((r) => toDbRow(r, { companyId: company.id, userId: user?.id }));

      let written = 0;
      const CHUNK = 250;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { data, error: insErr } = await supabase
          .from('deal_returns')
          .upsert(slice, {
            onConflict: 'company_id,credit_note_no,invoice_no,item_code',
            ignoreDuplicates: true,          // a re-import must not double-count
          })
          .select('id');
        if (insErr) throw insErr;
        written += (data || []).length;
      }

      setResult({
        submitted: rows.length,
        written,
        alreadyPresent: rows.length - written,
        duplicateInFile: dropped.length,
        unmatched: parsed.unmatched.length,
        ambiguous: parsed.ambiguous.length,
        invalid: parsed.invalid.length,
      });
      setStep('done');
      loadRecent();
    } catch (err) {
      setError(err?.message || 'The import failed.');
      setStep('preview');
    }
  }

  const matchedTotal = (parsed?.matched || []).reduce((s, r) => s + r.return_amount, 0);
  const unmatchedTotal = (parsed?.unmatched || []).reduce((s, r) => s + r.return_amount, 0);
  const ambiguousTotal = (parsed?.ambiguous || []).reduce((s, r) => s + r.return_amount, 0);

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Icon name="Undo2" size={20} className="text-amber-600 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Sales returns (credit notes)</p>
            <p className="mt-1">
              Returns are subtracted from Achieved in the month they happened, not the
              month the original invoice was raised. Invoice figures on the deal itself
              are never changed. Re-importing the same file is safe — rows are matched on
              credit note + invoice + item, so overlapping exports cannot double-count.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{error}</div>
      )}

      {step === 'upload' && (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <Icon name="Upload" size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            Upload the ERP sales-returns export (.xlsx / .xls / .csv)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="block mx-auto text-sm"
          />
        </div>
      )}

      {step === 'preview' && parsed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-mono">{fileName}</p>
            <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">
              Choose a different file
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Will apply', parsed.matched.length, matchedTotal, 'text-emerald-700'],
              ['No matching invoice', parsed.unmatched.length, unmatchedTotal, 'text-amber-700'],
              ['Ambiguous invoice', parsed.ambiguous.length, ambiguousTotal, 'text-red-700'],
              ['Unreadable', parsed.invalid.length, 0, 'text-muted-foreground'],
            ].map(([label, count, total, cls]) => (
              <div key={label} className="bg-card border border-border rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className={`text-lg font-semibold ${cls}`}>{count} row{count === 1 ? '' : 's'}</p>
                {total > 0 && <p className="text-xs text-muted-foreground font-mono">{SAR(total)} SAR</p>}
              </div>
            ))}
          </div>

          {/* Matched, grouped per invoice — one invoice can be credited across
              several lines, so the total per deal is what matters. */}
          {parsed.groups.length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-muted/40">
                <h4 className="text-sm font-semibold">
                  Matched invoices ({parsed.groups.length}) — check the customer looks right
                </h4>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {parsed.groups.map((g) => (
                  <div key={g.deal_id} className="px-4 py-2 text-sm flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{dealLabel(g.deal)}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        invoice {g.deal.invoice_number} · invoiced{' '}
                        {SAR(g.deal.final_amount ?? g.deal.amount)} SAR
                        {g.rows.length > 1 ? ` · ${g.rows.length} return lines` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-red-600 font-mono whitespace-nowrap">
                      −{SAR(g.total)} SAR
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Surfaced, never silently discarded. */}
          {parsed.unmatched.length > 0 && (
            <ListBlock
              title={`No matching invoice (${parsed.unmatched.length}) — stored for audit, will NOT reduce Achieved`}
              tone="amber"
              rows={parsed.unmatched}
              render={(r) => `row ${r.sheetRow} · invoice ${r.invoice_no || '(blank)'} · ${r.customer_name || '—'} · ${SAR(r.return_amount)} SAR`}
            />
          )}
          {parsed.ambiguous.length > 0 && (
            <ListBlock
              title={`Ambiguous invoice number (${parsed.ambiguous.length}) — NOT imported`}
              tone="red"
              rows={parsed.ambiguous}
              render={(r) => `row ${r.sheetRow} · invoice ${r.invoice_no} matches ${r.candidates.length} deals · ${SAR(r.return_amount)} SAR`}
              note="Several invoiced deals share this invoice number, so the return cannot be attributed to one customer or salesman. Fix the invoice numbers on those deals, then re-import."
            />
          )}
          {parsed.invalid.length > 0 && (
            <ListBlock
              title={`Unreadable rows (${parsed.invalid.length}) — NOT imported`}
              tone="muted"
              rows={parsed.invalid}
              render={(r) => `row ${r.sheetRow} · ${r.reason}`}
            />
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={commit}
              disabled={parsed.matched.length === 0 && parsed.unmatched.length === 0}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
            >
              Import {parsed.matched.length + parsed.unmatched.length} row
              {parsed.matched.length + parsed.unmatched.length === 1 ? '' : 's'}
            </button>
            <p className="text-xs text-muted-foreground">
              {SAR(matchedTotal)} SAR will be subtracted from Achieved.
            </p>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Importing…
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-emerald-900">Import finished</p>
            <ul className="mt-2 text-sm text-emerald-900 space-y-0.5">
              <li>{result.written} new row{result.written === 1 ? '' : 's'} stored</li>
              {result.alreadyPresent > 0 && (
                <li>{result.alreadyPresent} already imported previously — skipped, not double-counted</li>
              )}
              {result.duplicateInFile > 0 && (
                <li>{result.duplicateInFile} duplicate row{result.duplicateInFile === 1 ? '' : 's'} within this file — skipped</li>
              )}
              {result.unmatched > 0 && <li>{result.unmatched} stored without a matching invoice</li>}
              {result.ambiguous > 0 && <li>{result.ambiguous} ambiguous — not imported</li>}
              {result.invalid > 0 && <li>{result.invalid} unreadable — not imported</li>}
            </ul>
          </div>
          <button onClick={reset} className="px-4 py-2 border border-border rounded-md text-sm">
            Import another file
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Recently imported returns</h4>
          <button onClick={loadRecent} className="text-xs text-muted-foreground hover:text-foreground">
            Refresh
          </button>
        </div>
        {loadingRecent ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No returns imported yet.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {recent.map((r) => (
              <div key={r.id} className="px-4 py-2 text-sm flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate">{r.customer_name || '—'}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {r.return_date} · invoice {r.invoice_no || '—'} · CN {r.credit_note_no || '—'}
                    {!r.deal_id && ' · unmatched'}
                  </p>
                </div>
                <p className="font-mono text-red-600 whitespace-nowrap">−{SAR(r.return_amount)} SAR</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListBlock({ title, rows, render, tone, note }) {
  const cls = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    muted: 'border-border bg-muted/30 text-muted-foreground',
  }[tone] || 'border-border';
  return (
    <div className={`border rounded-lg overflow-hidden ${cls}`}>
      <div className="px-4 py-2 border-b border-inherit">
        <h4 className="text-sm font-semibold">{title}</h4>
        {note && <p className="text-xs mt-0.5 opacity-90">{note}</p>}
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-inherit">
        {rows.map((r, i) => (
          <p key={i} className="px-4 py-1.5 text-xs font-mono">{render(r)}</p>
        ))}
      </div>
    </div>
  );
}
