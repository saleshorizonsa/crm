-- ============================================================================
-- NOT APPLIED. Written 2026-10-21 (session 31). Claude Code never runs SQL: a
-- person runs this, block by block, in the Supabase SQL editor.
--
-- WEEKLY FORECAST SNAPSHOTS (CEO, 2026-10-21).
--
-- WHAT IT DOES
--   (1) public.forecast_snapshots — one row per (company, snapshot day, month
--       forecast, scope): the tiers as the Forecast page computed them, plus
--       the open deals behind them (open_deal_ids) so the page can say which
--       deals were added, slipped, won or lost since.
--   (2) RLS: read by the company's manager / director / head / admin, and by
--       a person for his own person-scope rows; written by director / head /
--       admin only (they are the roles whose Forecast covers the whole
--       company, so the rows they write are complete). No update, no delete.
--
-- WHO WRITES THE ROWS: THE APP, NOT A DATABASE FUNCTION.
--   The tiers depend on the shared Achieved (net of credit notes), the
--   per-person target rule, the session-24 conversion fallback and division
--   attribution. Those live in the app (utils/planningCalculations.js,
--   utils/salesDivisionMetrics.js, utils/forecastTiers.js). A SQL function
--   computing the same tiers would be a SECOND definition of all of them,
--   which is exactly how this app's figures drifted apart before. So the
--   Forecast page writes the snapshot with the same code that draws the page:
--     - automatically, the first time a director / head / admin opens the
--       Forecast page after Sunday 06:00 Riyadh, when that week has no
--       snapshot yet (one per company per week — the unique key below);
--     - on demand, with "Take snapshot now" (admin / director / head).
--
-- WHY THERE IS NO pg_cron JOB IN THIS FILE.
--   pg_cron can only run SQL, so a scheduled job could only take the snapshot
--   through that second, SQL copy of the definitions. That copy could not be
--   tested against any database before you apply it. Until someone opens the
--   page in a week, that week has no snapshot; "Since last week" then compares
--   with the most recent one and says which date it is. If a strictly
--   unattended weekly run is wanted, the clean route is a scheduled server
--   function running the app's own code, which is a separate piece of work.
--
-- THE PAGE WORKS BEFORE THIS IS APPLIED: snapshot panels say "needs
-- migrations/forecast_snapshots.sql" and everything else is unaffected.
--
-- RUN ORDER: PREVIEW (read-only) → APPLY on its own → VERIFY.
-- ROLLBACK only if needed.
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only.
-- ============================================================================

-- P1. The table must not exist yet. Expected: 0 rows.
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'forecast_snapshots';

-- P2. The roles the policies rely on. Expected: the company's users with
--     roles among manager, director, head, admin, supervisor, salesman, viewer.
SELECT role, count(*) FROM public.users GROUP BY role ORDER BY role;


-- ============================================================================
-- APPLY — run as one block.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.forecast_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_date  date NOT NULL,                       -- the Riyadh day it was taken
  week_start     timestamptz NOT NULL,                -- Sunday 06:00 Riyadh of its week
  period_month   date NOT NULL,                       -- first day of the month forecast
  scope_type     text NOT NULL CHECK (scope_type IN ('company', 'division', 'person')),
  scope_id       text NOT NULL,                       -- company id, division id ('unassigned'), or user id
  achieved       numeric NOT NULL DEFAULT 0,
  wni            numeric NOT NULL DEFAULT 0,          -- won, not yet invoiced
  commit         numeric NOT NULL DEFAULT 0,
  most_likely    numeric NOT NULL DEFAULT 0,
  best_case      numeric NOT NULL DEFAULT 0,
  target         numeric NOT NULL DEFAULT 0,
  open_deal_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id, stage, amount, due}] counted in the period
  taken_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  manual         boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, snapshot_date, period_month, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS forecast_snapshots_company_week
  ON public.forecast_snapshots (company_id, week_start DESC);
CREATE INDEX IF NOT EXISTS forecast_snapshots_company_month
  ON public.forecast_snapshots (company_id, period_month, scope_type, scope_id, snapshot_date DESC);

ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;

-- Read: managers and above of the company (directors also through
-- director_companies, admins for any company), or the person his own rows.
DROP POLICY IF EXISTS forecast_snapshots_select ON public.forecast_snapshots;
CREATE POLICY forecast_snapshots_select ON public.forecast_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN ('manager', 'director', 'head')
         AND (u.company_id = forecast_snapshots.company_id
              OR EXISTS (SELECT 1 FROM public.director_companies dc
                          WHERE dc.user_id = auth.uid() AND dc.company_id = forecast_snapshots.company_id))
    )
    OR (scope_type = 'person' AND scope_id = auth.uid()::text)
  );

-- Write: director / head / admin, for a company they can see.
DROP POLICY IF EXISTS forecast_snapshots_insert ON public.forecast_snapshots;
CREATE POLICY forecast_snapshots_insert ON public.forecast_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN ('director', 'head')
         AND (u.company_id = forecast_snapshots.company_id
              OR EXISTS (SELECT 1 FROM public.director_companies dc
                          WHERE dc.user_id = auth.uid() AND dc.company_id = forecast_snapshots.company_id))
    )
  );
-- No UPDATE or DELETE policy: a snapshot is a record of what was forecast.

COMMIT;


-- ============================================================================
-- VERIFY
-- ============================================================================

-- V1. The table, its policies and RLS. Expected: rls = true, two policies.
SELECT c.relname, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = 'forecast_snapshots') AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'forecast_snapshots';

-- V2. After the first "Take snapshot now" (or a director opening Forecast):
--     one row per scope per month for the three months, all on one date.
SELECT snapshot_date, period_month, scope_type, count(*), sum(most_likely)
  FROM public.forecast_snapshots
 GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3;

-- V3. Company rows only, for reading against the page.
SELECT snapshot_date, period_month, achieved, wni, commit, most_likely, best_case, target,
       jsonb_array_length(open_deal_ids) AS deals
  FROM public.forecast_snapshots
 WHERE scope_type = 'company'
 ORDER BY snapshot_date DESC, period_month;


-- ============================================================================
-- ROLLBACK — removes the table and every snapshot in it.
-- ============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.forecast_snapshots;
-- COMMIT;
