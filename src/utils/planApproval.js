import { supabase } from 'lib/supabase';
import { fetchTeamHierarchy } from 'utils/teamHierarchy';

// Manager approval workflow for monthly sales plans.
//
// Every function here degrades safely when
// migrations/add_plan_approval_workflow.sql has not been applied yet: Postgres
// answers an unknown column with 42703, which we treat as "feature not enabled"
// rather than an error. That keeps Planning usable on an un-migrated database
// instead of throwing on every render.
const UNDEFINED_COLUMN = '42703';

export const isMissingApprovalSchema = (error) => error?.code === UNDEFINED_COLUMN;

// First day of the current month as yyyy-MM-01 — the plan_month key.
export function currentPlanMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const DIRECTOR_ROLES = ['director', 'admin', 'head'];
const TEAM_ROLES = ['manager', 'supervisor'];

// The company-wide fallback reviewer, used for anyone with no supervisor_id at
// all. Without it their plan would notify nobody and appear in nobody's queue.
const LEAD_ROLES = ['manager', 'supervisor', 'director', 'head', 'admin'];

// Is this supervisor an active user ANYWHERE, not just inside one company?
//
// Supervisors legitimately sit in another company: Nader is a group director
// over JASCO PVC, IMDADAT and JASCO Steels, so IMDADAT's manager has a
// supervisor_id pointing outside his own company — correct data, confirmed with
// the business owner. A company-scoped active check reads that as "has no
// manager" and hands the plan to the company fallback; in a company whose only
// lead IS that manager, the fallback is HIMSELF, so he would approve his own
// plan. resolveApprover() never had this problem because it looks the approver
// up by id with no company filter. This keeps the map and the scope agreeing
// with it, and with the SQL trigger, which also reads the column directly.
async function activeApproverIds(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return new Set();
  const { data } = await supabase
    .from('users')
    .select('id')
    .in('id', list)
    .eq('is_active', true);
  return new Set((data || []).map((u) => u.id));
}

// Manager first, then supervisor, then director/head/admin. A company with no
// manager or supervisor legitimately resolves to its director — in that case
// the director IS the assigned approver and may act.
function pickFallback(users) {
  // Sorted by id so the pick is deterministic and matches the SQL trigger in
  // add_plan_approval_guard.sql, which orders by (role priority, id). Without
  // this, two managers could yield different approvers in JS and in Postgres.
  const leads = (users || [])
    .filter((u) => LEAD_ROLES.includes(u.role))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!leads.length) return null;
  const byRole = (r) => leads.find((u) => u.role === r)?.id;
  return byRole('manager') || byRole('supervisor') || byRole('director') || byRole('head') || byRole('admin') || null;
}

// Only ACTIVE leads can be the fallback: a deactivated manager must never be
// handed someone's plan to approve, because nobody would ever act on it and
// assertCanDecide() would then reject every other user who tried.
async function companyFallbackApprover(companyId) {
  const { data } = await supabase
    .from('users')
    .select('id, role')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('role', LEAD_ROLES);
  return pickFallback(data);
}

// ownerId -> approverId for many owners in one round trip, so the approvals
// screen can decide per card who may act without N queries.
export async function resolveApproverMap(companyId, ownerIds) {
  const map = {};
  if (!companyId || !ownerIds?.length) return map;
  const { data: users } = await supabase
    .from('users')
    .select('id, role, supervisor_id')
    .eq('company_id', companyId)
    .eq('is_active', true);
  const fallback = pickFallback(users);
  // Only active users are fetched, so this set is the test for "is this
  // person's supervisor still active?". A supervisor_id pointing at someone
  // deactivated resolves to the company fallback rather than to a person who
  // can no longer act — otherwise their whole team's plans become unapprovable.
  const activeIds = new Set((users || []).map((u) => u.id));
  // ...and a supervisor in ANOTHER company is still a valid approver.
  const elsewhere = await activeApproverIds(
    (users || []).map((u) => u.supervisor_id).filter((id) => id && !activeIds.has(id)),
  );
  const isUsableApprover = (id) => !!id && (activeIds.has(id) || elsewhere.has(id));
  for (const id of ownerIds) {
    const u = (users || []).find((x) => x.id === id);
    map[id] = isUsableApprover(u?.supervisor_id) ? u.supervisor_id : fallback;
  }
  return map;
}

// Authorization for a decision on one submission. Seeing a plan (directors see
// the whole company) is deliberately not the same as being able to decide it:
// only the approver resolveApprover picked for THAT salesman may act. Checked
// here rather than in the component so it holds for every caller.
async function assertIsApprover({ submissionId, companyId, actorId }) {
  const { data: sub } = await supabase
    .from('plan_submissions')
    .select('owner_id')
    .eq('id', submissionId)
    .maybeSingle();
  if (!sub?.owner_id) return { error: { message: 'Plan not found.' } };
  const approverId = await resolveApprover(companyId, sub.owner_id);
  if (!approverId || approverId !== actorId) {
    return { error: { message: 'Only the assigned Sales Manager can approve or reject this plan.' } };
  }
  return { error: null };
}

// Who reviews this salesman's plan: their manager, else the company fallback.
export async function resolveApprover(companyId, ownerId) {
  if (!companyId || !ownerId) return null;
  const { data: me } = await supabase
    .from('users')
    .select('supervisor_id')
    .eq('id', ownerId)
    .maybeSingle();
  // The owner's own status is irrelevant — a deactivated person's already-filed
  // plan still needs a reviewer. What matters is that the REVIEWER is active:
  // returning a deactivated manager would leave the plan permanently stuck,
  // since assertCanDecide() authorises only the resolved approver.
  if (me?.supervisor_id) {
    const { data: approver } = await supabase
      .from('users')
      .select('id')
      .eq('id', me.supervisor_id)
      .eq('is_active', true)
      .maybeSingle();
    if (approver?.id) return approver.id;
  }
  return companyFallbackApprover(companyId);
}

// The owner ids whose plans this user reviews — the exact inverse of
// resolveApprover, so a notified approver always finds the plan in their
// queue. Directors see the whole company; a manager/supervisor sees their
// downline, plus every unassigned user if they are the company fallback.
export async function resolveApproverScope({ companyId, userId, role }) {
  if (!companyId || !userId) return [];

  if (DIRECTOR_ROLES.includes(role)) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true);
    return (data || []).map((u) => u.id);
  }
  if (!TEAM_ROLES.includes(role)) return [];

  const team = await fetchTeamHierarchy({ companyId, userId, role });
  const ids = new Set(team.map((m) => m.id).filter(Boolean));

  if ((await companyFallbackApprover(companyId)) === userId) {
    // Everyone resolveApprover() hands to the fallback must appear here, or a
    // plan gets routed to an approver whose queue never shows it. That is two
    // groups, not one:
    //   a) supervisor_id IS NULL   — never had a manager
    //   b) supervisor_id points at a DEACTIVATED user — orphaned by a deactivation.
    // Group (b) matters because fetchTeamHierarchy() walks active users only, so
    // an orphan is unreachable from any manager's downline and would otherwise
    // fall out of every queue in the company.
    //
    // A supervisor in ANOTHER company is NOT an orphan: this query is company
    // scoped, so a cross-company supervisor (IMDADAT's manager -> Nader) is
    // absent from activeIds and would otherwise be swept in here, putting that
    // plan in two queues at once — the fallback's and the real approver's.
    const { data: companyUsers } = await supabase
      .from('users')
      .select('id, supervisor_id, is_active')
      .eq('company_id', companyId);
    const activeIds = new Set(
      (companyUsers || []).filter((u) => u.is_active).map((u) => u.id),
    );
    const elsewhere = await activeApproverIds(
      (companyUsers || [])
        .filter((u) => u.is_active)
        .map((u) => u.supervisor_id)
        .filter((id) => id && !activeIds.has(id)),
    );
    (companyUsers || [])
      .filter((u) => u.id !== userId && u.is_active)
      .filter((u) => !u.supervisor_id
        || !(activeIds.has(u.supervisor_id) || elsewhere.has(u.supervisor_id)))
      .forEach((u) => ids.add(u.id));
  }
  return [...ids];
}
// Best-effort notification insert. Mirrors leadExpiryCheck.notify: metadata is
// passed as an object, NOT JSON.stringify'd — the column is jsonb, and a
// stringified payload would store a JSON *string* that metadata?.field could
// not read back. Never throws; a failed notification must not fail the action.
async function notify({ userId, companyId, type, title, message, metadata }) {
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      company_id: companyId,
      type,
      title,
      message,
      metadata: metadata || null,
      is_read: false,
    });
  } catch (_) { /* best-effort */ }
}

const fmtSAR = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const monthLabel = (planMonth) =>
  new Date(`${planMonth}T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });

// ── Lock ────────────────────────────────────────────────────────────────────
// True only when an approved plan has locked the month. Any error — including
// the pre-migration 42703 — resolves to false, so a missing column can never
// lock a salesman out of their own plan.
export async function isPlanLocked(ownerId, planMonth = currentPlanMonth()) {
  if (!ownerId) return false;
  const { data, error } = await supabase
    .from('plan_submissions')
    .select('is_locked')
    .eq('owner_id', ownerId)
    .eq('plan_month', planMonth)
    .maybeSingle();
  if (error) return false;
  return data?.is_locked === true;
}

// Guard for opportunity create/update/delete. Returns true when the caller
// should stop. Managers and above are never blocked by a subordinate's lock.
export async function blockIfPlanLocked({ ownerId, role, planMonth = currentPlanMonth() }) {
  if (role && role !== 'salesman') return false;
  const locked = await isPlanLocked(ownerId, planMonth);
  if (locked) {
    alert('Your plan for this month is locked. Contact your manager if changes are needed.');
  }
  return locked;
}

// ── Conversion gate ─────────────────────────────────────────────────────────
// An opportunity may only become a deal once the OWNER's plan for THAT
// opportunity's month has been approved. Until this existed, conversion was
// unrestricted and salesmen were converting against months they had never
// submitted a plan for.
//
// Note this is the opposite polarity to isPlanLocked above: that one guards
// EDITING and fails open, because a missing row must never lock someone out of
// their own plan. This one guards CONVERSION, where a missing row means nothing
// was ever planned or approved, so it fails closed.

/** The plan_month key for an opportunity's expected_month (first of that month). */
export function planMonthForDate(value) {
  if (!value) return null;
  const s = String(value);
  // Already a yyyy-MM-* date string: take the month directly rather than
  // constructing a Date, which would apply the local timezone to a date-only
  // value and could roll it back a day (and so a month, on the 1st).
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-01`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return currentPlanMonth(d);
}

// Roles the gate applies to. Salesmen and supervisors both own opportunities
// and both submit plans; managers and above are not gated, matching the
// existing lock guard.
const CONVERSION_GATED_ROLES = ['salesman', 'supervisor'];

/**
 * The owner's plan state for one month.
 * @returns {{ allowed:boolean, reason:string, status:string|null }}
 *   reason ∈ approved | no_plan | unsubmitted | pending | rejected |
 *            schema_missing | lookup_failed | no_month | no_owner
 */
export async function planApprovalState(ownerId, planMonth) {
  if (!ownerId) return { allowed: true, reason: 'no_owner', status: null };
  if (!planMonth) return { allowed: true, reason: 'no_month', status: null };

  const { data, error } = await supabase
    .from('plan_submissions')
    .select('approval_status, is_submitted')
    .eq('owner_id', ownerId)
    .eq('plan_month', planMonth)
    .maybeSingle();

  // The approval migration not being applied is "feature off", not "block
  // everyone" — the same rule the rest of this module follows.
  if (isMissingApprovalSchema(error)) return { allowed: true, reason: 'schema_missing', status: null };
  // Any other error must NOT silently permit the thing the gate exists to stop.
  if (error) return { allowed: false, reason: 'lookup_failed', status: null };

  if (!data) return { allowed: false, reason: 'no_plan', status: null };
  if (data.approval_status === 'approved') return { allowed: true, reason: 'approved', status: 'approved' };
  if (data.approval_status === 'rejected') return { allowed: false, reason: 'rejected', status: 'rejected' };
  if (!data.is_submitted) return { allowed: false, reason: 'unsubmitted', status: data.approval_status || null };
  return { allowed: false, reason: 'pending', status: data.approval_status || 'pending' };
}

/** What to tell the user, naming the month and the actual thing standing in the way. */
export function conversionBlockedMessage(reason, planMonth) {
  const month = planMonth ? monthLabel(planMonth) : 'this month';
  switch (reason) {
    case 'no_plan':
      return `${month}'s plan must be approved before converting to a deal. No plan has been submitted for ${month} yet.`;
    case 'unsubmitted':
      return `${month}'s plan must be approved before converting to a deal. It has not been submitted yet.`;
    case 'pending':
      return `${month}'s plan must be approved before converting to a deal. It is submitted and waiting for your manager.`;
    case 'rejected':
      return `${month}'s plan must be approved before converting to a deal. It was sent back — revise it and submit again.`;
    case 'lookup_failed':
      return `Could not check whether ${month}'s plan is approved, so the conversion was not made. Please try again.`;
    default:
      return `${month}'s plan must be approved before converting to a deal.`;
  }
}

/**
 * Guard for converting an opportunity into a deal/lead. Returns true when the
 * caller should stop, having already told the user why.
 */
export async function blockIfPlanNotApproved({ ownerId, role, planMonth, notify = alert }) {
  if (role && !CONVERSION_GATED_ROLES.includes(role)) return false;
  const { allowed, reason } = await planApprovalState(ownerId, planMonth);
  if (allowed) return false;
  notify(conversionBlockedMessage(reason, planMonth));
  return true;
}

// ── Submit ──────────────────────────────────────────────────────────────────
// Called after plan_submissions has been upserted with is_submitted = true.
// Sends the notification that never existed before.
export async function notifyPlanSubmitted({ companyId, ownerId, ownerName, planMonth, totalPlanned, submissionId }) {
  const approverId = await resolveApprover(companyId, ownerId);
  await notify({
    userId: approverId,
    companyId,
    type: 'plan_submitted',
    title: '📋 Plan Submitted for Review',
    message: `${ownerName || 'A salesman'} submitted their ${monthLabel(planMonth)} sales plan. Total planned: ${fmtSAR(totalPlanned)} SAR. Please review and approve.`,
    metadata: { plan_submission_id: submissionId || null, owner_id: ownerId, plan_month: planMonth },
  });
  return approverId;
}

// ── Approve / reject ────────────────────────────────────────────────────────
export async function approvePlan({ submissionId, ownerId, companyId, approverId }) {
  const guard = await assertIsApprover({ submissionId, companyId, actorId: approverId });
  if (guard.error) return guard;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('plan_submissions')
    .update({
      approval_status: 'approved',
      approved_by: approverId,
      approved_at: now,
      is_locked: true,
      updated_at: now,
    })
    .eq('id', submissionId);
  if (error) return { error };

  await notify({
    userId: ownerId,
    companyId,
    type: 'plan_approved',
    title: '✅ Your Plan Was Approved',
    message: 'Your sales plan has been approved and is now locked for the month.',
    metadata: { plan_submission_id: submissionId },
  });
  return { error: null };
}

// Rejection clears is_submitted so the salesman can edit and resubmit — the
// existing canSubmit gate in planning/index.jsx keys off !is_submitted, so this
// reopens the plan without any further change there. is_locked is cleared too,
// in case the plan was approved and then sent back.
export async function rejectPlan({ submissionId, ownerId, companyId, reason, actorId }) {
  const guard = await assertIsApprover({ submissionId, companyId, actorId });
  if (guard.error) return guard;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('plan_submissions')
    .update({
      approval_status: 'rejected',
      rejection_reason: reason,
      is_submitted: false,
      is_locked: false,
      updated_at: now,
    })
    .eq('id', submissionId);
  if (error) return { error };

  await notify({
    userId: ownerId,
    companyId,
    type: 'plan_rejected',
    title: '❌ Your Plan Needs Changes',
    message: `Your manager sent back your plan: "${reason}". Please revise and resubmit.`,
    metadata: { plan_submission_id: submissionId, rejection_reason: reason },
  });
  return { error: null };
}

// ── Pending queue ───────────────────────────────────────────────────────────
// Returns { rows, schemaMissing }. schemaMissing is how callers know to show
// the "migration not applied" state instead of an empty queue, so a pending
// plan is never silently hidden.
export async function fetchPendingApprovals({ companyId, ownerIds }) {
  if (!companyId || !ownerIds?.length) return { rows: [], schemaMissing: false };
  const { data, error } = await supabase
    .from('plan_submissions')
    .select('id, plan_month, total_planned, required_plan, submitted_at, approval_status, owner_id, owner:users!owner_id(id, full_name)')
    .eq('company_id', companyId)
    .in('owner_id', ownerIds)
    .eq('approval_status', 'pending')
    .eq('is_submitted', true)
    .order('submitted_at', { ascending: false });

  if (isMissingApprovalSchema(error)) return { rows: [], schemaMissing: true };
  if (error) {
    console.error('fetchPendingApprovals:', error);
    return { rows: [], schemaMissing: false };
  }
  return { rows: data || [], schemaMissing: false };
}

// Count only — for the dashboard banner.
export async function fetchPendingApprovalCount({ companyId, ownerIds }) {
  const { rows } = await fetchPendingApprovals({ companyId, ownerIds });
  return rows.length;
}
