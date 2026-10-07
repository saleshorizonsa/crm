-- ============================================================================
-- NOT APPLIED. Run the APPLY block ON ITS OWN, exactly as
-- division_attribution.sql was run: the PREVIEW and VERIFY blocks are meant to
-- be run by hand, separately, on either side of it. Pasting the whole file is
-- what left that migration's first attempt completely untouched.
--
-- KEEP A DIVISION ONCE A ROW HAS ONE — the BEFORE UPDATE half of
-- migrations/division_attribution.sql.
-- ============================================================================
--
-- WHAT WENT WRONG. The attribution triggers are BEFORE INSERT only, so nothing
-- defends division_id after a row is created. Two ways it is lost:
--
--   1. An UPDATE writes NULL over it. DealModal sent
--      `division_id: formData.division_id || null` on the edit path, and
--      formData is filled from the owner's primary by an async lookup, so a
--      save before that lookup resolved — or a save on a deal object that
--      reached the modal without the column — nulled a division the database
--      had already set. SAUDI CARBOTAE CO. LTD (18,315 SAR, Alseyed Mohammed
--      Diba) was created with its division at 16:08 on 2026-10-07 and edited to
--      NULL at 16:10. The October divisions then stopped summing to the company
--      by exactly 18,315 — reported by /numbers-check the same evening as
--      "Divisions sum = company — Funnel dated into this period" 1,936,330 vs
--      1,954,645, and as PVC Sheet's planned gap 294,863 vs 276,548.
--
--      The app side is fixed separately (the key is now omitted, never sent as
--      NULL). This migration is the database's own guard, so the next write
--      path that gets it wrong cannot silently un-attribute a row again.
--
--   2. A row is REASSIGNED to someone in a different division and keeps the old
--      one. Nothing re-attributed it, so the figure stayed with the division
--      the previous owner belonged to.
--
-- THE RULE, for deals, opportunities, future_orders and sales_targets:
--
--   a. NEW.division_id IS NULL  →  the owner's (assignee's) primary division.
--   b. The owner CHANGED and the new owner does NOT belong to NEW.division_id,
--      by primary or by user_sales_divisions  →  the new owner's primary.
--      A multi-division owner who DOES belong to it keeps it: that is the whole
--      point of multi_division_membership.sql, and re-attributing such a row
--      would move Kamal's Export deals into PVC Compound on any edit.
--
--   Rule (b) deliberately does nothing when the new owner has no primary
--   division at all (Osman, Mueataz): keeping the previous division is better
--   than blanking it, and an unattributed row is exactly the defect this file
--   exists to stop creating.
--
-- ONE EDGE TO BE AWARE OF. Rule (b) outranks the CUSTOMER attribution set by
-- division_attribution.sql (decision 2026-10-07: Al BADAH and PLASTICO BAHRAIN
-- count as Export, nine named customers as PVC Compound, whoever owns them).
-- If such a deal is ever reassigned to someone who belongs to neither of those
-- divisions, rule (b) moves it to the new owner's primary and the customer rule
-- is lost. Nothing is at risk today: PREVIEW 1 returns no rows, and Kamal — who
-- owns every customer-attributed deal — belongs to Export (primary) and PVC
-- Compound (user_sales_divisions), so both of his groups survive rule (b)
-- untouched. If those customers should keep their division across a
-- reassignment, that is a second decision and a customer-list branch in these
-- functions, not a change to the rule above.
--
-- ONE-OFF REPAIR. The APPLY block also fills rows that are ALREADY NULL and
-- whose owner has a primary division. On 2026-10-07 that is exactly one row —
-- SAUDI CARBOTAE. It deliberately leaves the 60 rows whose owner has NO primary
-- (33 deals, 12 target rows, 8 future orders, 7 plan items, all Osman's and
-- Mueataz's, both departed): there is nothing to attribute them to, and
-- Insights already falls back to the owner's primary for a NULL row, which for
-- these people is also NULL. They are listed by PREVIEW 2 so the count is
-- known rather than discovered later.
--
-- The repair runs with the updated_at triggers DISABLED, so repairing a row
-- does not restamp it as edited today; the edit history stays honest. On
-- sales_targets it also disables trigger_validate_target_assignment, which
-- re-runs the whole headroom check on UPDATE and would RAISE on a historical
-- row whose assigner no longer has room — a validator rejecting a repair that
-- changes only the division column. Everything is inside one transaction, so a
-- failure anywhere rolls the disables back with it and leaves no trigger off.
--
-- VERIFY AFTER APPLYING (block at the bottom):
--   triggers      4 new BEFORE UPDATE triggers present and ENABLED ('O'), and
--                 none of the 5 updated_at / validator triggers left disabled
--   functions     set_division_from_owner_on_update and
--                 set_division_from_assignee_on_update, search_path pinned
--   repair        rows with NULL division whose owner HAS a primary = 0,
--                 on all four tables (the /numbers-check row added with this
--                 migration asserts the same thing from the app)
--   the figure    October 2026 divisions sum = company for the funnel, i.e.
--                 the 18,315 gap is gone
--   honesty       SAUDI CARBOTAE's updated_at is still 2026-10-07 13:10:07 UTC
--
-- ROLLBACK at the bottom drops the triggers and functions. It does NOT revert
-- the repair: once a NULL is filled, the column no longer records that it was
-- ever NULL. PREVIEW 2's output is the only record of which rows were touched,
-- so keep it; the rollback block carries today's single id as a comment.
-- ============================================================================


-- ============================================================================
-- PREVIEW 1 — the rule, on paper. Read-only.
--   Every row whose division would CHANGE if its owner were reassigned today:
--   the owner does not belong to the division the row carries.
--   Expected: nothing to do today (no reassignment is in flight); this query is
--   here so the rule can be inspected against real rows before it is armed.
-- ============================================================================
SELECT 'deals' AS tbl, d.id, d.title AS label,
       u.full_name AS owner, sd.name AS row_division, sd2.name AS owner_primary
FROM deals d
JOIN users u                 ON u.id  = d.owner_id
LEFT JOIN sales_divisions sd ON sd.id = d.division_id
LEFT JOIN sales_divisions sd2 ON sd2.id = u.sales_division_id
WHERE d.division_id IS NOT NULL
  AND u.sales_division_id IS DISTINCT FROM d.division_id
  AND NOT EXISTS (
    SELECT 1 FROM user_sales_divisions usd
    WHERE usd.user_id = d.owner_id AND usd.division_id = d.division_id
  )
ORDER BY u.full_name, d.title;


-- ============================================================================
-- PREVIEW 2 — what the repair will touch, and what it will leave. Read-only.
--   RUN THIS AND KEEP THE OUTPUT: it is the only record of which rows were
--   NULL, and the rollback cannot reconstruct it.
-- ============================================================================
WITH rows_null AS (
  SELECT 'deals'         AS tbl, d.id, d.title                                   AS label, d.owner_id    AS person
    FROM deals d          WHERE d.division_id IS NULL
  UNION ALL
  SELECT 'opportunities',       o.id, o.customer_name,                                 o.owner_id
    FROM opportunities o  WHERE o.division_id IS NULL
  UNION ALL
  SELECT 'future_orders',       f.id, f.customer_name,                                 f.owner_id
    FROM future_orders f  WHERE f.division_id IS NULL
  UNION ALL
  SELECT 'sales_targets',       t.id, t.target_type::text || ' ' || t.period_start::text, t.assigned_to
    FROM sales_targets t  WHERE t.division_id IS NULL
)
SELECT r.tbl,
       CASE WHEN u.sales_division_id IS NULL THEN 'LEFT AS IS (owner has no primary)'
            ELSE 'WILL BE REPAIRED → ' || sd.name END AS outcome,
       r.id, r.label, u.full_name AS owner, u.is_active
FROM rows_null r
JOIN users u                 ON u.id  = r.person
LEFT JOIN sales_divisions sd ON sd.id = u.sales_division_id
ORDER BY (u.sales_division_id IS NULL), r.tbl, r.label;

-- Expected on 2026-10-07:
--   WILL BE REPAIRED → PVC Sheet   deals / SAUDI CARBOTAE CO. LTD / Alseyed   (1 row)
--   LEFT AS IS                     33 deals, 12 sales_targets, 8 future_orders,
--                                  7 opportunities — Shaikh Osman Shoukat,
--                                  Mueataz Mohammed Ahmed (both inactive)


-- ============================================================================
-- APPLY — run this block on its own.
-- ============================================================================
BEGIN;

-- ── the two trigger functions ───────────────────────────────────────────────
-- Deliberately separate from set_division_from_owner(): that one answers "what
-- division does a NEW row get?", which is a one-line default. These answer
-- "may this row keep the division it has?", which needs OLD, and folding both
-- into one function would put a TG_OP branch in the middle of the INSERT path
-- that every new deal runs through.

CREATE OR REPLACE FUNCTION public.set_division_from_owner_on_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_primary uuid;
  v_belongs boolean;
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) No division: take the owner's primary. This also catches an UPDATE
  --     that writes NULL over a division the row already had.
  IF NEW.division_id IS NULL THEN
    SELECT u.sales_division_id INTO NEW.division_id
      FROM public.users u WHERE u.id = NEW.owner_id;
    RETURN NEW;
  END IF;

  -- (b) The owner changed. The row keeps its division only if the new owner
  --     belongs to it — primary or additional membership.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    SELECT EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = NEW.owner_id
         AND u.sales_division_id = NEW.division_id
      UNION ALL
      SELECT 1 FROM public.user_sales_divisions usd
       WHERE usd.user_id = NEW.owner_id
         AND usd.division_id = NEW.division_id
    ) INTO v_belongs;

    IF NOT v_belongs THEN
      SELECT u.sales_division_id INTO v_primary
        FROM public.users u WHERE u.id = NEW.owner_id;
      -- Only when there is somewhere to move it to: blanking the division of a
      -- row handed to someone with no primary would create the very defect
      -- this trigger exists to prevent.
      IF v_primary IS NOT NULL THEN
        NEW.division_id := v_primary;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_division_from_assignee_on_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_primary uuid;
  v_belongs boolean;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.division_id IS NULL THEN
    SELECT u.sales_division_id INTO NEW.division_id
      FROM public.users u WHERE u.id = NEW.assigned_to;
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    SELECT EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = NEW.assigned_to
         AND u.sales_division_id = NEW.division_id
      UNION ALL
      SELECT 1 FROM public.user_sales_divisions usd
       WHERE usd.user_id = NEW.assigned_to
         AND usd.division_id = NEW.division_id
    ) INTO v_belongs;

    IF NOT v_belongs THEN
      SELECT u.sales_division_id INTO v_primary
        FROM public.users u WHERE u.id = NEW.assigned_to;
      IF v_primary IS NOT NULL THEN
        NEW.division_id := v_primary;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── the four triggers ───────────────────────────────────────────────────────
-- Named set_* so they sort before the update_*/trigger_* updated_at and
-- validator triggers: Postgres fires BEFORE triggers in name order, so the
-- sales_targets validator sees the division this trigger settled on.

DROP TRIGGER IF EXISTS set_deals_division_on_update ON public.deals;
CREATE TRIGGER set_deals_division_on_update
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_division_from_owner_on_update();

DROP TRIGGER IF EXISTS set_opportunities_division_on_update ON public.opportunities;
CREATE TRIGGER set_opportunities_division_on_update
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_division_from_owner_on_update();

DROP TRIGGER IF EXISTS set_future_orders_division_on_update ON public.future_orders;
CREATE TRIGGER set_future_orders_division_on_update
  BEFORE UPDATE ON public.future_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_division_from_owner_on_update();

DROP TRIGGER IF EXISTS set_sales_targets_division_on_update ON public.sales_targets;
CREATE TRIGGER set_sales_targets_division_on_update
  BEFORE UPDATE ON public.sales_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_division_from_assignee_on_update();

-- ── the one-off repair ──────────────────────────────────────────────────────
-- updated_at triggers off, so a repair is not recorded as an edit by whoever
-- runs this; the sales_targets validator off, so it cannot reject a change that
-- touches only the division column. Both are restored below, and a failure
-- anywhere in this transaction rolls the disables back too.

ALTER TABLE public.deals          DISABLE TRIGGER update_deals_updated_at;
ALTER TABLE public.opportunities  DISABLE TRIGGER opportunities_updated_at;
ALTER TABLE public.future_orders  DISABLE TRIGGER future_orders_updated_at;
ALTER TABLE public.sales_targets  DISABLE TRIGGER trigger_update_sales_targets_updated_at;
ALTER TABLE public.sales_targets  DISABLE TRIGGER trigger_validate_target_assignment;

UPDATE public.deals d
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = d.owner_id
   AND d.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

UPDATE public.opportunities o
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = o.owner_id
   AND o.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

UPDATE public.future_orders f
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = f.owner_id
   AND f.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

UPDATE public.sales_targets t
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = t.assigned_to
   AND t.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

ALTER TABLE public.sales_targets  ENABLE TRIGGER trigger_validate_target_assignment;
ALTER TABLE public.sales_targets  ENABLE TRIGGER trigger_update_sales_targets_updated_at;
ALTER TABLE public.future_orders  ENABLE TRIGGER future_orders_updated_at;
ALTER TABLE public.opportunities  ENABLE TRIGGER opportunities_updated_at;
ALTER TABLE public.deals          ENABLE TRIGGER update_deals_updated_at;

COMMIT;


-- ============================================================================
-- VERIFY — read-only, after applying.
-- ============================================================================

-- 1. The 4 new triggers exist and are enabled, and nothing was left disabled.
--    Expect 9 rows, every tgenabled = 'O'.
SELECT c.relname AS table_name, t.tgname, t.tgenabled
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname IN ('deals','opportunities','future_orders','sales_targets')
  AND (t.tgname LIKE '%division%' OR t.tgname LIKE '%updated_at%'
       OR t.tgname = 'trigger_validate_target_assignment')
ORDER BY c.relname, t.tgname;

-- 2. Both functions exist with search_path pinned. Expect 2 rows.
SELECT p.proname, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('set_division_from_owner_on_update',
                    'set_division_from_assignee_on_update');

-- 3. THE ASSERTION: no row is unattributed while its owner has a division.
--    Expect 0 on every line. This is the same thing /numbers-check now checks
--    from the app ("rows with no division whose owner has a primary").
SELECT 'deals' AS tbl, COUNT(*) AS must_be_zero
  FROM deals d JOIN users u ON u.id = d.owner_id
 WHERE d.division_id IS NULL AND u.sales_division_id IS NOT NULL
UNION ALL
SELECT 'opportunities', COUNT(*)
  FROM opportunities o JOIN users u ON u.id = o.owner_id
 WHERE o.division_id IS NULL AND u.sales_division_id IS NOT NULL
UNION ALL
SELECT 'future_orders', COUNT(*)
  FROM future_orders f JOIN users u ON u.id = f.owner_id
 WHERE f.division_id IS NULL AND u.sales_division_id IS NOT NULL
UNION ALL
SELECT 'sales_targets', COUNT(*)
  FROM sales_targets t JOIN users u ON u.id = t.assigned_to
 WHERE t.division_id IS NULL AND u.sales_division_id IS NOT NULL;

-- 4. The figure that reported the defect. October 2026 open funnel, by
--    division, summed, against the same window company-wide: the two must be
--    equal, where before the repair they differed by 18,315.
WITH open_oct AS (
  SELECT d.amount, d.division_id
  FROM deals d
  WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND d.stage::text NOT IN ('won','lost')
    AND (d.expected_close_date IS NULL
         OR d.expected_close_date BETWEEN DATE '2026-10-01' AND DATE '2026-10-31')
)
SELECT SUM(amount) FILTER (WHERE division_id IS NOT NULL) AS sum_of_divisions,
       SUM(amount)                                        AS company,
       SUM(amount) - SUM(amount) FILTER (WHERE division_id IS NOT NULL) AS gap_must_be_zero
FROM open_oct;

-- 5. The repair did not restamp the row as edited. Expect the ORIGINAL
--    updated_at, 2026-10-07 13:10:07.557865+00, and division PVC Sheet.
SELECT d.id, d.title, sd.name AS division, d.created_at, d.updated_at
FROM deals d LEFT JOIN sales_divisions sd ON sd.id = d.division_id
WHERE d.id = '8232d669-6d28-4536-95d6-ff836b62d593';


-- ============================================================================
-- ROLLBACK — drops the guard. Run only to undo this migration.
--
-- The repair is NOT reverted: a filled column no longer records that it was
-- NULL, and PREVIEW 2's output is the only list of what changed. To undo
-- today's single repaired row as well, run the commented statement below —
-- with the updated_at trigger disabled, or the revert will restamp the row.
-- ============================================================================
DROP TRIGGER IF EXISTS set_deals_division_on_update         ON public.deals;
DROP TRIGGER IF EXISTS set_opportunities_division_on_update ON public.opportunities;
DROP TRIGGER IF EXISTS set_future_orders_division_on_update ON public.future_orders;
DROP TRIGGER IF EXISTS set_sales_targets_division_on_update ON public.sales_targets;
DROP FUNCTION IF EXISTS public.set_division_from_owner_on_update();
DROP FUNCTION IF EXISTS public.set_division_from_assignee_on_update();

-- ALTER TABLE public.deals DISABLE TRIGGER update_deals_updated_at;
-- UPDATE public.deals SET division_id = NULL
--  WHERE id = '8232d669-6d28-4536-95d6-ff836b62d593';
-- ALTER TABLE public.deals ENABLE TRIGGER update_deals_updated_at;
