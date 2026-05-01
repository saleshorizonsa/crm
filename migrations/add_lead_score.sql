-- Migration: Add lead scoring columns to contacts
-- Description: Adds lead_score, lead_grade, and score_updated_at to contacts
--              for AI/manual lead qualification tracking.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_score       integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_grade       text        NOT NULL DEFAULT 'cold',
  ADD COLUMN IF NOT EXISTS score_updated_at timestamptz NOT NULL DEFAULT now();

-- Constrain valid grade values
ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_lead_grade_check;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_lead_grade_check
    CHECK (lead_grade IN ('hot', 'warm', 'cold'));

-- Index for owner-scoped grade filtering (contacts scope to company via owner_id)
CREATE INDEX IF NOT EXISTS idx_contacts_owner_lead_grade
  ON contacts (owner_id, lead_grade);

-- Index for score-based sorting across all contacts (DESC so top scores come first)
CREATE INDEX IF NOT EXISTS idx_contacts_lead_score_desc
  ON contacts (lead_score DESC);
