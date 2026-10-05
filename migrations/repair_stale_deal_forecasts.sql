-- ============================================================================
-- NOT APPLIED — this file has NOT been run against any database.
-- ============================================================================
--
-- Repairs forecast_probability / forecast_amount on rows that were written
-- before the create and stage-change paths computed them (see the application
-- changes on this branch: upsertDeal, updateDealLost, ContactReportModal and
-- the opportunity-convert insert).
--
-- Two populations, both company-scoped:
--   (a) OPEN deals (stage not won/lost) whose stored probability does not match
--       their stage, or whose forecast_amount is not amount x p / 100.
--   (b) LOST deals still carrying forecast_amount > 0. Nothing forecasts a lost
--       deal, and forecastVarianceCheck.js sums forecast_amount by
--       expected_close_date with no stage filter, so each one is still being
--       counted into its month's forecast.
--
-- WON deals are deliberately left alone: a won deal's weighted forecast is
-- moot, its value is counted as Achieved (won + invoiced, by invoice_date), and
-- rewriting it would change nothing anyone reads.
--
-- The rule is the application's, restated once in SQL:
--   forecast_probability = stage_probabilities.probability for the deal's stage
--   forecast_amount      = round(amount x probability / 100, 2)
-- utils/forecastCalc.js computes Math.round(amount * p) / 100, which is the
-- same figure for any amount with two or fewer decimals (every row here).
--
-- A stage with NO row in stage_probabilities is skipped for case (a), matching
-- forecastFieldsFor's contract: when the probability cannot be determined the
-- stored value is left as it is rather than overwritten with a guess. For case
-- (b) a missing 'lost' row is treated as 0, because that is what "lost" means —
-- otherwise the very rows this is meant to clear would be skipped.
--
-- TYPES: deals.stage is the enum deal_stage and stage_probabilities.stage is
-- text, and Postgres has no implicit cast between them — joining them raw fails
-- with "operator does not exist: text = deal_stage". Every comparison and every
-- value written into the text backup column therefore casts d.stage::text.
-- Comparisons against bare literals ('won', 'lost') need no cast: an untyped
-- literal is resolved to whichever side's type it is compared with.
--
-- ORDER OF OPERATIONS
--   1. Run PREVIEW. It changes nothing and lists old vs new per deal.
--   2. Run REPAIR. It stores every old value in deal_forecast_repair_backup
--      first, so step 4 can put them back.
--   3. Run VERIFY.
--   4. ROLLBACK only if needed.
--
-- Preview for JASCO PVC, run read-only against production after the cast —
-- 7 open rows and 7 lost rows:
--   ALSEHLY PLASTIC FACTORY   amount 155,000, no forecast stored -> 15,500.00
--   "Ali alghamdi Est."       forecast 11,399.38 -> 34,198.13 (negotiation, 75%)
--   four rows with amount 0   -> 0.00 (they carry no forecast today)
--   Mawridi                   a 0.01 rounding correction
--   7 lost rows               297,407.16 between them -> 0
--
-- EDIT THE COMPANY ID in all four sections before running. JASCO PVC is
-- 'adf8ee78-cf78-4f02-932c-989a214bdd78'.
-- ============================================================================


-- ── 1. PREVIEW (read-only) ──────────────────────────────────────────────────
WITH p AS (
  SELECT stage, probability
  FROM stage_probabilities
  WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
),
calc AS (
  SELECT
    d.id,
    d.title,
    d.stage::text                                              AS stage,
    d.amount,
    d.expected_close_date,
    d.forecast_probability                                     AS old_probability,
    d.forecast_amount                                          AS old_forecast,
    CASE WHEN d.stage = 'lost' THEN COALESCE(p.probability, 0)
         ELSE p.probability END                                AS new_probability,
    round(COALESCE(d.amount, 0)
          * CASE WHEN d.stage = 'lost' THEN COALESCE(p.probability, 0)
                 ELSE p.probability END / 100.0, 2)            AS new_forecast
  FROM deals d
  LEFT JOIN p ON p.stage = d.stage::text
  WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
)
SELECT
  CASE WHEN stage = 'lost' THEN 'b: lost with a forecast' ELSE 'a: open and stale' END AS reason,
  id, title, stage, amount, expected_close_date,
  old_probability, new_probability,
  old_forecast, new_forecast,
  COALESCE(new_forecast, 0) - COALESCE(old_forecast, 0) AS delta
FROM calc
WHERE
  (stage NOT IN ('won', 'lost')
   AND new_probability IS NOT NULL
   AND (old_probability IS DISTINCT FROM new_probability
        OR old_forecast     IS DISTINCT FROM new_forecast))
  OR
  (stage = 'lost' AND COALESCE(old_forecast, 0) > 0)
ORDER BY reason, amount DESC NULLS LAST;


-- ── 2. REPAIR ───────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS deal_forecast_repair_backup (
  deal_id                  uuid PRIMARY KEY,
  company_id               uuid,
  stage                    text,
  amount                   numeric,
  old_forecast_probability numeric,
  old_forecast_amount      numeric,
  new_forecast_probability numeric,
  new_forecast_amount      numeric,
  repaired_at              timestamptz NOT NULL DEFAULT now()
);

WITH p AS (
  SELECT stage, probability
  FROM stage_probabilities
  WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
),
calc AS (
  SELECT
    -- ::text because deal_forecast_repair_backup.stage is text; an enum value
    -- cannot be assigned to a text column without it.
    d.id, d.company_id, d.stage::text AS stage, d.amount,
    d.forecast_probability AS old_probability,
    d.forecast_amount      AS old_forecast,
    CASE WHEN d.stage = 'lost' THEN COALESCE(p.probability, 0)
         ELSE p.probability END                          AS new_probability,
    round(COALESCE(d.amount, 0)
          * CASE WHEN d.stage = 'lost' THEN COALESCE(p.probability, 0)
                 ELSE p.probability END / 100.0, 2)      AS new_forecast
  FROM deals d
  LEFT JOIN p ON p.stage = d.stage::text
  WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
),
stale AS (
  SELECT * FROM calc
  WHERE
    (stage NOT IN ('won', 'lost')
     AND new_probability IS NOT NULL
     AND (old_probability IS DISTINCT FROM new_probability
          OR old_forecast     IS DISTINCT FROM new_forecast))
    OR
    (stage = 'lost' AND COALESCE(old_forecast, 0) > 0)
)
INSERT INTO deal_forecast_repair_backup (
  deal_id, company_id, stage, amount,
  old_forecast_probability, old_forecast_amount,
  new_forecast_probability, new_forecast_amount
)
SELECT id, company_id, stage, amount,
       old_probability, old_forecast,
       new_probability, new_forecast
FROM stale
-- Re-running the repair must not overwrite the ORIGINAL values with the
-- already-repaired ones, which would make the rollback a no-op.
ON CONFLICT (deal_id) DO NOTHING;

UPDATE deals d
SET forecast_probability = b.new_forecast_probability,
    forecast_amount      = b.new_forecast_amount,
    updated_at           = now()
FROM deal_forecast_repair_backup b
WHERE d.id = b.deal_id
  AND d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND (d.forecast_probability IS DISTINCT FROM b.new_forecast_probability
       OR d.forecast_amount   IS DISTINCT FROM b.new_forecast_amount);

COMMIT;


-- ── 3. VERIFY ───────────────────────────────────────────────────────────────
-- Expect: rows_repaired = the preview's row count, lost_with_forecast = 0, and
-- open_mismatched = 0.
SELECT
  (SELECT count(*) FROM deal_forecast_repair_backup
    WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78')          AS rows_repaired,
  (SELECT count(*) FROM deals
    WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
      AND stage = 'lost' AND COALESCE(forecast_amount, 0) > 0)          AS lost_with_forecast,
  (SELECT count(*)
     FROM deals d
     JOIN stage_probabilities sp
       ON sp.company_id = d.company_id AND sp.stage = d.stage::text
    WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
      AND d.stage NOT IN ('won', 'lost')
      AND (d.forecast_probability IS DISTINCT FROM sp.probability
           OR d.forecast_amount   IS DISTINCT FROM
              round(COALESCE(d.amount, 0) * sp.probability / 100.0, 2))) AS open_mismatched;

-- Per-deal result, against what was stored before.
SELECT b.deal_id, b.stage, b.amount,
       b.old_forecast_probability, d.forecast_probability AS now_probability,
       b.old_forecast_amount,      d.forecast_amount      AS now_forecast
FROM deal_forecast_repair_backup b
JOIN deals d ON d.id = b.deal_id
WHERE b.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
ORDER BY b.stage, b.amount DESC NULLS LAST;


-- ── 4. ROLLBACK ─────────────────────────────────────────────────────────────
-- Puts back exactly what each row held before the repair, including NULLs.
-- Only rows still holding the repaired value are touched, so a deal edited by
-- someone since the repair is left alone rather than being reverted over.
--
-- BEGIN;
--   UPDATE deals d
--   SET forecast_probability = b.old_forecast_probability,
--       forecast_amount      = b.old_forecast_amount,
--       updated_at           = now()
--   FROM deal_forecast_repair_backup b
--   WHERE d.id = b.deal_id
--     AND b.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
--     AND d.forecast_probability IS NOT DISTINCT FROM b.new_forecast_probability
--     AND d.forecast_amount      IS NOT DISTINCT FROM b.new_forecast_amount;
--
--   -- Drop the backup only once nothing needs it any more. It is the ONLY
--   -- record of the pre-repair values.
--   -- DELETE FROM deal_forecast_repair_backup
--   --  WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78';
-- COMMIT;
