-- Activity Log enhancements
-- Run in Supabase SQL Editor

ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_type text DEFAULT 'note';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS next_action_date date;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES deals(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS duration_minutes integer;

CREATE INDEX IF NOT EXISTS idx_activities_owner   ON activities(owner_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_deal    ON activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_activities_date    ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_activities_company ON activities(company_id);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activities' AND policyname='Users read company activities') THEN
    CREATE POLICY "Users read company activities" ON activities FOR SELECT
      USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activities' AND policyname='Users create own activities') THEN
    CREATE POLICY "Users create own activities" ON activities FOR INSERT
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activities' AND policyname='Users update own activities') THEN
    CREATE POLICY "Users update own activities" ON activities FOR UPDATE
      USING (owner_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activities' AND policyname='Users delete own activities') THEN
    CREATE POLICY "Users delete own activities" ON activities FOR DELETE
      USING (owner_id = auth.uid());
  END IF;
END $$;
