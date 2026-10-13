-- ============================================================================
-- NOT APPLIED. Written 2026-10-13 (session 24). Run the blocks in order, each
-- on its own: PREVIEW (read-only) → APPLY → VERIFY. ROLLBACK at the end.
--
-- WHY
--   The one conversion rule (CEO 2026-10-13): a person with no deals of his
--   own in the 3 completed months borrows his DIVISION's 3-month conversion
--   (if the division has at least 10 deals), else the company's. A salesman
--   cannot read the division's deals (deals RLS), so — exactly like
--   company_conversion_3m in migrations/insights_rls.sql — the rate comes from
--   a narrow SECURITY DEFINER function that returns four numbers and nothing
--   else.
--
-- THE APP BEFORE THIS IS APPLIED
--   fetchConversionBase (utils/planningCalculations.js) treats a missing
--   function as "no answer" and counts the deals the viewer can read instead.
--   For a manager, a director and /numbers-check that is the whole company,
--   so the figures are the same before and after. For a salesman with no
--   history it is only what RLS lets him read — this function is what makes
--   his screen match his manager's.
--
-- Same window, scope and exclusions as company_conversion_3m:
--   3 COMPLETED months in Asia/Riyadh · active achievers (salesman,
--   supervisor, or is_contributor) · PRE-CRM imports excluded · plus
--   deals.division_id = p_division_id.
-- ============================================================================


-- ── PREVIEW (read-only) ─────────────────────────────────────────────────────
-- 1. The function does not exist yet.
SELECT count(*) AS division_conversion_3m_exists
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'division_conversion_3m';
-- expect 0

-- 2. What it will return, per division (the same query as the body below).
WITH w AS (
  SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '3 months' AS s,
         date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '1 second'  AS e
), ach AS (
  SELECT u.id FROM public.users u
   WHERE u.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78' AND u.is_active
     AND (u.role = ANY (ARRAY['salesman','supervisor']::user_role[])
          OR u.is_contributor IS TRUE)
), d AS (
  SELECT dd.division_id, dd.stage,
         coalesce(dd.invoice_number, '') ILIKE 'PRE-CRM%' AS imported
    FROM public.deals dd, w
   WHERE dd.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
     AND dd.owner_id IN (SELECT id FROM ach)
     AND dd.created_at >= w.s AND dd.created_at <= w.e
)
SELECT sd.name,
       round(100.0 * count(*) FILTER (WHERE NOT d.imported AND d.stage = 'won')
             / nullif(count(*) FILTER (WHERE NOT d.imported), 0), 1) AS win_rate_pct,
       count(*) FILTER (WHERE NOT d.imported AND d.stage = 'won') AS won,
       count(*) FILTER (WHERE NOT d.imported)                     AS total,
       count(*) FILTER (WHERE d.imported)                         AS imported_excluded
  FROM d JOIN public.sales_divisions sd ON sd.id = d.division_id
 GROUP BY sd.name ORDER BY sd.name;
-- expect, as read by the app on 2026-10-13:
--   Export            100.0 ·  6 /   6
--   Pipes & Fittings   69.0 · 80 / 116
--   PVC Compound       85.7 ·  6 /   7
--   PVC Sheet          35.7 ·  5 /  14


-- ── APPLY ───────────────────────────────────────────────────────────────────
BEGIN;

CREATE OR REPLACE FUNCTION public.division_conversion_3m(p_company_id uuid, p_division_id uuid)
RETURNS TABLE (win_rate_pct numeric, won bigint, total bigint, imported_excluded bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
BEGIN
  -- Only for your own company, same guard as company_conversion_3m.
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = auth.uid()
       AND (u.company_id = p_company_id OR u.company_id IS NULL)
  ) THEN
    RETURN;   -- no rows, not an error: the app falls back
  END IF;

  v_start := date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '3 months';
  v_end   := date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '1 second';

  RETURN QUERY
  WITH ach AS (
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
       AND dd.division_id = p_division_id
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

REVOKE ALL ON FUNCTION public.division_conversion_3m(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.division_conversion_3m(uuid, uuid) TO authenticated;

COMMIT;


-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- 1. SECURITY DEFINER with search_path pinned.
SELECT p.proname, p.prosecdef, p.proconfig
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'division_conversion_3m';
-- expect prosecdef = true, proconfig = {search_path=public}

-- 2. As a SALESMAN (Mohamed Hussein), Pipes & Fittings: the same counts as
--    PREVIEW 2, from someone who cannot read the deals behind them.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"ba03074d-8b5b-4378-bd51-6fe1f3ee225e","role":"authenticated"}', true);
SELECT * FROM public.division_conversion_3m(
  'adf8ee78-cf78-4f02-932c-989a214bdd78',
  (SELECT id FROM public.sales_divisions
    WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78' AND name = 'Pipes & Fittings'));
ROLLBACK;
-- expect the Pipes & Fittings row of PREVIEW 2 (69.0 · 80 / 116 on 2026-10-13)

-- 3. It refuses another company.
SELECT count(*) AS rows_for_a_foreign_company
  FROM public.division_conversion_3m('00000000-0000-0000-0000-000000000000',
                                     '00000000-0000-0000-0000-000000000000');
-- expect 0 (when run as a user of JASCO; as postgres auth.uid() is NULL → 0)


-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.division_conversion_3m(uuid, uuid);
-- The app keeps working: fetchConversionBase falls back to readable deals.
