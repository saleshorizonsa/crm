-- ============================================================================
-- NOT APPLIED. Read the PREVIEW, then run APPLY, then run VERIFY.
--
-- DIVISION ATTRIBUTION — attribute a multi-division person's TARGET and PLAN
-- by division, the same way deals already are. (Business decision, option 2,
-- 2026-10-06.)
-- ============================================================================
--
-- THE PROBLEM. deals carry deals.division_id, so a deal belongs to ONE
-- division. Targets and plan items carried no division at all, so the panel
-- attributed them PER PERSON — and a person in two divisions had their whole
-- target and whole plan counted in BOTH. Mohamed Kamal is in Export (primary)
-- and PVC Compound (additional), so his October target (1,550,000 total_value
-- plus 500,000 by_clients) and his whole open plan (1,179,250) were counted
-- twice over. The panel's targets summed to 5.75M against a company target of
-- 3.70M.
--
-- WHAT "PRIMARY DIVISION" MEANS HERE: users.sales_division_id. There is no
-- is_primary column on user_sales_divisions — that table holds the ADDITIONAL
-- memberships only — so the primary is the one on the user row. Checked against
-- the live schema on 2026-10-06.
--
-- FOUR THINGS THE BRIEF DID NOT KNOW, all verified read-only on 2026-10-06:
--
--   1. sales_targets.division_id ALREADY EXISTS, and 6 of the 47 rows already
--      have it set — all six of October's. So this file ADDs the column only if
--      it is missing, and the backfill touches only the 41 NULL rows. It does
--      NOT overwrite a value somebody has already chosen.
--
--   2. Kamal's two October rows are already attributed, and OPPOSITE to the way
--      the brief described them: the 1,550,000 total_value row is on PVC
--      Compound and the 500,000 by_clients row (Al BADAH) is on Export.
--      DECISION 2026-10-06: LEAVE THEM AS THEY ARE. This file therefore does not
--      touch them, and the October division targets are
--          Pipes & Fittings  826,000
--          PVC Compound    1,550,000
--          PVC Sheet         825,000
--          Export            500,000
--          TOTAL           3,701,000  = the company target, exactly
--      which is the same total as the brief's figures with Export and PVC
--      Compound the other way round. Both rows are shown in PREVIEW 1 so the
--      decision can be reversed by editing two uuids, and the statement to do
--      that is written out (commented) in the APPLY section.
--
--   3. 23 non-imported deals have division_id NULL, not 6. Seventeen belong to
--      Shaikh Osman Shoukat, who is INACTIVE and has NO primary division, so
--      "backfill to the owner's primary" cannot reach them. DECISION: leave
--      them NULL. He is outside the achiever scope, so they affect no figure on
--      the panel today. They are listed in PREVIEW 3 so the decision is visible
--      rather than implicit. The 6 the brief meant — Amer 4, Kamal 2, all
--      created since 2026-09-15 — are the ones this file backfills.
--
--   4. NEITHER opportunities NOR future_orders had a division_id column. The
--      brief asked for opportunities; future_orders needs one for the same
--      reason (the panel filters carry-in by division too), and DECISION
--      2026-10-06 was to add it. Both are added here.
--
-- ONE EXPLICIT DATA DECISION, not a backfill: of Kamal's five OPEN October plan
-- items, Al BADAH (600,000) belongs to PVC Compound — it is the customer his
-- by_clients target names — and the other four stay on his primary, Export:
--     PLASTICO BAHRAIN  307,500
--     GHAZER UNITED      97,500
--     NATIONAL BUYUT     92,250
--     Resources Projects  82,000
-- (Decision 2026-10-06. The five total 1,179,250.)
--
-- TRIGGERS. Every one of these four tables has a BEFORE UPDATE trigger that
-- rewrites updated_at, and sales_targets also has trigger_validate_target_
-- assignment on INSERT **and UPDATE**, which runs the budget checks. A plain
-- backfill UPDATE would therefore rewrite every updated_at and could be
-- REJECTED outright by the budget validator. All of them are disabled inside
-- the transaction and re-enabled before it commits, so a failure rolls the
-- disable back with everything else.
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Run all five and read them before applying.
-- ============================================================================

-- PREVIEW 1. Kamal's two October target rows, as the brief asked to see them.
-- Nothing below changes these; they are already attributed.
SELECT t.id,
       u.full_name                       AS assignee,
       t.target_type,
       t.target_amount,
       (SELECT string_agg(c.client_name || ' ' || c.target_amount, ', ')
          FROM client_targets c WHERE c.sales_target_id = t.id) AS client_breakdown,
       sd.name                           AS division_now,
       psd.name                          AS assignee_primary,
       'unchanged by this file'          AS action
FROM sales_targets t
JOIN users u            ON u.id  = t.assigned_to
LEFT JOIN sales_divisions sd  ON sd.id  = t.division_id
LEFT JOIN sales_divisions psd ON psd.id = u.sales_division_id
WHERE t.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND t.status = 'active' AND t.period_type = 'monthly'
  AND t.period_start <= '2026-10-31' AND t.period_end >= '2026-10-01'
ORDER BY u.full_name, t.target_type;

-- PREVIEW 2. The sales_targets rows the backfill WILL touch: division_id NULL
-- and an assignee who has a primary division. Anything with no primary stays
-- NULL and is listed separately.
SELECT 'will backfill' AS bucket, count(*) AS rows,
       count(DISTINCT t.assigned_to) AS people
FROM sales_targets t JOIN users u ON u.id = t.assigned_to
WHERE t.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND t.division_id IS NULL AND u.sales_division_id IS NOT NULL
UNION ALL
SELECT 'stays NULL (assignee has no primary division)', count(*),
       count(DISTINCT t.assigned_to)
FROM sales_targets t JOIN users u ON u.id = t.assigned_to
WHERE t.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND t.division_id IS NULL AND u.sales_division_id IS NULL
UNION ALL
SELECT 'already set, left alone', count(*), count(DISTINCT t.assigned_to)
FROM sales_targets t
WHERE t.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND t.division_id IS NOT NULL;

-- PREVIEW 3. EVERY deal with a NULL division_id, non-imported, one row each —
-- the brief asked for the full list. The `action` column says what will happen
-- to it, so the 17 that stay NULL are visible rather than silently skipped.
SELECT d.id,
       u.full_name                                   AS owner,
       u.is_active                                   AS owner_active,
       coalesce(psd.name, '(NO PRIMARY DIVISION)')   AS owner_primary,
       d.title, d.stage, d.amount, d.final_amount, d.is_invoiced,
       d.created_at::date                            AS created,
       CASE WHEN u.sales_division_id IS NULL
            THEN 'STAYS NULL — owner has no primary division'
            ELSE 'backfill -> ' || psd.name END      AS action
FROM deals d
JOIN users u ON u.id = d.owner_id
LEFT JOIN sales_divisions psd ON psd.id = u.sales_division_id
WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND d.division_id IS NULL
  AND coalesce(d.invoice_number, '') NOT ILIKE 'PRE-CRM%'
ORDER BY u.full_name, d.created_at;

-- PREVIEW 4. Kamal's October plan items, so the one explicit override is
-- visible beside the four that take his primary division.
SELECT o.id, o.customer_name, o.planned_amount, o.status,
       CASE WHEN o.id = 'f4607713-9c8b-496b-8eca-5fcfb7d15fcd'
            THEN 'OVERRIDE -> PVC Compound (his by_clients target names Al BADAH)'
            ELSE 'backfill -> Export (his primary)' END AS action
FROM opportunities o
JOIN users u ON u.id = o.owner_id
WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND u.full_name ILIKE '%kamal%'
  AND o.expected_month BETWEEN '2026-10-01' AND '2026-10-31'
ORDER BY o.status, o.planned_amount DESC;

-- PREVIEW 5. THE FIGURES THIS IS FOR: October 2026 per division, as the panel
-- will read them AFTER applying. The TOTAL row must equal the company figures
-- the dashboards already show — 3,701,000 target — or do not apply this.
WITH ach AS (
  SELECT u.id FROM users u
  WHERE u.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78' AND u.is_active
    AND (u.role IN ('salesman','supervisor') OR u.is_contributor IS TRUE)
),
dv AS (SELECT d.*, coalesce(d.division_id, u.sales_division_id) AS eff
       FROM deals d JOIN users u ON u.id = d.owner_id
       WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'),
tg AS (SELECT t.id, coalesce(t.division_id, u.sales_division_id) AS eff,
         greatest(coalesce(t.target_amount,0),
           coalesce((SELECT sum(c.target_amount) FROM client_targets c
                      WHERE c.sales_target_id = t.id),0)) AS row_value
       FROM sales_targets t JOIN users u ON u.id = t.assigned_to
       WHERE t.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
         AND t.status='active' AND t.period_type='monthly'
         AND t.period_start <= '2026-10-31' AND t.period_end >= '2026-10-01'
         AND t.assigned_to IN (SELECT id FROM ach)),
op AS (SELECT o.planned_amount,
         CASE WHEN o.id = 'f4607713-9c8b-496b-8eca-5fcfb7d15fcd'
              THEN '115dae2d-0ff0-41cd-b64f-47ca57cf9126'::uuid
              ELSE u.sales_division_id END AS eff
       FROM opportunities o JOIN users u ON u.id = o.owner_id
       WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
         AND o.status='open'
         AND o.expected_month BETWEEN '2026-10-01' AND '2026-10-31'
         AND o.owner_id IN (SELECT id FROM ach))
SELECT coalesce(sd.name, 'ZZ TOTAL (must equal the company figures)') AS division,
       (SELECT coalesce(sum(row_value),0) FROM tg
          WHERE sd.id IS NULL OR tg.eff = sd.id)                     AS target,
       (SELECT coalesce(sum(coalesce(x.final_amount,x.amount)),0) FROM dv x
          WHERE (sd.id IS NULL OR x.eff = sd.id)
            AND x.stage='won' AND x.is_invoiced
            AND x.invoice_date BETWEEN '2026-10-01' AND '2026-10-31'
            AND x.owner_id IN (SELECT id FROM ach))                   AS achieved,
       (SELECT coalesce(sum(o.planned_amount),0) FROM op o
          WHERE sd.id IS NULL OR o.eff = sd.id)                       AS planned_open,
       (SELECT coalesce(sum(x.amount),0) FROM dv x
          WHERE (sd.id IS NULL OR x.eff = sd.id)
            AND x.stage NOT IN ('won','lost')
            AND x.owner_id IN (SELECT id FROM ach)
            AND (x.expected_close_date IS NULL
                 OR x.expected_close_date BETWEEN '2026-10-01' AND '2026-10-31')) AS funnel
FROM (SELECT id, name FROM sales_divisions
      WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
      UNION ALL SELECT NULL, NULL) sd
ORDER BY 1;


-- ============================================================================
-- APPLY — one transaction. Review the preview first.
-- ============================================================================

BEGIN;

-- The updated_at triggers, and the sales_targets budget VALIDATOR, which fires
-- on UPDATE as well as INSERT and could reject a backfill that changes nothing
-- it cares about. Disabled here, re-enabled before COMMIT; a failure anywhere
-- below rolls the disable back along with everything else.
ALTER TABLE public.deals          DISABLE TRIGGER update_deals_updated_at;
ALTER TABLE public.opportunities  DISABLE TRIGGER opportunities_updated_at;
ALTER TABLE public.future_orders  DISABLE TRIGGER future_orders_updated_at;
ALTER TABLE public.sales_targets  DISABLE TRIGGER trigger_update_sales_targets_updated_at;
ALTER TABLE public.sales_targets  DISABLE TRIGGER trigger_validate_target_assignment;

-- ── (a) sales_targets.division_id ──────────────────────────────────────────
-- The column already exists on production; IF NOT EXISTS makes this safe to
-- run anywhere.
ALTER TABLE public.sales_targets
  ADD COLUMN IF NOT EXISTS division_id uuid NULL REFERENCES public.sales_divisions(id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_division_id
  ON public.sales_targets(division_id);

-- NULL rows only. A row somebody has already attributed is never overwritten.
UPDATE public.sales_targets t
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = t.assigned_to
   AND t.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

-- To REVERSE decision 2 (Kamal's two October rows), uncomment these two:
-- UPDATE public.sales_targets SET division_id = '115dae2d-0ff0-41cd-b64f-47ca57cf9126'
--   WHERE id = '190d8d2b-d3fa-4929-a8cf-82fdf191f67d';  -- by_clients Al BADAH -> PVC Compound
-- UPDATE public.sales_targets SET division_id = '78733b2e-3f61-4fd1-a4d1-3bbc71451d0e'
--   WHERE id = 'de453335-c564-4683-a808-6cf7a669e8d0';  -- total_value 1.55M -> Export

-- ── (b) opportunities.division_id ──────────────────────────────────────────
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS division_id uuid NULL REFERENCES public.sales_divisions(id);
CREATE INDEX IF NOT EXISTS idx_opportunities_division_id
  ON public.opportunities(division_id);

UPDATE public.opportunities o
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = o.owner_id
   AND o.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

-- The one explicit override (decision 2026-10-06): Kamal's Al BADAH plan item
-- belongs to PVC Compound, the division his by_clients target names. Written
-- AFTER the backfill so it wins, and keyed by id so it can touch nothing else.
UPDATE public.opportunities
   SET division_id = '115dae2d-0ff0-41cd-b64f-47ca57cf9126'  -- PVC Compound
 WHERE id = 'f4607713-9c8b-496b-8eca-5fcfb7d15fcd';

-- ── (b2) future_orders.division_id ─────────────────────────────────────────
-- Not in the brief's list; added by decision 2026-10-06 so carry-in splits by
-- division like everything else.
ALTER TABLE public.future_orders
  ADD COLUMN IF NOT EXISTS division_id uuid NULL REFERENCES public.sales_divisions(id);
CREATE INDEX IF NOT EXISTS idx_future_orders_division_id
  ON public.future_orders(division_id);

UPDATE public.future_orders f
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = f.owner_id
   AND f.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

-- ── (c) deals backfill ────────────────────────────────────────────────────
-- Only rows whose OWNER has a primary division. The 17 belonging to an
-- inactive owner with no primary stay NULL, by decision — see PREVIEW 3.
UPDATE public.deals d
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = d.owner_id
   AND d.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

-- ── (d) BEFORE INSERT triggers ────────────────────────────────────────────
-- So this never has to be backfilled again. Only DealModal set division_id;
-- every other insert path left it NULL, which is how six deals created since
-- 2026-09-15 vanished from the panel.
--
-- Each one is a no-op when division_id is already supplied, so a form that
-- offers a division picker (a multi-division person) still wins.
-- SET search_path is pinned: a SECURITY INVOKER trigger function with a
-- mutable search_path is how a schema-shadowing attack gets in.

CREATE OR REPLACE FUNCTION public.set_division_from_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.division_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    SELECT u.sales_division_id INTO NEW.division_id
      FROM public.users u WHERE u.id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_division_from_assignee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.division_id IS NULL AND NEW.assigned_to IS NOT NULL THEN
    SELECT u.sales_division_id INTO NEW.division_id
      FROM public.users u WHERE u.id = NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_deals_division          ON public.deals;
DROP TRIGGER IF EXISTS set_opportunities_division   ON public.opportunities;
DROP TRIGGER IF EXISTS set_future_orders_division   ON public.future_orders;
DROP TRIGGER IF EXISTS set_sales_targets_division   ON public.sales_targets;

CREATE TRIGGER set_deals_division
  BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_division_from_owner();

CREATE TRIGGER set_opportunities_division
  BEFORE INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_division_from_owner();

CREATE TRIGGER set_future_orders_division
  BEFORE INSERT ON public.future_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_division_from_owner();

CREATE TRIGGER set_sales_targets_division
  BEFORE INSERT ON public.sales_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_division_from_assignee();

-- Back on, inside the same transaction.
ALTER TABLE public.deals          ENABLE TRIGGER update_deals_updated_at;
ALTER TABLE public.opportunities  ENABLE TRIGGER opportunities_updated_at;
ALTER TABLE public.future_orders  ENABLE TRIGGER future_orders_updated_at;
ALTER TABLE public.sales_targets  ENABLE TRIGGER trigger_update_sales_targets_updated_at;
ALTER TABLE public.sales_targets  ENABLE TRIGGER trigger_validate_target_assignment;

COMMIT;


-- ============================================================================
-- VERIFY — run after applying.
-- ============================================================================

-- 1. Every trigger is back ON. 'O' means enabled; 'D' means still disabled and
--    something went wrong. There must be no 'D'.
SELECT c.relname AS table_name, t.tgname, t.tgenabled
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
  AND c.relname IN ('deals','opportunities','sales_targets','future_orders')
ORDER BY 1, 2;

-- 2. What is left NULL, and it should be ONLY rows whose owner/assignee has no
--    primary division.
SELECT 'deals' AS tbl, count(*) AS null_division,
       count(*) FILTER (WHERE u.sales_division_id IS NOT NULL) AS should_be_zero
FROM deals d JOIN users u ON u.id = d.owner_id
WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78' AND d.division_id IS NULL
UNION ALL
SELECT 'opportunities', count(*),
       count(*) FILTER (WHERE u.sales_division_id IS NOT NULL)
FROM opportunities o JOIN users u ON u.id = o.owner_id
WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78' AND o.division_id IS NULL
UNION ALL
SELECT 'future_orders', count(*),
       count(*) FILTER (WHERE u.sales_division_id IS NOT NULL)
FROM future_orders f JOIN users u ON u.id = f.owner_id
WHERE f.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78' AND f.division_id IS NULL
UNION ALL
SELECT 'sales_targets', count(*),
       count(*) FILTER (WHERE u.sales_division_id IS NOT NULL)
FROM sales_targets t JOIN users u ON u.id = t.assigned_to
WHERE t.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78' AND t.division_id IS NULL;

-- 3. The one override stuck.
SELECT o.customer_name, o.planned_amount, sd.name AS division
FROM opportunities o LEFT JOIN sales_divisions sd ON sd.id = o.division_id
WHERE o.id = 'f4607713-9c8b-496b-8eca-5fcfb7d15fcd';
-- expect: Al BADAH | 600000.00 | PVC Compound

-- 4. Kamal's two October target rows are UNCHANGED (decision 2026-10-06).
SELECT t.target_type, t.target_amount, sd.name AS division
FROM sales_targets t LEFT JOIN sales_divisions sd ON sd.id = t.division_id
WHERE t.id IN ('190d8d2b-d3fa-4929-a8cf-82fdf191f67d',
               'de453335-c564-4683-a808-6cf7a669e8d0')
ORDER BY t.target_amount;
-- expect: by_clients  500000.00  Export
--         total_value 1550000.00 PVC Compound

-- 5. Re-run PREVIEW 5. October per division, and the TOTAL row must equal the
--    company figures the dashboards show:
--      target 3,701,000 ; achieved 38,528.38 ; and Pipes & Fittings achieved
--      must now be the whole 38,528.38, because Amer's Namaa invoice (15,000)
--      had no division before this.

-- 6. The triggers actually fire. Read-only proof, no insert needed: a new row
--    inserted by any path will take the owner's primary, so check the functions
--    exist and are attached (query 1 above lists set_*_division) and confirm
--    search_path is pinned:
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('set_division_from_owner','set_division_from_assignee');
-- expect proconfig to contain search_path=public


-- ============================================================================
-- ROLLBACK — undoes everything above.
-- ============================================================================
-- The backfills cannot be reversed row by row, because "was NULL" is not
-- recorded anywhere. They CAN be reversed wholesale: set division_id back to
-- NULL on exactly the rows a backfill would have touched, which is every row
-- whose division_id now equals its owner's primary division. That is not
-- perfectly precise — a row somebody had already set to the owner's primary by
-- hand is indistinguishable — and the three such rows on production today are
-- listed in PREVIEW 2 ("already set"), so check that list before running this.
--
-- The columns are deliberately NOT dropped: dropping opportunities.division_id
-- and future_orders.division_id would discard the attribution rather than
-- revert it, and sales_targets.division_id predates this file.

-- BEGIN;
--
-- DROP TRIGGER IF EXISTS set_deals_division        ON public.deals;
-- DROP TRIGGER IF EXISTS set_opportunities_division ON public.opportunities;
-- DROP TRIGGER IF EXISTS set_future_orders_division ON public.future_orders;
-- DROP TRIGGER IF EXISTS set_sales_targets_division ON public.sales_targets;
-- DROP FUNCTION IF EXISTS public.set_division_from_owner();
-- DROP FUNCTION IF EXISTS public.set_division_from_assignee();
--
-- ALTER TABLE public.deals          DISABLE TRIGGER update_deals_updated_at;
-- ALTER TABLE public.opportunities  DISABLE TRIGGER opportunities_updated_at;
-- ALTER TABLE public.future_orders  DISABLE TRIGGER future_orders_updated_at;
-- ALTER TABLE public.sales_targets  DISABLE TRIGGER trigger_update_sales_targets_updated_at;
-- ALTER TABLE public.sales_targets  DISABLE TRIGGER trigger_validate_target_assignment;
--
-- UPDATE public.deals d SET division_id = NULL
--   FROM public.users u WHERE u.id = d.owner_id AND d.division_id = u.sales_division_id;
-- UPDATE public.future_orders f SET division_id = NULL
--   FROM public.users u WHERE u.id = f.owner_id AND f.division_id = u.sales_division_id;
-- UPDATE public.sales_targets t SET division_id = NULL
--   FROM public.users u WHERE u.id = t.assigned_to AND t.division_id = u.sales_division_id;
-- -- opportunities: the Al BADAH override too, which is NOT the owner's primary.
-- UPDATE public.opportunities o SET division_id = NULL
--   FROM public.users u WHERE u.id = o.owner_id AND o.division_id = u.sales_division_id;
-- UPDATE public.opportunities SET division_id = NULL
--   WHERE id = 'f4607713-9c8b-496b-8eca-5fcfb7d15fcd';
--
-- ALTER TABLE public.deals          ENABLE TRIGGER update_deals_updated_at;
-- ALTER TABLE public.opportunities  ENABLE TRIGGER opportunities_updated_at;
-- ALTER TABLE public.future_orders  ENABLE TRIGGER future_orders_updated_at;
-- ALTER TABLE public.sales_targets  ENABLE TRIGGER trigger_update_sales_targets_updated_at;
-- ALTER TABLE public.sales_targets  ENABLE TRIGGER trigger_validate_target_assignment;
--
-- COMMIT;
-- ============================================================================
