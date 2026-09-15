-- contacts.market — Domestic / Export customer classification
-- Date: 2026-09-15
--
-- A classification tag only. Nothing in Target, Achieved, Win Rate, Planned,
-- Pipeline or Coverage reads it: achievement still follows deal ownership
-- (owner_id -> the owner's sales division), exactly as before. It is used to
-- filter customers in Planning -> Customer Master and to decide whose customers
-- to reassign (with the existing Reassign Records tool) to the Export division.
--
-- NOT contacts.customer_type: that column already exists and holds the
-- customer's STATUS (active / inactive / dormant / prospect / blocked). It is
-- not touched here.
--
-- Every existing contact becomes 'domestic'. Safe to run before or after the
-- app code deploys: the Market filter and bulk action hide themselves until the
-- column exists.
--
-- HOW TO RUN (Supabase SQL Editor): run PART 1, then PART 2 to check.


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — SCHEMA
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'domestic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname = 'contacts_market_check'
    AND    conrelid = 'public.contacts'::regclass
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_market_check CHECK (market IN ('domestic', 'export'));
  END IF;
END $$;

COMMENT ON COLUMN contacts.market IS
  'Customer market: domestic | export. Classification only — does not drive any KPI (achievement follows deal ownership).';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — CHECK
-- ════════════════════════════════════════════════════════════════════════════
SELECT market, count(*) FROM contacts GROUP BY market;
-- Expected: one row, domestic = every contact (1109 on 2026-09-15)

SELECT customer_type, count(*) FROM contacts GROUP BY customer_type ORDER BY customer_type;
-- Expected: UNCHANGED — active 614, inactive 495 on 2026-09-15


-- ════════════════════════════════════════════════════════════════════════════
-- UNDO — only if needed (remove the leading "-- " to run)
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_market_check;
-- ALTER TABLE contacts DROP COLUMN IF EXISTS market;
