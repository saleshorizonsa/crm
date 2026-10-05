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
-- SCOPE: status = 'open' only, and expected_month >= 2026-09-01. Converted rows
-- are history (the deal carries the value now) and rows moved to future orders
-- are a different workflow; moving either would rewrite the past. A month-end
-- expected_month is the signature of this bug — the application only ever writes
-- the 1st — but the preview lists every candidate so they can be eyeballed
-- before anything is written.
--
-- THE DATE FLOOR: the two open rows on 2026-07-31 (Shaikh Osman, 2 x 170,000,
-- added 17 August) are deliberately out of scope. Moving them to 2026-08-01
-- would file open work into a month that is long over, inside a plan that has
-- already been submitted and approved, and would retroactively change August's
-- Planned and Planned Gap — figures that have already been reported. They need
-- a decision per row about the month the work is actually expected in, which is
-- the owner's call and not a data repair. PART 1 lists them separately so the
-- floor never hides anything.
--
-- updated_at: production has opportunities.updated_at and a BEFORE UPDATE
-- trigger `opportunities_updated_at` that maintains it. A repair is not a
-- business edit, so the trigger is disabled inside the transaction and
-- re-enabled before COMMIT, leaving each row's updated_at exactly as it was.
-- PART 0 confirms both the column and the trigger before anything runs.
--
-- Expected preview for JASCO PVC (figures from the live read-only check, not
-- from this file): 6 open rows, all 2026-09-30 -> 2026-10-01, totalling
-- 1,014,235 — Mohamed Kamal 600,000 + 307,500 + 92,250, Hassan Ali Asiri
-- 5,485 + 5,000, Ahmad Sulaiman Moamina 4,000. None of those owners has an
-- October plan_submissions row, so `attention` reads "no plan row for the
-- target month" for all six and nothing needs re-approval.
--
-- RUN ORDER: PART 0, then PART 1, read the output, then PART 2. PART 3 undoes it.
-- ============================================================================


-- ── PART 0. Preflight (read-only) ───────────────────────────────────────────
-- Expect `opportunities_updated_at` among the triggers listed. PART 2 disables
-- it by that exact name, so if it is absent or named differently, stop and fix
-- the name there first — ALTER TABLE ... DISABLE TRIGGER on a name that does not
-- exist aborts the transaction, which is the safe failure but worth expecting.
-- Disabling needs table ownership and takes a brief ACCESS EXCLUSIVE lock.
SELECT t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
WHERE t.tgrelid = 'public.opportunities'::regclass
  AND NOT t.tgisinternal;

-- The column the trigger maintains. Expect exactly one row.
SELECT column_name, data_type
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
    -- the date floor; see THE DATE FLOOR in the header
    AND o.expected_month >= DATE '2026-09-01'
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
    AND o.expected_month >= DATE '2026-09-01'
)
SELECT old_month, new_month, count(*) AS rows, sum(planned_amount) AS total
FROM candidates
GROUP BY old_month, new_month
ORDER BY old_month;

-- What the DATE FLOOR leaves behind: open, shifted, and older than the floor.
-- Expect the two 2026-07-31 rows (Shaikh Osman, 170,000 each). They are not a
-- data-repair question — see the header.
SELECT u.full_name AS owner, o.customer_name, o.planned_amount,
       o.expected_month, o.created_at
FROM opportunities o
LEFT JOIN users u ON u.id = o.owner_id
WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND o.status = 'open'
  AND o.expected_month IS NOT NULL
  AND o.expected_month
      = (date_trunc('month', o.expected_month) + interval '1 month' - interval '1 day')::date
  AND o.expected_month < DATE '2026-09-01'
ORDER BY o.expected_month, o.planned_amount DESC;

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

-- `opportunities_updated_at` maintains opportunities.updated_at on every UPDATE.
-- A month repair is not a business edit by the row's owner, and updated_at is
-- read as "when this was last worked on", so it is left exactly as it was.
-- Disabled only for the length of this transaction and re-enabled below; if the
-- transaction rolls back, the trigger comes back with it.
ALTER TABLE opportunities DISABLE TRIGGER opportunities_updated_at;

CREATE TABLE IF NOT EXISTS opportunity_month_repair_backup (
  opportunity_id  uuid PRIMARY KEY,
  company_id      uuid,
  owner_id        uuid,
  customer_name   text,
  planned_amount  numeric,
  status          text,
  old_month       date,
  new_month       date,
  -- Stored so "updated_at was not touched" is checkable afterwards rather than
  -- merely asserted. If this table already exists from an earlier run, add the
  -- column first: ALTER TABLE opportunity_month_repair_backup
  --   ADD COLUMN IF NOT EXISTS old_updated_at timestamptz;
  old_updated_at  timestamptz,
  repaired_at     timestamptz NOT NULL DEFAULT now()
);

WITH candidates AS (
  SELECT
    o.id, o.company_id, o.owner_id, o.customer_name, o.planned_amount, o.status,
    o.updated_at                                                       AS old_updated_at,
    o.expected_month                                                   AS old_month,
    (date_trunc('month', o.expected_month) + interval '1 month')::date AS new_month
  FROM opportunities o
  WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND o.status = 'open'
    AND o.expected_month IS NOT NULL
    AND o.expected_month
        = (date_trunc('month', o.expected_month) + interval '1 month' - interval '1 day')::date
    AND o.expected_month >= DATE '2026-09-01'
)
INSERT INTO opportunity_month_repair_backup (
  opportunity_id, company_id, owner_id, customer_name, planned_amount, status,
  old_month, new_month, old_updated_at
)
SELECT id, company_id, owner_id, customer_name, planned_amount, status,
       old_month, new_month, old_updated_at
FROM candidates
-- A second run must not overwrite the ORIGINAL month with an already-repaired
-- one, which would make PART 3 a no-op.
ON CONFLICT (opportunity_id) DO NOTHING;

-- Only expected_month is written: no other column is mentioned, and with the
-- trigger disabled above, updated_at keeps the value it already had.
UPDATE opportunities o
SET expected_month = b.new_month
FROM opportunity_month_repair_backup b
WHERE o.id = b.opportunity_id
  AND o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND o.status = 'open'
  AND o.expected_month = b.old_month;

-- Back on before the transaction ends, so no later write escapes it.
ALTER TABLE opportunities ENABLE TRIGGER opportunities_updated_at;

COMMIT;

-- ── Verification, after PART 2 ───────────────────────────────────────────────
-- Expect: moved = 6, still_shifted_in_scope = 0, updated_at_changed = 0, and
-- below_the_floor_untouched = 2 (the July rows, left alone on purpose).
SELECT
  (SELECT count(*) FROM opportunity_month_repair_backup
    WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78')                AS moved,
  (SELECT count(*) FROM opportunities o
    WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
      AND o.status = 'open'
      AND o.expected_month IS NOT NULL
      AND o.expected_month
          = (date_trunc('month', o.expected_month) + interval '1 month' - interval '1 day')::date
      AND o.expected_month >= DATE '2026-09-01')                              AS still_shifted_in_scope,
  (SELECT count(*) FROM opportunities o
    WHERE o.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
      AND o.status = 'open'
      AND o.expected_month IS NOT NULL
      AND o.expected_month
          = (date_trunc('month', o.expected_month) + interval '1 month' - interval '1 day')::date
      AND o.expected_month < DATE '2026-09-01')                               AS below_the_floor_untouched,
  -- The trigger was off, so every moved row must still carry the updated_at it
  -- had before. Anything other than 0 means it fired.
  (SELECT count(*) FROM opportunity_month_repair_backup b
     JOIN opportunities o ON o.id = b.opportunity_id
    WHERE b.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
      AND o.updated_at IS DISTINCT FROM b.old_updated_at)                     AS updated_at_changed;

-- The trigger is enabled again (it is re-enabled inside the transaction).
-- Expect tgenabled = 'O'.
SELECT t.tgname, t.tgenabled
FROM pg_trigger t
WHERE t.tgrelid = 'public.opportunities'::regclass
  AND t.tgname = 'opportunities_updated_at';

SELECT b.customer_name, b.planned_amount, b.old_month,
       o.expected_month AS now_month,
       b.old_updated_at, o.updated_at AS now_updated_at
FROM opportunity_month_repair_backup b
JOIN opportunities o ON o.id = b.opportunity_id
WHERE b.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
ORDER BY b.old_month, b.planned_amount DESC;


-- ── PART 3. UNDO ────────────────────────────────────────────────────────────
-- Puts every repaired row back on its original month. Scoped by the backup
-- table, so it can only ever touch the six rows PART 2 moved — the date floor
-- applies here for free, and the July rows stay out of it. Only rows still
-- sitting on the repaired month are updated, so an item somebody has since
-- re-planned by hand is left alone rather than dragged backwards.
--
-- The trigger goes off here too: undoing a repair is no more a business edit
-- than making it was, and updated_at should come back exactly as it started.
--
-- BEGIN;
--   ALTER TABLE opportunities DISABLE TRIGGER opportunities_updated_at;
--
--   UPDATE opportunities o
--   SET expected_month = b.old_month
--   FROM opportunity_month_repair_backup b
--   WHERE o.id = b.opportunity_id
--     AND b.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
--     AND o.expected_month = b.new_month;
--
--   ALTER TABLE opportunities ENABLE TRIGGER opportunities_updated_at;
--
--   -- Drop the backup only once nothing needs it: it is the only record of
--   -- which rows were moved and from where.
--   -- DELETE FROM opportunity_month_repair_backup
--   --  WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78';
-- COMMIT;
