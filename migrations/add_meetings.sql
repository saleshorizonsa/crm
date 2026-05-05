-- Meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid REFERENCES companies(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  start_time       timestamptz NOT NULL,
  end_time         timestamptz NOT NULL,
  location         text,
  meeting_url      text,
  status           text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled')),
  type             text NOT NULL DEFAULT 'meeting'
    CHECK (type IN ('meeting','call','demo','followup','other')),
  deal_id          uuid REFERENCES deals(id) ON DELETE SET NULL,
  contact_id       uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES users(id),
  google_event_id  text,
  outlook_event_id text,
  reminder_minutes integer DEFAULT 15,
  notes            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_company
  ON meetings(company_id, start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_deal
  ON meetings(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_contact
  ON meetings(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_creator
  ON meetings(created_by);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see company meetings"
  ON meetings FOR SELECT
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users manage company meetings"
  ON meetings FOR ALL
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- Meeting attendees
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  email      text,
  name       text,
  status     text DEFAULT 'invited'
    CHECK (status IN ('invited','accepted','declined')),
  UNIQUE(meeting_id, user_id)
);

ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see meeting attendees"
  ON meeting_attendees FOR SELECT
  USING (
    meeting_id IN (
      SELECT id FROM meetings
      WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users manage meeting attendees"
  ON meeting_attendees FOR ALL
  USING (
    meeting_id IN (
      SELECT id FROM meetings
      WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- Calendar OAuth connections (Google / Outlook)
CREATE TABLE IF NOT EXISTS calendar_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  provider      text NOT NULL CHECK (provider IN ('google','outlook')),
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  calendar_id   text,
  email         text,
  connected_at  timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar connection"
  ON calendar_connections FOR ALL
  USING (user_id = auth.uid());
