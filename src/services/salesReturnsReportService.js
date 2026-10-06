import { supabase } from '../lib/supabase';
import { fetchTeamHierarchy } from '../utils/teamHierarchy';

// THE SALES RETURNS LIST — every credit note, read-only.
//
// The importer lives on Planning → Sales Returns and is untouched; this is the
// register you read, not the one you write to.
//
// WHY A SCOPE IS APPLIED HERE AS WELL AS IN RLS. The deal_returns SELECT policy
// in production (read 2026-10-05) allows an UNMATCHED return — one with
// deal_id IS NULL — to be read by ANY user whose company_id matches, including a
// salesman. That is wider than the agreed visibility, and the brief's rule is
// enforced in the query below so the screen is correct before any SQL is
// applied. migrations/deal_returns_rls_visibility.sql tightens the policy to
// match; until it is applied, RLS is the weaker of the two and this is the
// binding one. Note the direction of that: the UI cannot make RLS stricter for
// someone who queries the API directly, so the migration still matters.
//
// THE AGREED VISIBILITY:
//   director / admin / head         every return in the company, matched or not
//   manager / supervisor            MATCHED returns on their own subtree's deals
//   salesman                        MATCHED returns on their own deals
//   anyone else                     nothing
//
// An unmatched return has no deal and therefore no owner, so there is no subtree
// it could belong to — which is why only the company-wide roles see them.

// No 'ceo': there is no such value in the user_role enum
// {admin, manager, agent, director, supervisor, salesman, head, viewer}. It was
// inert here — a JavaScript comparison that never matched — but it was also
// what made migrations/deal_returns_rls_visibility.sql fail to apply, where a
// role that does not exist is fatal rather than merely useless. Keeping the two
// lists identical is the point: this is the UI half of that policy.
export const ALL_RETURNS_ROLES = ['director', 'admin', 'head'];
export const TEAM_RETURNS_ROLES = ['manager', 'supervisor', 'sales_manager'];

/** PostgREST caps a response at 1000 rows; this walks the pages. */
const PAGE = 1000;

/**
 * Who this viewer may see returns for.
 *
 * @returns {{ seesAll: boolean, ownerIds: string[]|null, seesUnmatched: boolean }}
 *   ownerIds null means "no owner filter" and only ever accompanies seesAll.
 */
export async function resolveReturnsScope({ companyId, userId, role }) {
  if (ALL_RETURNS_ROLES.includes(role)) {
    return { seesAll: true, ownerIds: null, seesUnmatched: true };
  }
  if (TEAM_RETURNS_ROLES.includes(role)) {
    // The same downward walk the rest of the app uses, so this screen cannot
    // disagree with the Coverage Console about who is in a team.
    const team = await fetchTeamHierarchy({ companyId, userId, role });
    const ids = [userId, ...(team || []).map((m) => m.id)].filter(Boolean);
    return { seesAll: false, ownerIds: [...new Set(ids)], seesUnmatched: false };
  }
  if (role === 'salesman') {
    return { seesAll: false, ownerIds: [userId].filter(Boolean), seesUnmatched: false };
  }
  return { seesAll: false, ownerIds: [], seesUnmatched: false };
}

/**
 * Every return this viewer may see, paginated past the 1000-row cap.
 *
 * The deal is joined for the two fields that only it has — the salesman and the
 * deal's own invoice number — with a LEFT join, because an unmatched return has
 * no deal and must still be listed for the people entitled to see it. The old
 * Planning widget used `deals!inner`, which silently dropped exactly the rows
 * somebody needs to go and fix.
 *
 * @returns {{ rows: object[], truncated: boolean, scope: object, error: Error|null }}
 */
export async function fetchSalesReturns({ companyId, userId, role, maxRows = 20000 }) {
  const scope = await resolveReturnsScope({ companyId, userId, role });
  const empty = { rows: [], truncated: false, scope, error: null };
  if (!companyId) return empty;
  if (!scope.seesAll && (!scope.ownerIds || scope.ownerIds.length === 0)) return empty;

  const SELECT = `
    id, deal_id, return_date, credit_note_no, invoice_no, customer_name,
    item_code, item_description, materials_group, return_qty, unit_price,
    return_amount, created_at,
    deal:deals!deal_id(
      id, invoice_number, title, owner_id,
      owner:users!owner_id(id, full_name)
    )
  `;

  const out = [];
  let truncated = false;
  for (let from = 0; from < maxRows; from += PAGE) {
    let q = supabase
      .from('deal_returns')
      .select(SELECT)
      .eq('company_id', companyId)
      .order('return_date', { ascending: false })
      .order('credit_note_no', { ascending: false })
      .range(from, from + PAGE - 1);

    // The scope, in the query. `deal.owner_id` is a filter on the embedded
    // table; PostgREST applies it with the join, so for a team scope the
    // unmatched rows (no deal) drop out on their own — which is the rule.
    if (!scope.seesAll) q = q.in('deal.owner_id', scope.ownerIds);

    const { data, error } = await q;
    if (error) return { rows: out, truncated, scope, error };
    const page = data || [];
    // An embedded filter narrows the JOIN, not the outer rows, so a row whose
    // deal was filtered out comes back with deal: null. Those are dropped here
    // for a team scope — otherwise a supervisor would see every unmatched
    // return in the company as a blank row.
    out.push(...(scope.seesAll ? page : page.filter((r) => r.deal)));
    if (page.length < PAGE) return { rows: out, truncated, scope, error: null };
    if (from + PAGE >= maxRows) truncated = true;
  }
  return { rows: out, truncated, scope, error: null };
}

/** Matched = linked to a deal. Unmatched credit notes reduce nobody's Achieved. */
export const isMatched = (r) => !!r?.deal_id;

/** One row, flattened for the table and the export. */
export function toReturnRow(r) {
  return {
    id: r.id,
    returnDate: String(r.return_date || '').slice(0, 10),
    creditNoteNo: r.credit_note_no || '',
    // The return carries the invoice number it was imported with; the deal
    // carries the one the deal was corrected to. They differ exactly when
    // somebody has fixed a deal's invoice number since the import, and the
    // difference is worth seeing rather than hiding behind one of them.
    invoiceNo: r.invoice_no || '',
    dealInvoiceNo: r.deal?.invoice_number || '',
    customer: r.customer_name || '',
    salesman: r.deal?.owner?.full_name || '',
    salesmanId: r.deal?.owner?.id || null,
    dealTitle: r.deal?.title || '',
    itemCode: r.item_code || '',
    itemDescription: r.item_description || '',
    materialsGroup: r.materials_group || '',
    qty: Number(r.return_qty) || 0,
    unitPrice: Number(r.unit_price) || 0,
    // Stored POSITIVE and subtracted by the Achieved rule; shown positive here
    // and labelled as a credit, which is how the accounts read.
    amount: Math.abs(Number(r.return_amount) || 0),
    matched: isMatched(r),
  };
}

/**
 * The filters the screen offers, applied in memory over the already-scoped rows.
 * Month range is inclusive on both ends and compared as yyyy-MM-dd strings —
 * return_date is a DATE column, so there is no instant to mis-convert.
 */
export function filterReturnRows(rows, {
  fromMonth = null, toMonth = null, customer = '', salesmanId = 'all', status = 'all',
} = {}) {
  const from = fromMonth ? `${fromMonth}-01` : null;
  // The last day of `toMonth`, without constructing a Date: the 0th day of the
  // NEXT month is the last of this one, and doing it in UTC keeps Riyadh out of it.
  let to = null;
  if (toMonth) {
    const [y, m] = toMonth.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    to = `${toMonth}-${String(last).padStart(2, '0')}`;
  }
  const term = String(customer || '').trim().toLowerCase();

  return (rows || []).filter((r) => {
    if (from && r.returnDate < from) return false;
    if (to && r.returnDate > to) return false;
    if (term && !r.customer.toLowerCase().includes(term)
      && !r.creditNoteNo.toLowerCase().includes(term)
      && !r.invoiceNo.toLowerCase().includes(term)) return false;
    if (salesmanId !== 'all' && r.salesmanId !== salesmanId) return false;
    if (status === 'matched' && !r.matched) return false;
    if (status === 'unmatched' && r.matched) return false;
    return true;
  });
}

/** Count and the three totals the footer shows. */
export function summariseReturnRows(rows) {
  const list = rows || [];
  const matched = list.filter((r) => r.matched);
  const unmatched = list.filter((r) => !r.matched);
  const sum = (xs) => xs.reduce((s, r) => s + r.amount, 0);
  return {
    count: list.length,
    total: sum(list),
    matchedCount: matched.length,
    matchedTotal: sum(matched),
    unmatchedCount: unmatched.length,
    unmatchedTotal: sum(unmatched),
  };
}
