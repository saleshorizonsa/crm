-- STEP 1: Add columns to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS creation_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS stage_dates jsonb DEFAULT '{}'::jsonb;

-- STEP 5: Create lead_history table
CREATE TABLE IF NOT EXISTS lead_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid REFERENCES leads(id) ON DELETE CASCADE,
  company_id   uuid REFERENCES companies(id),
  changed_by   uuid REFERENCES users(id),
  changed_at   timestamptz DEFAULT now(),
  field_name   text NOT NULL,
  old_value    text,
  new_value    text,
  change_type  text DEFAULT 'update'
    CHECK (change_type IN ('create','update','delete','stage_change','assignment'))
);

CREATE INDEX IF NOT EXISTS idx_lead_history_lead
  ON lead_history(lead_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_history_company
  ON lead_history(company_id, changed_at DESC);

ALTER TABLE lead_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users see lead history"
  ON lead_history FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company users insert lead history"
  ON lead_history FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );
