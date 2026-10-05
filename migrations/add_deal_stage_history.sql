-- ============================================================================
-- APPLIED to production 2026-10-05 (SQL editor)
-- ============================================================================
--
-- Run as ONE transaction. Without it, a failure part-way (the policies below
-- are the likely place) leaves the tables and indexes behind, and the file then
-- aborts on re-run at the first CREATE POLICY — which has no IF NOT EXISTS.
-- Every policy is therefore dropped first, so the whole file is re-runnable.
--
-- Nothing is backfilled. deal_stage_history starts empty, which is what
-- forecastEngine.calculateHistoricalWinRates will read: no error any more, but
-- no rows either, so `rates` stays {} and buildForecast keeps falling back to
-- DEFAULT_STAGE_WEIGHTS exactly as it does today. The only visible change is
-- that sampleCounts reports zeros instead of nothing. Real per-stage rates
-- appear once 5+ deals per stage have passed through AFTER this runs; history
-- cannot be reconstructed for existing deals, since deals.stage_changed_at
-- records only their latest move.
-- ============================================================================

BEGIN;

-- The admin clauses below call current_user_role(), the function the users
-- policies already use. It is NOT created by any file in this repo, so it is
-- checked here: a clear failure now is better than "function does not exist"
-- raised from inside a CREATE POLICY. The transaction means nothing is left
-- half-applied either way.
DO $$
BEGIN
  IF to_regprocedure('public.current_user_role()') IS NULL THEN
    RAISE EXCEPTION
      'current_user_role() was not found in schema public. The admin clauses in this migration depend on it (it is the function the users policies use). Create it first, or remove those clauses.';
  END IF;
END $$;

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

-- An admin works across companies through the company selector, so the row they
-- write carries the DEAL's company_id, not their own users.company_id. Without
-- the admin clause that insert is refused — silently, because the write is
-- fire-and-forget — and an admin moving a deal would record no history at all.
DROP POLICY IF EXISTS "Company users read stage history" ON deal_stage_history;
CREATE POLICY "Company users read stage history"
  ON deal_stage_history FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    OR current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "Company users insert stage history" ON deal_stage_history;
CREATE POLICY "Company users insert stage history"
  ON deal_stage_history FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    OR current_user_role() = 'admin'
  );

-- UPDATE is left company-scoped on purpose: the only update the application
-- makes is dealService.updateDeal stamping exited_at on the row it is leaving,
-- and nothing reads exited_at yet (calculateHistoricalWinRates reads deal_id,
-- stage and entered_at). A cross-company admin move will therefore insert the
-- new stage row but not close the previous one. Widen this the same way if that
-- column ever starts being read.
DROP POLICY IF EXISTS "Company users update stage history" ON deal_stage_history;
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

DROP POLICY IF EXISTS "Company users read win rates" ON company_win_rates;
CREATE POLICY "Company users read win rates"
  ON company_win_rates FOR SELECT
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- FOR ALL with only USING: Postgres reuses USING as the WITH CHECK, so a
-- manager, director or admin can write the cache. A salesman or supervisor
-- cannot, so getOrCalculateWinRates's upsert is refused for them and swallowed
-- by its own .catch — they simply recompute on every load instead of reading a
-- cached row. Left as written; widening it is a separate decision.
DROP POLICY IF EXISTS "Managers manage win rates" ON company_win_rates;
CREATE POLICY "Managers manage win rates"
  ON company_win_rates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('admin', 'director', 'manager')
  ));

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
-- Expect both tables present, RLS enabled on both, and 5 policies.
-- SELECT c.relname, c.relrowsecurity
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname IN ('deal_stage_history', 'company_win_rates');
--
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('deal_stage_history', 'company_win_rates')
-- ORDER BY tablename, policyname;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- deal_stage_history holds the only record of stage transitions once the app
-- starts writing it; dropping it discards that history permanently.
--
-- BEGIN;
--   DROP TABLE IF EXISTS deal_stage_history;
--   DROP TABLE IF EXISTS company_win_rates;
-- COMMIT;
