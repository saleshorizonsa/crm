-- ============================================================================
-- NOT APPLIED. Written 2026-10-13 (session 22). Claude Code never runs SQL: a
-- person runs this, block by block, in the Supabase SQL editor.
--
-- EXPORT CUSTOMERS ALWAYS LAND IN EXPORT (CEO, 2026-10-13).
--
-- WHY. Kamal created Al BADAH — an export customer — as a deal in Export at
-- 11:18 on 13 Oct; at 11:19 he marked it Won and the deal form saved it as
-- PVC Compound, because Kamal belongs to two divisions and the form offers
-- him both. Corrected by hand. The rule: an EXPORT customer's deals, plan
-- items and future orders are ALWAYS Export, whatever the products or the
-- owner. Local customers keep today's rule (owner's division, or the one
-- picked on the form).
--
-- WHAT IT DOES
--   (1) contacts.is_export boolean NOT NULL DEFAULT false
--   (2) seed: Al BADAH (Kamal's record) and PLASTICO BAHRAIN — by id, after
--       PREVIEW P3 has shown there is exactly one record of each to mark
--   (3) the INSERT and UPDATE division triggers on deals, opportunities and
--       future_orders: when the row's customer is export, division_id is the
--       company's Export division, overriding what the form sent; otherwise
--       their behaviour is unchanged (bodies below = the repo's current
--       definitions plus the one export branch at the top)
--   (4) backfill: open and won-not-invoiced deals, open/converted plan items
--       and pending future orders of export customers → Export. INVOICED
--       DEALS ARE NOT TOUCHED — history keeps the division it was booked in.
--   (5) who may set the flag: manager, director, head, admin. Enforced by a
--       guard trigger on contacts rather than a policy change: a row policy
--       cannot single out one column, and the contacts policies are not in
--       this repository to rewrite safely. NO EXISTING POLICY IS CHANGED.
--       auth.uid() is NULL in the SQL editor, so this file's own seed passes.
--
-- RUN ORDER: PREVIEW (read-only) → compare P1 with the bodies in APPLY →
-- APPLY on its own → VERIFY. ROLLBACK only if needed.
--
-- On 13 Oct (read through the API, not SQL): one PLASTICO BAHRAIN record
-- (f21ba5c5-97ce-4b66-8528-bc1c130aebaf, owner Mohamed Kamal); its one open
-- plan item is already Export, so the backfill is expected to move 0 rows
-- today — Al BADAH's were corrected by hand. Re-check with P4.
-- ============================================================================


-- ============================================================================
-- PREVIEW — read-only. Run each query and keep the output.
-- ============================================================================

-- P1. The LIVE definitions of the two functions APPLY replaces. APPLY's bodies
--     are the repository's (migrations/division_attribution.sql and
--     division_on_update.sql) plus the export branch. If P1 differs from
--     those files in anything else, STOP: someone changed them in the
--     database, and APPLY would undo it.
SELECT p.proname, pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('set_division_from_owner', 'set_division_from_owner_on_update');

-- P2. The Export division per company. APPLY matches the name 'Export'
--     (case-insensitive); a company with none simply gets no override.
--     Expected for JASCO PVC: 78733b2e-3f61-4fd1-a4d1-3bbc71451d0e.
SELECT company_id, id, name FROM public.sales_divisions WHERE lower(trim(name)) = 'export';

-- P3. The customers to mark. EVERY name match is listed; the seed in APPLY
--     uses ids, so if P3 shows more than one PLASTICO BAHRAIN or a different
--     Al BADAH id, stop and decide which record is the customer.
SELECT id, company_name, owner_id, status, created_at
  FROM public.contacts
 WHERE company_name ILIKE '%plastico%'
    OR company_name ILIKE '%badah%'
 ORDER BY company_name, created_at;

-- P4. What the backfill will move (for the two seeded customers).
WITH exp AS (
  SELECT id FROM public.contacts
   WHERE id IN ('162f5a4f-df4b-44c9-b03d-1b1fadae9856', 'f21ba5c5-97ce-4b66-8528-bc1c130aebaf')
),
xd AS (SELECT company_id, id AS export_id FROM public.sales_divisions WHERE lower(trim(name)) = 'export')
SELECT 'deal' AS kind, d.id, d.title AS what, d.stage AS status, d.division_id AS from_division, xd.export_id AS to_division
  FROM public.deals d JOIN exp ON exp.id = d.contact_id JOIN xd ON xd.company_id = d.company_id
 WHERE (d.stage NOT IN ('won', 'lost') OR (d.stage = 'won' AND COALESCE(d.is_invoiced, false) = false))
   AND d.division_id IS DISTINCT FROM xd.export_id
UNION ALL
SELECT 'plan item', o.id, o.customer_name, o.status, o.division_id, xd.export_id
  FROM public.opportunities o JOIN exp ON exp.id = o.contact_id JOIN xd ON xd.company_id = o.company_id
 WHERE o.status IN ('open', 'converted') AND o.division_id IS DISTINCT FROM xd.export_id
UNION ALL
SELECT 'future order', f.id, f.customer_name, f.status, f.division_id, xd.export_id
  FROM public.future_orders f JOIN exp ON exp.id = f.contact_id JOIN xd ON xd.company_id = f.company_id
 WHERE f.status = 'pending' AND f.division_id IS DISTINCT FROM xd.export_id;

-- P5. For information: the contacts policies as they are (not changed here).
SELECT policyname, cmd, qual, with_check FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'contacts' ORDER BY cmd, policyname;


-- ============================================================================
-- APPLY — run this block ON ITS OWN, from BEGIN to COMMIT.
-- ============================================================================
BEGIN;

-- (1) the flag
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_export boolean NOT NULL DEFAULT false;

-- The company's Export division for a row, when the row's customer is export;
-- NULL otherwise. SECURITY DEFINER so the answer does not depend on whether
-- the person saving can read that contact or division row; it returns one id
-- and nothing else. search_path pinned.
CREATE OR REPLACE FUNCTION public.export_division_for(p_contact uuid, p_company uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id
    FROM public.contacts c
    JOIN public.sales_divisions d
      ON d.company_id = p_company AND lower(trim(d.name)) = 'export'
   WHERE c.id = p_contact
     AND c.is_export
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.export_division_for(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_division_for(uuid, uuid) TO authenticated, service_role;

-- (3a) INSERT: deals, opportunities, future_orders. Unchanged except the
--      export branch first.
CREATE OR REPLACE FUNCTION public.set_division_from_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_export uuid;
BEGIN
  -- EXPORT CUSTOMER: Export, whatever the form sent (session 22).
  IF NEW.contact_id IS NOT NULL THEN
    v_export := public.export_division_for(NEW.contact_id, NEW.company_id);
    IF v_export IS NOT NULL THEN
      NEW.division_id := v_export;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.division_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    SELECT u.sales_division_id INTO NEW.division_id
      FROM public.users u WHERE u.id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

-- (3b) UPDATE: same three tables. Unchanged except the export branch first —
--      which is what stops "marked Won, saved as PVC Compound".
CREATE OR REPLACE FUNCTION public.set_division_from_owner_on_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_primary uuid;
  v_belongs boolean;
  v_export  uuid;
BEGIN
  -- EXPORT CUSTOMER: Export, whatever the form sent (session 22).
  IF NEW.contact_id IS NOT NULL THEN
    v_export := public.export_division_for(NEW.contact_id, NEW.company_id);
    IF v_export IS NOT NULL THEN
      NEW.division_id := v_export;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) No division: take the owner's primary. This also catches an UPDATE
  --     that writes NULL over a division the row already had.
  IF NEW.division_id IS NULL THEN
    SELECT u.sales_division_id INTO NEW.division_id
      FROM public.users u WHERE u.id = NEW.owner_id;
    RETURN NEW;
  END IF;

  -- (b) The owner changed. The row keeps its division only if the new owner
  --     belongs to it — primary or additional membership.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    SELECT EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = NEW.owner_id
         AND u.sales_division_id = NEW.division_id
      UNION ALL
      SELECT 1 FROM public.user_sales_divisions usd
       WHERE usd.user_id = NEW.owner_id
         AND usd.division_id = NEW.division_id
    ) INTO v_belongs;

    IF NOT v_belongs THEN
      SELECT u.sales_division_id INTO v_primary
        FROM public.users u WHERE u.id = NEW.owner_id;
      IF v_primary IS NOT NULL THEN
        NEW.division_id := v_primary;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
-- The triggers themselves (set_*_division, set_*_division_on_update) already
-- point at these two functions; replacing the bodies is enough.

-- (5) Only manager and above may set or change the flag.
CREATE OR REPLACE FUNCTION public.guard_contacts_is_export()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_export)
     OR (TG_OP = 'UPDATE' AND NEW.is_export IS DISTINCT FROM OLD.is_export) THEN
    -- auth.uid() is NULL for the SQL editor and the service role.
    IF auth.uid() IS NOT NULL
       AND COALESCE(public.current_user_role(), '') NOT IN ('manager', 'director', 'head', 'admin') THEN
      RAISE EXCEPTION 'Only a manager or above can mark a customer as export'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_contacts_is_export ON public.contacts;
CREATE TRIGGER guard_contacts_is_export
  BEFORE INSERT OR UPDATE OF is_export ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contacts_is_export();

-- (2) seed — by id (see P3)
UPDATE public.contacts SET is_export = true
 WHERE id IN ('162f5a4f-df4b-44c9-b03d-1b1fadae9856',   -- Al BADAH (Kamal)
              'f21ba5c5-97ce-4b66-8528-bc1c130aebaf');  -- PLASTICO BAHRAIN

-- (4) backfill. updated_at triggers off so the repair is not recorded as an
--     edit by whoever runs this; back on before COMMIT. The division
--     triggers stay ON and agree with what is written.
ALTER TABLE public.deals          DISABLE TRIGGER update_deals_updated_at;
ALTER TABLE public.opportunities  DISABLE TRIGGER opportunities_updated_at;
ALTER TABLE public.future_orders  DISABLE TRIGGER future_orders_updated_at;

UPDATE public.deals d
   SET division_id = public.export_division_for(d.contact_id, d.company_id)
 WHERE public.export_division_for(d.contact_id, d.company_id) IS NOT NULL
   AND d.division_id IS DISTINCT FROM public.export_division_for(d.contact_id, d.company_id)
   AND (d.stage NOT IN ('won', 'lost') OR (d.stage = 'won' AND COALESCE(d.is_invoiced, false) = false));

UPDATE public.opportunities o
   SET division_id = public.export_division_for(o.contact_id, o.company_id)
 WHERE public.export_division_for(o.contact_id, o.company_id) IS NOT NULL
   AND o.division_id IS DISTINCT FROM public.export_division_for(o.contact_id, o.company_id)
   AND o.status IN ('open', 'converted');

UPDATE public.future_orders f
   SET division_id = public.export_division_for(f.contact_id, f.company_id)
 WHERE public.export_division_for(f.contact_id, f.company_id) IS NOT NULL
   AND f.division_id IS DISTINCT FROM public.export_division_for(f.contact_id, f.company_id)
   AND f.status = 'pending';

ALTER TABLE public.deals          ENABLE TRIGGER update_deals_updated_at;
ALTER TABLE public.opportunities  ENABLE TRIGGER opportunities_updated_at;
ALTER TABLE public.future_orders  ENABLE TRIGGER future_orders_updated_at;

COMMIT;


-- ============================================================================
-- VERIFY — read-only. Every count should be as stated.
-- ============================================================================

-- V1. The column exists, NOT NULL, default false.                 → 1 row
SELECT column_name, is_nullable, column_default FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'is_export';

-- V2. Seeded customers.                                           → 2 rows
SELECT id, company_name FROM public.contacts WHERE is_export ORDER BY company_name;

-- V3. Nothing left outside Export in the backfilled statuses.      → 0
SELECT count(*) AS left_outside_export FROM (
  SELECT d.id FROM public.deals d
   WHERE public.export_division_for(d.contact_id, d.company_id) IS NOT NULL
     AND d.division_id IS DISTINCT FROM public.export_division_for(d.contact_id, d.company_id)
     AND (d.stage NOT IN ('won', 'lost') OR (d.stage = 'won' AND COALESCE(d.is_invoiced, false) = false))
  UNION ALL
  SELECT o.id FROM public.opportunities o
   WHERE public.export_division_for(o.contact_id, o.company_id) IS NOT NULL
     AND o.division_id IS DISTINCT FROM public.export_division_for(o.contact_id, o.company_id)
     AND o.status IN ('open', 'converted')
  UNION ALL
  SELECT f.id FROM public.future_orders f
   WHERE public.export_division_for(f.contact_id, f.company_id) IS NOT NULL
     AND f.division_id IS DISTINCT FROM public.export_division_for(f.contact_id, f.company_id)
     AND f.status = 'pending'
) x;

-- V4. Both functions carry the export branch; the guard trigger exists.  → 2, 1
SELECT count(*) AS functions_with_export_branch FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('set_division_from_owner', 'set_division_from_owner_on_update')
   AND pg_get_functiondef(p.oid) LIKE '%export_division_for%';
SELECT count(*) AS guard_trigger FROM pg_trigger WHERE tgname = 'guard_contacts_is_export';

-- V5. The rule, end to end, without leaving anything behind: an update that
--     tries to put an Al BADAH deal in PVC Compound comes back as Export.
--     Rolled back — nothing is kept.                              → Export
BEGIN;
UPDATE public.deals SET division_id = '115dae2d-0ff0-41cd-b64f-47ca57cf9126'   -- PVC Compound
 WHERE id = (SELECT id FROM public.deals WHERE contact_id = '162f5a4f-df4b-44c9-b03d-1b1fadae9856' ORDER BY created_at DESC LIMIT 1)
RETURNING (SELECT name FROM public.sales_divisions WHERE id = division_id) AS division_after_update;
ROLLBACK;


-- ============================================================================
-- ROLLBACK — only if needed. Restores the two function bodies as they were
-- (the repository's definitions), removes the guard and the helper, and drops
-- the flag. Rows the backfill moved to Export STAY in Export: P4's output is
-- the record of what moved, if any of it has to be put back by hand.
-- ============================================================================
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.set_division_from_owner()
-- RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
-- BEGIN
--   IF NEW.division_id IS NULL AND NEW.owner_id IS NOT NULL THEN
--     SELECT u.sales_division_id INTO NEW.division_id FROM public.users u WHERE u.id = NEW.owner_id;
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
-- -- set_division_from_owner_on_update(): re-run its CREATE OR REPLACE from
-- -- migrations/division_on_update.sql (APPLY block, "the two trigger functions").
-- DROP TRIGGER IF EXISTS guard_contacts_is_export ON public.contacts;
-- DROP FUNCTION IF EXISTS public.guard_contacts_is_export();
-- DROP FUNCTION IF EXISTS public.export_division_for(uuid, uuid);
-- ALTER TABLE public.contacts DROP COLUMN IF EXISTS is_export;
-- COMMIT;
