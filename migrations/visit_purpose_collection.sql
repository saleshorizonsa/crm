-- ============================================================================
-- NOT APPLIED. Written 2026-11-16 (session 40, Sales Monitor). Claude Code
-- never runs SQL: a person runs this, block by block, in the Supabase SQL
-- editor.
--
-- VISIT PURPOSE AND COLLECTION.
--
-- WHY. Salesmen also visit customers to COLLECT payment, to handle a service
-- complaint or to follow up a delivery. Today every visit, call and WhatsApp
-- reads as a sales contact, and money collected on a visit is recorded
-- nowhere. The CEO wants each contact to say what it was for, and a
-- collection visit to say how much was collected.
--
-- WHAT IT DOES (one transaction)
--   (1) contact_reports.visit_purpose  text NULL
--         CHECK (visit_purpose IN ('sales','collection','service','delivery'))
--   (2) contact_reports.collected_amount numeric NULL
--         CHECK (collected_amount >= 0)
--   (3) the same two columns, with the same checks, on activities.
--
--   Old rows stay NULL; the app reads NULL as "Sales". Nothing is backfilled.
--   No NOT NULL: the app asks for the purpose on every NEW contact (default
--   Sales), and old rows have no purpose to give.
--
-- WHAT IT DOES NOT DO
--   No RLS change. The contact_reports and activities policies decide WHICH
--   ROWS a person may read or write; two new columns inside rows they may
--   already insert, read and update add no access, and the existing insert
--   policies already let the owner write the whole row. No index: the
--   columns are only read together with rows already selected by company and
--   date.
--
-- THE APP, BEFORE AND AFTER. Nothing merged depends on this file:
--   * the forms (ContactReportModal, LogActivityModal, Log visit) look for
--     the column once; while it is missing the Purpose field is hidden and
--     the save is exactly today's save;
--   * the Sales Monitor and Insights read the two columns in their own
--     guarded request and, while they are missing, show every contact as
--     Sales with nothing collected.
--
-- RUN ORDER: PREVIEW (read-only) → APPLY on its own → VERIFY. ROLLBACK only
-- if needed.
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Run each query and keep the output.
-- ============================================================================

-- P1. None of the four columns may exist yet (expect 0 rows).
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('contact_reports', 'activities')
   AND column_name IN ('visit_purpose', 'collected_amount');

-- P2. No constraint with these names yet (expect 0 rows).
SELECT conname
  FROM pg_constraint
 WHERE conname IN ('contact_reports_visit_purpose_check', 'contact_reports_collected_amount_check',
                   'activities_visit_purpose_check', 'activities_collected_amount_check');

-- P3. Row counts, for VERIFY: they must not change.
SELECT 'contact_reports' AS t, COUNT(*) FROM contact_reports
UNION ALL
SELECT 'activities', COUNT(*) FROM activities;


-- ============================================================================
-- APPLY — run on its own.
-- ============================================================================

BEGIN;

ALTER TABLE contact_reports
  ADD COLUMN IF NOT EXISTS visit_purpose text NULL,
  ADD COLUMN IF NOT EXISTS collected_amount numeric NULL;

ALTER TABLE contact_reports
  DROP CONSTRAINT IF EXISTS contact_reports_visit_purpose_check,
  ADD CONSTRAINT contact_reports_visit_purpose_check
    CHECK (visit_purpose IN ('sales', 'collection', 'service', 'delivery')),
  DROP CONSTRAINT IF EXISTS contact_reports_collected_amount_check,
  ADD CONSTRAINT contact_reports_collected_amount_check
    CHECK (collected_amount >= 0);

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS visit_purpose text NULL,
  ADD COLUMN IF NOT EXISTS collected_amount numeric NULL;

ALTER TABLE activities
  DROP CONSTRAINT IF EXISTS activities_visit_purpose_check,
  ADD CONSTRAINT activities_visit_purpose_check
    CHECK (visit_purpose IN ('sales', 'collection', 'service', 'delivery')),
  DROP CONSTRAINT IF EXISTS activities_collected_amount_check,
  ADD CONSTRAINT activities_collected_amount_check
    CHECK (collected_amount >= 0);

COMMENT ON COLUMN contact_reports.visit_purpose IS
  'What the contact was for: sales | collection | service | delivery. NULL = sales (rows before 2026-11).';
COMMENT ON COLUMN contact_reports.collected_amount IS
  'SAR collected on a collection contact; NULL when nothing was recorded.';
COMMENT ON COLUMN activities.visit_purpose IS
  'What the contact was for: sales | collection | service | delivery. NULL = sales (rows before 2026-11).';
COMMENT ON COLUMN activities.collected_amount IS
  'SAR collected on a collection contact; NULL when nothing was recorded.';

-- PostgREST caches the schema: tell it the columns exist.
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- VERIFY — read-only.
-- ============================================================================

-- V1. Four columns (expect 4 rows: text, numeric on each table, nullable YES).
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('contact_reports', 'activities')
   AND column_name IN ('visit_purpose', 'collected_amount')
 ORDER BY table_name, column_name;

-- V2. Four check constraints (expect 4 rows).
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conname IN ('contact_reports_visit_purpose_check', 'contact_reports_collected_amount_check',
                   'activities_visit_purpose_check', 'activities_collected_amount_check');

-- V3. Old rows untouched: same counts as P3, every purpose NULL.
SELECT 'contact_reports' AS t, COUNT(*) AS total, COUNT(visit_purpose) AS with_purpose, COUNT(collected_amount) AS with_amount FROM contact_reports
UNION ALL
SELECT 'activities', COUNT(*), COUNT(visit_purpose), COUNT(collected_amount) FROM activities;


-- ============================================================================
-- ROLLBACK — only if needed. Drops the columns and whatever was written to
-- them since APPLY; the app goes back to hiding the field.
-- ============================================================================

-- BEGIN;
-- ALTER TABLE contact_reports
--   DROP CONSTRAINT IF EXISTS contact_reports_visit_purpose_check,
--   DROP CONSTRAINT IF EXISTS contact_reports_collected_amount_check,
--   DROP COLUMN IF EXISTS visit_purpose,
--   DROP COLUMN IF EXISTS collected_amount;
-- ALTER TABLE activities
--   DROP CONSTRAINT IF EXISTS activities_visit_purpose_check,
--   DROP CONSTRAINT IF EXISTS activities_collected_amount_check,
--   DROP COLUMN IF EXISTS visit_purpose,
--   DROP COLUMN IF EXISTS collected_amount;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
