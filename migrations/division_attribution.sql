-- ============================================================================
-- APPLIED 2026-10-06 23:30 (Asia/Riyadh). The APPLY block was run ON ITS OWN,
-- not as part of the whole file.
--
-- DIVISION ATTRIBUTION — attribute a multi-division person's TARGET and PLAN
-- by division, the same way deals already are. (Business decision, option 2,
-- 2026-10-06.)
-- ============================================================================
--
-- RUN IT THE SAME WAY IF THIS IS EVER REPLAYED: the APPLY block alone. A first
-- attempt that pasted the whole file left production completely untouched —
-- every column, trigger and backfill absent, and no trigger left disabled, so
-- the transaction had rolled back cleanly rather than half-applying. The
-- PREVIEW and VERIFY blocks are meant to be run by hand, separately, on either
-- side of it.
--
-- VERIFICATION, read-only, after applying:
--   columns                 division_id present on deals, opportunities,
--                           future_orders, sales_targets
--   triggers                set_deals_division, set_opportunities_division,
--                           set_future_orders_division,
--                           set_sales_targets_division — all 4 present and
--                           ENABLED ('O'); none of the five updated_at /
--                           validator triggers left disabled
--   functions               set_division_from_owner and
--                           set_division_from_assignee, both with
--                           search_path=public pinned
--   Kamal's deals           PVC Compound 12 / Export 6   (decision 3)
--   Kamal's plan + future   PVC Compound 20 / Export 13
--   Oct 2026 targets        Pipes & Fittings    826,000
--                           PVC Compound      1,550,000
--                           PVC Sheet           825,000
--                           Export              500,000
--                           TOTAL             3,701,000 = the company target
--   left NULL               deals 33, opportunities 7, future_orders 8,
--                           sales_targets 12 — and VERIFY query 2's
--                           `should_be_zero` column reads 0 on all four, i.e.
--                           every remaining NULL belongs to someone with no
--                           primary division: Shaikh Osman Shoukat (inactive,
--                           all four tables) and Mueataz Mohammed Ahmed
--                           (sales_targets only). Decision 4, as intended.
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
-- ============================================================================
-- THE DECISIONS THIS FILE IMPLEMENTS (2026-10-06)
-- ============================================================================
--
--   1. KAMAL'S TARGET ROWS STAY EXACTLY AS THEY ARE. Both of his October rows
--      already carry a division on production:
--          total_value  1,550,000  ->  PVC Compound
--          by_clients     500,000  ->  Export        (Al BADAH)
--      so the October division targets are
--          Pipes & Fittings    826,000
--          PVC Compound      1,550,000
--          PVC Sheet           825,000
--          Export              500,000
--          TOTAL             3,701,000  = the company target, exactly
--      Nothing below touches those two rows. They are shown in PREVIEW 1.
--
--   2. sales_targets.division_id ALREADY EXISTS, and 6 of the 47 rows already
--      have it set — all six of October's. So this file ADDs the column only if
--      it is missing, and it never overwrites a value somebody has already
--      chosen. Of the 41 NULL rows the generic backfill fills 29; the other 12
--      belong to two assignees with no primary division and stay NULL
--      (PREVIEW 2 counts all three buckets).
--
--   3. KAMAL'S DEALS, PLAN ITEMS AND FUTURE ORDERS ARE ATTRIBUTED BY CUSTOMER,
--      not by his primary division — because he sells for two divisions out of
--      one login, and which division a sale belongs to is decided by WHO HE
--      SOLD IT TO:
--          Export        Al BADAH, PLASTICO BAHRAIN
--          PVC Compound  ALSEHLY PLASTIC FACTORY, NEPRO PLAST,
--                        QUALITY SUPPLY PALSTIC TECHNOLOGY Factory,
--                        NATIONAL BUYUT FOR INDUSTRY, GHAZER UNITED COMPANY,
--                        SAFA PIPES, UPVC COMPOUND, Upvc white compound,
--                        Special Production
--      Matched case-insensitively on deals.title and opportunities /
--      future_orders.customer_name. All stages, all months, imported PRE-CRM
--      history excluded — his won/lost history drives Conversion (3m) per
--      division, so splitting only the open rows would leave each division
--      measuring its rate against the other's history.
--
--      THIS IS THE ONE PLACE THIS FILE OVERWRITES A DIVISION THAT IS ALREADY
--      SET. 12 of Kamal's 18 non-imported deals are PVC Compound customers, and
--      10 of those 12 currently carry Export (his primary) — put there by
--      DealModal, which defaults to the owner's primary and has no way to know
--      the customer belongs to the other division. Those ten are the point of
--      this step, so a NULL-only guard would skip it entirely. The ten are
--      listed in PREVIEW 4 and the ROLLBACK restores them exactly.
--
--      "Resources Projects Company Limited" (82,000: one open October plan item,
--      one moved future order) is in NEITHER list, by decision — it takes the
--      ordinary owner-primary default, Export. PREVIEW 4 lists it under
--      "matched neither" so the decision stays visible rather than looking like
--      an oversight.
--
--   4. 23 non-imported deals have division_id NULL, not the 6 the brief
--      described. Seventeen belong to Shaikh Osman Shoukat, who is INACTIVE and
--      has NO primary division, so "backfill to the owner's primary" cannot
--      reach them. DECISION: leave them NULL. He is outside the achiever scope,
--      so they affect no figure on the panel today. They are listed in
--      PREVIEW 3 so the decision is visible rather than implicit.
--
--   5. NEITHER opportunities NOR future_orders had a division_id column. The
--      brief asked for opportunities; future_orders needs one for the same
--      reason (the panel filters carry-in by division too). Both are added.
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

-- PREVIEW 1. Kamal's two October target rows. Nothing below changes these;
-- decision 1 is to leave them exactly as production already has them.
SELECT t.id,
       u.full_name                       AS assignee,
       t.target_type,
       t.target_amount,
       -- client_targets has NO client_name: it names the client by contact_id,
       -- so the name comes from contacts.company_name (falling back to the
       -- person's name, which is what the UI shows for an individual).
       (SELECT string_agg(
                 coalesce(nullif(ct.company_name, ''),
                          trim(coalesce(ct.first_name,'') || ' ' || coalesce(ct.last_name,'')),
                          '(unnamed contact)')
                 || ' ' || c.target_amount, ', ')
          FROM client_targets c
          LEFT JOIN contacts ct ON ct.id = c.contact_id
         WHERE c.sales_target_id = t.id)   AS client_breakdown,
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
-- expect, among the rows: Mohamed Kamal by_clients  500,000 Export
--                         Mohamed Kamal total_value 1,550,000 PVC Compound

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

-- PREVIEW 3. EVERY deal with a NULL division_id, non-imported, one row each.
-- The `action` column says what will happen to it, so the 17 that stay NULL are
-- visible rather than silently skipped.
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

-- PREVIEW 4. DECISION 3, row by row: every one of Kamal's deals, plan items and
-- future orders, which customer pattern it matched, the division it will get,
-- and what it carries today — so the ten deals whose Export value gets
-- OVERWRITTEN are visible before anything runs. Rows matching neither list are
-- included, and take the owner-primary default.
WITH kpat AS (
  SELECT '78733b2e-3f61-4fd1-a4d1-3bbc71451d0e'::uuid AS div, 'Export' AS div_name, p
    FROM unnest(ARRAY['%al badah%', '%plastico bahrain%']) AS p
  UNION ALL
  SELECT '115dae2d-0ff0-41cd-b64f-47ca57cf9126'::uuid, 'PVC Compound', p
    FROM unnest(ARRAY[
      '%alsehly plastic factory%', '%nepro plast%',
      '%quality supply palstic technology factory%',
      '%national buyut for industry%', '%ghazer united company%',
      '%safa pipes%', '%upvc compound%', '%upvc white compound%',
      '%special production%']) AS p
),
-- Not named `rows`: ROWS is a reserved word, and `FROM rows r` is a syntax
-- error rather than a subtle one.
kamal_rows AS (
  -- stage::text, because deals.stage is the deal_stage ENUM and the other two
  -- branches of the UNION supply plain text ("UNION types deal_stage and text
  -- cannot be matched").
  SELECT 'deal' AS kind, d.id, d.title AS customer, d.stage::text AS state,
         coalesce(d.final_amount, d.amount) AS amount, d.division_id AS division_now
  FROM deals d
  WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND d.owner_id = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
    AND coalesce(d.invoice_number, '') NOT ILIKE 'PRE-CRM%'
  UNION ALL
  -- NULL::uuid, not o.division_id: this preview has to RUN BEFORE the apply
  -- block, and the column does not exist on opportunities until the apply block
  -- adds it. Today every plan item of his has no division at all, so NULL is
  -- also the truthful value.
  SELECT 'plan item', o.id, o.customer_name,
         o.status || ' ' || to_char(o.expected_month, 'YYYY-MM'),
         o.planned_amount, NULL::uuid
  FROM opportunities o
  WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND o.owner_id = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
  UNION ALL
  SELECT 'future order', f.id, f.customer_name,
         f.status || ' ' || to_char(f.expected_month, 'YYYY-MM'),
         f.planned_amount, NULL::uuid
  FROM future_orders f
  WHERE f.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND f.owner_id = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
)
SELECT r.kind, r.customer, r.state, r.amount,
       coalesce(sdn.name, '(null)')                       AS division_now,
       coalesce(m.div_name, 'Export (owner primary — matched NEITHER list)')
                                                          AS division_after,
       coalesce(m.p, '—')                                 AS matched_pattern,
       CASE WHEN m.div IS NULL              THEN 'default'
            WHEN r.division_now IS NULL     THEN 'fill'
            WHEN r.division_now = m.div     THEN 'already correct'
            ELSE 'OVERWRITE ' || coalesce(sdn.name, '?') || ' -> ' || m.div_name
       END                                                AS action
FROM kamal_rows r
LEFT JOIN LATERAL (
  SELECT k.div, k.div_name, k.p FROM kpat k WHERE r.customer ILIKE k.p LIMIT 1
) m ON TRUE
LEFT JOIN sales_divisions sdn ON sdn.id = r.division_now
ORDER BY r.kind, division_after, r.customer, r.amount DESC;
-- expect: 18 deals, 27 plan items, 6 future orders;
--         exactly 10 rows reading 'OVERWRITE Export -> PVC Compound' (all deals);
--         exactly 2 rows reading 'matched NEITHER list' (Resources Projects).

-- PREVIEW 5. THE FIGURES THIS IS FOR: October 2026 per division, as the panel
-- will read them AFTER applying. The TOTAL row must equal the company figures
-- the dashboards already show — 3,701,000 target — or do not apply this.
WITH kpat AS (
  SELECT '78733b2e-3f61-4fd1-a4d1-3bbc71451d0e'::uuid AS div, p
    FROM unnest(ARRAY['%al badah%', '%plastico bahrain%']) AS p
  UNION ALL
  SELECT '115dae2d-0ff0-41cd-b64f-47ca57cf9126'::uuid, p
    FROM unnest(ARRAY[
      '%alsehly plastic factory%', '%nepro plast%',
      '%quality supply palstic technology factory%',
      '%national buyut for industry%', '%ghazer united company%',
      '%safa pipes%', '%upvc compound%', '%upvc white compound%',
      '%special production%']) AS p
),
ach AS (
  SELECT u.id FROM users u
  WHERE u.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78' AND u.is_active
    AND (u.role IN ('salesman','supervisor') OR u.is_contributor IS TRUE)
),
-- The customer rule FIRST, then whatever the row already carries, then the
-- owner's primary — the same precedence the APPLY section writes.
dv AS (SELECT d.*,
         coalesce((SELECT k.div FROM kpat k
                    WHERE d.owner_id = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
                      AND d.title ILIKE k.p LIMIT 1),
                  d.division_id, u.sales_division_id) AS eff
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
-- No o.division_id term here either, for the same reason as PREVIEW 4: the
-- column arrives with the apply block, and every plan item is division-less
-- until then, so customer rule then owner primary is the whole precedence.
op AS (SELECT o.planned_amount,
         coalesce((SELECT k.div FROM kpat k
                    WHERE o.owner_id = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
                      AND o.customer_name ILIKE k.p LIMIT 1),
                  u.sales_division_id) AS eff
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

-- NULL rows only. A row somebody has already attributed is never overwritten,
-- which is what keeps Kamal's two October rows (decision 1) untouched.
UPDATE public.sales_targets t
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = t.assigned_to
   AND t.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

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

-- ── (b2) future_orders.division_id ─────────────────────────────────────────
-- Not in the brief's list; added by decision 5 so carry-in splits by division
-- like everything else.
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
-- inactive owner with no primary stay NULL, by decision 4 — see PREVIEW 3.
UPDATE public.deals d
   SET division_id = u.sales_division_id
  FROM public.users u
 WHERE u.id = d.owner_id
   AND d.division_id IS NULL
   AND u.sales_division_id IS NOT NULL;

-- ── (c2) DECISION 3: Kamal's rows attributed BY CUSTOMER ───────────────────
-- Runs AFTER the generic backfills so it wins, and deliberately NOT guarded on
-- division_id IS NULL: ten of these deals already carry Export and are the
-- whole reason this step exists (see the header). Scoped to one owner_id, so
-- nobody else's rows can be touched by a customer name that happens to match.
--
-- No customer appears in both lists — PREVIEW 4 proves it, since a row matching
-- two patterns would have to appear twice there and does not — so the order of
-- the two statements per table changes nothing.

-- Export customers
UPDATE public.deals
   SET division_id = '78733b2e-3f61-4fd1-a4d1-3bbc71451d0e'  -- Export
 WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
   AND owner_id   = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
   AND coalesce(invoice_number, '') NOT ILIKE 'PRE-CRM%'
   AND title ILIKE ANY (ARRAY['%al badah%', '%plastico bahrain%']);

UPDATE public.opportunities
   SET division_id = '78733b2e-3f61-4fd1-a4d1-3bbc71451d0e'
 WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
   AND owner_id   = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
   AND customer_name ILIKE ANY (ARRAY['%al badah%', '%plastico bahrain%']);

UPDATE public.future_orders
   SET division_id = '78733b2e-3f61-4fd1-a4d1-3bbc71451d0e'
 WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
   AND owner_id   = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
   AND customer_name ILIKE ANY (ARRAY['%al badah%', '%plastico bahrain%']);

-- PVC Compound customers
UPDATE public.deals
   SET division_id = '115dae2d-0ff0-41cd-b64f-47ca57cf9126'  -- PVC Compound
 WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
   AND owner_id   = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
   AND coalesce(invoice_number, '') NOT ILIKE 'PRE-CRM%'
   AND title ILIKE ANY (ARRAY[
         '%alsehly plastic factory%', '%nepro plast%',
         '%quality supply palstic technology factory%',
         '%national buyut for industry%', '%ghazer united company%',
         '%safa pipes%', '%upvc compound%', '%upvc white compound%',
         '%special production%']);

UPDATE public.opportunities
   SET division_id = '115dae2d-0ff0-41cd-b64f-47ca57cf9126'
 WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
   AND owner_id   = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
   AND customer_name ILIKE ANY (ARRAY[
         '%alsehly plastic factory%', '%nepro plast%',
         '%quality supply palstic technology factory%',
         '%national buyut for industry%', '%ghazer united company%',
         '%safa pipes%', '%upvc compound%', '%upvc white compound%',
         '%special production%']);

UPDATE public.future_orders
   SET division_id = '115dae2d-0ff0-41cd-b64f-47ca57cf9126'
 WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
   AND owner_id   = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
   AND customer_name ILIKE ANY (ARRAY[
         '%alsehly plastic factory%', '%nepro plast%',
         '%quality supply palstic technology factory%',
         '%national buyut for industry%', '%ghazer united company%',
         '%safa pipes%', '%upvc compound%', '%upvc white compound%',
         '%special production%']);

-- ── (d) BEFORE INSERT triggers ────────────────────────────────────────────
-- So this never has to be backfilled again. Only DealModal set division_id;
-- every other insert path left it NULL, which is how six deals created since
-- 2026-09-15 vanished from the panel.
--
-- Each one is a no-op when division_id is already supplied, so a form that
-- offers a division picker (a multi-division person) still wins.
--
-- NOTE what this does NOT do: it fills in the owner's PRIMARY division, not a
-- customer rule. Kamal's PVC Compound customers therefore need the picker on
-- the form, or they will arrive on Export again — which is exactly how the ten
-- rows in (c2) got there. (c2) is a one-off correction of history; the picker
-- is what stops it recurring.
--
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

-- 3. DECISION 3 landed: Kamal's rows now split by customer, and nothing of his
--    is left on the wrong side. Run PREVIEW 4 again — every `action` must now
--    read 'already correct' or 'default' — or read the summary here:
SELECT CASE WHEN sd.name IS NULL THEN '(null)' ELSE sd.name END AS division,
       count(*) FILTER (WHERE k = 'deal')         AS deals,
       count(*) FILTER (WHERE k = 'plan item')    AS plan_items,
       count(*) FILTER (WHERE k = 'future order') AS future_orders,
       string_agg(DISTINCT customer, ', ' ORDER BY customer)     AS customers
FROM (
  SELECT 'deal' AS k, title AS customer, division_id FROM deals
   WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
     AND owner_id = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
     AND coalesce(invoice_number, '') NOT ILIKE 'PRE-CRM%'
  UNION ALL
  SELECT 'plan item', customer_name, division_id FROM opportunities
   WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
     AND owner_id = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
  UNION ALL
  SELECT 'future order', customer_name, division_id FROM future_orders
   WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
     AND owner_id = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
) r
LEFT JOIN sales_divisions sd ON sd.id = r.division_id
GROUP BY 1 ORDER BY 1;
-- expect Export: 6 deals, 12 plan items, 1 future order  (Al BADAH,
--        PLASTICO BAHRAIN and the two Resources Projects rows)
--        PVC Compound: 12 deals, 15 plan items, 5 future orders

-- 4. Kamal's two October target rows are UNCHANGED (decision 1).
SELECT t.target_type, t.target_amount, sd.name AS division
FROM sales_targets t LEFT JOIN sales_divisions sd ON sd.id = t.division_id
WHERE t.id IN ('190d8d2b-d3fa-4929-a8cf-82fdf191f67d',
               'de453335-c564-4683-a808-6cf7a669e8d0')
ORDER BY t.target_amount;
-- expect: by_clients   500000.00  Export
--         total_value 1550000.00  PVC Compound

-- 5. Re-run PREVIEW 5. October per division, and the TOTAL row must equal the
--    company figures the dashboards show:
--      target    3,701,000  (826,000 / 1,550,000 / 825,000 / 500,000)
--      achieved     38,528.38, all of it Pipes & Fittings — because Amer's
--                   Namaa invoice (15,000) had no division before this
--      planned   2,424,512
--      funnel    2,088,758

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
-- The generic backfills cannot be reversed row by row, because "was NULL" is
-- not recorded anywhere. They CAN be reversed wholesale: set division_id back
-- to NULL on exactly the rows a backfill would have touched, which is every row
-- whose division_id now equals its owner's primary division. That is not
-- perfectly precise — a row somebody had already set to the owner's primary by
-- hand is indistinguishable — and the rows already set are listed in PREVIEW 2
-- ("already set") and PREVIEW 1, so check those lists before running this.
--
-- DECISION 3 *is* reversible exactly, because PREVIEW 4 was read first: of the
-- 12 deals the customer rule puts on PVC Compound, 10 carried Export and 2
-- carried NULL. Those two ids are named below. His plan items and future orders
-- all carried NULL, so they all go back to NULL.
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
-- -- DECISION 3 first, back to what PREVIEW 4 recorded: Export for the ten,
-- -- NULL for the two. Done before the wholesale step below, which would
-- -- otherwise not recognise a PVC Compound value as backfilled.
-- UPDATE public.deals SET division_id = '78733b2e-3f61-4fd1-a4d1-3bbc71451d0e'
--  WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
--    AND owner_id   = '6fcb06dc-9cb0-4143-9f82-fb77a011024e'
--    AND division_id = '115dae2d-0ff0-41cd-b64f-47ca57cf9126';
-- UPDATE public.deals SET division_id = NULL
--  WHERE id IN ('b43d3efd-6af9-4dd8-8382-34c946263ec6',   -- ALSEHLY, lead
--               '82b1ed22-5946-46c0-bd1e-30defb909585');  -- ALSEHLY, won
-- UPDATE public.opportunities SET division_id = NULL
--  WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
--    AND owner_id   = '6fcb06dc-9cb0-4143-9f82-fb77a011024e';
-- UPDATE public.future_orders SET division_id = NULL
--  WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
--    AND owner_id   = '6fcb06dc-9cb0-4143-9f82-fb77a011024e';
--
-- -- Then the generic backfills.
-- UPDATE public.deals d SET division_id = NULL
--   FROM public.users u WHERE u.id = d.owner_id AND d.division_id = u.sales_division_id;
-- UPDATE public.opportunities o SET division_id = NULL
--   FROM public.users u WHERE u.id = o.owner_id AND o.division_id = u.sales_division_id;
-- UPDATE public.future_orders f SET division_id = NULL
--   FROM public.users u WHERE u.id = f.owner_id AND f.division_id = u.sales_division_id;
-- UPDATE public.sales_targets t SET division_id = NULL
--   FROM public.users u WHERE u.id = t.assigned_to AND t.division_id = u.sales_division_id;
--
-- ALTER TABLE public.deals          ENABLE TRIGGER update_deals_updated_at;
-- ALTER TABLE public.opportunities  ENABLE TRIGGER opportunities_updated_at;
-- ALTER TABLE public.future_orders  ENABLE TRIGGER future_orders_updated_at;
-- ALTER TABLE public.sales_targets  ENABLE TRIGGER trigger_update_sales_targets_updated_at;
-- ALTER TABLE public.sales_targets  ENABLE TRIGGER trigger_validate_target_assignment;
--
-- COMMIT;
-- ============================================================================
