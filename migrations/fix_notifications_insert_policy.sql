-- Migration: allow hierarchy-based cross-user notification inserts
-- Date: 2026-09-13
--
-- ---------------------------------------------------------------------------
-- PROBLEM
-- ---------------------------------------------------------------------------
-- The notifications INSERT policy is:
--
--     WITH CHECK (auth.uid() = user_id)
--
-- i.e. a user may only ever create a notification ADDRESSED TO THEMSELVES.
--
-- Every notification insert in this app is client-side through the anon key
-- (src/lib/supabase.js builds both clients from VITE_SUPABASE_ANON_KEY; the only
-- service-role clients are the Deno edge functions, none of which touch
-- notifications). So RLS applies to all of them, and EVERY cross-user
-- notification the product intends to send has been silently rejected:
--
--   DOWNWARD (manager -> report)
--     * plan approved / rejected        planApproval.js:212,243
--     * target assigned                 supabaseService.js:3583
--     * target changed                  targetChangeHandler.js:73
--     * lead assigned                   leadService.js:227
--     * deal edited on owner's behalf   sales-pipeline/index.jsx
--
--   UPWARD (report -> manager)
--     * plan submitted                  planApproval.js:184
--     * lead expiry escalation          leadExpiryCheck.js:169
--     * plan deadline missed            deadlineCheck.js:64
--     * deal stage events to supervisors notifyRoleBasedEvent
--
-- Nothing surfaced this because supabase-js RETURNS { error } rather than
-- throwing, and every one of these call sites discards it. Only
-- self-addressed notifications have ever been written to this table.
--
-- It is worse for the batch inserts (notifyRoleBasedEvent, deadlineCheck,
-- targetChangeHandler): a multi-row INSERT is atomic under RLS, so one
-- disallowed recipient discards the whole batch — including the row addressed
-- to the acting user, which would individually have been allowed.
--
-- ---------------------------------------------------------------------------
-- FIX
-- ---------------------------------------------------------------------------
-- Reuse can_manage_user_contacts(manager_id, target_user_id) — the same
-- function the deals policies already use.
--
-- It is strictly ONE-DIRECTIONAL (verified by probing it against live data):
--
--     Kamal   -> Osman     true    manager -> direct report
--     Kamal   -> Hazim     true    manager -> indirect report (2 levels)
--     Nader   -> Hazim     true    director -> anyone
--     Osman   -> Kamal     FALSE   report -> their manager
--     Hazim   -> Mueataz   FALSE   peer under the same supervisor
--     Hazim   -> Malki     FALSE   unrelated user
--     Kamal   -> <Steels>  FALSE   cross-company
--
-- Because it only answers downward, a single clause would leave every UPWARD
-- notification above still failing. Both orientations are therefore permitted:
--
--     auth.uid() = user_id                          self     (unchanged)
--     can_manage_user_contacts(auth.uid(), user_id) downward: manager -> report
--     can_manage_user_contacts(user_id, auth.uid()) upward:   report  -> manager
--
-- The reverse clause does NOT widen the blast radius: peers, unrelated users and
-- cross-company pairs return false in BOTH directions, so they stay rejected.
--
-- ---------------------------------------------------------------------------
-- PRE-FLIGHT (run first, confirm before applying)
-- ---------------------------------------------------------------------------
--   SELECT policyname, cmd, permissive, roles, with_check
--   FROM   pg_policies
--   WHERE  schemaname = 'public' AND tablename = 'notifications'
--   ORDER  BY cmd, policyname;
--
-- Confirm:
--   1. No existing policy is already named
--      "Users can insert notifications within their hierarchy".
--   2. The existing INSERT policy's `permissive` column reads PERMISSIVE.
--      This migration is ADDITIVE and relies on PostgreSQL OR-ing multiple
--      permissive policies for the same command. If the existing policy is
--      RESTRICTIVE, policies are AND-ed instead and this will NOT work —
--      stop and tell me, the approach must change.

-- =====================================================
-- 1. Add the hierarchy-aware INSERT policy
-- =====================================================
--
-- Deliberately ADDITIVE — no DROP. Permissive policies for the same command are
-- OR-ed, so the existing self-only rule stays valid and this widens it. That
-- avoids guessing the current policy's name (a wrong name in a DROP silently
-- no-ops) and avoids a window where the table has no INSERT policy at all.
-- Rollback is a single DROP of this one policy, with nothing else disturbed.

CREATE POLICY "Users can insert notifications within their hierarchy"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR can_manage_user_contacts(auth.uid(), user_id)
    OR can_manage_user_contacts(user_id, auth.uid())
  );

-- =====================================================
-- 2. Verification (run after applying)
-- =====================================================
--
-- a) Policy is present and PERMISSIVE:
--      SELECT policyname, cmd, permissive, with_check FROM pg_policies
--      WHERE schemaname='public' AND tablename='notifications' AND cmd='INSERT';
--
-- b) Re-run the manager-edits-a-team-member's-deal test in the running app and
--    confirm a row lands with user_id = the deal's owner:
--      SELECT user_id, type, title, created_at FROM notifications
--      ORDER BY created_at DESC LIMIT 5;
--
--    Test through the APP as an authenticated user. A service-role client
--    bypasses RLS entirely and will pass regardless, proving nothing — that is
--    precisely the mistake that let the earlier ownership fix reach production.
--
-- c) Negative check — a peer-to-peer insert must still be rejected.

-- =====================================================
-- 3. Rollback
-- =====================================================
--   DROP POLICY "Users can insert notifications within their hierarchy"
--     ON notifications;

-- =====================================================
-- 4. Known limitation (does not block this migration)
-- =====================================================
-- can_manage_user_contacts() resolves the tree through users.supervisor_id,
-- while several of the call sites above compute their recipient from
-- users.reports_to (deadlineCheck, leadExpiryCheck, DealModal.notifyManager).
-- Where those two columns disagree the policy will reject a recipient the app
-- just calculated. In JASCO PVC that is one user (Ahmad Sulaiman Moamina);
-- in JASCO Steels the two trees differ substantially. Resolving that is the
-- separate, currently-paused supervisor_id/reports_to consolidation.
