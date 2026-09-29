import { supabase } from 'lib/supabase';

// Achievement for CLIENT targets.
//
// Simpler than the product-group rule: a deal belongs to exactly one contact,
// so achieved-per-client is a plain sum with no double counting. Contrast
// utils/productGroupAchievement.js, where one deal can count in full toward
// several groups because it can contain lines from several.
//
// Same definition of "achieved" as everywhere else in the app: won AND
// invoiced, windowed by invoice_date, valued at final_amount when the price was
// renegotiated, else amount.

/**
 * Achieved value per contact for one owner (or several) in a period.
 *
 * @returns {Promise<Record<string, number>>} contact_id -> achieved value
 */
export async function achievedByClient({ companyId, ownerIds = null, start, end }) {
  if (!companyId || !start || !end) return {};

  let q = supabase
    .from('deals')
    .select('contact_id, amount, final_amount')
    .eq('company_id', companyId)
    .eq('stage', 'won')
    .eq('is_invoiced', true)
    .gte('invoice_date', start)
    .lte('invoice_date', end)
    .not('contact_id', 'is', null);
  if (Array.isArray(ownerIds)) {
    if (!ownerIds.length) return {};
    q = q.in('owner_id', ownerIds);
  }

  const { data, error } = await q;
  if (error) {
    console.error('clientTargetAchievement:', error);
    return {};
  }

  const per = {};
  (data || []).forEach((d) => {
    const v = parseFloat(d.final_amount ?? d.amount) || 0;
    per[d.contact_id] = (per[d.contact_id] || 0) + v;
  });

  // Net off returns dated in this window, charged to the CLIENT of the deal
  // the credit note was matched to — not to the ERP customer_id on the return
  // row, which is a different identifier space from contacts.id. A return whose
  // invoice never matched has no deal and so no client, and is excluded by the
  // inner join; it still reduces company Achieved, just not any one client's.
  let rq = supabase
    .from('deal_returns')
    .select('return_amount, deals!inner(contact_id, owner_id)')
    .eq('company_id', companyId)
    .gte('return_date', start)
    .lte('return_date', end)
    .not('deals.contact_id', 'is', null);
  if (Array.isArray(ownerIds)) rq = rq.in('deals.owner_id', ownerIds);
  const { data: retRows, error: retErr } = await rq;
  if (retErr) {
    // Degrade to gross rather than returning nothing — the pre-returns answer.
    console.error('clientTargetAchievement returns:', retErr);
    return per;
  }
  (retRows || []).forEach((r) => {
    const cid = r.deals?.contact_id;
    if (!cid) return;
    const v = Math.abs(parseFloat(r.return_amount) || 0);
    per[cid] = (per[cid] || 0) - v;
  });
  return per;
}

/** Achieved for one owner + one contact. */
export async function achievedForClient({ companyId, ownerId, contactId, start, end }) {
  if (!companyId || !ownerId || !contactId) return 0;
  const map = await achievedByClient({ companyId, ownerIds: [ownerId], start, end });
  return map[contactId] || 0;
}
