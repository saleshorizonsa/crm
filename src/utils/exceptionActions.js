/**
 * WHAT CLEARS EACH EXCEPTION (session 39, CEO 2026-11-16).
 *
 * One line per rule of buildExceptions (utils/salesMonitor.js): what has to
 * happen for the exception to go away, and the screen where it is done. A rule
 * whose fix has no screen of its own (a visit is logged on the phone) has no
 * `to`, and the feed shows the line without a button.
 *
 *   to: 'deal'       the deal in the pipeline (/sales-pipeline, openDealId)
 *       'planning'   Planning (/planning)
 *       'approvals'  Planning → Plans Awaiting Approval (/planning#approvals)
 *       'reassign'   Reassign records (/reassign-records)
 *       'audit'      Insights → Contact Reports — Audit (/insights#contact-audit)
 *       'person'     the salesman's own sheet on the Sales Monitor
 *
 * Nothing here decides whether an exception exists; the rules and their
 * thresholds stay in salesMonitor.js and salesMonitorThresholds.js.
 */

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (monthStart) => MONTH_LONG[Number(String(monthStart || '').slice(5, 7)) - 1] || 'month\'s';

export const EXCEPTION_ACTIONS = {
  plan_not_submitted: { text: ({ monthStart }) => `Submit the ${monthName(monthStart)} plan`, to: 'planning', button: 'Open Planning' },
  plan_below_required: { text: () => 'Add plan items up to the required plan', to: 'planning', button: 'Open Planning' },
  plan_awaiting_approval: { text: () => 'Approve or reject the plan', to: 'approvals', button: 'Plans Awaiting Approval' },
  plan_rejected: { text: () => 'Revise and resubmit the plan', to: 'planning', button: 'Open Planning' },
  required_plan_wrong: { text: () => 'Check the required plan with its owner', to: 'person', button: 'Open the salesman' },
  no_visit_today: { text: () => 'Log today\'s visits, calls or WhatsApps', to: 'person', button: 'Open the salesman' },
  no_visit_week: { text: () => 'Visit customers and log the visits', to: 'person', button: 'Open the salesman' },
  planned_customer_silent: { text: () => 'Contact the customer and log it', to: 'planning', button: 'Open Planning' },
  negative_no_next_action: { text: () => 'Agree a next action with the customer', to: 'deal', button: 'Open the deal' },
  deal_past_close: { text: () => 'Re-date or close the deal', to: 'deal', button: 'Open the deal' },
  won_not_invoiced: { text: () => 'Mark as invoiced', to: 'deal', button: 'Open the deal' },
  large_deal: { text: () => 'Review the deal with its owner', to: 'deal', button: 'Open the deal' },
  plan_bounced_twice: { text: () => 'Re-plan the item or drop it', to: 'planning', button: 'Open Planning' },
  planned_deal_lost: { text: () => 'Review why the deal was lost', to: 'deal', button: 'Open the deal' },
  duplicate_invoice: { text: () => 'Correct the invoice number', to: 'deal', button: 'Open the deal' },
  deal_no_division: { text: () => 'Set the deal\'s division', to: 'deal', button: 'Open the deal' },
  departed_open_work: { text: () => 'Reassign the open work', to: 'reassign', button: 'Reassign records' },
  report_no_customer: { text: () => 'Link the report to a customer', to: 'person', button: 'Open the salesman' },
  // Session 40.
  reports_not_audited: { text: () => 'Audit them in Insights → Contact Reports — Audit', to: 'audit', button: 'Contact Reports — Audit' },
};

/**
 * The clearing action of one exception: { text, to, button } — `to` null when
 * the target screen does not exist for this exception (e.g. "Open the deal"
 * for a negative visit that has no deal).
 */
export function exceptionAction(e, { monthStart } = {}) {
  const a = EXCEPTION_ACTIONS[e?.rule];
  if (!a) return { text: 'Review it', to: null, button: null };
  const to = a.to === 'deal' && !e.record?.dealId ? null : a.to;
  return { text: a.text({ monthStart, e }), to, button: to ? a.button : null };
}

/** Where a target goes: a react-router navigate() argument, or null. */
export function actionTarget(to, e) {
  if (to === 'deal' && e?.record?.dealId) return { path: '/sales-pipeline', state: { openDealId: e.record.dealId } };
  if (to === 'planning') return { path: '/planning' };
  if (to === 'approvals') return { path: '/planning', hash: '#approvals' };
  if (to === 'reassign') return { path: '/reassign-records' };
  // Insights opens the "Contact Reports — Audit" panel on #contact-audit (session 40).
  if (to === 'audit') return { path: '/insights', hash: '#contact-audit' };
  return null;
}
