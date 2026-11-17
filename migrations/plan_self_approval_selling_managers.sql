-- ============================================================================
-- NOT APPLIED. Written 2026-11-17 (session 44). Claude Code never runs SQL: a
-- person runs this, block by block, in the Supabase SQL editor.
--
-- MANAGERS WHO SELL APPROVE THEIR OWN PLANS.
--
-- WHY. CEO decision 2026-11-17: a manager who sells himself (users.role =
-- 'manager' AND users.is_contributor = true — today only Mohamed Kamal) is
-- the approver of his own plans, including each division plan (session 43).
-- Everyone else's approver is unchanged: supervisor_id, then the company
-- fallback.
--
-- WHAT IT DOES (one transaction)
--   (1) Replaces public.enforce_plan_approver(). ONE addition: when the plan's
--       owner is a selling manager, the approver is the owner himself. The
--       rest is the current body: the unchanged-status early return, the
--       service-role bypass, the owner's own pending resubmission,
--       supervisor_id, then the company fallback (manager, supervisor,
--       director, head, admin by id), and the same error.
--   (2) Creates public.plan_self_approval_enabled() — returns true, nothing
--       else. It is how the app knows this file has been applied: until it
--       exists the app routes plans exactly as today (Nader approves Kamal),
--       so the app and the trigger can never disagree about who decides.
--
-- WHAT IT DOES NOT DO
--   The trigger plan_submissions_approver_guard is not touched (it calls the
--   function by name). No table, column, row or RLS policy changes.
--
-- ⚠ ORDER: MERGE FIRST, THEN THIS FILE.
--   1. Merge feat/self-approve-selling-managers and let it deploy. Until this
--      file is applied the deployed app finds no plan_self_approval_enabled()
--      and behaves exactly as today: Kamal's plans go to Nader, Nader
--      approves them, the trigger agrees.
--   2. Apply this file. From the next page load Kamal's plans are in HIS
--      queue and he decides them; Nader sees them read-only. A page already
--      open from before APPLY still shows Nader the buttons until it is
--      reloaded — and if he clicks, the trigger refuses ("Only the assigned
--      Sales Manager…") and nothing is changed.
--   The other way round (this file before the merge) is NOT safe: the old app
--   would keep offering Kamal's plans to Nader, the trigger would refuse him,
--   and Kamal would have no queue to approve from — his plans would be stuck
--   until the merge.
--
-- RUN ORDER: PREVIEW (read-only) → APPLY on its own → VERIFY. ROLLBACK only
-- if needed.
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Run each query and KEEP THE OUTPUT OF P1: it is the
-- exact production body ROLLBACK must restore.
-- ============================================================================

-- P1. The current function, exactly as production has it. Save this text.
SELECT pg_get_functiondef('public.enforce_plan_approver()'::regprocedure);

-- P2. Which hierarchy column it reads today. Expect reads_supervisor_id = true
--     (migrations/plan_approver_use_supervisor_id.sql). If instead
--     reads_reports_to = true, that earlier file was never applied: APPLY
--     below also moves the trigger to supervisor_id, as the brief requires —
--     tell me before applying.
SELECT pg_get_functiondef('public.enforce_plan_approver()'::regprocedure) ILIKE '%u.supervisor_id%' AS reads_supervisor_id,
       pg_get_functiondef('public.enforce_plan_approver()'::regprocedure) ILIKE '%u.reports_to%'    AS reads_reports_to;

-- P3. The trigger that calls it (expect plan_submissions_approver_guard,
--     BEFORE UPDATE on plan_submissions, enabled 'O').
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
  FROM pg_trigger
 WHERE tgrelid = 'public.plan_submissions'::regclass AND NOT tgisinternal;

-- P4. Who will approve their own plans (expect only Mohamed Kamal).
SELECT id, full_name, role, is_contributor, is_active
  FROM users
 WHERE role = 'manager' AND is_contributor = true
 ORDER BY full_name;

-- P5. The marker must not exist yet (expect 0 rows).
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND proname = 'plan_self_approval_enabled';

-- P6. Kamal's plans waiting on a decision now (they move to his queue).
SELECT p.id, u.full_name, p.plan_month, p.division_id, p.approval_status, p.is_submitted
  FROM plan_submissions p JOIN users u ON u.id = p.owner_id
 WHERE u.role = 'manager' AND u.is_contributor = true
   AND p.is_submitted = true AND p.approval_status = 'pending';


-- ============================================================================
-- APPLY — run on its own, AFTER the merge has deployed.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_plan_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  approver uuid;
  self_approves boolean;
BEGIN
  IF NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
     AND NEW.is_locked IS NOT DISTINCT FROM OLD.is_locked THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id = auth.uid()
     AND NEW.approval_status = 'pending'
     AND COALESCE(NEW.is_locked, false) = false THEN
    RETURN NEW;
  END IF;

  SELECT u.supervisor_id,
         (u.role = 'manager' AND COALESCE(u.is_contributor, false))
    INTO approver, self_approves
    FROM users u
   WHERE u.id = NEW.owner_id;

  -- SESSION 44, THE ONE ADDITION: a manager who sells approves his own plans.
  IF COALESCE(self_approves, false) THEN
    approver := NEW.owner_id;
  END IF;

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
$function$;

-- The app's switch: it exists exactly when the function above does.
CREATE OR REPLACE FUNCTION public.plan_self_approval_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT true $$;
GRANT EXECUTE ON FUNCTION public.plan_self_approval_enabled() TO authenticated;

COMMENT ON FUNCTION public.plan_self_approval_enabled() IS
  'Session 44 marker: true when enforce_plan_approver lets a selling manager (role manager AND is_contributor) approve his own plans. The app routes plans to them only when this exists.';

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- VERIFY — read-only.
-- ============================================================================

-- V1. The new body: expect has_self_rule = true and reads_supervisor_id = true.
SELECT pg_get_functiondef('public.enforce_plan_approver()'::regprocedure) ILIKE '%self_approves%'     AS has_self_rule,
       pg_get_functiondef('public.enforce_plan_approver()'::regprocedure) ILIKE '%u.supervisor_id%'   AS reads_supervisor_id;

-- V2. The trigger is unchanged (same row as P3).
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
  FROM pg_trigger
 WHERE tgrelid = 'public.plan_submissions'::regclass AND NOT tgisinternal;

-- V3. The marker answers (expect true).
SELECT public.plan_self_approval_enabled();

-- V4. Nothing in plan_submissions moved (same rows as P6).
SELECT p.id, u.full_name, p.plan_month, p.division_id, p.approval_status, p.is_submitted
  FROM plan_submissions p JOIN users u ON u.id = p.owner_id
 WHERE u.role = 'manager' AND u.is_contributor = true
   AND p.is_submitted = true AND p.approval_status = 'pending';


-- ============================================================================
-- ROLLBACK — only if needed.
--
-- Restores the function EXACTLY as P1 printed it, and removes the marker (the
-- app then routes Kamal's plans back to Nader on the next page load).
--
--   R1. Run the text you saved from P1 (it is a complete CREATE OR REPLACE
--       FUNCTION statement).
--   R2. Then run the block below.
--
-- For reference, P1 is expected to equal the body in
-- migrations/plan_approver_use_supervisor_id.sql. If P1 differs from it, P1
-- wins: it is what production actually ran.
-- ============================================================================

BEGIN;
DROP FUNCTION IF EXISTS public.plan_self_approval_enabled();
NOTIFY pgrst, 'reload schema';
COMMIT;
