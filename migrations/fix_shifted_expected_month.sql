-- ============================================================================
-- NOT APPLIED — this file has NOT been run against any database.
-- ============================================================================
--
-- Repairs plan rows whose expected_month is the LAST day of a month instead of
-- the FIRST day of the month they were planned for.
--
-- Cause (fixed in the application on this branch): Customer Master built the
-- month with `new Date(y, m, 1).toISOString().split('T')[0]`. toISOString()
-- converts the local midnight to UTC, and Riyadh is UTC+3, so the first of the
-- month became 21:00 on the last day of the PREVIOUS month and the date part
-- came out as that previous day. Adding a customer to the plan on 1 October
-- saved 2026-09-30.
--
-- Consequence: every screen windows a plan month on its own first-to-last day,
-- so these rows are invisible to the plan total, the submit gate, Planned Gap
-- and the KPI strip's Planned — while still being open work somebody intends to
-- win. The money is real; only the month is wrong.
--
-- SCOPE: status = 'open' only. Converted rows are history (the deal carries the
-- value now) and rows moved to future orders are a different workflow; moving
-- either would rewrite the past. A month-end expected_month is the signature of
-- this bug — the application only ever writes the 1st — but the preview lists
-- every candidate so they can be eyeballed before anything is written.
--
-- updated_at: `opportunities` has NO updated_at column (id, customer_name,
-- customer_type, planned_amount, material_group, expected_month, status,
-- deal_id, contact_id, owner_id, company_id, notes, converted_at, created_at,
-- bounce_count, last_bounced_at, is_replacement, replaces_deal_id), so there is
-- nothing to preserve and no trigger to suppress for it. PART 0 still lists the
-- table's triggers, because this repo defines none on this table and production
-- may carry one created outside version control.
--
-- Expected preview for JASCO PVC (figures from the live check, not from this
-- file): 6 open rows on 2026-09-30 totalling 1,014,235 (Mohamed Kamal 999,750;
-- Hassan Ali Asiri 10,485; others) -> 2026-10-01, and 2 open rows on 2026-07-31
-- totalling 340,000 -> 2026-08-01. The 5 converted rows on 2026-07-31 (673,260)
-- are deliberately left alone.
--
-- RUN ORDER: PART 0, then PART 1, read the output, then PART 2. PART 3 undoes it.
-- ============================================================================


-- ── PART 0. Preflight (read-only) ───────────────────────────────────────────
-- Expect no rows from the first query. If a trigger IS listed, decide whether it
-- should fire for this repair; to suppress it, uncomment the two ALTER TABLE
-- lines in PART 2 and name it there (needs table ownership, and takes a brief
-- ACCESS EXCLUSIVE lock).
SELECT t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
WHERE t.tgrelid = 'public.opportunities'::regclass
  AND NOT t.tgisinternal;

-- Confirms there is no updated_at column to preserve. Expect zero rows.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'opportunities'
  AND column_name = 'updated_at';


-- ── PART 1. PREVIEW (read-only) ─────────────────────────────────────────────
-- Owner, customer, amount, old -> new month, and what state that owner's plan
-- for the NEW month is in. A row landing in a month whose plan is already
-- approved or locked changes a figure the manager has signed off: those are
-- flagged so they can be re-approved deliberately rather than silently.
WITH candidates AS (
  SELECT
    o.id,
    o.owner_id,
    o.company_id,
    o.customer_name,
    o.planned_amount,
    o.status,
    o.expected_month                                                   AS old_month,
    (date_trunc('month', o.expected_month) + interval '1 month')::date AS new_month
  FROM opportunities o
  WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND o.status = 'open'
    AND o.expected_month IS NOT NULL
    -- the last day of its own month
    AND o.expected_month
        = (date_trunc('month', o.expected_month) + interval '1 month' - interval '1 day')::date
)
SELECT
  u.full_name                                   AS owner,
  c.customer_name,
  c.planned_amount,
  c.old_month,
  c.new_month,
  ps.is_submitted                               AS target_month_submitted,
  ps.approval_status                            AS target_month_approval,
  ps.is_locked                                  AS target_month_locked,
  CASE
    WHEN ps.id IS NULL                        THEN 'no plan row for the target month'
    WHEN ps.is_locked                         THEN 'NEEDS RE-APPROVAL: target month is locked'
    WHEN ps.approval_status = 'approved'      THEN 'NEEDS RE-APPROVAL: target month already approved'
    WHEN ps.is_submitted                      THEN 'target month submitted, awaiting approval'
    ELSE 'target month still a draft'
  END                                           AS attention,
  c.id                                          AS opportunity_id
FROM candidates c
LEFT JOIN users u
  ON u.id = c.owner_id
LEFT JOIN plan_submissions ps
  ON ps.company_id = c.company_id
 AND ps.owner_id   = c.owner_id
 AND ps.plan_month = c.new_month
ORDER BY c.old_month, u.full_name, c.planned_amount DESC;

-- Totals per month, to check against the figures in the header.
WITH candidates AS (
  SELECT o.expected_month AS old_month,
         (date_trunc('month', o.expected_month) + interval '1 month')::date AS new_month,
         o.planned_amount
  FROM opportunities o
  WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND o.status = 'open'
    AND o.expected_month IS NOT NULL
    AND o.expected_month
        = (date_trunc('month', o.expected_month) + interval '1 month' - interval '1 day')::date
)
SELECT old_month, new_month, count(*) AS rows, sum(planned_amount) AS total
FROM candidates
GROUP BY old_month, new_month
ORDER BY old_month;

-- What is deliberately NOT being touched, for completeness.
SELECT o.status, count(*) AS rows, sum(o.planned_amount) AS total
FROM opportunities o
WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND o.status <> 'open'
  AND o.expected_month IS NOT NULL
  AND o.expected_month
      = (date_trunc('month', o.expected_month) + interval '1 month' - interval '1 day')::date
GROUP BY o.status
ORDER BY o.status;


-- ── PART 2. APPLY ───────────────────────────────────────────────────────────
BEGIN;

-- Uncomment ONLY if PART 0 listed a trigger that must not fire here, and put
-- its name in place of <trigger_name>:
-- ALTER TABLE opportunities DISABLE TRIGGER <trigger_name>;

CREATE TABLE IF NOT EXISTS opportunity_month_repair_backup (
  opportunity_id uuid PRIMARY KEY,
  company_id     uuid,
  owner_id       uuid,
  customer_name  text,
  planned_amount numeric,
  status         text,
  old_month      date,
  new_month      date,
  repaired_at    timestamptz NOT NULL DEFAULT now()
);

WITH candidates AS (
  SELECT
    o.id, o.company_id, o.owner_id, o.customer_name, o.planned_amount, o.status,
    o.expected_month                                                   AS old_month,
    (date_trunc('month', o.expected_month) + interval '1 month')::date AS new_month
  FROM opportunities o
  WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND o.status = 'open'
    AND o.expected_month IS NOT NULL
    AND o.expected_month
        = (date_trunc('month', o.expected_month) + interval '1 month' - interval '1 day')::date
)
INSERT INTO opportunity_month_repair_backup (
  opportunity_id, company_id, owner_id, customer_name, planned_amount, status,
  old_month, new_month
)
SELECT id, company_id, owner_id, customer_name, planned_amount, status,
       old_month, new_month
FROM candidates
-- A second run must not overwrite the ORIGINAL month with an already-repaired
-- one, which would make PART 3 a no-op.
ON CONFLICT (opportunity_id) DO NOTHING;

-- Only expected_month is written. No other column is mentioned, so nothing else
-- changes — and there is no updated_at on this table to bump.
UPDATE opportunities o
SET expected_month = b.new_month
FROM opportunity_month_repair_backup b
WHERE o.id = b.opportunity_id
  AND o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND o.status = 'open'
  AND o.expected_month = b.old_month;

-- ALTER TABLE opportunities ENABLE TRIGGER <trigger_name>;

COMMIT;

-- ── Verification, after PART 2 ───────────────────────────────────────────────
-- Expect: moved = the preview's row count, and still_shifted = 0.
SELECT
  (SELECT count(*) FROM opportunity_month_repair_backup
    WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78')                AS moved,
  (SELECT count(*) FROM opportunities o
    WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
      AND o.status = 'open'
      AND o.expected_month IS NOT NULL
      AND o.expected_month
          = (date_trunc('month', o.expected_month) + interval '1 month' - interval '1 day')::date)
                                                                              AS still_shifted;

SELECT b.customer_name, b.planned_amount, b.old_month, o.expected_month AS now_month
FROM opportunity_month_repair_backup b
JOIN opportunities o ON o.id = b.opportunity_id
WHERE b.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
ORDER BY b.old_month, b.planned_amount DESC;


-- ── PART 3. UNDO ────────────────────────────────────────────────────────────
-- Puts every repaired row back on its original month. Only rows still sitting on
-- the repaired month are touched, so an item somebody has since re-planned by
-- hand is left alone rather than dragged backwards.
--
-- BEGIN;
--   UPDATE opportunities o
--   SET expected_month = b.old_month
--   FROM opportunity_month_repair_backup b
--   WHERE o.id = b.opportunity_id
--     AND b.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
--     AND o.expected_month = b.new_month;
--
--   -- Drop the backup only once nothing needs it: it is the only record of
--   -- which rows were moved and from where.
--   -- DELETE FROM opportunity_month_repair_backup
--   --  WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78';
-- COMMIT;
