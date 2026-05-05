-- ============================================================
-- Migration: Add structured lost reason tracking to deals
-- Run once in Supabase SQL Editor
-- ============================================================

-- 1. New columns on deals table
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS lost_reason_code  text,
  ADD COLUMN IF NOT EXISTS lost_reason_notes text,
  ADD COLUMN IF NOT EXISTS lost_at           timestamptz;

-- 2. Lost reason options catalogue (per-company, admin-managed)
CREATE TABLE IF NOT EXISTS lost_reason_options (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        REFERENCES companies(id) ON DELETE CASCADE,
  code       text        NOT NULL,
  label      text        NOT NULL,
  category   text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_lost_reasons_company
  ON lost_reason_options (company_id, is_active);

-- 3. Enable RLS (admins manage via policy that trusts authenticated users)
ALTER TABLE lost_reason_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read lost reasons"
  ON lost_reason_options FOR SELECT
  USING (true);

CREATE POLICY "Admins manage lost reasons"
  ON lost_reason_options FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- Default seed data — call adminService.seedLostReasons(companyId)
-- from the app, or run the INSERT below manually with your company_id.
--
-- Replace '<YOUR_COMPANY_ID>' with the actual UUID before running.
-- ============================================================

-- INSERT INTO lost_reason_options (company_id, code, label, category, sort_order) VALUES
--   ('<YOUR_COMPANY_ID>', 'PRICE_HIGH',          'Price too high',                        'Price',      1),
--   ('<YOUR_COMPANY_ID>', 'PRICE_COMPETITOR',    'Competitor offered lower price',         'Price',      2),
--   ('<YOUR_COMPANY_ID>', 'BUDGET_CUT',          'Customer budget cut or frozen',          'Price',      3),
--   ('<YOUR_COMPANY_ID>', 'CREDIT_TERMS',        'Better credit terms elsewhere',          'Price',      4),
--   ('<YOUR_COMPANY_ID>', 'LOCAL_COMPETITOR',    'Lost to local competitor',               'Competition',1),
--   ('<YOUR_COMPANY_ID>', 'IMPORT_COMPETITOR',   'Lost to cheaper imported product',       'Competition',2),
--   ('<YOUR_COMPANY_ID>', 'EXISTING_SUPPLIER',   'Customer stayed with existing supplier', 'Competition',3),
--   ('<YOUR_COMPANY_ID>', 'SPEC_MISMATCH',       'Specification did not match',            'Product',    1),
--   ('<YOUR_COMPANY_ID>', 'STOCK_DELAY',         'Stock unavailable or lead time too long','Product',    2),
--   ('<YOUR_COMPANY_ID>', 'MOQ_HIGH',            'Minimum order quantity too high',        'Product',    3),
--   ('<YOUR_COMPANY_ID>', 'QUALITY_CONCERN',     'Quality concern raised',                 'Product',    4),
--   ('<YOUR_COMPANY_ID>', 'PROJECT_CANCELLED',   'Project cancelled or postponed',         'Customer',   1),
--   ('<YOUR_COMPANY_ID>', 'NO_RESPONSE',         'Customer went silent',                   'Customer',   2),
--   ('<YOUR_COMPANY_ID>', 'DECISION_CHANGE',     'Decision maker changed',                 'Customer',   3),
--   ('<YOUR_COMPANY_ID>', 'CUSTOMER_CLOSED',     'Customer closed or restructured',        'Customer',   4),
--   ('<YOUR_COMPANY_ID>', 'QUOTE_EXPIRED',       'Quote expired before decision',          'Commercial', 1),
--   ('<YOUR_COMPANY_ID>', 'LC_TERMS',            'LC payment terms not accepted',          'Commercial', 2),
--   ('<YOUR_COMPANY_ID>', 'MARGIN_LOW',          'Margin too low to proceed',              'Commercial', 3),
--   ('<YOUR_COMPANY_ID>', 'WITHDREW_OFFER',      'We withdrew the offer',                  'Internal',   1),
--   ('<YOUR_COMPANY_ID>', 'CAPACITY',            'Capacity not available',                 'Internal',   2);
