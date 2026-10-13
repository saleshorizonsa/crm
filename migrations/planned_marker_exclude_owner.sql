-- ============================================================================
-- NOT APPLIED. Written 2026-10-13 (session 25). Run the blocks in order, each
-- ON ITS OWN: PREVIEW (read-only) → APPLY → VERIFY. ROLLBACK at the end.
--
-- WHY
--   The "already planned this month" marker (planned_contacts_this_month, from
--   migrations/insights_rls.sql) exists to stop TWO DIFFERENT people planning
--   one customer. It also stopped the SAME owner adding a second item for a
--   customer he already has — e.g. Mohamed Kamal could not plan the 152,500
--   balance of QUALITY SUPPLY PALSTIC TECHNOLOGY Factory, because his own
--   converted 305,000 item (fce4f340…) greyed the customer out.
--
-- WHAT CHANGES
--   One optional argument, p_exclude_owner uuid DEFAULT NULL. When it is the
--   CALLER (auth.uid()), that person's own items are left out, so the function
--   returns the customers planned this month by SOMEONE ELSE. Any other value
--   is IGNORED (treated as NULL): otherwise a salesman could pass a colleague's
--   id and learn, by difference, exactly which customers that colleague has.
--   Everything else — company guard, open + converted, one calendar month,
--   SETOF uuid and nothing more — is unchanged.
--
-- WHY DROP + CREATE, NOT CREATE OR REPLACE
--   Adding a parameter makes a NEW function next to the old (uuid, date) one,
--   and a two-argument call would then match both and fail as ambiguous. So
--   the old one is dropped and the new one, whose third argument defaults to
--   NULL, answers the old two-argument call exactly as before. One transaction:
--   no moment exists in which neither is there.
--
-- THE APP BEFORE THIS IS APPLIED
--   utils/plannedMarker.js asks with three arguments; PostgREST finds no such
--   function, the app gets null, and the Customer Master keeps today's rule
--   (anyone's open or converted item blocks). The existing two-argument callers
--   (Customer Master, gap closer) are untouched and keep working after.
--
-- NO CONSTRAINT STOPS TWO ITEMS FOR ONE CUSTOMER IN ONE MONTH
--   Checked on production data 2026-10-13: 68 customer-months already carry 2+
--   plan items (all 68 with the same owner on more than one item), including
--   'open' and 'converted' side by side, so there is no unique key on
--   (customer, month). The triggers on opportunities, AS THE MIGRATION FILES
--   RECORD THEM, set division_id and updated_at only; PREVIEW 4 lists the live
--   ones so that is confirmed rather than assumed. Nothing here changes them.
-- ============================================================================


-- ── PREVIEW (read-only) ─────────────────────────────────────────────────────
-- 1. Today's signature.
SELECT p.oid::regprocedure AS signature, p.prosecdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'planned_contacts_this_month';
-- expect one row: planned_contacts_this_month(uuid,date), prosecdef = true

-- 2. QUALITY SUPPLY in October: who holds items, and in what status.
SELECT o.owner_id, u.full_name, o.status, o.planned_amount, o.id
  FROM public.opportunities o JOIN public.users u ON u.id = o.owner_id
 WHERE o.contact_id = 'ee3951b1-cbe2-4b57-8d97-cb7393675e20'
   AND o.expected_month >= DATE '2026-10-01' AND o.expected_month < DATE '2026-11-01';
-- expect Mohamed Kamal only: converted 305,000 (fce4f340-…)

-- 3. October, JASCO PVC: customers blocked for everyone today, and those that
--    would stay blocked FOR KAMAL (someone else holds an item).
SELECT count(DISTINCT contact_id) FILTER (WHERE true)                                         AS blocked_today,
       count(DISTINCT contact_id) FILTER (WHERE owner_id <> '6fcb06dc-9cb0-4143-9f82-fb77a011024e') AS blocked_for_kamal_after
  FROM public.opportunities
 WHERE company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
   AND contact_id IS NOT NULL
   AND status IN ('open', 'converted')
   AND expected_month >= DATE '2026-10-01' AND expected_month < DATE '2026-11-01';


-- 4. Every trigger and every unique / exclusion constraint on opportunities.
SELECT 'trigger' AS kind, t.tgname AS name, pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger t
 WHERE t.tgrelid = 'public.opportunities'::regclass AND NOT t.tgisinternal
UNION ALL
SELECT 'constraint', c.conname, pg_get_constraintdef(c.oid)
  FROM pg_constraint c
 WHERE c.conrelid = 'public.opportunities'::regclass AND c.contype IN ('u', 'x')
UNION ALL
SELECT 'unique index', i.relname, pg_get_indexdef(i.oid)
  FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
 WHERE x.indrelid = 'public.opportunities'::regclass AND x.indisunique AND NOT x.indisprimary;
-- expect triggers only (division on insert, division on update, updated_at),
-- no unique constraint or unique index besides the primary key


-- ── APPLY ───────────────────────────────────────────────────────────────────
BEGIN;

DROP FUNCTION IF EXISTS public.planned_contacts_this_month(uuid, date);

CREATE FUNCTION public.planned_contacts_this_month(
  p_company uuid,
  p_month date,
  p_exclude_owner uuid DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exclude uuid;
BEGIN
  -- Only for your own company, same guard as before.
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = auth.uid()
       AND (u.company_id = p_company OR u.company_id IS NULL)
  ) THEN
    RETURN;
  END IF;

  -- Only the caller's OWN items may be left out.
  v_exclude := CASE WHEN p_exclude_owner = auth.uid() THEN p_exclude_owner ELSE NULL END;

  RETURN QUERY
  SELECT DISTINCT o.contact_id
    FROM public.opportunities o
   WHERE o.company_id = p_company
     AND o.contact_id IS NOT NULL
     AND o.status IN ('open', 'converted')
     AND o.expected_month >= date_trunc('month', p_month)::date
     AND o.expected_month <  (date_trunc('month', p_month) + interval '1 month')::date
     AND (v_exclude IS NULL OR o.owner_id IS DISTINCT FROM v_exclude);
END;
$$;

REVOKE ALL ON FUNCTION public.planned_contacts_this_month(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planned_contacts_this_month(uuid, date, uuid) TO authenticated;

COMMIT;

-- PostgREST caches function signatures; reload so the three-argument call is
-- found at once rather than after the next schema-cache refresh.
NOTIFY pgrst, 'reload schema';


-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- 1. One function, three arguments, SECURITY DEFINER, search_path pinned.
SELECT p.oid::regprocedure AS signature, p.prosecdef, p.proconfig
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'planned_contacts_this_month';
-- expect one row: planned_contacts_this_month(uuid,date,uuid), true, {search_path=public}

-- 2. As KAMAL: the two-argument call is unchanged (QUALITY SUPPLY is in it);
--    with himself excluded it is not; with someone else's id passed, the
--    argument is ignored and QUALITY SUPPLY is back.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"6fcb06dc-9cb0-4143-9f82-fb77a011024e","role":"authenticated"}', true);
SELECT
  (SELECT count(*) FROM public.planned_contacts_this_month('adf8ee78-cf78-4f02-932c-989a214bdd78', DATE '2026-10-01')) AS all_count,
  'ee3951b1-cbe2-4b57-8d97-cb7393675e20' IN (SELECT * FROM public.planned_contacts_this_month('adf8ee78-cf78-4f02-932c-989a214bdd78', DATE '2026-10-01')) AS qs_two_args,
  'ee3951b1-cbe2-4b57-8d97-cb7393675e20' IN (SELECT * FROM public.planned_contacts_this_month('adf8ee78-cf78-4f02-932c-989a214bdd78', DATE '2026-10-01', '6fcb06dc-9cb0-4143-9f82-fb77a011024e')) AS qs_excluding_self,
  'ee3951b1-cbe2-4b57-8d97-cb7393675e20' IN (SELECT * FROM public.planned_contacts_this_month('adf8ee78-cf78-4f02-932c-989a214bdd78', DATE '2026-10-01', 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e')) AS qs_other_id_ignored;
ROLLBACK;
-- expect all_count = blocked_today from PREVIEW 3, qs_two_args true,
--        qs_excluding_self false, qs_other_id_ignored true

-- 3. As MOHAMED HUSSEIN (salesman): QUALITY SUPPLY is still blocked for him,
--    with or without excluding himself — it is Kamal's item.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"ba03074d-8b5b-4378-bd51-6fe1f3ee225e","role":"authenticated"}', true);
SELECT 'ee3951b1-cbe2-4b57-8d97-cb7393675e20' IN (SELECT * FROM public.planned_contacts_this_month('adf8ee78-cf78-4f02-932c-989a214bdd78', DATE '2026-10-01', 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e')) AS qs_blocked_for_hussein;
ROLLBACK;
-- expect true


-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Restores the two-argument function exactly as migrations/insights_rls.sql
-- defined it. The app degrades to today's rule on its own.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.planned_contacts_this_month(uuid, date, uuid);
-- CREATE FUNCTION public.planned_contacts_this_month(p_company uuid, p_month date)
-- RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
-- AS $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
--                    AND (u.company_id = p_company OR u.company_id IS NULL)) THEN
--     RETURN;
--   END IF;
--   RETURN QUERY
--   SELECT DISTINCT o.contact_id FROM public.opportunities o
--    WHERE o.company_id = p_company AND o.contact_id IS NOT NULL
--      AND o.status IN ('open', 'converted')
--      AND o.expected_month >= date_trunc('month', p_month)::date
--      AND o.expected_month <  (date_trunc('month', p_month) + interval '1 month')::date;
-- END;
-- $$;
-- REVOKE ALL ON FUNCTION public.planned_contacts_this_month(uuid, date) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.planned_contacts_this_month(uuid, date) TO authenticated;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
