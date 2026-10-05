-- ============================================================================
-- NOT APPLIED to production
-- ============================================================================
--
-- deals.is_imported — a durable marker for loaded-in history.
--
-- WHY. JASCO PVC's CRM started mid-year, so the months before it were loaded in
-- as deals that were already won and already invoiced. Those rows can only ever
-- be "won", so counting them in a win or conversion rate inflates every rate on
-- every screen (company 74.2% instead of 62.7%, Amer 89.2% instead of 81.7%) —
-- and an inflated rate UNDERSTATES Required Plan, which is target ÷ rate. CEO
-- decision, 2026-10-05: imported history never counts in a rate. It still counts
-- in Achieved; the money is real.
--
-- Today the only marker is invoice_number LIKE 'PRE-CRM-%', and that is now
-- WRITABLE from the UI: the "Correct invoice no." action on an invoiced deal
-- replaces invoice_number with the real ERP number, which silently turns a piece
-- of imported history into an ordinary won deal and re-inflates every rate. A
-- column nothing in the app writes is the durable answer.
--
-- The application reads BOTH markers (src/utils/importedDeals.js
-- isImportedDeal), and its deal queries ask for is_imported and retry without it
-- if it is absent — so applying this changes numbers but breaks nothing, and not
-- applying it leaves today's behaviour (invoice_number only) in place.
--
-- ORDER OF OPERATIONS
--   1. Run PREVIEW. It changes nothing and reports exactly what would be marked.
--   2. Run APPLY.
--   3. Run VERIFY.
--   4. ROLLBACK only if needed — it drops the column.
-- ============================================================================


-- ── 1. PREVIEW (read-only) ──────────────────────────────────────────────────
-- What the backfill would mark, per company and per owner. Run this FIRST and
-- keep the numbers: step 3 checks against them.
SELECT
  d.company_id,
  COALESCE(u.full_name, '(unassigned)')                        AS owner,
  count(*)                                                     AS imported_deals,
  ROUND(SUM(COALESCE(d.final_amount, d.amount)), 2)             AS value,
  MIN(d.invoice_date)                                           AS earliest_invoice,
  MAX(d.invoice_date)                                           AS latest_invoice,
  count(*) FILTER (WHERE d.stage <> 'won')                      AS not_won,
  count(*) FILTER (WHERE d.is_invoiced IS NOT TRUE)             AS not_invoiced
FROM deals d
LEFT JOIN users u ON u.id = d.owner_id
WHERE d.invoice_number LIKE 'PRE-CRM-%'
GROUP BY d.company_id, COALESCE(u.full_name, '(unassigned)')
ORDER BY d.company_id, imported_deals DESC;

-- The totals, and the share of the 3-month conversion window they account for.
-- `not_won` and `not_invoiced` above should both be 0: a row that is neither is
-- not imported history, and if any appear, STOP and look at them before
-- applying — the LIKE pattern would be marking something it should not.
SELECT
  count(*)                                                      AS total_imported,
  count(*) FILTER (WHERE d.created_at >= date_trunc('month', now()) - interval '3 months'
                     AND d.created_at <  date_trunc('month', now()))
                                                                AS imported_in_the_3m_window,
  (SELECT count(*) FROM deals x
    WHERE x.created_at >= date_trunc('month', now()) - interval '3 months'
      AND x.created_at <  date_trunc('month', now()))           AS all_deals_in_the_3m_window
FROM deals d
WHERE d.invoice_number LIKE 'PRE-CRM-%';


-- ── 2. APPLY ────────────────────────────────────────────────────────────────
BEGIN;

-- NOT NULL DEFAULT false: every existing row becomes false in one rewrite, and
-- nothing in the app has to cope with NULL meaning "unknown".
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS is_imported boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.deals.is_imported IS
  'True for deals loaded in from before the CRM (history import). They never passed through a pipeline, so they are excluded from win and conversion rates (src/utils/importedDeals.js). They still count in Achieved. Nothing in the application writes this column.';

-- The backfill. invoice_number is the only evidence there is, which is exactly
-- why the column exists: once it is set, correcting an invoice number can no
-- longer erase the fact.
UPDATE public.deals
SET is_imported = true
WHERE invoice_number LIKE 'PRE-CRM-%'
  AND is_imported IS DISTINCT FROM true;

-- Rates read this column with created_at and company_id; the partial index keeps
-- the "not imported" half of those scans cheap without indexing every row.
CREATE INDEX IF NOT EXISTS deals_imported_idx
  ON public.deals (company_id, created_at)
  WHERE is_imported = true;

COMMIT;


-- ── 3. VERIFY ───────────────────────────────────────────────────────────────
-- (a) The count matches the preview, and the two markers now agree exactly.
SELECT
  count(*) FILTER (WHERE is_imported)                                   AS marked,
  count(*) FILTER (WHERE invoice_number LIKE 'PRE-CRM-%')                AS placeholder_rows,
  count(*) FILTER (WHERE is_imported AND invoice_number NOT LIKE 'PRE-CRM-%') AS marked_without_placeholder,
  count(*) FILTER (WHERE NOT is_imported AND invoice_number LIKE 'PRE-CRM-%') AS placeholder_not_marked
FROM deals;

-- (b) The conversion rate the application will now show, company-wide, over the
-- 3 completed months — the figure to compare against the screen.
-- EDIT THE COMPANY ID. JASCO PVC is 'adf8ee78-cf78-4f02-932c-989a214bdd78'.
WITH win AS (
  SELECT
    count(*)                                        AS all_created,
    count(*) FILTER (WHERE NOT is_imported)         AS non_imported,
    count(*) FILTER (WHERE stage = 'won')           AS all_won,
    count(*) FILTER (WHERE stage = 'won' AND NOT is_imported) AS non_imported_won
  FROM deals
  WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND created_at >= date_trunc('month', now()) - interval '3 months'
    AND created_at <  date_trunc('month', now())
)
SELECT
  all_won, all_created,
  ROUND(100.0 * all_won / NULLIF(all_created, 0), 1)           AS rate_before,
  non_imported_won, non_imported,
  ROUND(100.0 * non_imported_won / NULLIF(non_imported, 0), 1) AS rate_after
FROM win;


-- ── 4. ROLLBACK ─────────────────────────────────────────────────────────────
-- Dropping the column puts the application back on the invoice_number marker
-- alone: isImportedDeal still answers, and the deal queries retry without the
-- column (queryDealsWithImportFlag), so nothing breaks — the rates simply go
-- back to trusting a value the UI can overwrite.
--
-- BEGIN;
--   DROP INDEX IF EXISTS deals_imported_idx;
--   ALTER TABLE public.deals DROP COLUMN IF EXISTS is_imported;
-- COMMIT;
