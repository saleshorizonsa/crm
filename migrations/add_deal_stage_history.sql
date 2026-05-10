-- Track which stage each deal was in and when
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id),
  stage         text NOT NULL,
  entered_at    timestamptz NOT NULL DEFAULT now(),
  exited_at     timestamptz,
  days_in_stage integer,
  created_by    uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_dsh_deal    ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_dsh_company ON deal_stage_history(company_id, stage);
CREATE INDEX IF NOT EXISTS idx_dsh_entered ON deal_stage_history(entered_at);

ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users read stage history"
  ON deal_stage_history FOR SELECT
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Company users insert stage history"
  ON deal_stage_history FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Company users update stage history"
  ON deal_stage_history FOR UPDATE
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- 24-hour win-rate cache per company
CREATE TABLE IF NOT EXISTS company_win_rates (
  company_id    uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  stage_rates   jsonb NOT NULL DEFAULT '{}',
  rep_rates     jsonb NOT NULL DEFAULT '{}',
  sample_counts jsonb NOT NULL DEFAULT '{}',
  calculated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_win_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users read win rates"
  ON company_win_rates FOR SELECT
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers manage win rates"
  ON company_win_rates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('admin', 'director', 'manager')
  ));
