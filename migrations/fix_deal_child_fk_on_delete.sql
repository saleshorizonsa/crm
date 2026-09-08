-- Root cause of the stuck-lead backlog (Sept 2026)
--
-- add_activity_log.sql declared:
--     ALTER TABLE activities ADD COLUMN IF NOT EXISTS deal_id uuid
--       REFERENCES deals(id) ON DELETE SET NULL;
--
-- `activities.deal_id` already existed, so ADD COLUMN IF NOT EXISTS was a no-op
-- and the ON DELETE SET NULL clause never took effect. The column kept its
-- original NO ACTION foreign key, which makes DELETE FROM deals fail with
-- 23503 for any deal that has activities.
--
-- checkExpiredLeads() deleted expired leads with a bare delete and only checked
-- the error with `if (!delErr)`, so every expired lead that had been worked at
-- all silently failed to leave the Funnel — while its opportunity had already
-- been reset on the preceding line. 34 leads accumulated, the oldest 89 days.
--
-- The application code now cascades explicitly, but the constraint itself
-- should behave as it was always meant to.

ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_deal_id_fkey;
ALTER TABLE activities
  ADD CONSTRAINT activities_deal_id_fkey
  FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;

-- Records that describe a deal's history should survive the deal being removed
-- from the Funnel; they carry opportunity_id / owner_id of their own.
ALTER TABLE bounce_back_logs DROP CONSTRAINT IF EXISTS bounce_back_logs_deal_id_fkey;
ALTER TABLE bounce_back_logs
  ADD CONSTRAINT bounce_back_logs_deal_id_fkey
  FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;

-- A future_orders row outlives the deal it was created from.
ALTER TABLE future_orders DROP CONSTRAINT IF EXISTS future_orders_source_deal_id_fkey;
ALTER TABLE future_orders
  ADD CONSTRAINT future_orders_source_deal_id_fkey
  FOREIGN KEY (source_deal_id) REFERENCES deals(id) ON DELETE SET NULL;
