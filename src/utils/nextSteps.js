import { supabase } from 'lib/supabase';
import { SLA_DAYS } from 'utils/leadExpiryCheck';
import { deadlineFor } from 'utils/planMonths';
import { riyadhToday } from 'utils/visits';

/**
 * NEXT STEPS FOR SALESMEN — every text in ONE place (session 40, CEO
 * 2026-11-16).
 *
 * After a save succeeds, the screen that saved calls emitNextStep({ kind, … })
 * (utils/nextStepBus.js). NextStepPanel turns the event into one line and,
 * where the screen exists, one button — by resolveNextStep below. Nothing here
 * writes, and every read is allowed to fail: the panel then shows the line
 * without the part it could not work out. It never blocks a save.
 *
 *   kind               when
 *   planItemAdded      a plan item was added to the month's plan
 *   planSubmitted      the month's plan was submitted
 *   planRejected       Planning opened on a rejected, not resubmitted plan
 *   leadCreated        a plan item converted to a lead, or a new lead created
 *   stageChanged       a deal moved to contact_made / proposal_sent /
 *                      negotiation / won / lost
 *   invoiced           a deal was marked invoiced
 *   movedToFuture      a deal or plan item was moved to a later month
 *   visitLogged        a visit, call or WhatsApp was logged
 *   collectionLogged   a collection contact was logged (no amount: 40a)
 */

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = (s) => String(s).slice(0, 10).split('-').map(Number);
const ymd = (d) => d.toISOString().slice(0, 10);
export const addDaysTo = (day, n) => { const [y, m, d] = parts(day); return ymd(new Date(Date.UTC(y, m - 1, d + n))); };
const daysFromTo = (a, b) => { const [y1, m1, d1] = parts(a); const [y2, m2, d2] = parts(b); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };
/** "19 Nov" */
export const dayText = (day) => { if (!day) return null; const [, m, d] = parts(day); return `${d} ${MONTH[m - 1]}`; };
/** "December 2026" */
export const monthText = (day) => { if (!day) return null; const [y, m] = parts(day); return `${MONTH_LONG[m - 1]} ${y}`; };
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The texts. Each takes what resolveNextStep worked out and returns the line. */
export const NEXT_STEP_TEXT = {
  planItemAdded: ({ deadline, daysLeft }) => (daysLeft >= 0
    ? `Add your other customers, then Submit Plan by the ${ordinal(parts(deadline)[2])} (${plural(daysLeft, 'day')} left)`
    : `Add your other customers, then Submit Plan — the deadline (the ${ordinal(parts(deadline)[2])}) has passed`),
  planSubmitted: () => 'Convert plan items to leads as customers engage',
  planRejected: ({ reason }) => `Revise and resubmit: ${reason || 'no reason was given'}`,
  leadCreated: ({ moveDate }) => `Contact the customer within ${SLA_DAYS} days and move to Contact Made, or it moves to Future Orders on ${dayText(moveDate)}`,
  contact_made: () => 'Send the proposal, then move to Proposal Sent',
  proposal_sent: ({ followUp }) => `Follow up by ${dayText(followUp)}; then Negotiation`,
  negotiation: () => 'Close it: Won or Lost',
  won: () => 'Mark as Invoiced when the ERP invoice is raised',
  invoiced: ({ nextOrder }) => (nextOrder
    ? `Next order for this customer expected around ${dayText(nextOrder)}: add it to next month's plan`
    : 'Next order for this customer: add it to next month\'s plan when it is expected (too few past invoices to tell when)'),
  lost: () => 'Project postponed? Use Move to Future; otherwise plan a follow-up visit',
  movedToFuture: ({ month }) => `It returns to your plan in ${monthText(month) || 'a later month'}`,
  visitLogged: ({ nextAction, followUp }) => `${nextAction || 'Follow up'} by ${dayText(followUp) || 'the follow-up date'}`,
  visitOpenDeal: () => 'Open a deal or add to plan',
  collectionLogged: ({ followUp }) => `Collection visit logged. Next collection: ${dayText(followUp) || 'not set'}`,
};

/** Where a button goes: a react-router target. */
const TO = {
  pipeline: (dealId) => ({ path: '/sales-pipeline', state: dealId ? { openDealId: dealId } : undefined }),
  planning: () => ({ path: '/planning' }),
};

/**
 * A customer's usual gap between invoices, in days: the median gap between
 * the dates of its invoiced deals (at least three invoices, so two gaps).
 * Pure, for the tests.
 */
export function usualGapDays(invoiceDates) {
  const days = [...new Set((invoiceDates || []).filter(Boolean).map((d) => String(d).slice(0, 10)))].sort();
  if (days.length < 3) return null;
  const gaps = days.slice(1).map((d, i) => daysFromTo(days[i], d)).filter((g) => g > 0).sort((a, b) => a - b);
  if (!gaps.length) return null;
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

/**
 * One event → { kind, text, button? , extra? }. Async: some lines need a
 * read. Never throws.
 */
export async function resolveNextStep(e, { now = new Date() } = {}) {
  const today = riyadhToday(now);
  try {
    switch (e.kind) {
      case 'planItemAdded': {
        const month = e.month || `${today.slice(0, 7)}-01`;
        const deadline = deadlineFor(month);
        return { kind: e.kind, text: NEXT_STEP_TEXT.planItemAdded({ deadline, daysLeft: daysFromTo(today, deadline) }) };
      }
      case 'planSubmitted':
        return { kind: e.kind, text: NEXT_STEP_TEXT.planSubmitted(), button: { label: 'Open the pipeline', to: TO.pipeline() } };
      case 'planRejected':
        return { kind: e.kind, text: NEXT_STEP_TEXT.planRejected({ reason: e.reason }) };
      case 'leadCreated': {
        // The 3-day sweep's own clock: from when the lead entered the Lead stage.
        const from = String(e.createdAt || now.toISOString()).slice(0, 10);
        return {
          kind: e.kind,
          text: NEXT_STEP_TEXT.leadCreated({ moveDate: addDaysTo(from, SLA_DAYS) }),
          button: e.dealId ? { label: 'Open the lead', to: TO.pipeline(e.dealId) } : null,
        };
      }
      case 'stageChanged': {
        const s = e.stage;
        if (s === 'lead') return resolveNextStep({ kind: 'leadCreated', dealId: e.deal?.id, createdAt: now.toISOString() }, { now });
        if (s === 'proposal_sent') {
          return { kind: s, text: NEXT_STEP_TEXT.proposal_sent({ followUp: e.followUp || addDaysTo(today, 7) }) };
        }
        if (s === 'won') return { kind: s, text: NEXT_STEP_TEXT.won(), button: e.deal?.id ? { label: 'Open the deal', to: TO.pipeline(e.deal.id) } : null };
        if (s === 'lost') return { kind: s, text: NEXT_STEP_TEXT.lost(), button: e.deal?.id ? { label: 'Open the deal', to: TO.pipeline(e.deal.id) } : null };
        if (NEXT_STEP_TEXT[s]) return { kind: s, text: NEXT_STEP_TEXT[s]() };
        return null;
      }
      case 'invoiced': {
        let nextOrder = null;
        const contactId = e.deal?.contact_id || e.contactId || null;
        const invoiceDate = String(e.invoiceDate || e.deal?.invoice_date || today).slice(0, 10);
        if (contactId) {
          const { data } = await supabase.from('deals').select('invoice_date')
            .eq('contact_id', contactId).eq('is_invoiced', true).not('invoice_date', 'is', null);
          const gap = usualGapDays([...(data || []).map((d) => d.invoice_date), invoiceDate]);
          if (gap) nextOrder = addDaysTo(invoiceDate, gap);
        }
        return { kind: e.kind, text: NEXT_STEP_TEXT.invoiced({ nextOrder }), button: { label: 'Open Planning', to: TO.planning() } };
      }
      case 'movedToFuture':
        return { kind: e.kind, text: NEXT_STEP_TEXT.movedToFuture({ month: e.month }) };
      case 'collectionLogged':
        return { kind: e.kind, text: NEXT_STEP_TEXT.collectionLogged({ followUp: e.followUp }) };
      case 'visitLogged': {
        const out = { kind: e.kind, text: NEXT_STEP_TEXT.visitLogged({ nextAction: e.nextAction, followUp: e.followUp }) };
        if (e.response === 'positive' && e.contactId) {
          const monthStart = `${today.slice(0, 7)}-01`;
          const [deals, items] = await Promise.all([
            supabase.from('deals').select('id').eq('contact_id', e.contactId).not('stage', 'in', '("won","lost")').limit(1),
            supabase.from('opportunities').select('id').eq('contact_id', e.contactId).eq('status', 'open').gte('expected_month', monthStart).limit(1),
          ]);
          if (!deals.error && !items.error && !(deals.data || []).length && !(items.data || []).length) {
            out.extra = { text: NEXT_STEP_TEXT.visitOpenDeal(), buttons: [{ label: 'Open the pipeline', to: TO.pipeline() }, { label: 'Open Planning', to: TO.planning() }] };
          }
        }
        return out;
      }
      default:
        return null;
    }
  } catch (_) {
    return null;
  }
}
