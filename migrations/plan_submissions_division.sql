-- ============================================================================
-- NOT APPLIED. Written 2026-11-17 (session 43). Claude Code never runs SQL: a
-- person runs this, block by block, in the Supabase SQL editor.
--
-- ONE PLAN PER DIVISION FOR A PERSON IN MORE THAN ONE DIVISION.
--
-- WHY. CEO decision 2026-11-17: Mohamed Kamal (manager, sells himself) is
-- responsible for PVC Compound AND Export. He files a separate plan for each
-- division; each goes into Plans Awaiting Approval and is approved by his
-- assigned approver (today Nader, through supervisor_id). plan_submissions is
-- unique on (company_id, owner_id, plan_month), so a person can hold only one
-- plan a month. This adds the division to the key.
--
-- WHAT IT DOES (one transaction)
--   (1) plan_submissions.division_id uuid NULL REFERENCES sales_divisions(id).
--   (2) a unique index on (company_id, owner_id, plan_month, division_id)
--       NULLS NOT DISTINCT — production runs Postgres 17 (NULLS NOT DISTINCT
--       needs 15+), so two NULL-division rows for the same person and month
--       still collide exactly as today, and ON CONFLICT can target it.
--   (3) the old unique index/constraint plan_submissions_unique is dropped
--       (the new one replaces it; dropped AFTER the new one exists).
--
--   Every existing row keeps division_id NULL, which means "all divisions" —
--   today's meaning. Nothing is backfilled, moved or reassigned.
--
-- WHAT IT DOES NOT DO
--   * No RLS change. The plan_submissions policies decide WHICH ROWS a person
--     may read or write, by owner and company; a new column inside rows they
--     can already insert and update adds no access.
--   * The approval trigger enforce_plan_approver is NOT touched. It works per
--     row on NEW.owner_id → users.supervisor_id, so each division plan is
--     approved by the same person as today, and the owner still cannot
--     approve his own plan.
--   * No target, plan item or user is changed.
--
-- ⚠ RUN ORDER WITH THE APP — IMPORTANT.
--   Apply this ONLY AFTER feat/plan-per-division is merged and deployed to
--   production. The app saves a plan with an upsert whose ON CONFLICT target
--   must match a unique index:
--     * the code on master today names (company_id, owner_id, plan_month);
--       once (3) drops that index, Postgres refuses it (42P10) — Submit Plan
--       and the 25th-deadline flag would fail on the OLD code;
--     * the new code looks for division_id once per page load and uses
--       (company_id, owner_id, plan_month, division_id) when it exists, the
--       old target when it does not — and retries with the other target if
--       the database answers 42P10, so it works on either side of APPLY.
--
-- RUN ORDER: PREVIEW (read-only) → APPLY on its own → VERIFY. ROLLBACK only
-- if needed (see its own warning).
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Run each query and keep the output.
-- ============================================================================

-- P1. Postgres version: must be 15 or later (expect 17.x).
SHOW server_version;

-- P2. division_id must not exist yet (expect 0 rows).
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'plan_submissions' AND column_name = 'division_id';

-- P3. The unique key today: expect plan_submissions_unique on
--     (company_id, owner_id, plan_month). `is_constraint` says whether it is a
--     table constraint or a bare index — APPLY handles both.
SELECT i.relname AS index_name,
       pg_get_indexdef(i.oid) AS definition,
       EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid) AS is_constraint
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
 WHERE x.indrelid = 'public.plan_submissions'::regclass
   AND x.indisunique;

-- P4. Anything in the DATABASE that writes plan_submissions (functions, cron).
--     The app's writers are handled in code; a database function using
--     ON CONFLICT (company_id, owner_id, plan_month) would break after APPLY.
--     Expect only enforce_plan_approver (a trigger, no ON CONFLICT). If any
--     row shows uses_on_conflict = true, STOP and send me its name.
SELECT p.proname,
       p.prosrc ILIKE '%on conflict%' AS uses_on_conflict
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prosrc ILIKE '%plan_submissions%';

-- P5. The rows, for VERIFY: they must not change. And no duplicate key today
--     (expect 0 rows) — the new index is built over the same rows.
SELECT COUNT(*) AS rows_total FROM plan_submissions;
SELECT company_id, owner_id, plan_month, COUNT(*)
  FROM plan_submissions
 GROUP BY 1, 2, 3
HAVING COUNT(*) > 1;

-- P6. Who holds more than one division (expect only Mohamed Kamal: PVC
--     Compound primary + Export).
SELECT u.full_name, u.role, pd.name AS primary_division, ad.name AS additional_division
  FROM user_sales_divisions usd
  JOIN users u            ON u.id = usd.user_id
  LEFT JOIN sales_divisions pd ON pd.id = u.sales_division_id
  JOIN sales_divisions ad ON ad.id = usd.division_id
 WHERE usd.division_id IS DISTINCT FROM u.sales_division_id
 ORDER BY u.full_name;


-- ============================================================================
-- APPLY — run on its own (after the app is merged and deployed; see above).
-- ============================================================================

BEGIN;

ALTER TABLE plan_submissions
  ADD COLUMN IF NOT EXISTS division_id uuid NULL REFERENCES sales_divisions(id);

COMMENT ON COLUMN plan_submissions.division_id IS
  'The division this plan is for. NULL = all divisions (one plan for the month: everyone in one division, and every row before 2026-11-17). Set only for a person in more than one division, who files one plan per division.';

-- The new key first, so the table is never without one.
CREATE UNIQUE INDEX IF NOT EXISTS plan_submissions_owner_month_division_unique
  ON plan_submissions (company_id, owner_id, plan_month, division_id) NULLS NOT DISTINCT;

-- Then the old one, whether it is a constraint or a bare index.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.plan_submissions'::regclass
                AND conname = 'plan_submissions_unique') THEN
    ALTER TABLE plan_submissions DROP CONSTRAINT plan_submissions_unique;
  ELSE
    DROP INDEX IF EXISTS plan_submissions_unique;
  END IF;
END $$;

-- PostgREST caches the schema: tell it the column and the key changed.
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- VERIFY — read-only (V4 writes inside a transaction it rolls back).
-- ============================================================================

-- V1. The column (expect 1 row: uuid, YES).
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'plan_submissions' AND column_name = 'division_id';

-- V2. The keys: expect ONLY plan_submissions_owner_month_division_unique
--     (plus the primary key), with nulls_not_distinct = true.
SELECT i.relname AS index_name, x.indnullsnotdistinct AS nulls_not_distinct, pg_get_indexdef(i.oid) AS definition
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
 WHERE x.indrelid = 'public.plan_submissions'::regclass
   AND x.indisunique;

-- V3. Rows untouched: same count as P5, every division_id NULL.
SELECT COUNT(*) AS rows_total, COUNT(division_id) AS with_division FROM plan_submissions;

-- V4. The app's upsert works on the new key, for a NULL division (everyone
--     in one division) — it must UPDATE the existing row, not add a second.
--     Takes the oldest row, upserts an exact copy of it onto itself, counts
--     that person's rows for that month, and ROLLS BACK.
--     Expect: before = 1, after = 1 (and the ROLLBACK leaves nothing).
BEGIN;
SELECT COUNT(*) AS before FROM plan_submissions p
 WHERE (p.company_id, p.owner_id, p.plan_month) = (SELECT company_id, owner_id, plan_month FROM plan_submissions ORDER BY id LIMIT 1);
INSERT INTO plan_submissions
SELECT * FROM plan_submissions ORDER BY id LIMIT 1
ON CONFLICT (company_id, owner_id, plan_month, division_id) DO UPDATE SET updated_at = EXCLUDED.updated_at;
SELECT COUNT(*) AS after FROM plan_submissions p
 WHERE (p.company_id, p.owner_id, p.plan_month) = (SELECT company_id, owner_id, plan_month FROM plan_submissions ORDER BY id LIMIT 1);
ROLLBACK;


-- ============================================================================
-- ROLLBACK — only if needed.
--
-- ⚠ It restores the one-plan-a-month key, so it FAILS while any person has
-- two division plans for the same month (R1 lists them). Those rows have to
-- be resolved by hand first — that is a business decision, not something this
-- file guesses. With none, it puts the table back exactly as before.
-- ============================================================================

-- R1. Division plans that would collide (expect 0 rows before R2).
SELECT company_id, owner_id, plan_month, COUNT(*)
  FROM plan_submissions
 GROUP BY 1, 2, 3
HAVING COUNT(*) > 1;

-- R2.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS plan_submissions_unique
  ON plan_submissions (company_id, owner_id, plan_month);
DROP INDEX IF EXISTS plan_submissions_owner_month_division_unique;
ALTER TABLE plan_submissions DROP COLUMN IF EXISTS division_id;
NOTIFY pgrst, 'reload schema';
COMMIT;
-- (If P3 showed plan_submissions_unique as a CONSTRAINT, re-create it as one
--  instead: ALTER TABLE plan_submissions ADD CONSTRAINT plan_submissions_unique
--  UNIQUE (company_id, owner_id, plan_month); — same columns, same effect.)
