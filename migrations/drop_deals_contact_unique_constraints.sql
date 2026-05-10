-- Remove any unique constraints that incorrectly prevent multiple deals
-- for the same contact. A contact can have unlimited deals.
-- The ONLY valid unique constraint on the deals table is the primary key (id).
--
-- Run this in the Supabase SQL editor or via supabase db push.

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_contact_id_company_id_key;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_contact_id_unique;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_contact_id_stage_key;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_contact_company_unique;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS unique_deal_contact;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS unique_deal_per_contact;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_unique_contact;
