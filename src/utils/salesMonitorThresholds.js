// SALES MONITOR — every exception rule's threshold, in ONE place (session 34).
//
// The rules themselves live in utils/salesMonitor.js (buildExceptions). Each
// one reads its numbers from here and nowhere else, so changing "how late is
// late" is a one-line edit that every rule, test and drill picks up together.
//
// Shared thresholds are NOT restated: "won, not invoiced" staleness is
// STALE_INVOICE_DAYS in utils/planningCalculations.js, the rule the Insights
// and Coverage Console exception feeds already use. It is imported, not copied.

import { STALE_INVOICE_DAYS } from 'utils/planningCalculations';

export const SEVERITY = { high: 'high', medium: 'medium', low: 'low' };
export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

export const THRESHOLDS = {
  // ── Plan ──
  /** A submitted plan still pending approval after this many days. */
  approvalPendingDays: 2,

  // ── Visits ──
  /**
   * "No visit logged today" fires only from this hour (Riyadh, 24h): before
   * it, an empty day is a morning that has not happened yet.
   */
  noVisitTodayAfterHour: 14,
  /** "None this week": no visit, call or WhatsApp in this many days. */
  noVisitWeekDays: 7,
  /** A planned customer not contacted by the plan owner in this many days. */
  plannedCustomerSilentDays: 14,
  /**
   * The Saudi working week. "No visit today" does not fire on a day off
   * (getDay(): 5 = Friday, 6 = Saturday).
   */
  daysOff: [5, 6],

  // ── Deals ──
  /** Won, not invoiced, this many days or more — the shared rule. */
  wonNotInvoicedDays: STALE_INVOICE_DAYS,
  /** An open deal is "very large" above this amount (SAR)… */
  largeDealAmount: 1000000,
  /** …or above this share of its owner's monthly target. */
  largeDealShareOfTarget: 0.5,
  /** A plan item bounced this many times or more. */
  bouncedTimes: 2,

  // ── Data ──
  /**
   * A submission's required_plan above this many times the person's target
   * for the month looks wrong (a yearly figure, a typo, a rate of ~0%).
   */
  requiredPlanTargetMultiple: 3,
};

/** Which severity each rule raises. One table, read by every rule. */
export const RULE_SEVERITY = {
  plan_not_submitted: SEVERITY.high,
  plan_below_required: SEVERITY.medium,
  plan_awaiting_approval: SEVERITY.medium,
  plan_rejected: SEVERITY.high,
  no_visit_today: SEVERITY.low,
  no_visit_week: SEVERITY.high,
  planned_customer_silent: SEVERITY.medium,
  negative_no_next_action: SEVERITY.medium,
  deal_past_close: SEVERITY.medium,
  won_not_invoiced: SEVERITY.high,
  large_deal: SEVERITY.low,
  plan_bounced_twice: SEVERITY.medium,
  planned_deal_lost: SEVERITY.high,
  duplicate_invoice: SEVERITY.medium,
  deal_no_division: SEVERITY.low,
  departed_open_work: SEVERITY.medium,
  report_no_customer: SEVERITY.low,
  required_plan_wrong: SEVERITY.medium,
};

/** The group each rule is listed under in the feed. */
export const RULE_GROUP = {
  plan_not_submitted: 'Plan',
  plan_below_required: 'Plan',
  plan_awaiting_approval: 'Plan',
  plan_rejected: 'Plan',
  no_visit_today: 'Visits',
  no_visit_week: 'Visits',
  planned_customer_silent: 'Visits',
  negative_no_next_action: 'Visits',
  deal_past_close: 'Deals',
  won_not_invoiced: 'Deals',
  large_deal: 'Deals',
  plan_bounced_twice: 'Deals',
  planned_deal_lost: 'Deals',
  duplicate_invoice: 'Data',
  deal_no_division: 'Data',
  departed_open_work: 'Data',
  report_no_customer: 'Data',
  required_plan_wrong: 'Data',
};
