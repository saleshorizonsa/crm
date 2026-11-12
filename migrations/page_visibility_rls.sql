-- ============================================================================
-- NOT APPLIED. Written 2026-11-12 (session 35, per-user page visibility).
-- Claude Code never runs SQL: a person runs this, block by block, in the
-- Supabase SQL editor.
--
-- user_page_permissions: WHO MAY READ AND WRITE IT.
--
-- WHY. The table's only policy today is "Admins manage permissions",
-- FOR ALL USING (true) WITH CHECK (true): any signed-in user can read every
-- user's rows and insert, change or delete anyone's — including un-hiding a
-- page the admin hid from them, or hiding pages from colleagues. The app now
-- READS this table to decide what each user sees (utils/pageAccess.js), so
-- that hole matters from the moment anybody hides anything.
--
-- WHAT IT DOES
--   (1) drops "Admins manage permissions";
--   (2) SELECT: a user reads his OWN rows (that is all the app reads for him);
--   (3) SELECT, INSERT, UPDATE, DELETE of ANY row: admin and director only,
--       and only for a company they belong to — their own users.company_id,
--       or a company they direct through director_companies (Nader directs
--       PVC, IMDADAT and Steels). On INSERT/UPDATE the row's user must also
--       belong to that company, so nobody can file a row for a user of another
--       company under their own.
--
-- ROLE HELPER USED: public.current_user_role() — the function the users
-- policies already use (and migrations/add_deal_stage_history.sql and
-- export_customers.sql depend on). PREVIEW P1 stops the run if it is missing.
-- Company membership uses the same users ∪ director_companies subquery as the
-- opportunities / future_orders policies in migrations/insights_rls.sql.
--
-- WHAT IT DOES NOT CHANGE: the table, its columns, its rows (0 today), and
-- every other table's policies. Head is NOT given write access (the brief
-- names admin and director only). The screen that writes is on the Admin
-- Dashboard, which only the admin role can open today.
--
-- THE APP BEFORE AND AFTER: unchanged either way while the table is empty.
-- If a read is ever refused, the app treats it as "nothing hidden".
--
-- RUN ORDER: PREVIEW (read-only) → APPLY on its own → VERIFY. ROLLBACK only
-- if needed.
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Run each query and keep the output.
-- ============================================================================

-- P1. The role helper exists (expect 1 row) and what it returns.
SELECT p.oid::regprocedure AS fn, p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'current_user_role';

-- P2. The policies on the table now (expect exactly "Admins manage permissions").
SELECT policyname, cmd, permissive, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'user_page_permissions'
 ORDER BY policyname;

-- P3. RLS is enabled on the table (expect relrowsecurity = true).
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE oid = 'public.user_page_permissions'::regclass;

-- P4. The rows (expect 0 on 12 Nov) and the unique key the app upserts on.
SELECT count(*) AS rows FROM public.user_page_permissions;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.user_page_permissions'::regclass AND contype IN ('u', 'p');

-- P5. Who will be able to manage it: active admins and directors, by company.
SELECT u.role, u.full_name, u.company_id AS own_company,
       array_agg(DISTINCT dc.company_id) FILTER (WHERE dc.company_id IS NOT NULL) AS directs
  FROM public.users u
  LEFT JOIN public.director_companies dc ON dc.user_id = u.id
 WHERE u.role IN ('admin', 'director') AND u.is_active
 GROUP BY u.role, u.full_name, u.company_id
 ORDER BY u.role, u.full_name;


-- ============================================================================
-- APPLY — run this block ON ITS OWN, from BEGIN to COMMIT.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.current_user_role()') IS NULL THEN
    RAISE EXCEPTION 'current_user_role() not found in schema public — stop: the policies below depend on it.';
  END IF;
END $$;

ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage permissions" ON public.user_page_permissions;
DROP POLICY IF EXISTS user_page_permissions_select_own ON public.user_page_permissions;
DROP POLICY IF EXISTS user_page_permissions_admin_all ON public.user_page_permissions;

-- (2) Everyone: his own rows, read-only.
CREATE POLICY user_page_permissions_select_own ON public.user_page_permissions
  FOR SELECT USING (user_id = auth.uid());

-- (3) Admin and director: every row of a company they belong to.
CREATE POLICY user_page_permissions_admin_all ON public.user_page_permissions
  FOR ALL
  USING (
    COALESCE(public.current_user_role(), '') IN ('admin', 'director')
    AND company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    COALESCE(public.current_user_role(), '') IN ('admin', 'director')
    AND company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.users t
       WHERE t.id = user_page_permissions.user_id
         AND t.company_id = user_page_permissions.company_id
    )
  );

COMMIT;


-- ============================================================================
-- VERIFY — read-only.
-- ============================================================================

-- V1. Exactly the two new policies; the permissive one is gone.
SELECT policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'user_page_permissions'
 ORDER BY policyname;
-- expect: user_page_permissions_admin_all (ALL), user_page_permissions_select_own (SELECT)

-- V2. Rows untouched (compare with P4).
SELECT count(*) AS rows FROM public.user_page_permissions;

-- V3. In the app, signed in as a SALESMAN: open any page — nothing changes,
--     the menu is as before. As the ADMIN: Admin Dashboard → Authorization →
--     choose a user → switch one page off → Save; sign in as that user: the
--     page is gone from the menu and its address lands on Insights with
--     "That page is not available for your account." Switch it back on.
--     (Read-only checks by role impersonation are possible in the SQL editor
--     with SET request.jwt.claims, if you prefer them to the app.)


-- ============================================================================
-- ROLLBACK — only if needed: back to the single permissive policy.
-- ============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS user_page_permissions_select_own ON public.user_page_permissions;
-- DROP POLICY IF EXISTS user_page_permissions_admin_all ON public.user_page_permissions;
-- CREATE POLICY "Admins manage permissions" ON public.user_page_permissions
--   USING (true) WITH CHECK (true);
-- COMMIT;
