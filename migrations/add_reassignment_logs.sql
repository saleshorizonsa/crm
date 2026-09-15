-- Migration: reassignment_logs — audit trail for the Reassign Records tool
-- Date: 2026-09-15
--
-- WHY A NEW TABLE, NOT escalation_logs
-- The Coverage Console lists every unresolved escalation_logs row as an exception
-- to be acted on, so writing reassignments there would flood that feed with
-- routine admin actions. A reassignment is a completed event, not an open issue.
--
-- SHAPE
-- One row per "Apply Reassignment": who acted, from whom, to whom, and the exact
-- ids that actually moved (as returned by the UPDATE — not the ids requested,
-- since a row blocked by RLS or already moved elsewhere is skipped silently).
-- Counts are generated from the arrays so they can never disagree with them.
--
-- Append-only: there are no UPDATE or DELETE policies, so a log cannot be edited
-- or removed from the app.

CREATE TABLE IF NOT EXISTS reassignment_logs (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid        NOT NULL REFERENCES companies(id),
  performed_by           uuid        NOT NULL REFERENCES users(id),
  from_user_id           uuid        NOT NULL REFERENCES users(id),
  to_user_id             uuid        NOT NULL REFERENCES users(id),
  deal_ids               uuid[]      NOT NULL DEFAULT '{}',
  opportunity_ids        uuid[]      NOT NULL DEFAULT '{}',
  contact_ids            uuid[]      NOT NULL DEFAULT '{}',
  future_order_ids       uuid[]      NOT NULL DEFAULT '{}',
  deal_count             integer     GENERATED ALWAYS AS (cardinality(deal_ids)) STORED,
  opportunity_count      integer     GENERATED ALWAYS AS (cardinality(opportunity_ids)) STORED,
  contact_count          integer     GENERATED ALWAYS AS (cardinality(contact_ids)) STORED,
  future_order_count     integer     GENERATED ALWAYS AS (cardinality(future_order_ids)) STORED,
  -- Requested-but-not-moved counts per table, e.g. {"deals": 1}. Non-empty means
  -- RLS refused a row or someone changed its owner between loading and applying.
  skipped                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reassignment_logs_from_differs_from_to CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_reassignment_logs_company ON reassignment_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reassignment_logs_from    ON reassignment_logs (from_user_id);
CREATE INDEX IF NOT EXISTS idx_reassignment_logs_to      ON reassignment_logs (to_user_id);

ALTER TABLE reassignment_logs ENABLE ROW LEVEL SECURITY;

-- Anyone may write a log only in their own name.
CREATE POLICY "Users insert their own reassignment logs"
  ON reassignment_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());

-- Readable by whoever performed it, and by members of the log's company.
CREATE POLICY "Company members read reassignment logs"
  ON reassignment_logs
  FOR SELECT
  TO authenticated
  USING (
    performed_by = auth.uid()
    OR company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- Rollback:
--   DROP TABLE IF EXISTS reassignment_logs;
