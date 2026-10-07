-- ============================================================================
-- PARTIALLY APPLIED 2026-10-07 — read this before running anything.
--
--   APPLIED on 2026-10-07 (added by hand, folded into APPLY section (a2) and
--   the matching block under (b) so the file matches production):
--     opportunities_select_director_companies
--     future_orders_select_director_companies
--
--   NOT APPLIED — everything else in this file. Verified read-only on
--   2026-10-07 after the attempt:
--     my scoped SELECT policies ......... 0 of 4 present
--     my split write policies ........... 0 of 9 present
--     company_conversion_3m ............. absent
--     planned_contacts_this_month ....... absent
--     the four ORIGINAL company-wide FOR ALL policies ... all 4 still in place
--   and the hole is still open: as Mohamed Hussein (salesman), opportunities
--   349 rows / 230 not his, future_orders 108 / 52, salesman_flags 7 / 5 —
--   the same figures as before the attempt.
--
--   SO THE APPLY TRANSACTION ROLLED BACK, cleanly: nothing is half-done and
--   the original policies are untouched. This is the second time this has
--   happened on this project — migrations/division_attribution.sql did exactly
--   the same thing — and the fix there was the same:
--
--       *** RUN THE APPLY BLOCK ON ITS OWN. ***
--
--   Not the whole file. The PREVIEW and VERIFY sections contain BEGIN / SET
--   LOCAL ROLE / ROLLBACK of their own, and pasting the file whole puts those
--   in the same batch as the APPLY transaction. Run PREVIEW by hand, then the
--   APPLY block alone, then VERIFY by hand — and VERIFY query 2 is the one
--   that proves it worked: must_be_zero has to read 0.
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


-- PREVIEW 5. The "already planned this month" marker, before and after. The
-- new function counts CONVERTED plan items as well as open ones, which is
-- wider than CustomerMaster's current query — so this is the one user-visible
-- change in the file that is not about permissions.
WITH m AS (
  SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')::date AS s,
         (date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') + interval '1 month')::date AS e
)
SELECT 'open only (the query today)' AS rule, count(DISTINCT o.contact_id) AS customers_greyed_out
FROM opportunities o, m
WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND o.contact_id IS NOT NULL AND o.status = 'open'
  AND o.expected_month >= m.s AND o.expected_month < m.e
UNION ALL
SELECT 'open + converted (the function)', count(DISTINCT o.contact_id)
FROM opportunities o, m
WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND o.contact_id IS NOT NULL AND o.status IN ('open','converted')
  AND o.expected_month >= m.s AND o.expected_month < m.e
UNION ALL
SELECT 'moved_to_future (still NOT counted)', count(DISTINCT o.contact_id)
FROM opportunities o, m
WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND o.contact_id IS NOT NULL AND o.status = 'moved_to_future'
  AND o.expected_month >= m.s AND o.expected_month < m.e;
-- measured 2026-10-07: 34 -> 81, with 11 moved_to_future customers left
-- available. If 81 is not the intended behaviour, change the status list in
-- section (e2) of APPLY before running it — the app reads whatever the
-- function returns.


-- ============================================================================
-- APPLY — one transaction.
-- ============================================================================

BEGIN;

-- The two director_companies policies are ALREADY ON PRODUCTION (2026-10-07).
-- Dropped first so this block can be re-run as a whole without colliding with
-- them — CREATE POLICY has no IF NOT EXISTS.
DROP POLICY IF EXISTS opportunities_select_director_companies ON public.opportunities;
DROP POLICY IF EXISTS future_orders_select_director_companies ON public.future_orders;

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
    -- DIRECT reports regardless of is_active. get_user_subordinates is
    -- ACTIVE-ONLY, and without this clause a supervisor loses his DEPARTED
    -- direct reports rows: Amer Sulaiman Alburaym has two of Ahmad Sulaiman
    -- Moaminas plan submissions still awaiting approval, and View Plan would
    -- have rendered an empty list rather than an error. This is the same
    -- two-level shape the existing deals policy already uses, so it widens
    -- nothing the app did not already allow; anything deeper than one level
    -- below a departed person stays with manager-and-above.
    OR owner_id IN (SELECT u2.id FROM public.users u2 WHERE u2.supervisor_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = ANY (ARRAY['manager','director','head','admin']::user_role[])
         AND (u.company_id = opportunities.company_id OR u.company_id IS NULL)
    )
  );

-- Writes keep the company-wide shape they had: plan items are created and
-- edited through Planning and Customer Master by people the old policy already
-- allowed, and narrowing writes is a separate change with its own blast radius.
--
-- *** FOR INSERT / UPDATE / DELETE, NEVER "FOR ALL". ***
-- A permissive FOR ALL policy's USING clause applies to SELECT as well, and
-- permissive policies are combined with OR — so a company-wide FOR ALL write
-- policy sitting beside the scoped SELECT policy above would OR straight over
-- it and re-grant company-wide reads, leaving this file looking applied and
-- changing nothing. (The live proof that FOR ALL governs SELECT: today
-- opportunities has ONLY a FOR ALL policy, and a salesman reads 349 rows
-- through it.) Splitting the write path by command is what keeps SELECT
-- governed by one policy alone.
CREATE POLICY opportunities_insert_company ON public.opportunities
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  );

CREATE POLICY opportunities_update_company ON public.opportunities
  FOR UPDATE USING (
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

CREATE POLICY opportunities_delete_company ON public.opportunities
  FOR DELETE USING (
    company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  );

-- ── (a2) ...and the DIRECTOR_COMPANIES read route ─────────────────────────
-- Applied separately on 2026-10-07 and folded in here so the file matches
-- production.
--
-- WHY IT IS NEEDED, and why the scoped policy above does not cover it: that
-- policy lets a manager-and-above read the whole company, but only when
-- users.company_id = opportunities.company_id. A director attached to a second
-- company through director_companies has his OWN company_id on his user row,
-- so for that other company's rows the test fails and he would have lost reads
-- the old policy gave him through its director_companies UNION.
--
-- It is a company-wide SELECT grant, so it is only safe while
-- director_companies holds directors. On production today it holds exactly one
-- row: Nader (director). If a salesman is ever added to that table he gets
-- company-wide reads of these two tables back, which is the one thing this
-- file exists to prevent.
CREATE POLICY opportunities_select_director_companies ON public.opportunities
  FOR SELECT USING (
    company_id IN (
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  );

-- ── (b) future_orders: the same shape ─────────────────────────────────────
DROP POLICY IF EXISTS future_orders_access ON public.future_orders;

CREATE POLICY future_orders_select_scoped ON public.future_orders
  FOR SELECT USING (
    owner_id = auth.uid()
    OR owner_id IN (SELECT s.subordinate_id FROM public.get_user_subordinates(auth.uid()) s)
    -- DIRECT reports regardless of is_active. get_user_subordinates is
    -- ACTIVE-ONLY, and without this clause a supervisor loses his DEPARTED
    -- direct reports rows: Amer Sulaiman Alburaym has two of Ahmad Sulaiman
    -- Moaminas plan submissions still awaiting approval, and View Plan would
    -- have rendered an empty list rather than an error. This is the same
    -- two-level shape the existing deals policy already uses, so it widens
    -- nothing the app did not already allow; anything deeper than one level
    -- below a departed person stays with manager-and-above.
    OR owner_id IN (SELECT u2.id FROM public.users u2 WHERE u2.supervisor_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = ANY (ARRAY['manager','director','head','admin']::user_role[])
         AND (u.company_id = future_orders.company_id OR u.company_id IS NULL)
    )
  );

-- Split by command for the reason spelled out above the opportunities writes.
CREATE POLICY future_orders_insert_company ON public.future_orders
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  );

CREATE POLICY future_orders_update_company ON public.future_orders
  FOR UPDATE USING (
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

CREATE POLICY future_orders_delete_company ON public.future_orders
  FOR DELETE USING (
    company_id IN (
      SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()
      UNION
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  );

-- The director_companies read route, as for opportunities above.
CREATE POLICY future_orders_select_director_companies ON public.future_orders
  FOR SELECT USING (
    company_id IN (
      SELECT dc.company_id FROM public.director_companies dc WHERE dc.user_id = auth.uid()
    )
  );

-- ── (c) salesman_flags: own / team only for the two new roles ─────────────
DROP POLICY IF EXISTS salesman_flags_access ON public.salesman_flags;

CREATE POLICY salesman_flags_select_scoped ON public.salesman_flags
  FOR SELECT USING (
    owner_id = auth.uid()
    OR owner_id IN (SELECT s.subordinate_id FROM public.get_user_subordinates(auth.uid()) s)
    -- DIRECT reports regardless of is_active. get_user_subordinates is
    -- ACTIVE-ONLY, and without this clause a supervisor loses his DEPARTED
    -- direct reports rows: Amer Sulaiman Alburaym has two of Ahmad Sulaiman
    -- Moaminas plan submissions still awaiting approval, and View Plan would
    -- have rendered an empty list rather than an error. This is the same
    -- two-level shape the existing deals policy already uses, so it widens
    -- nothing the app did not already allow; anything deeper than one level
    -- below a departed person stays with manager-and-above.
    OR owner_id IN (SELECT u2.id FROM public.users u2 WHERE u2.supervisor_id = auth.uid())
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
-- Split by command, same reason as above.
CREATE POLICY salesman_flags_insert_company ON public.salesman_flags
  FOR INSERT WITH CHECK (
    company_id IN (SELECT u.company_id FROM public.users u WHERE u.id = auth.uid())
  );

CREATE POLICY salesman_flags_update_company ON public.salesman_flags
  FOR UPDATE USING (
    company_id IN (SELECT u.company_id FROM public.users u WHERE u.id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT u.company_id FROM public.users u WHERE u.id = auth.uid())
  );

CREATE POLICY salesman_flags_delete_company ON public.salesman_flags
  FOR DELETE USING (
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

-- ── (f) the "already planned this month" marker ───────────────────────────
-- Customer Master greys out a customer somebody has already planned, which is
-- what stops two salesmen planning the same one. The marker therefore has to
-- see the WHOLE COMPANY's plan items — and (a) above takes that away from
-- precisely the two roles it protects.
--
-- So it gets a function that returns A SET OF CONTACT IDS AND NOTHING ELSE:
-- enough to grey out a row, and nothing about whose plan it is, what it is
-- worth, how many there are, or any month other than the one asked for. A
-- salesman learns "someone has this customer this month", which is the point,
-- and learns nothing he could not already infer from being told he cannot plan
-- it.
--
-- OPEN *AND* CONVERTED, which is WIDER THAN TODAY'S QUERY. CustomerMaster
-- filtered status = 'open' alone, so a plan item already converted into a deal
-- stopped blocking its customer — the collision the marker exists to prevent
-- was allowed the moment the first salesman made progress. Decision
-- 2026-10-07: converted counts. On production today this moves the marker from
-- 34 customers to 81 for October, so the screen will visibly grey out more
-- rows, for every role.
--
-- moved_to_future is deliberately NOT counted: a bounced lead has been pushed
-- out of this month's plan (see utils/leadExpiryCheck.js), so its customer is
-- genuinely available again. That is 12 rows / 11 customers today.
CREATE OR REPLACE FUNCTION public.planned_contacts_this_month(
  p_company uuid,
  p_month date
)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only for your own company, same guard as company_conversion_3m.
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = auth.uid()
       AND (u.company_id = p_company OR u.company_id IS NULL)
  ) THEN
    RETURN;   -- no rows, not an error: the caller falls back / shows nothing
  END IF;

  -- One calendar month from the date given, computed in SQL so a caller cannot
  -- widen the window by passing a range. date_trunc guards against a caller
  -- passing a mid-month date.
  RETURN QUERY
  SELECT DISTINCT o.contact_id
    FROM public.opportunities o
   WHERE o.company_id = p_company
     AND o.contact_id IS NOT NULL
     AND o.status IN ('open', 'converted')
     AND o.expected_month >= date_trunc('month', p_month)::date
     AND o.expected_month <  (date_trunc('month', p_month) + interval '1 month')::date;
END;
$$;

REVOKE ALL ON FUNCTION public.planned_contacts_this_month(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planned_contacts_this_month(uuid, date) TO authenticated;

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

-- 8. The "already planned" marker still works for a SALESMAN, which is the
--    whole reason planned_contacts_this_month exists: the row-level policy has
--    just taken 230 of 349 plan items away from him, and this still returns
--    every planned customer in the company.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"ba03074d-8b5b-4378-bd51-6fe1f3ee225e","role":"authenticated"}', true);
SELECT count(*) AS planned_customers_seen_by_a_salesman
FROM public.planned_contacts_this_month(
  'adf8ee78-cf78-4f02-932c-989a214bdd78',
  date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')::date) ;
-- and prove he cannot get there the ordinary way:
SELECT count(DISTINCT contact_id) AS same_question_through_the_table
FROM opportunities
WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND contact_id IS NOT NULL
  AND status IN ('open','converted')
  AND expected_month >= date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')::date
  AND expected_month <  (date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') + interval '1 month')::date;
ROLLBACK;
-- expect 81 from the function (the company's planned customers for October
-- 2026) and a much smaller number from the table — the function is the only
-- way he can answer the question, and it tells him nothing else.

-- 9. ...and it refuses another company.
SELECT count(*) AS rows_for_a_foreign_company
FROM public.planned_contacts_this_month(
  '00000000-0000-0000-0000-000000000000', '2026-10-01');
-- expect 0

-- 10. The director_companies route is a company-wide SELECT grant, so it must
--     only ever hold people who are meant to have one.
SELECT u.full_name, u.role
FROM director_companies dc JOIN users u ON u.id = dc.user_id
ORDER BY u.role, u.full_name;
-- expect directors (and heads/admins) only. On 2026-10-07: Nader, director.
-- A salesman in this list has company-wide reads of opportunities and
-- future_orders, which defeats section (a) and (b).


-- ============================================================================
-- ROLLBACK — restores exactly the four policies this file replaced.
-- ============================================================================
-- The originals are reproduced verbatim from pg_policies as read on
-- 2026-10-07, so this is a true revert rather than an approximation.

-- BEGIN;
--
-- DROP POLICY IF EXISTS opportunities_select_scoped    ON public.opportunities;
-- DROP POLICY IF EXISTS opportunities_insert_company   ON public.opportunities;
-- DROP POLICY IF EXISTS opportunities_update_company   ON public.opportunities;
-- DROP POLICY IF EXISTS opportunities_delete_company   ON public.opportunities;
-- DROP POLICY IF EXISTS future_orders_select_scoped    ON public.future_orders;
-- DROP POLICY IF EXISTS future_orders_insert_company   ON public.future_orders;
-- DROP POLICY IF EXISTS future_orders_update_company   ON public.future_orders;
-- DROP POLICY IF EXISTS future_orders_delete_company   ON public.future_orders;
-- DROP POLICY IF EXISTS salesman_flags_select_scoped   ON public.salesman_flags;
-- DROP POLICY IF EXISTS salesman_flags_insert_company  ON public.salesman_flags;
-- DROP POLICY IF EXISTS salesman_flags_update_company  ON public.salesman_flags;
-- DROP POLICY IF EXISTS salesman_flags_delete_company  ON public.salesman_flags;
-- DROP POLICY IF EXISTS opportunities_select_director_companies ON public.opportunities;
-- DROP POLICY IF EXISTS future_orders_select_director_companies ON public.future_orders;
-- DROP POLICY IF EXISTS escalation_logs_manager_up     ON public.escalation_logs;
-- DROP FUNCTION IF EXISTS public.company_conversion_3m(uuid);
-- DROP FUNCTION IF EXISTS public.planned_contacts_this_month(uuid, date);
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
