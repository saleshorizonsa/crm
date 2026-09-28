-- ============================================================================
-- Plan-approval routing: read supervisor_id, not reports_to.
--
-- NOT APPLIED YET. Applying this changes who may approve a plan, so it goes in
-- with the matching JS (src/utils/planApproval.js) and after a manual
-- approve/reject test by a real manager login.
--
-- Why: users carries two hierarchy columns and only supervisor_id is written —
-- by every hierarchy write path and by every RLS function. reports_to is a
-- one-time partial backfill nothing maintains. Planning, the Coverage Console,
-- Insights (6218e78) and the three notification routers (fef9c17) have already
-- moved; this trigger and its JS mirror are the last readers.
--
-- Live consequence today: IMDADAT's Fadi has reports_to = NULL and
-- supervisor_id = Nader (the group director over PVC, IMDADAT and Steels —
-- correct data, confirmed with the business owner). With reports_to the SELECT
-- below returns NULL, so the fallback runs; IMDADAT's only lead-role user is
-- Fadi himself, so the trigger would authorise Fadi to approve his OWN plan.
-- It has not fired yet (IMDADAT has no plan_submissions rows), but it is live.
-- Reading supervisor_id resolves him to Nader instead.
--
-- ONLY the SELECT changes. The fallback block, the self-submit allowance, the
-- auth.uid() IS NULL service-role bypass and the error message are untouched,
-- so the JS mirror's pickFallback() ordering still matches.
--
-- Rollback: re-run this file with `u.supervisor_id` changed back to
-- `u.reports_to`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_plan_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  approver uuid;
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

  -- THE ONE CHANGE: supervisor_id, not reports_to.
  SELECT u.supervisor_id INTO approver FROM users u WHERE u.id = NEW.owner_id;

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

-- ── Two pre-existing asymmetries, NOT changed here ──────────────────────────
-- Neither bites on today's data (verified 2026-09-28: no active user has a
-- deactivated supervisor, and the trigger's fallback picks the same person as
-- the JS fallback in every company), but both are latent:
--
--   1. This trigger takes the supervisor as-is and never checks is_active,
--      while resolveApprover() falls back to the company reviewer when the
--      supervisor is deactivated. Deactivate someone's supervisor and the JS
--      would offer the button to the fallback while the trigger still demands
--      the deactivated supervisor.
--   2. The fallback block above has no is_active filter either, while
--      companyFallbackApprover() has one. A deactivated lowest-id manager would
--      be picked here and not in JS.
--
-- Both are one-line additions (AND u.is_active) but they change who may
-- approve, so they belong in their own reviewed change.
