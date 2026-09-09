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

// The company-wide fallback reviewer, used for anyone whose reports_to is
// null. Ahmad Sulaiman Moamina — the only salesman who has ever submitted a
// plan — has no reports_to, so without this his plan would notify nobody and
// appear in nobody's queue.
const LEAD_ROLES = ['manager', 'supervisor', 'director', 'head', 'admin'];

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

async function companyFallbackApprover(companyId) {
  const { data } = await supabase
    .from('users')
    .select('id, role')
    .eq('company_id', companyId)
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
    .select('id, role, reports_to')
    .eq('company_id', companyId);
  const fallback = pickFallback(users);
  for (const id of ownerIds) {
    const u = (users || []).find((x) => x.id === id);
    map[id] = u?.reports_to || fallback;
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
    .select('reports_to')
    .eq('id', ownerId)
    .maybeSingle();
  if (me?.reports_to) return me.reports_to;
  return companyFallbackApprover(companyId);
}

// The owner ids whose plans this user reviews — the exact inverse of
// resolveApprover, so a notified approver always finds the plan in their
// queue. Directors see the whole company; a manager/supervisor sees their
// downline, plus every unassigned user if they are the company fallback.
export async function resolveApproverScope({ companyId, userId, role }) {
  if (!companyId || !userId) return [];

  if (DIRECTOR_ROLES.includes(role)) {
    const { data } = await supabase.from('users').select('id').eq('company_id', companyId);
    return (data || []).map((u) => u.id);
  }
  if (!TEAM_ROLES.includes(role)) return [];

  const team = await fetchTeamHierarchy({ companyId, userId, role });
  const ids = new Set(team.map((m) => m.id).filter(Boolean));

  if ((await companyFallbackApprover(companyId)) === userId) {
    const { data: unassigned } = await supabase
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .is('reports_to', null)
      .neq('id', userId);
    (unassigned || []).forEach((u) => ids.add(u.id));
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
