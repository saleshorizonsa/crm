-- Server-side enforcement of "only the assigned approver may decide a plan".
--
-- The check in src/utils/planApproval.js (assertIsApprover) runs in the BROWSER.
-- It stops the UI from doing the wrong thing, but it is not a security control:
-- anyone holding the anon key and a logged-in session can PATCH plan_submissions
-- directly and skip it. This trigger is the enforcement that actually holds.
--
-- Implemented as a BEFORE UPDATE trigger rather than an RLS policy on purpose:
-- plan_submissions already has RLS enabled with policies this migration cannot
-- see, and adding an UPDATE policy blind risks either colliding with them or
-- silently widening access. A trigger is additive and cannot loosen anything.
--
-- Directors keep full read access (oversight) — this only guards the decision.

CREATE OR REPLACE FUNCTION enforce_plan_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approver uuid;
BEGIN
  -- Only guard the approval fields. Ordinary edits (a salesman resubmitting,
  -- the missed-deadline flow writing flagged/reviewed) are untouched.
  IF NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
     AND NEW.is_locked IS NOT DISTINCT FROM OLD.is_locked THEN
    RETURN NEW;
  END IF;

  -- No JWT means service_role or a server-side job: not a browser, allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- A salesman reopening their OWN plan is not an approval decision. After a
  -- rejection, handleSubmitPlan upserts approval_status back to pending, which
  -- flips the guarded column; without this the trigger would block every
  -- resubmission and strand the plan in rejected forever.
  IF NEW.owner_id = auth.uid()
     AND NEW.approval_status = 'pending'
     AND COALESCE(NEW.is_locked, false) = false THEN
    RETURN NEW;
  END IF;

  -- Mirrors resolveApprover(): the salesman's manager, else the company
  -- fallback. Ordered by role priority then id so it picks the SAME person as
  -- pickFallback() in src/utils/planApproval.js.
  SELECT u.reports_to INTO approver FROM users u WHERE u.id = NEW.owner_id;

  IF approver IS NULL THEN
    SELECT u.id INTO approver
    FROM   users u
    WHERE  u.company_id = NEW.company_id
    AND    u.role IN ('manager', 'supervisor', 'director', 'head', 'admin')
    ORDER  BY CASE u.role
                WHEN 'manager'    THEN 1
                WHEN 'supervisor' THEN 2
                WHEN 'director'   THEN 3
                WHEN 'head'       THEN 4
                ELSE 5
              END,
              u.id
    LIMIT  1;
  END IF;

  IF approver IS NULL OR approver IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned Sales Manager can approve or reject this plan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_submissions_approver_guard ON plan_submissions;
CREATE TRIGGER plan_submissions_approver_guard
  BEFORE UPDATE ON plan_submissions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_plan_approver();
