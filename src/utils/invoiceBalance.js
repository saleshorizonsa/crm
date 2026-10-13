// A deal invoiced for LESS than its original value leaves a balance. What
// happens to it is asked every time (CEO decision 2026-10-13):
//   (a) a new plan item        — Current Sales Plan, open, the month chosen
//   (b) a new lead deal        — the pipeline, closing in the month chosen
//   (c) drop it                — the customer reduced the order; nothing written
// The new row keeps the original deal's customer, owner and division (the
// export-customer trigger still forces Export for an export customer), and says
// where it came from in its notes / description. There is no column linking it
// to the original deal, and none is added for this.
//
// And a WARNING, never a block, when an invoice number is already on another
// deal of the company — compared through parseInvoiceNumbers, so "93002906"
// and "0093002906" are the same invoice.
import { supabase } from 'lib/supabase';
import { dealService } from 'services/supabaseService';
import { parseInvoiceNumbers } from 'utils/invoiceNumber';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const SAR = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num(n));

export const BALANCE_CHOICE = { plan: 'plan', lead: 'lead', drop: 'drop' };

/** The value the deal started from: original_amount, else initial_amount. */
export function originalValueOf(deal) {
  return num(deal?.original_amount) || num(deal?.initial_amount) || 0;
}

/** The value it was invoiced / won at: final_amount, else amount. */
export function finalValueOf(deal) {
  return num(deal?.final_amount) || num(deal?.amount) || 0;
}

/** original − final when positive (to the halala), else 0. */
export function balanceOf(deal) {
  const original = originalValueOf(deal);
  const final = finalValueOf(deal);
  const gap = Math.round((original - final) * 100) / 100;
  return original > 0 && final > 0 && gap > 0 ? gap : 0;
}

/**
 * The two months on offer: this one (the default) and the next. LOCAL date
 * parts, never toISOString(), which in Riyadh stamps a local midnight as the
 * previous day.
 */
export function balanceMonths(now = new Date()) {
  const at = (offset) => {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return {
      key: offset === 0 ? 'current' : 'next',
      first: ymd(first),
      last: ymd(last),
      label: first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    };
  };
  return [at(0), at(1)];
}

/** "Balance of <title> invoiced <date> (<final> of <original>)". */
export function balanceNote(deal, invoiceDate) {
  const date = String(invoiceDate || deal?.invoice_date || '').slice(0, 10);
  return `Balance of ${deal?.title || 'deal'} invoiced ${date} (${SAR(finalValueOf(deal))} of ${SAR(originalValueOf(deal))})`;
}

function customerNameOf(deal) {
  const c = deal?.contact || deal?.contacts || null;
  return (c?.company_name
    || [c?.first_name, c?.last_name].filter(Boolean).join(' ')
    || deal?.title
    || 'Unnamed customer').trim();
}

/**
 * Write what was chosen. (c) writes nothing.
 * @returns {{ written: 'plan'|'lead'|null, row: object|null }}
 */
export async function recordBalance({ choice, month, deal, invoiceDate, userId }) {
  const balance = balanceOf(deal);
  if (!balance || choice === BALANCE_CHOICE.drop) return { written: null, row: null };
  const note = balanceNote(deal, invoiceDate);

  if (choice === BALANCE_CHOICE.plan) {
    const { data, error } = await supabase.from('opportunities').insert({
      company_id: deal.company_id,
      owner_id: deal.owner_id,
      created_by: userId || deal.owner_id,
      contact_id: deal.contact_id || null,
      customer_name: customerNameOf(deal),
      customer_type: 'existing',
      planned_amount: balance,
      expected_month: month.first,
      status: 'open',
      notes: note,
      division_id: deal.division_id || null,
    }).select().single();
    if (error) throw error;
    return { written: 'plan', row: data };
  }

  if (choice === BALANCE_CHOICE.lead) {
    const { data, error } = await dealService.createDeal({
      company_id: deal.company_id,
      owner_id: deal.owner_id,
      contact_id: deal.contact_id || null,
      title: deal.title,
      description: note,
      stage: 'lead',
      amount: balance,
      currency: deal.currency || 'SAR',
      priority: deal.priority || 'medium',
      // The month's LAST day: a lead dated in the past cannot be saved again
      // from the deal form without first moving its date.
      expected_close_date: month.last,
      division_id: deal.division_id || null,
    });
    if (error) throw error;
    return { written: 'lead', row: data };
  }
  return { written: null, row: null };
}

/**
 * Other deals of the company that already carry one of these invoice numbers.
 * Leading zeros and spaces do not count: both sides go through
 * parseInvoiceNumbers. A failed lookup returns [] — it is a warning, and must
 * never stop an invoice being saved.
 */
export async function findInvoiceDuplicates({ companyId, invoiceText, excludeDealId = null }) {
  const wanted = parseInvoiceNumbers(invoiceText);
  if (!companyId || !wanted.length) return [];
  try {
    // Narrow on the significant digits (no leading zeros), then compare exactly.
    const cores = wanted.map((n) => n.replace(/^0+/, ''));
    const { data, error } = await supabase
      .from('deals')
      .select('id, title, amount, final_amount, invoice_number, contact:contacts!contact_id(company_name, first_name, last_name)')
      .eq('company_id', companyId)
      .or(cores.map((c) => `invoice_number.ilike.%${c}%`).join(','));
    if (error) return [];
    const set = new Set(wanted);
    return (data || [])
      .filter((d) => d.id !== excludeDealId)
      .filter((d) => parseInvoiceNumbers(d.invoice_number).some((n) => set.has(n)))
      .map((d) => ({ id: d.id, customer: customerNameOf(d), amount: finalValueOf(d), invoiceNumber: d.invoice_number }));
  } catch {
    return [];
  }
}

/** "This invoice number is already on <customer> (<amount>). Save anyway?" */
export function duplicateInvoiceMessage(dups) {
  const on = dups.map((d) => `${d.customer} (${SAR(d.amount)})`).join(', ');
  return `This invoice number is already on ${on}. Save anyway?`;
}
