-- Allow an opportunity to be parked when its lead bounces to Future Orders.
--
-- opportunities.status is constrained to open / converted / won / lost, so
-- checkExpiredLeads() cannot mark a bounced opportunity as anything other than
-- 'open' — which puts it straight back into the current month's Sales Plan,
-- alongside the future_orders row created for the same customer. That is the
-- double count this status removes.
--
-- Until this migration is applied, leadExpiryCheck.js falls back to leaving the
-- row 'open' and pushing expected_month to the Future Order's month.

ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_status_check;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_status_check
  CHECK (status IN ('open', 'converted', 'won', 'lost', 'moved_to_future'));

-- Bring the leads already parked by the backlog sweep onto the new status.
-- They were left as status='open' with expected_month pushed a month out.
UPDATE opportunities o
SET    status = 'moved_to_future'
WHERE  o.status = 'open'
AND    o.last_bounced_at IS NOT NULL
AND    EXISTS (
         SELECT 1 FROM future_orders f
         WHERE  f.opportunity_id = o.id
         AND    f.reason = 'No contact within 3-day SLA'
         AND    f.status = 'pending'
       );
