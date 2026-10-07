-- ============================================================================
-- NOT APPLIED. Read the PREVIEW, then run APPLY, then run VERIFY.
--
-- INSIGHTS FOR SUPERVISORS AND SALESMEN — close the tables a salesman can read
-- company-wide, and add the one function that lets him see a company RATE
-- without reading company data. (CEO decision, 2026-10-07.)
-- ============================================================================
--
-- THE AUDIT THIS FILE ANSWERS. Every table the Insights page reads was tested
-- on production on 2026-10-07 by impersonating two real users inside a
-- READ-ONLY transaction that was rolled back:
--
--     BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}', true);
--     ...counts...
--     ROLLBACK;
--
-- as Mohamed Hussein (salesman) and Amer Sulaiman Alburaym (supervisor):
--
--   table                 salesman sees            supervisor sees        verdict
--   users                 all 15 in the company    all 15                 by design (names/pickers); the page must not use it — it no longer reads outside its scope
--   deals                 115, 0 not his own       477, none outside his subtree *   OK
--   sales_targets          11, 0 not his own        22, none outside       OK
--   client_targets          34 (his own rows')      102 (his + ones he assigned)     OK, with a gap — see NOTE 2
--   deal_returns             0 (he has none)          0                    OK (own/subtree via get_user_subordinates)
--   opportunities          349, **230 NOT his own**  349, **85 outside**   *** COMPANY-WIDE — fixed below
--   future_orders          108, **52 NOT his own**   108, **34 outside**   *** COMPANY-WIDE — fixed below
--   salesman_flags           7, company-wide           7, **4 outside**    *** COMPANY-WIDE — fixed below
--   escalation_logs          0 rows exist, but the policy is company-wide  *** fixed below
--   sales_divisions           4 (reference data)        4                  OK
--   user_sales_divisions      1 (company-wide policy)   1                  OK — membership map, no figures
--
--   * the 11 rows outside Amer's three active reports are Ahmad Sulaiman
--     Moamina's, who is inactive and reports to Amer: inside his subtree, not a
--     leak.
--
-- NOTE 1 — THE DEALS POLICY IS ONLY TWO LEVELS DEEP. "Users can view deals
-- based on role" matches owner = me, owner.supervisor_id = me, or
-- owner.supervisor_id.supervisor_id = me. JASCO PVC is two levels under a
-- supervisor today, so every supervisor sees his whole team. A three-level
-- chain under one supervisor would silently hide the bottom level from him —
-- and from the Insights page, which would then show him a smaller team than
-- the app believes he has. Not fixed here because it is a change to how every
-- screen reads deals, not just this page; recorded so it is a decision rather
-- than a surprise. get_user_subordinates() (used by sales_targets and
-- deal_returns) recurses properly and is the model for a fix.
--
-- NOTE 2 — A SUPERVISOR CANNOT ALWAYS READ HIS TEAM'S client_targets. The
-- policy matches sales_targets.assigned_by = me OR assigned_to = me, so he
-- reads the breakdown of rows HE assigned. If a manager assigns a by_clients
-- target straight to one of his salesmen, the supervisor reads the parent row
-- but not its children, and targetRowValue() then returns the parent's own
-- target_amount instead of the children's sum. On production today every
-- by_clients row's parent amount EQUALS its children's sum, so no figure
-- differs; this is latent, not live. Also left for a separate decision.
--
-- WHAT THIS FILE DOES NOT DO: it does not make the page's own scope filters
-- redundant. The page asks the database for `owner_id IN (its scope)` whether
-- or not this file is applied, because an RLS policy is the boundary and a
-- query filter is the intent, and both should be right.
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Run these before applying.
-- ============================================================================

-- PREVIEW 1. The policies that will be replaced, as they stand.
SELECT tablename, policyname, cmd, qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('opportunities', 'future_orders', 'salesman_flags', 'escalation_logs')
ORDER BY tablename, policyname;
-- expect one company-wide policy per table:
--   opportunities    opportunities_company_access   ALL
--   future_orders    future_orders_access           ALL
--   salesman_flags   salesman_flags_access          ALL
--   escalation_logs  escalation_logs_access         ALL

-- PREVIEW 2. What a salesman can read today that he should not. Impersonates
-- inside a transaction that is rolled back, so nothing changes.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"ba03074d-8b5b-4378-bd51-6fe1f3ee225e","role":"authenticated"}', true);
SELECT 'opportunities' AS tbl, count(*) AS visible,
       count(*) FILTER (WHERE owner_id <> 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e') AS not_his
  FROM opportunities
UNION ALL
SELECT 'future_orders', count(*),
       count(*) FILTER (WHERE owner_id <> 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e')
  FROM future_orders
UNION ALL
SELECT 'salesman_flags', count(*),
       count(*) FILTER (WHERE owner_id <> 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e')
  FROM salesman_flags;
ROLLBACK;
-- measured on 2026-10-07: opportunities 349 / 230 · future_orders 108 / 52
--                         salesman_flags 7 / 5

-- PREVIEW 3. get_user_subordinates must exist and recurse, because the new
-- policies lean on it exactly as the sales_targets and deal_returns ones do.
SELECT p.proname, pg_get_function_result(p.oid) AS returns, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_user_subordinates';
-- expect: TABLE(subordinate_id uuid, ...) and security_definer = true

SELECT count(*) AS amer_subordinates
FROM public.get_user_subordinates('a35acac8-85d7-4e07-821c-5910fc0c3232') s;
-- expect 2: Hassan Ali Asiri and Mohamed Hussein.
--
-- NOT 3. get_user_subordinates() is ACTIVE-ONLY, so Ahmad Sulaiman Moamina —
-- inactive, reporting to Amer — is not returned. Two consequences, both
-- deliberate and both verified:
--
--   1. The new policies inherit that, so after this file a supervisor cannot
--      read a DEPARTED team member's plan items or future orders. That matches
--      the page exactly: scopeUserIds gives a supervisor his ACTIVE subtree
--      (team figures stay active-only, CEO decision 2026-10-07), so the page
--      never asks for those rows. Page scope is a subset of RLS scope, which
--      is the direction that cannot produce a broken screen.
--
--   2. It leaves one asymmetry on purpose: the DEALS policy is structural
--      (owner.supervisor_id = me) and has no is_active test, so a supervisor
--      can still read Ahmad's 11 deals even though he cannot read his plan
--      items. The page does not ask for either. Unifying the two is NOTE 1's
--      change, not this one.

-- PREVIEW 4. The figures the benchmark function must reproduce: the company
-- conversion over the 3 COMPLETED months, imported history excluded.
WITH w AS (
  SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '3 months' AS s,
         date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '1 second'  AS e
),
ach AS (
  SELECT u.id FROM users u
   WHERE u.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78' AND u.is_active
     AND (u.role IN ('salesman','supervisor') OR u.is_contributor IS TRUE)
),
d AS (
  SELECT d.stage, coalesce(d.invoice_number,'') ILIKE 'PRE-CRM%' AS imported
    FROM deals d, w
   WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
     AND d.owner_id IN (SELECT id FROM ach)
     AND d.created_at >= w.s AND d.created_at <= w.e
)
SELECT count(*) FILTER (WHERE NOT imported AND stage = 'won') AS won,
       count(*) FILTER (WHERE NOT imported)                   AS total,
       count(*) FILTER (WHERE imported)                       AS imported_excluded,
       round(100.0 * count(*) FILTER (WHERE NOT imported AND stage = 'won')
             / nullif(count(*) FILTER (WHERE NOT imported), 0), 1) AS win_rate_pct
FROM d;
-- expect, on 2026-10-07: won 97 · total 143 · 67.8%
-- Conversion stays ACTIVE-ONLY at every scope (it is a rate, not a total):
-- CEO decision 2026-10-07, see utils/achieverScope.js.


-- ============================================================================
-- APPLY — one transaction.
-- ============================================================================

BEGIN;

-- ── (a) opportunities: own, or a subordinate's, or a lead's company ────────
-- The company-wide policy is replaced, not supplemented: an extra permissive
-- policy would be OR'd with the old one and change nothing.
DROP POLICY IF EXISTS opportunities_company_access ON public.opportunities;

-- Reads: yourself, anyone under you (recursively), and any manager-and-above
-- for the whole company — which is what the Planning and Insights screens for
-- those roles already assume.
CREATE POLICY opportunities_select_scoped ON public.opportunities
  FOR SELECT USING (
    owner_id = auth.uid()
    OR owner_id IN (SELECT s.subordinate_id FROM public.get_user_subordinates(auth.uid()) s)
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = ANY (ARRAY['manager','director','head','admin']::user_role[])
         AND (u.company_id = opportunities.company_id OR u.company_id IS NULL)
    )
  );

-- Writes keep the company-wide shape they had: plan items are created and
-- edited through Planning by people who already pass the read policy, and
-- narrowing writes here is a separate change with its own blast radius.
CREATE POLICY opportunities_write_company ON public.opportunities
  FOR ALL USING (
    company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  );

-- ── (b) future_orders: the same shape ─────────────────────────────────────
DROP POLICY IF EXISTS future_orders_access ON public.future_orders;

CREATE POLICY future_orders_select_scoped ON public.future_orders
  FOR SELECT USING (
    owner_id = auth.uid()
    OR owner_id IN (SELECT s.subordinate_id FROM public.get_user_subordinates(auth.uid()) s)
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = ANY (ARRAY['manager','director','head','admin']::user_role[])
         AND (u.company_id = future_orders.company_id OR u.company_id IS NULL)
    )
  );

CREATE POLICY future_orders_write_company ON public.future_orders
  FOR ALL USING (
    company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  );

-- ── (c) salesman_flags: own / team only for the two new roles ─────────────
DROP POLICY IF EXISTS salesman_flags_access ON public.salesman_flags;

CREATE POLICY salesman_flags_select_scoped ON public.salesman_flags
  FOR SELECT USING (
    owner_id = auth.uid()
    OR owner_id IN (SELECT s.subordinate_id FROM public.get_user_subordinates(auth.uid()) s)
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = ANY (ARRAY['manager','director','head','admin']::user_role[])
         AND (u.company_id = salesman_flags.company_id OR u.company_id IS NULL)
    )
  );

-- The flags are written by background checks running as the service role,
-- which bypasses RLS; this keeps an authenticated write path for the review
-- action (marking a flag reviewed), which only the above roles can see anyway.
CREATE POLICY salesman_flags_write_company ON public.salesman_flags
  FOR ALL USING (
    company_id IN (SELECT u.company_id FROM public.users u WHERE u.id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT u.company_id FROM public.users u WHERE u.id = auth.uid())
  );

-- ── (d) escalation_logs: manager and above only ───────────────────────────
-- CEO decision 2026-10-07. Zero rows exist today, so this changes no screen —
-- it closes the door before anything walks through it.
DROP POLICY IF EXISTS escalation_logs_access ON public.escalation_logs;

CREATE POLICY escalation_logs_manager_up ON public.escalation_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = ANY (ARRAY['manager','director','head','admin']::user_role[])
         AND (u.company_id = escalation_logs.company_id OR u.company_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = ANY (ARRAY['manager','director','head','admin']::user_role[])
         AND (u.company_id = escalation_logs.company_id OR u.company_id IS NULL)
    )
  );

-- ── (e) the benchmark: a RATE, and nothing else ───────────────────────────
-- A salesman must not read company deals, and the CEO asked for the company
-- conversion rate beside his own. SECURITY DEFINER is the only way to compute
-- one from the other, so this function is deliberately as narrow as a function
-- can be: it returns four numbers, it takes no window or scope parameter a
-- caller could widen, and it never returns a row, a name or an amount.
--
-- The caller must belong to the company asked about — otherwise any
-- authenticated user could read any company's rate.
CREATE OR REPLACE FUNCTION public.company_conversion_3m(p_company_id uuid)
RETURNS TABLE (win_rate_pct numeric, won bigint, total bigint, imported_excluded bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
BEGIN
  -- Only for your own company.
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = auth.uid()
       AND (u.company_id = p_company_id OR u.company_id IS NULL)
  ) THEN
    RETURN;   -- no rows, not an error: the page hides the benchmark
  END IF;

  -- The 3 COMPLETED months, in Asia/Riyadh — the same window as
  -- utils/winRate3m.js, which the app computes from local date parts.
  v_start := date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '3 months';
  v_end   := date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '1 second';

  RETURN QUERY
  WITH ach AS (
    -- The ACHIEVER scope, active-only: conversion is a rate, not a total, and
    -- stays active-only at every scope (CEO decision 2026-10-07).
    SELECT u.id FROM public.users u
     WHERE u.company_id = p_company_id AND u.is_active
       AND (u.role = ANY (ARRAY['salesman','supervisor']::user_role[])
            OR u.is_contributor IS TRUE)
  ),
  d AS (
    SELECT dd.stage,
           coalesce(dd.invoice_number, '') ILIKE 'PRE-CRM%' AS imported
      FROM public.deals dd
     WHERE dd.company_id = p_company_id
       AND dd.owner_id IN (SELECT id FROM ach)
       AND dd.created_at >= v_start AND dd.created_at <= v_end
  )
  SELECT round(100.0 * count(*) FILTER (WHERE NOT d.imported AND d.stage = 'won')
               / nullif(count(*) FILTER (WHERE NOT d.imported), 0), 1),
         count(*) FILTER (WHERE NOT d.imported AND d.stage = 'won'),
         count(*) FILTER (WHERE NOT d.imported),
         count(*) FILTER (WHERE d.imported)
    FROM d;
END;
$$;

REVOKE ALL ON FUNCTION public.company_conversion_3m(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_conversion_3m(uuid) TO authenticated;

COMMIT;


-- ============================================================================
-- VERIFY — run after applying.
-- ============================================================================

-- 1. The new policies are in place and the old ones are gone.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('opportunities','future_orders','salesman_flags','escalation_logs')
ORDER BY tablename, policyname;
-- expect NO *_company_access / *_access rows, and the five new ones.

-- 2. THE POINT OF THE FILE: a salesman sees only his own rows.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"ba03074d-8b5b-4378-bd51-6fe1f3ee225e","role":"authenticated"}', true);
SELECT 'opportunities' AS tbl, count(*) AS visible,
       count(*) FILTER (WHERE owner_id <> 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e') AS must_be_zero
  FROM opportunities
UNION ALL
SELECT 'future_orders', count(*),
       count(*) FILTER (WHERE owner_id <> 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e')
  FROM future_orders
UNION ALL
SELECT 'salesman_flags', count(*),
       count(*) FILTER (WHERE owner_id <> 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e')
  FROM salesman_flags
UNION ALL
SELECT 'escalation_logs', count(*), count(*) FROM escalation_logs;
ROLLBACK;
-- expect must_be_zero = 0 on all four.

-- 3. A supervisor still sees his own team, and only his own team.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a35acac8-85d7-4e07-821c-5910fc0c3232","role":"authenticated"}', true);
-- Amer plus his two ACTIVE reports — the same set get_user_subordinates
-- returns, which is the same set the page scopes to.
WITH team AS (
  SELECT 'a35acac8-85d7-4e07-821c-5910fc0c3232'::uuid AS id
  UNION SELECT s.subordinate_id FROM public.get_user_subordinates('a35acac8-85d7-4e07-821c-5910fc0c3232') s
)
SELECT 'opportunities' AS tbl, count(*) AS visible,
       count(*) FILTER (WHERE owner_id NOT IN (SELECT id FROM team)) AS must_be_zero
  FROM opportunities
UNION ALL
SELECT 'future_orders', count(*),
       count(*) FILTER (WHERE owner_id NOT IN (SELECT id FROM team)) FROM future_orders
UNION ALL
SELECT 'salesman_flags', count(*),
       count(*) FILTER (WHERE owner_id NOT IN (SELECT id FROM team)) FROM salesman_flags;
ROLLBACK;
-- expect must_be_zero = 0 on all three, and visible > 0 for opportunities.

-- 4. A manager still sees the company (nothing regressed for the roles that
--    already had Insights).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"6fcb06dc-9cb0-4143-9f82-fb77a011024e","role":"authenticated"}', true);
SELECT count(*) AS opps_visible_to_kamal FROM opportunities;
ROLLBACK;
-- expect the company total (349 on 2026-10-07).

-- 5. The benchmark function returns the rate and nothing else.
SELECT * FROM public.company_conversion_3m('adf8ee78-cf78-4f02-932c-989a214bdd78');
-- expect win_rate_pct 67.8 · won 97 · total 143 · imported_excluded 71
--        (matches PREVIEW 4 and the app's own 97/143)

-- 6. ...and it refuses another company.
SELECT count(*) AS rows_for_a_foreign_company
FROM public.company_conversion_3m('00000000-0000-0000-0000-000000000000');
-- expect 0

-- 7. A salesman may execute it, and gets a rate with no row data.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"ba03074d-8b5b-4378-bd51-6fe1f3ee225e","role":"authenticated"}', true);
SELECT * FROM public.company_conversion_3m('adf8ee78-cf78-4f02-932c-989a214bdd78');
ROLLBACK;
-- expect the same 67.8 / 97 / 143 / 71 — a RATE, from someone who cannot read
-- a single one of the deals behind it.


-- ============================================================================
-- ROLLBACK — restores exactly the four policies this file replaced.
-- ============================================================================
-- The originals are reproduced verbatim from pg_policies as read on
-- 2026-10-07, so this is a true revert rather than an approximation.

-- BEGIN;
--
-- DROP POLICY IF EXISTS opportunities_select_scoped   ON public.opportunities;
-- DROP POLICY IF EXISTS opportunities_write_company   ON public.opportunities;
-- DROP POLICY IF EXISTS future_orders_select_scoped   ON public.future_orders;
-- DROP POLICY IF EXISTS future_orders_write_company   ON public.future_orders;
-- DROP POLICY IF EXISTS salesman_flags_select_scoped  ON public.salesman_flags;
-- DROP POLICY IF EXISTS salesman_flags_write_company  ON public.salesman_flags;
-- DROP POLICY IF EXISTS escalation_logs_manager_up    ON public.escalation_logs;
-- DROP FUNCTION IF EXISTS public.company_conversion_3m(uuid);
--
-- CREATE POLICY opportunities_company_access ON public.opportunities
--   FOR ALL USING (
--     company_id IN (
--       SELECT users.company_id FROM users WHERE users.id = auth.uid()
--       UNION
--       SELECT companies.id FROM companies
--        WHERE companies.id IN (SELECT director_companies.company_id
--                                 FROM director_companies
--                                WHERE director_companies.user_id = auth.uid())));
--
-- CREATE POLICY future_orders_access ON public.future_orders
--   FOR ALL USING (
--     company_id IN (
--       SELECT users.company_id FROM users WHERE users.id = auth.uid()
--       UNION
--       SELECT director_companies.company_id FROM director_companies
--        WHERE director_companies.user_id = auth.uid()));
--
-- CREATE POLICY salesman_flags_access ON public.salesman_flags
--   FOR ALL USING (
--     company_id IN (SELECT users.company_id FROM users WHERE users.id = auth.uid()));
--
-- CREATE POLICY escalation_logs_access ON public.escalation_logs
--   FOR ALL USING (
--     company_id IN (SELECT users.company_id FROM users WHERE users.id = auth.uid()));
--
-- COMMIT;
-- ============================================================================
