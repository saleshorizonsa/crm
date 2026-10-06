-- ============================================================================
-- APPLIED ON PRODUCTION 2026-10-06.
--
-- deal_returns SELECT visibility, brought in line with the agreed rule.
--
-- ONE CORRECTION WAS NEEDED TO APPLY IT, and it was a defect in this file:
-- it listed 'ceo' as a company-wide role. There is no such value in the
-- user_role enum, which is
--     {admin, manager, agent, director, supervisor, salesman, head, viewer}
-- and Postgres casts a bare string literal to user_role when comparing it to
-- a user_role column, so BOTH the preview query and the CREATE POLICY would
-- have failed outright with "invalid input value for enum user_role". 'ceo'
-- has been removed from both blocks below; the three company-wide roles are
-- 'admin', 'director' and 'head'.
--
-- Other role lists in the application still mention a ceo — reportService
-- getTeamUserIds, the Reports role label, salesDivisionMetrics. They are
-- harmless there, because they are JavaScript string comparisons that simply
-- never match, and they are left alone. A SQL enum comparison is the one
-- place where a role that does not exist is fatal rather than inert.
-- ============================================================================
--
-- WHAT WAS THERE BEFORE (read from pg_policies on 2026-10-05 — read-only
-- SELECT, nothing was changed by the reading). One SELECT policy, "Users can
-- view deal returns based on role", an OR of two branches:
--
--   BRANCH 1 — the return IS linked to a deal:
--       the deal's owner, OR
--       a user who is the owner's direct supervisor, OR
--       a user who is the supervisor of the owner's supervisor (TWO levels), OR
--       a user whose role is 'admin' or 'director' in the deal's company
--
--   BRANCH 2 — the return is NOT linked to a deal (deal_id IS NULL):
--       ANY user whose company_id equals the return's company_id
--
-- THREE GAPS against the agreed rule (director/admin/head see everything
-- including unmatched; manager and supervisor see matched returns on their own
-- subtree; salesman sees his own):
--
--   GAP 1, the important one. Branch 2 let EVERY user in the company read every
--   UNMATCHED credit note — a salesman included. At the time that was all 5
--   returns in production, 223,050.51. The agreed rule restricts unmatched rows
--   to the company-wide roles, because an unmatched return is linked to no deal
--   and so belongs to no team: there is no subtree it could be inside.
--   FIXED — a salesman now reads 0 of them (see VERIFY below).
--
--   GAP 2. 'head' was NOT in the company-wide role list, only 'admin' and
--   'director', so a head saw returns only on deals inside their own two-level
--   supervisor chain — for this company, almost nothing. FIXED.
--
--   GAP 3. The chain walk was hard-coded to TWO levels, where every other
--   hierarchy rule in the database recurses (get_user_subordinates) and the
--   application walks the full subtree (utils/teamHierarchy.js). At JASCO PVC's
--   depth — Kamal -> Amer/Alseyed -> salesmen — two levels happened to cover the
--   whole tree, so it was latent rather than live; it would have become live the
--   day a fourth level was added. FIXED: the policy now calls
--   get_user_subordinates.
--
-- THE SCREEN AND THE POLICY NOW AGREE. Reports -> Sales Returns enforces the
-- same rule in its own query (services/salesReturnsReportService.js, whose
-- ALL_RETURNS_ROLES is the same three roles as the policy below). That was
-- never a substitute for RLS — a UI filter cannot stop someone reading the
-- table through the API with their own token — and it is now belt and braces
-- rather than the only belt. Keep the two lists identical.
--
-- The app writes NOTHING to deal_returns from this screen, and the INSERT,
-- UPDATE and DELETE policies are left exactly as they are (admin only).
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Run this FIRST and read the output.
-- ============================================================================

-- 1. The policy as it stands today, so you can compare it with what you get.
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'deal_returns' AND cmd = 'SELECT';

-- 2. WHO GAINS AND WHO LOSES. One row per active user, with how many returns
--    they can read now and how many they will be able to read afterwards.
--    Nobody should gain except a 'head'; everyone who loses should lose only
--    UNMATCHED rows.
WITH ret AS (
  SELECT r.id, r.deal_id, r.company_id, r.return_amount, d.owner_id
  FROM deal_returns r
  LEFT JOIN deals d ON d.id = r.deal_id
),
-- The full subtree of each user, recursively — what the NEW policy will use.
subtree AS (
  WITH RECURSIVE walk AS (
    SELECT u.id AS root, u.id AS member
    FROM users u
    UNION ALL
    SELECT w.root, c.id
    FROM walk w
    JOIN users c ON c.supervisor_id = w.member
  )
  SELECT root, member FROM walk
)
SELECT
  u.full_name,
  u.role,
  u.is_active,
  -- NOW: branch 1 (own / direct / grandchild / admin+director) OR branch 2 (any
  -- unmatched row in the company).
  (SELECT count(*) FROM ret
    WHERE (ret.deal_id IS NOT NULL AND (
            ret.owner_id = u.id
         OR EXISTS (SELECT 1 FROM users s WHERE s.id = ret.owner_id AND s.supervisor_id = u.id)
         OR EXISTS (SELECT 1 FROM users s JOIN users ss ON ss.supervisor_id = s.id
                    WHERE ss.id = ret.owner_id AND s.supervisor_id = u.id)
         OR u.role IN ('admin', 'director')))
       OR (ret.deal_id IS NULL AND ret.company_id = u.company_id)
  ) AS can_read_now,
  -- AFTER: company-wide roles see everything; everyone else sees MATCHED rows
  -- on their own full subtree.
  (SELECT count(*) FROM ret
    WHERE (u.role IN ('admin', 'director', 'head') AND ret.company_id = u.company_id)
       OR (ret.deal_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM subtree st WHERE st.root = u.id AND st.member = ret.owner_id))
  ) AS can_read_after
FROM users u
WHERE u.is_active IS TRUE
ORDER BY u.role, u.full_name;

-- 3. The rows that will stop being visible to non-privileged users, which
--    should be exactly the unmatched ones.
SELECT count(*) AS unmatched_rows, coalesce(sum(return_amount), 0) AS unmatched_amount
FROM deal_returns
WHERE deal_id IS NULL;


-- ============================================================================
-- APPLY — ALREADY RUN ON PRODUCTION, 2026-10-06. Kept verbatim as the record of
-- what was applied, and re-runnable: DROP IF EXISTS then CREATE is idempotent,
-- so running it again replaces the policy with the identical one.
-- ============================================================================
--
-- One statement, one policy. DROP then CREATE rather than ALTER, because an
-- ALTER cannot change the shape of the expression and a half-changed policy is
-- worse than either version. Both run inside the transaction below, so the table
-- is never left without a SELECT policy.

BEGIN;

DROP POLICY IF EXISTS "Users can view deal returns based on role" ON public.deal_returns;

CREATE POLICY "Users can view deal returns based on role"
  ON public.deal_returns
  FOR SELECT
  USING (
    -- Company-wide roles: everything in their own company, matched or not.
    -- 'head' added; it was missing. 'ceo' is NOT here: no such enum value
    -- exists (see the header).
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.is_active IS TRUE
        AND u.role = ANY (ARRAY['admin'::user_role, 'director'::user_role,
                                'head'::user_role])
        AND (u.company_id = deal_returns.company_id OR u.company_id IS NULL)
    )
    OR
    -- Everyone else: MATCHED returns on a deal owned by themselves or by anyone
    -- in their subtree. get_user_subordinates() is the database's own recursive
    -- walk — the same one can_user_access_data and can_manage_user_contacts use —
    -- so this rule cannot disagree with the rest of the schema about who is in a
    -- team, and it is not limited to two levels. It is SECURITY DEFINER, so
    -- calling it here does not re-enter the RLS on `users`.
    --
    -- It returns a TABLE(subordinate_id, subordinate_role, full_name, email,
    -- department, level) — NOT a setof uuid — so the column has to be named.
    -- `IN (SELECT public.get_user_subordinates(...))` would compare a uuid
    -- against a composite and fail at CREATE POLICY time.
    --
    -- An UNMATCHED return reaches neither branch: it has no deal, so no owner,
    -- so no team. That is the intended behaviour and the reason this policy
    -- changed.
    EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_returns.deal_id
        AND (
          d.owner_id = auth.uid()
          OR d.owner_id IN (
            SELECT s.subordinate_id FROM public.get_user_subordinates(auth.uid()) s
          )
        )
    )
  );

COMMIT;


-- ============================================================================
-- VERIFY — run after applying.
-- ============================================================================

-- 1. The policy is there and is the new one.
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'deal_returns' AND cmd = 'SELECT';

-- 2. The other three policies are untouched (admin-only insert/update/delete).
SELECT cmd, policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'deal_returns'
ORDER BY cmd;

-- 3. Re-run PREVIEW query 2. `can_read_after` is now what RLS actually does, so
--    the two columns should agree with what you approved.

-- 4. Click-through, which no query can replace: open Reports -> Sales Returns as
--    a director, then as a supervisor and a salesman.
--
--    OBSERVED AFTER APPLYING, 2026-10-06:
--      director   5 rows, 223,050.51, all Unmatched
--      salesman   0 rows
--    Which is the agreed rule working: every credit note in production is
--    unmatched (deal_id IS NULL), an unmatched return belongs to no team, and
--    so only the company-wide roles can read one. Before this change a
--    salesman could read all five.


-- ============================================================================
-- ROLLBACK — restores the policy exactly as it was before.
-- ============================================================================
-- Verbatim from pg_policies on 2026-10-05, including the two-level chain walk
-- and the any-user-in-the-company branch for unmatched rows. Run this and you
-- are back where you started.

-- BEGIN;
--
-- DROP POLICY IF EXISTS "Users can view deal returns based on role" ON public.deal_returns;
--
-- CREATE POLICY "Users can view deal returns based on role"
--   ON public.deal_returns
--   FOR SELECT
--   USING (
--     (EXISTS ( SELECT 1
--        FROM deals d
--       WHERE ((d.id = deal_returns.deal_id) AND ((d.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
--                FROM users s
--               WHERE ((s.id = d.owner_id) AND (s.supervisor_id = auth.uid())))) OR (EXISTS ( SELECT 1
--                FROM (users s
--                  JOIN users ss ON ((ss.supervisor_id = s.id)))
--               WHERE ((ss.id = d.owner_id) AND (s.supervisor_id = auth.uid())))) OR (EXISTS ( SELECT 1
--                FROM users u
--               WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::user_role, 'director'::user_role])) AND ((u.company_id = d.company_id) OR (u.company_id IS NULL)))))))))
--     OR ((deal_id IS NULL) AND (EXISTS ( SELECT 1
--        FROM users u
--       WHERE ((u.id = auth.uid()) AND ((u.company_id = deal_returns.company_id) OR ((u.role = ANY (ARRAY['admin'::user_role, 'director'::user_role])) AND (u.company_id IS NULL)))))))
--   );
--
-- COMMIT;
-- ============================================================================
