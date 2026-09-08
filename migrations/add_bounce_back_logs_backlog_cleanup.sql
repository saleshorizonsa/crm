-- Distinguish the one-off historical backlog cleanup from real-time bounces.
--
-- On 2026-09-08 the 34-lead backlog that had accumulated behind the broken
-- checkExpiredLeads() sweep was cleared in a single run: 31 leads that were
-- 3-89 days old were moved to Future Orders and 31 bounce_back_logs rows were
-- written at once.
--
-- Those bounces were never enforced in real time — the SLA sweep could not
-- delete an expired deal, so nobody was ever warned or escalated. Counting them
-- toward the 2nd-bounce escalation would retroactively flag five salesmen for
-- violations the system itself failed to catch, so they are marked here and
-- excluded from escalation counts by checkSecondBounce() in
-- src/utils/leadExpiryCheck.js. They are kept as an audit record.
--
-- No salesman_flags, escalation_logs or notifications were created for them.

ALTER TABLE bounce_back_logs
  ADD COLUMN IF NOT EXISTS backlog_cleanup boolean DEFAULT false;

-- The cleanup run wrote every row with one identical bounced_at timestamp.
UPDATE bounce_back_logs
SET    backlog_cleanup = true
WHERE  company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'  -- JASCO PVC
AND    bounced_at = '2026-09-08T07:18:11.507+00:00'
AND    reason = 'No contact within 3-day SLA';
-- expected: UPDATE 31

-- Real-time bounces from here on keep the default false and escalate normally.
