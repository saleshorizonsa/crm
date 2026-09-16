-- Only an active admin may grant or remove the 'admin' role
-- Date: 2026-09-16
--
-- THE GAP: the "Admins and directors update users" policy lets any director
-- UPDATE any users row, every column. A director could therefore set anyone's
-- role — including their own — to 'admin', or demote an admin. The admin role
-- is the only gate on api/admin-update-user.js (set another user's password),
-- so this had to close before that feature ships.
--
-- WHY A TRIGGER, NOT A POLICY CHANGE: a policy's WITH CHECK sees only the new
-- row, so it cannot tell "role changed to admin" from "an existing admin row was
-- edited". A BEFORE trigger sees OLD and NEW. The existing policies stay exactly
-- as they are, so directors keep every edit they have today.
--
-- THE RULE (role column only; every other column is unaffected):
--   * auth.uid() IS NULL (service role, SQL Editor, server-side jobs) -> allowed
--   * any change TO or FROM 'admin'                -> caller must be an ACTIVE admin
--   * any other role change (e.g. salesman -> supervisor)
--                                                  -> caller must be an ACTIVE admin
--                                                     or ACTIVE director (as today)
--   * everyone else (manager, supervisor, salesman, viewer) cannot change any
--     role, including their own, even where a policy lets them update their row
--   * INSERT with role 'admin'                     -> caller must be an ACTIVE admin
--
-- HOW TO RUN (Supabase SQL Editor): run this whole file once. Then run
-- migrations/test_restrict_admin_role_changes.sql, which proves it and rolls
-- back every change it makes.

CREATE OR REPLACE FUNCTION public.enforce_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id   uuid := auth.uid();
  caller_role text;
BEGIN
  -- Service role / SQL Editor / server-side code: not a browser session.
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;   -- role untouched: nothing to check
  END IF;
  IF TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM 'admin' THEN
    RETURN NEW;   -- inserting a non-admin row: existing insert policies decide
  END IF;

  SELECT u.role::text INTO caller_role
  FROM   users u
  WHERE  u.id = caller_id
  AND    u.is_active = true;

  IF caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role::text = 'admin' OR (TG_OP = 'UPDATE' AND OLD.role::text = 'admin') THEN
    RAISE EXCEPTION 'Only an administrator can grant or remove the admin role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' AND caller_role IS DISTINCT FROM 'director' THEN
    RAISE EXCEPTION 'Only an administrator or director can change a user''s role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_role_change_guard ON public.users;
CREATE TRIGGER users_role_change_guard
  BEFORE INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_role_change();

-- Check it is installed:
SELECT tgname, tgenabled FROM pg_trigger
WHERE  tgrelid = 'public.users'::regclass AND tgname = 'users_role_change_guard';
-- Expected: one row, users_role_change_guard, O

-- UNDO (only if needed):
-- DROP TRIGGER IF EXISTS users_role_change_guard ON public.users;
-- DROP FUNCTION IF EXISTS public.enforce_user_role_change();
