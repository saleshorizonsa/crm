import { supabase } from 'lib/supabase';

/**
 * A DEAL IS ABOUT TO BE DELETED — PUT ITS PLAN ITEM BACK FIRST.
 *
 * `opportunities.deal_id` is ON DELETE SET NULL. So deleting a deal used to
 * leave the plan item it came from marked `converted` with nothing behind it:
 * counted as neither plan nor pipeline, its value in no figure on any screen.
 * Production carries 35 such items, 28 of them from the Delete Deal button and
 * 7 from Move to Future Orders.
 *
 * The rule, in one place so no caller can forget it:
 *
 *   1. find the plan items pointing at the deal
 *   2. set them back to a real status, with deal_id and converted_at cleared
 *   3. ONLY THEN delete the deal — and if step 2 fails, do not delete at all
 *
 * Step 3 is the caller's, but it must take its answer from here: a deal
 * deleted after a failed release is exactly the orphan this module exists to
 * prevent, and it cannot be undone afterwards because the link is gone.
 *
 * WHERE IT GOES BACK TO depends on why the deal is going away:
 *
 *   open             the deal was deleted. The work is still to be done this
 *                    month, so the item returns to the plan and counts toward
 *                    planned coverage again.
 *   moved_to_future  the deal was moved to Future Orders. The work has been
 *                    deferred, not abandoned, and the item should not re-enter
 *                    this month's plan. This is the status the app already
 *                    uses for exactly that (leadExpiryCheck's sweep writes it).
 *
 * Both are accepted by `opportunities_status_check` on production, verified
 * read-only before this was written:
 *   CHECK (status = ANY (ARRAY['open','converted','won','lost','moved_to_future']))
 *
 * ONLY ITEMS STILL LINKED TO THE DEAL ARE TOUCHED. The 35 existing orphans
 * have deal_id NULL already, so no filter here can match them — they are a
 * separate cleanup decision and this must not pre-empt it.
 */

/** The status a released item goes back to. */
export const RELEASE_STATUS = {
  /** The deal was deleted: the work is still due this month. */
  deleted: 'open',
  /** The deal was moved to Future Orders: deferred, not back in this month. */
  movedToFuture: 'moved_to_future',
};

const VALID = Object.values(RELEASE_STATUS);

/**
 * The plan items a deal was converted from, for a dialog that has to name
 * them before anyone presses Delete.
 *
 * @param {string} dealId
 * @returns {Promise<{data: object[], error: object|null}>}
 */
export async function fetchPlanItemsForDeal(dealId) {
  if (!dealId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('opportunities')
    .select('id, owner_id, customer_name, planned_amount, expected_month, status')
    .eq('deal_id', dealId);
  if (error) {
    console.error('fetchPlanItemsForDeal:', error);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

/**
 * Put every plan item linked to this deal back, BEFORE the deal is deleted.
 *
 * Returns `{ error }` on failure and the caller must then leave the deal
 * alone. A zero-item deal is a success with `released: 0` — most deals were
 * never planned, and that is not a reason to block a delete.
 *
 * @param {string} dealId
 * @param {string} status  one of RELEASE_STATUS
 * @returns {Promise<{released: number, items: object[], error: object|null}>}
 */
export async function releasePlanItemsForDeal(dealId, status = RELEASE_STATUS.deleted) {
  if (!dealId) return { released: 0, items: [], error: null };
  if (!VALID.includes(status)) {
    // A status the CHECK constraint would reject must not reach the database:
    // the update would fail, the caller would abandon the delete, and the user
    // would see a delete that silently does nothing.
    const error = new Error(`releasePlanItemsForDeal: refusing to write status "${status}"`);
    console.error(error.message);
    return { released: 0, items: [], error };
  }

  // The read is for the COUNT and the dialog text only — never a gate.
  //
  // RLS reads and writes this table through different policies:
  // `opportunities_select_scoped` is owner / subtree / manager-scoped, while
  // `opportunities_update_company` is company-wide. So the read can come back
  // empty for somebody whose delete the `deals` policy still allows, and
  // gating the update on it would let that delete through and mint a fresh
  // orphan — the exact bug this module exists to prevent. The update is keyed
  // on deal_id and runs regardless; it matches nothing when there is nothing
  // to match, which costs one query on a deal that was never planned.
  const { data: items } = await fetchPlanItemsForDeal(dealId);

  const { error } = await supabase
    .from('opportunities')
    .update({
      status,
      deal_id: null,
      // The conversion is being undone, so the date it converted is no longer
      // true. Weekly pacing buckets by converted_at, and a cleared deal_id
      // with a date left behind would put a conversion that did not happen
      // into a week's bar.
      converted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('deal_id', dealId);

  if (error) {
    console.error('releasePlanItemsForDeal:', error);
    return { released: 0, items: items || [], error };
  }
  // `released` is what the READ could see, so it can under-report for a viewer
  // the select policy narrows. The update covered every row either way.
  return { released: (items || []).length, items: items || [], error: null };
}

/**
 * PUT THE ITEMS BACK THE WAY THEY WERE, because the delete did not happen.
 *
 * The release goes first so that a deal is never deleted with an item still
 * pointing at it. That leaves the other order of failure to answer for: the
 * item released, then the delete refused. The deal is still there and its item
 * now reads `open` with no link — an item that looks unplanned beside a live
 * deal, which is the same lie as the orphan, told the other way round.
 *
 * So the caller restores. Each row goes back to the exact status, deal_id and
 * converted_at it was read with, by id.
 *
 * BEST EFFORT, AND HONEST ABOUT IT: `items` is what the SELECT policy let the
 * caller see. For the owner of the deal — which is every linked item on
 * production — that is all of them. For a viewer the policy narrows it could
 * be fewer, and what was not read cannot be put back; the caller is told the
 * restore failed so the message can say so rather than claim nothing happened.
 *
 * @param {object[]} items  rows as returned by releasePlanItemsForDeal
 * @returns {Promise<{restored: number, error: object|null}>}
 */
export async function restorePlanItems(items) {
  if (!items?.length) return { restored: 0, error: null };

  const results = await Promise.all(items.map(async (o) => {
    const { error } = await supabase
      .from('opportunities')
      .update({
        status: o.status,
        deal_id: o.deal_id,
        converted_at: o.converted_at ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', o.id);
    return error || null;
  }));

  const failed = results.filter(Boolean);
  if (failed.length) {
    console.error('restorePlanItems: could not restore', failed.length, 'of', items.length, failed[0]);
    return { restored: items.length - failed.length, error: failed[0] };
  }
  return { restored: items.length, error: null };
}

/**
 * One line naming what a delete will do to the plan, for the confirm dialog.
 * Returns null when the deal came from no plan item.
 */
export function planItemWarning(items, status = RELEASE_STATUS.deleted) {
  if (!items?.length) return null;
  const money = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
  const month = (v) => {
    if (!v) return 'no month';
    const [y, m] = String(v).split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-GB', {
      month: 'long', year: 'numeric',
    });
  };
  const named = items
    .map((o) => `${o.customer_name || 'an unnamed customer'} (${money(o.planned_amount)}, ${month(o.expected_month)})`)
    .join('; ');
  const back = status === RELEASE_STATUS.movedToFuture
    ? 'Moving it marks the item as moved to a later month.'
    : 'Deleting it returns the item to the plan as open.';
  return `This deal came from plan item ${named}. ${back}`;
}
