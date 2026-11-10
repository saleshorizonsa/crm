-- ============================================================================
-- NOT APPLIED. Written 2026-11-10 (session 34, Sales Monitor). Claude Code
-- never runs SQL: a person runs this, block by block, in the Supabase SQL
-- editor.
--
-- VISITS MUST NAME A CUSTOMER.
--
-- WHY. contact_reports has no contact_id: a report reaches its customer only
-- through deal_id → deals.contact_id. On 10 Nov 2026 JASCO PVC had 312
-- reports since 1 Oct and 171 of them carry no deal (the deal was deleted, or
-- moved to Future Orders, which deletes it), so for more than half of the
-- month's visits nobody can say whom the salesman saw. The Sales Monitor's
-- daily visit list, its "In plan" tag and "planned customer not contacted in
-- 14 days" all need the customer.
--
-- WHAT IT DOES
--   (1) contact_reports.contact_id uuid NULL REFERENCES contacts(id)
--       ON DELETE SET NULL — deleting a customer must not delete the history
--       of visits to it.
--   (2) backfill: contact_id := deals.contact_id for every report that has a
--       deal_id and no contact_id yet. Reports whose deal is gone stay NULL —
--       there is no record of their customer to copy, and guessing is worse
--       than "customer not recorded".
--   (3) index (company_id, contact_date) — every reader filters by company
--       and dates by contact_date.
--
-- WHAT IT DOES NOT DO
--   No RLS change. The contact_reports policies decide WHICH ROWS a person may
--   read or write (by company / owner); a new column inside a row they may
--   already see adds no access. The foreign key is checked by Postgres as the
--   table owner, so writing contact_id needs no SELECT right on contacts that
--   the writer does not already have. (The policies themselves are
--   company-wide today — utils/visits.js — which is a separate, known item.)
--   No NOT NULL: old reports without a deal have no customer to give, and the
--   app enforces "a customer is required" on every NEW report instead.
--
-- THE APP, BEFORE AND AFTER. Nothing merged depends on this file:
--   * the Sales Monitor reads contact_id in its own guarded request
--     (utils/salesMonitorData.js) and, while the column is missing, names the
--     customer through the deal and says so in one line;
--   * ContactReportModal writes contact_id and, if the column is missing,
--     retries the same insert without it (the report is never lost).
--
-- RUN ORDER: PREVIEW (read-only) → APPLY on its own → VERIFY. ROLLBACK only
-- if needed.
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Run each query and keep the output.
-- ============================================================================

-- P1. The column must not exist yet (expect 0 rows).
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'contact_reports' AND column_name = 'contact_id';

-- P2. What the backfill will do, per company: reports with a deal whose deal
--     names a customer (will be filled), with a deal that names none, and
--     with no deal at all (both stay NULL). Expected for JASCO PVC since
--     1 Oct: 312 reports, 171 without a deal.
SELECT r.company_id,
       count(*)                                                        AS reports,
       count(*) FILTER (WHERE r.deal_id IS NOT NULL AND d.contact_id IS NOT NULL) AS will_fill,
       count(*) FILTER (WHERE r.deal_id IS NOT NULL AND d.contact_id IS NULL)     AS deal_without_customer,
       count(*) FILTER (WHERE r.deal_id IS NULL)                                   AS no_deal
  FROM public.contact_reports r
  LEFT JOIN public.deals d ON d.id = r.deal_id
 GROUP BY r.company_id
 ORDER BY reports DESC;

-- P3. The same for JASCO PVC since 1 Oct 2026 only, by type.
SELECT r.contact_type,
       count(*) AS reports,
       count(*) FILTER (WHERE d.contact_id IS NOT NULL) AS will_fill,
       count(*) FILTER (WHERE r.deal_id IS NULL)        AS no_deal
  FROM public.contact_reports r
  LEFT JOIN public.deals d ON d.id = r.deal_id
 WHERE r.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
   AND r.contact_date >= '2026-10-01'
 GROUP BY r.contact_type
 ORDER BY r.contact_type;

-- P4. For information: the policies as they are (NOT changed here).
SELECT policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'contact_reports'
 ORDER BY cmd, policyname;

-- P5. Existing indexes, so APPLY does not duplicate one under another name.
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'contact_reports';


-- ============================================================================
-- APPLY — run this block ON ITS OWN, from BEGIN to COMMIT.
-- ============================================================================
BEGIN;

-- (1) the column
ALTER TABLE public.contact_reports
  ADD COLUMN IF NOT EXISTS contact_id uuid NULL
  REFERENCES public.contacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contact_reports.contact_id IS
  'The customer this visit / call / WhatsApp was with. Required by the app on new reports (session 34); backfilled from deals.contact_id for older ones.';

-- (2) backfill from the deal
UPDATE public.contact_reports r
   SET contact_id = d.contact_id
  FROM public.deals d
 WHERE d.id = r.deal_id
   AND r.contact_id IS NULL
   AND d.contact_id IS NOT NULL;
-- expected: UPDATE <P2 will_fill, summed over companies>

-- (3) the index
CREATE INDEX IF NOT EXISTS contact_reports_company_date_idx
  ON public.contact_reports (company_id, contact_date);

COMMIT;


-- ============================================================================
-- VERIFY — read-only.
-- ============================================================================

-- V1. The column exists, nullable, uuid.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'contact_reports' AND column_name = 'contact_id';

-- V2. The foreign key, ON DELETE SET NULL (confdeltype = 'n').
SELECT conname, confdeltype, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.contact_reports'::regclass AND contype = 'f'
   AND pg_get_constraintdef(oid) ILIKE '%contact_id%';

-- V3. Backfill complete: no report with a customer-bearing deal is left empty
--     (expect 0), and the filled count equals P2's will_fill.
SELECT count(*) AS left_empty
  FROM public.contact_reports r JOIN public.deals d ON d.id = r.deal_id
 WHERE r.contact_id IS NULL AND d.contact_id IS NOT NULL;
SELECT company_id, count(*) FILTER (WHERE contact_id IS NOT NULL) AS with_customer, count(*) AS reports
  FROM public.contact_reports GROUP BY company_id ORDER BY reports DESC;

-- V4. The backfill copied the deal's customer, never another one (expect 0).
SELECT count(*) AS mismatched
  FROM public.contact_reports r JOIN public.deals d ON d.id = r.deal_id
 WHERE r.contact_id IS DISTINCT FROM d.contact_id AND d.contact_id IS NOT NULL;

-- V5. The index.
SELECT indexname FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'contact_reports'
   AND indexname = 'contact_reports_company_date_idx';

-- V6. Policies unchanged — compare with P4.
SELECT policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'contact_reports'
 ORDER BY cmd, policyname;

-- After VERIFY: open /sales-monitor. The amber line "Visits name their
-- customer through the deal only" must be gone.


-- ============================================================================
-- ROLLBACK — only if needed. Drops the column, its foreign key and the index.
-- The app keeps working: both readers and the writer degrade without it.
-- ============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS public.contact_reports_company_date_idx;
-- ALTER TABLE public.contact_reports DROP COLUMN IF EXISTS contact_id;
-- COMMIT;
