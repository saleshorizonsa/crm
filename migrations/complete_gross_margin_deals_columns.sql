-- ============================================================================
-- NOT APPLIED — this file has NOT been run against any database.
-- ============================================================================
--
-- Finishes add_gross_margin.sql. That migration has three parts; only the
-- `products` and `deal_products` parts reached production, so
-- deals.total_cost / gross_margin / margin_pct do not exist, and
-- dealProductService.updateDealMargin's write is rejected on every call —
-- silently until now (see src/services/supabaseService.js,
-- reportMarginColumnsMissing).
--
-- Only the three missing columns. Same names and same types as
-- add_gross_margin.sql, so running either file afterwards is a no-op:
--   deals.total_cost    NUMERIC(15,2)
--   deals.gross_margin  NUMERIC(15,2)
--   deals.margin_pct    NUMERIC(6,2)
--
-- NO BACKFILL. Every deal would compute to total_cost 0 and margin_pct 100,
-- because no deal_products line in this database carries a cost_price or a
-- line_cost — writing that would turn missing data into a 100% margin on every
-- deal, which is the bug the application side of this branch removes. The
-- columns stay NULL until a deal's lines are actually costed, at which point
-- updateDealMargin fills them on the next save of that deal.
--
-- Costs are entered per product in the Product Master; a deal_products line
-- takes its cost_price when the line is created, so filling the Product Master
-- affects lines added after that, not lines already saved.
-- ============================================================================

BEGIN;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS total_cost      NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS gross_margin    NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS margin_pct      NUMERIC(6,2);

-- Present in add_gross_margin.sql beside these columns; IF NOT EXISTS makes it
-- safe whether or not that part ever ran.
CREATE INDEX IF NOT EXISTS idx_deals_margin_pct ON deals(margin_pct);

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
-- Expect exactly three rows: total_cost numeric(15,2), gross_margin
-- numeric(15,2), margin_pct numeric(6,2) — and all three fully NULL.
SELECT
  c.column_name,
  c.data_type,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'deals'
  AND c.column_name IN ('total_cost', 'gross_margin', 'margin_pct')
ORDER BY c.column_name;

SELECT
  count(*)                                        AS deals_total,
  count(total_cost)                               AS with_total_cost,
  count(gross_margin)                             AS with_gross_margin,
  count(margin_pct)                               AS with_margin_pct
FROM deals;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Dropping these columns discards any margin written after the migration ran.
-- Nothing else reads them: the Margin report computes from deal_products, and
-- MarginSummaryWidget simply returns to its empty state.
--
-- BEGIN;
--   DROP INDEX IF EXISTS idx_deals_margin_pct;
--   ALTER TABLE deals
--     DROP COLUMN IF EXISTS total_cost,
--     DROP COLUMN IF EXISTS gross_margin,
--     DROP COLUMN IF EXISTS margin_pct;
-- COMMIT;
