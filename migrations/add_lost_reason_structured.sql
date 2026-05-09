-- ============================================================
-- Migration: Structured lost reason tracking
-- Adds columns to deals + creates lost_reason_options table
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS)
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
  ON lost_reason_options (company_id, is_active, category);

-- 3. Row-level security
ALTER TABLE lost_reason_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users read lost reasons"
  ON lost_reason_options FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admin manages lost reasons"
  ON lost_reason_options FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'director')
    )
  );
