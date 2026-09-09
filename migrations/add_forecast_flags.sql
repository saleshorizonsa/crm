-- Forecast vs Actual (±10%) variance flagging.
--
-- Stage 3/4 of the director's process calls for a check that the month's
-- forecast landed within tolerance of what was actually invoiced. Nothing for
-- it existed: no table, and no code referenced one.
--
-- Scope-level, not per-deal: one row per owner per month, comparing the SUM of
-- that owner's weighted forecast for the month against the SUM of what they
-- actually invoiced. Per-deal comparison would flag every deal that did not
-- land at exactly its probability weighting, which is noise by construction.
--
-- Informational only — the check writes rows here and nothing else. No
-- notifications, no escalation_logs, no salesman_flags.

CREATE TABLE IF NOT EXISTS forecast_flags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_id         uuid NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  -- First day of the month being assessed, e.g. 2026-09-01.
  period_month     date NOT NULL,
  forecast_amount  numeric NOT NULL DEFAULT 0,
  actual_amount    numeric NOT NULL DEFAULT 0,
  -- (actual - forecast) / forecast x 100. Negative = under-delivered.
  variance_pct     numeric NOT NULL DEFAULT 0,
  tolerance_pct    numeric NOT NULL DEFAULT 10,
  flagged          boolean NOT NULL DEFAULT true,
  reviewed         boolean NOT NULL DEFAULT false,
  reviewed_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- The banner reads unreviewed flags for a company, scoped to a team.
CREATE INDEX IF NOT EXISTS forecast_flags_lookup_idx
  ON forecast_flags (company_id, reviewed, period_month);
CREATE INDEX IF NOT EXISTS forecast_flags_owner_month_idx
  ON forecast_flags (owner_id, period_month);

-- One flag per owner per month. The check re-runs on every login in the last
-- three days of the month, so without this a single variance would be recorded
-- once per login. checkForecastVariance also tests before inserting; this
-- constraint is the backstop that makes the guarantee real under concurrency.
CREATE UNIQUE INDEX IF NOT EXISTS forecast_flags_owner_month_uniq
  ON forecast_flags (company_id, owner_id, period_month);

ALTER TABLE forecast_flags ENABLE ROW LEVEL SECURITY;

-- Mirrors how the other dashboard-alert tables are read: any authenticated user
-- in the company can see and acknowledge their team's flags. Scoping to a team
-- is done by the query, as it is for salesman_flags.
DROP POLICY IF EXISTS forecast_flags_select ON forecast_flags;
CREATE POLICY forecast_flags_select ON forecast_flags
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS forecast_flags_insert ON forecast_flags;
CREATE POLICY forecast_flags_insert ON forecast_flags
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS forecast_flags_update ON forecast_flags;
CREATE POLICY forecast_flags_update ON forecast_flags
  FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));
