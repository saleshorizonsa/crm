-- Main leads table — isolated from contacts
CREATE TABLE IF NOT EXISTS leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid REFERENCES companies(id) ON DELETE CASCADE,
  assigned_to       uuid REFERENCES users(id),
  assigned_by       uuid REFERENCES users(id),

  -- Person info from Apollo
  first_name        text,
  last_name         text,
  email             text,
  phone             text,
  title             text,
  linkedin_url      text,

  -- Company info from Apollo
  company_name      text,
  company_website   text,
  company_size      text,
  industry          text,
  city              text,
  country           text DEFAULT 'Saudi Arabia',
  region            text,

  -- Lead management
  status            text DEFAULT 'new'
    CHECK (status IN (
      'new','contacted','qualified','unqualified','converted'
    )),
  source            text DEFAULT 'apollo'
    CHECK (source IN ('apollo','manual','import','referral')),
  product_interest  text[],
  lead_score        integer DEFAULT 0,
  notes             text,
  last_contacted_at timestamptz,

  -- Apollo metadata
  apollo_id         text UNIQUE,
  apollo_data       jsonb,
  data_collected_at timestamptz DEFAULT now(),

  -- Tracking
  converted_at      timestamptz,
  converted_to      uuid REFERENCES contacts(id),
  converted_by      uuid REFERENCES users(id),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_company
  ON leads(company_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned
  ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_apollo_id
  ON leads(apollo_id);
CREATE INDEX IF NOT EXISTS idx_leads_score
  ON leads(lead_score DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see company leads"
  ON leads FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users manage assigned leads"
  ON leads FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Territory mapping for auto-assignment
CREATE TABLE IF NOT EXISTS territory_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  regions    text[],
  products   text[],
  UNIQUE(user_id, company_id)
);
