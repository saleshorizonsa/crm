import { supabase } from 'lib/supabase';

/**
 * MANAGERS WHO SELL APPROVE THEIR OWN PLANS (session 44, CEO 2026-11-17).
 *
 * A manager who sells himself (users.role = 'manager' AND is_contributor —
 * today only Mohamed Kamal) is the approver of his own plans, each division
 * plan included. Everyone else is routed as before: supervisor_id, then the
 * company fallback.
 *
 * The database enforces the same rule in enforce_plan_approver() from
 * migrations/plan_self_approval_selling_managers.sql, which also creates
 * plan_self_approval_enabled(). The app routes a selling manager's plans to
 * himself ONLY once that function exists, so the app and the trigger never
 * disagree: before the migration his plans go to his supervisor, exactly as
 * today.
 *
 * "Self-approved" needs no column: a plan approved by its own owner
 * (approved_by = owner_id).
 */

/** The person approves his own plans: a manager flagged as selling. */
export const selfApprovesPlans = (user) => user?.role === 'manager' && user?.is_contributor === true;

/** An approved plan whose approver is its owner. */
export const isSelfApproved = (row) => row?.approval_status === 'approved'
  && !!row?.approved_by && row.approved_by === row.owner_id;

export const SELF_APPROVED = 'self-approved';

let probe = null;
/**
 * Whether the migration is applied (plan_self_approval_enabled() exists and
 * says true). "Function not found" is kept for the page load; any other
 * failure is asked again next time, and reads as "not applied" meanwhile —
 * the routing that was always there.
 */
export function probeSelfApproval() {
  if (!probe) {
    probe = Promise.resolve(supabase.rpc('plan_self_approval_enabled'))
      .then(({ data, error }) => {
        if (!error) return data === true ? 'yes' : 'no';
        if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '')) return 'no';
        return 'unknown';
      })
      .catch(() => 'unknown')
      .then((a) => { if (a === 'unknown') probe = null; return a === 'yes'; });
  }
  return probe;
}
/** For tests, and after the schema is known to have changed. */
export const resetSelfApprovalProbe = () => { probe = null; };
