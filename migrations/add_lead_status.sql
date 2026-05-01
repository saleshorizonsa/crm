-- Add lead pipeline status to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_status text
    CHECK (lead_status IN ('new', 'contacted', 'qualified', 'proposal', 'converted', 'lost'));

-- Index for pipeline queries scoped to owner
CREATE INDEX IF NOT EXISTS idx_contacts_owner_lead_status
  ON contacts (owner_id, lead_status)
  WHERE lead_status IS NOT NULL;
