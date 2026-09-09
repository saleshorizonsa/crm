-- Manager approval workflow for monthly sales plans.
--
-- Before this, a salesman could submit a plan but no manager screen existed to
-- review it, and the only manager-facing signal was the missed-deadline flag in
-- deadlineCheck.js — nothing fired when a plan actually arrived on time.
--
-- The existing reviewed / reviewed_by / reviewed_at columns belong to that
-- missed-deadline flow (a manager acknowledging a flag) and are deliberately
-- left alone; approval is tracked separately below.

ALTER TABLE plan_submissions
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending';

ALTER TABLE plan_submissions
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);

ALTER TABLE plan_submissions
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE plan_submissions
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE plan_submissions
  ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;

-- Keep the column honest: only these three states are meaningful to the UI.
ALTER TABLE plan_submissions DROP CONSTRAINT IF EXISTS plan_submissions_approval_status_check;
ALTER TABLE plan_submissions
  ADD CONSTRAINT plan_submissions_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- The approvals screen filters on (company_id, approval_status, is_submitted)
-- and orders by submitted_at; the lock check hits (owner_id, plan_month).
CREATE INDEX IF NOT EXISTS plan_submissions_approval_idx
  ON plan_submissions (company_id, approval_status, is_submitted);
CREATE INDEX IF NOT EXISTS plan_submissions_owner_month_idx
  ON plan_submissions (owner_id, plan_month);

-- Historical rows: the 6 August rows that were never submitted stay 'pending'
-- but are invisible to the approvals screen (it also filters is_submitted=true).
-- The one genuinely submitted August plan is back-dated to 'pending' so it
-- surfaces for review rather than appearing silently approved.
UPDATE plan_submissions
SET    approval_status = 'pending'
WHERE  approval_status IS NULL;
