-- ============================================================================
-- NOT APPLIED. Written 2026-11-18 (session 48). Claude Code never runs SQL: a
-- person runs this, block by block, in the Supabase SQL editor.
--
-- CUSTOMER STRATEGY — one per customer: growth · maintenance · collection ·
-- collect_close · other (with a note) · or not set.
--
-- WHAT IT DOES (additive only, one transaction)
--   (1) contacts: strategy, strategy_note, strategy_set_by, strategy_set_at,
--       with two CHECKs (the five values; 'other' needs a non-empty note).
--   (2) customer_strategy_history: one row per change, written ONLY by a
--       trigger (SECURITY DEFINER). company_id = the customer's company,
--       COALESCE(contacts.company_id, the owner's users.company_id) — 371 JASCO
--       PVC customers have contacts.company_id NULL; nothing is backfilled.
--       RLS: a user sees the history of exactly the customers the existing
--       contacts SELECT policies already let him see (the policy reads
--       contacts, so those policies decide). No INSERT/UPDATE/DELETE for the app.
--   (3) contacts_strategy_guard — BEFORE INSERT OR UPDATE on contacts (like
--       plan_submissions_approver_guard / guard_contacts_is_export): if
--       strategy or strategy_note changes, the caller must be manager,
--       supervisor, director, head or admin, else
--       "Only a manager can change a customer's strategy." The service role /
--       SQL editor (auth.uid() IS NULL) passes. It stamps strategy_set_by /
--       strategy_set_at, and keeps them unchanged on any other edit (they
--       cannot be forged). Other contacts columns are not looked at: a
--       salesman edits his customers exactly as today.
--   (4) contacts_strategy_history — AFTER INSERT OR UPDATE on contacts: writes
--       the history row when strategy or its note changes.
--   (5) customer_strategy_enabled() — returns true. The app shows strategy
--       features ONLY when this exists. NOTIFY pgrst.
--
-- WHAT IT DOES NOT DO
--   No existing contacts policy or trigger is changed or dropped (PREVIEW P1/P2
--   print them; VERIFY V3/V4 print them again — they must match). No row is
--   changed: every customer starts "Not set".
--
-- WHO MAY CHANGE A STRATEGY ON WHICH CUSTOMER
--   The ROLE is checked by the guard. WHICH customers a manager can change is
--   decided by the existing contacts UPDATE policies (P2, cmd = UPDATE): if
--   they only let the owner update his own row, a manager can set strategies
--   only on customers he can update — the app then says "could not be
--   changed" for the others rather than pretending. Tell me what P2 shows.
--
-- ORDER: either order is safe.
--   * Merge first: the deployed app finds no customer_strategy_enabled() and
--     shows no strategy anywhere (identical to today). Applying this file
--     turns it on at the next page load.
--   * This file first: nothing reads the new columns until the app that asks
--     for them is deployed; the guard only acts when strategy changes, which
--     today's app never sends.
--
-- RUN ORDER: PREVIEW (read-only) → APPLY on its own → VERIFY. ROLLBACK only if
-- needed. Tested on PostgreSQL 16 (PGlite) in the session-48 harness; production
-- is 17.
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Keep the output of P1 and P2: VERIFY must show the
-- same rows (plus the two new triggers in V3).
-- ============================================================================

-- P1. The triggers on contacts today (expected: 2 rows).
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
  FROM pg_trigger
 WHERE tgrelid = 'public.contacts'::regclass AND NOT tgisinternal
 ORDER BY tgname;

-- P2. The policies on contacts today (expected: 8 rows). Note the UPDATE ones:
--     they decide which customers a manager can change (see header).
SELECT policyname, cmd, roles, permissive, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'contacts'
 ORDER BY cmd, policyname;

-- P3. Nothing of this file exists yet (expected: 0 columns, NULL table, 0 functions).
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'contacts'
   AND column_name IN ('strategy', 'strategy_note', 'strategy_set_by', 'strategy_set_at');
SELECT to_regclass('public.customer_strategy_history') AS history_table;
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND proname IN ('customer_strategy_enabled', 'guard_contacts_strategy', 'log_contacts_strategy');

-- P4. The role helper the guard uses (the same one guard_contacts_is_export and
--     the deal_stage_history policies use). Expected: one row, not NULL.
SELECT to_regprocedure('public.current_user_role()') AS current_user_role_fn;

-- P5. Customers whose company comes from their owner (contacts.company_id NULL).
--     Expected: JASCO PVC 371 (the brief's figure).
SELECT COALESCE(co.name, '(owner has no company)') AS owner_company, count(*) AS customers_with_null_company_id
  FROM public.contacts c
  LEFT JOIN public.users u ON u.id = c.owner_id
  LEFT JOIN public.companies co ON co.id = u.company_id
 WHERE c.company_id IS NULL
 GROUP BY 1 ORDER BY 2 DESC;


-- ============================================================================
-- APPLY — run this block ON ITS OWN, from BEGIN to COMMIT.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.current_user_role()') IS NULL THEN
    RAISE EXCEPTION 'current_user_role() was not found in schema public; the strategy guard depends on it.';
  END IF;
END $$;

-- (1) the columns
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS strategy        text,
  ADD COLUMN IF NOT EXISTS strategy_note   text,
  ADD COLUMN IF NOT EXISTS strategy_set_by uuid,
  ADD COLUMN IF NOT EXISTS strategy_set_at timestamptz;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_strategy_check
  CHECK (strategy IS NULL OR strategy IN ('growth', 'maintenance', 'collection', 'collect_close', 'other'));
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_strategy_other_note_check
  CHECK (strategy IS DISTINCT FROM 'other' OR length(btrim(COALESCE(strategy_note, ''))) > 0);

COMMENT ON COLUMN public.contacts.strategy IS
  'Session 48: growth | maintenance | collection | collect_close | other (needs strategy_note) | NULL = not set. Set by manager and above (guard_contacts_strategy).';

-- (2) the history
CREATE TABLE IF NOT EXISTS public.customer_strategy_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id   uuid,
  old_strategy text,
  new_strategy text,
  note         text,
  changed_by   uuid,
  changed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_strategy_history_company_idx ON public.customer_strategy_history (company_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS customer_strategy_history_contact_idx ON public.customer_strategy_history (contact_id, changed_at DESC);

ALTER TABLE public.customer_strategy_history ENABLE ROW LEVEL SECURITY;
-- Visible exactly when the customer is: the subquery runs under the reader's
-- own contacts SELECT policies.
CREATE POLICY customer_strategy_history_select ON public.customer_strategy_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = customer_strategy_history.contact_id));
REVOKE ALL ON public.customer_strategy_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.customer_strategy_history FROM authenticated;
GRANT SELECT ON public.customer_strategy_history TO authenticated;

-- (3) the guard
CREATE OR REPLACE FUNCTION public.guard_contacts_strategy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.strategy IS NOT DISTINCT FROM OLD.strategy
     AND NEW.strategy_note IS NOT DISTINCT FROM OLD.strategy_note THEN
    -- Any other edit: the stamps stay as they were.
    NEW.strategy_set_by := OLD.strategy_set_by;
    NEW.strategy_set_at := OLD.strategy_set_at;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.strategy IS NULL AND NEW.strategy_note IS NULL THEN
    NEW.strategy_set_by := NULL;
    NEW.strategy_set_at := NULL;
    RETURN NEW;
  END IF;
  -- auth.uid() is NULL for the SQL editor and the service role.
  IF auth.uid() IS NOT NULL
     AND COALESCE(public.current_user_role(), '') NOT IN ('manager', 'supervisor', 'director', 'head', 'admin') THEN
    RAISE EXCEPTION 'Only a manager can change a customer''s strategy.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.strategy IS NULL THEN
    NEW.strategy_note := NULL;             -- clearing the strategy clears its note
  ELSE
    NEW.strategy_note := NULLIF(btrim(NEW.strategy_note), '');
  END IF;
  NEW.strategy_set_by := auth.uid();
  NEW.strategy_set_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER contacts_strategy_guard
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contacts_strategy();

-- (4) the history writer (the only way rows get into the history table)
CREATE OR REPLACE FUNCTION public.log_contacts_strategy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.strategy IS NOT DISTINCT FROM OLD.strategy
     AND NEW.strategy_note IS NOT DISTINCT FROM OLD.strategy_note THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.strategy IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.customer_strategy_history
    (contact_id, company_id, old_strategy, new_strategy, note, changed_by, changed_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.company_id, (SELECT u.company_id FROM public.users u WHERE u.id = NEW.owner_id)),
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.strategy END,
    NEW.strategy,
    NEW.strategy_note,
    auth.uid(),
    now()
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.log_contacts_strategy() FROM PUBLIC;
CREATE TRIGGER contacts_strategy_history
  AFTER INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_contacts_strategy();

-- (5) the app's switch
CREATE OR REPLACE FUNCTION public.customer_strategy_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT true $$;
GRANT EXECUTE ON FUNCTION public.customer_strategy_enabled() TO authenticated;
COMMENT ON FUNCTION public.customer_strategy_enabled() IS
  'Session 48 marker: the customer strategy columns, history and guard exist. The app shows strategy features only when this exists.';

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- VERIFY — read-only (V7 changes nothing: it is rolled back).
-- ============================================================================

-- V1. The four columns.                                              → 4 rows
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'contacts'
   AND column_name IN ('strategy', 'strategy_note', 'strategy_set_by', 'strategy_set_at')
 ORDER BY column_name;

-- V2. The two checks.                                                → 2 rows
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.contacts'::regclass AND conname LIKE 'contacts_strategy%' ORDER BY conname;

-- V3. Triggers on contacts: P1's rows, unchanged, PLUS contacts_strategy_guard
--     and contacts_strategy_history.                                 → P1 + 2
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
  FROM pg_trigger
 WHERE tgrelid = 'public.contacts'::regclass AND NOT tgisinternal
 ORDER BY tgname;

-- V4. Policies on contacts: exactly P2's rows.                       → same as P2
SELECT policyname, cmd, roles, permissive, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'contacts'
 ORDER BY cmd, policyname;

-- V5. History table: RLS on, one SELECT policy, no rows yet.         → t, 1, 0
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.customer_strategy_history'::regclass;
SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_strategy_history';
SELECT count(*) AS history_rows FROM public.customer_strategy_history;

-- V6. The marker.                                                    → true
SELECT public.customer_strategy_enabled();

-- V7. Optional end-to-end check AS A SALESMAN, rolled back: the update is
--     refused with "Only a manager can change a customer's strategy."
--     (Pick any active salesman's id and one of his customers.)
-- BEGIN;
--   SELECT set_config('request.jwt.claims', json_build_object('sub', '<salesman uuid>', 'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   UPDATE public.contacts SET strategy = 'growth' WHERE id = '<one of his contacts>';
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK — only if needed. Removes everything above. Any strategies already
-- set, and their history, are lost.
-- ============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS contacts_strategy_history ON public.contacts;
-- DROP TRIGGER IF EXISTS contacts_strategy_guard   ON public.contacts;
-- DROP FUNCTION IF EXISTS public.log_contacts_strategy();
-- DROP FUNCTION IF EXISTS public.guard_contacts_strategy();
-- DROP FUNCTION IF EXISTS public.customer_strategy_enabled();
-- DROP TABLE IF EXISTS public.customer_strategy_history;
-- ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_strategy_other_note_check;
-- ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_strategy_check;
-- ALTER TABLE public.contacts
--   DROP COLUMN IF EXISTS strategy_set_at,
--   DROP COLUMN IF EXISTS strategy_set_by,
--   DROP COLUMN IF EXISTS strategy_note,
--   DROP COLUMN IF EXISTS strategy;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
