-- Sales divisions (JASCO PVC) — table, users.sales_division_id, and membership
-- Date: 2026-09-15
-- company_id: adf8ee78-cf78-4f02-932c-989a214bdd78
--
-- A sales division is a PRODUCT-LINE grouping of people (Pipes & Fittings,
-- PVC Compound, PVC Sheet, Export). It is separate from the reporting line
-- (reports_to / supervisor_id) and changes nothing about hierarchy, RLS on
-- other tables, targets, or any KPI. The only reader is the "Sales Division"
-- filter on the manager's target-assignment screen.
--
-- HOW TO RUN (Supabase SQL Editor): run PART 1, then PART 2, then PART 3.
-- The app works before, between and after these parts: the filter simply
-- hides itself while the table or column is missing.


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — SCHEMA
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sales_divisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE sales_divisions ENABLE ROW LEVEL SECURITY;

-- Read-only for signed-in users of the same company (admins see all).
-- No INSERT/UPDATE/DELETE policy: divisions are managed from the SQL Editor.
DROP POLICY IF EXISTS sales_divisions_select_same_company ON sales_divisions;
CREATE POLICY sales_divisions_select_same_company
  ON sales_divisions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE  u.id = auth.uid()
      AND   (u.company_id = sales_divisions.company_id OR u.role = 'admin')
    )
  );

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sales_division_id uuid
  REFERENCES sales_divisions(id) ON DELETE SET NULL;

COMMENT ON COLUMN users.sales_division_id IS
  'Product-line sales division (sales_divisions). Grouping only — not the reporting line.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — THE FOUR PVC DIVISIONS (Export is its own standalone division)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO sales_divisions (company_id, name, sort_order) VALUES
  ('adf8ee78-cf78-4f02-932c-989a214bdd78', 'Pipes & Fittings', 1),
  ('adf8ee78-cf78-4f02-932c-989a214bdd78', 'PVC Compound',     2),
  ('adf8ee78-cf78-4f02-932c-989a214bdd78', 'PVC Sheet',        3),
  ('adf8ee78-cf78-4f02-932c-989a214bdd78', 'Export',           4)
ON CONFLICT (company_id, name) DO NOTHING;

SELECT name, sort_order FROM sales_divisions
WHERE  company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
ORDER  BY sort_order;
-- Expected: Pipes & Fittings 1 | PVC Compound 2 | PVC Sheet 3 | Export 4


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — MEMBERSHIP (all or nothing)
--   Pipes & Fittings: Amer, Mohamed Hussein, Ahmad, Hassan Al Othairy
--   PVC Sheet:        Alseyed
--   PVC Compound:     nobody yet
--   Export:           nobody yet (the Export shell accounts do not exist)
--   Everyone else (Nader, Kamal, Osman, Hazim, Mueataz, Malki) stays NULL.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  pvc constant uuid := 'adf8ee78-cf78-4f02-932c-989a214bdd78';
  pf  uuid;
  sh  uuid;
  n   int;
BEGIN
  SELECT id INTO pf FROM sales_divisions WHERE company_id = pvc AND name = 'Pipes & Fittings';
  SELECT id INTO sh FROM sales_divisions WHERE company_id = pvc AND name = 'PVC Sheet';
  IF pf IS NULL OR sh IS NULL THEN RAISE EXCEPTION 'Run PART 2 first: divisions not found'; END IF;

  UPDATE users SET sales_division_id = pf
  WHERE  company_id = pvc
    AND  id IN ('a35acac8-85d7-4e07-821c-5910fc0c3232',   -- Amer Sulaiman Alburaym
                'ba03074d-8b5b-4378-bd51-6fe1f3ee225e',   -- Mohamed Hussein
                '730d8711-bbcc-4062-b0c7-91daa13b9cb6',   -- Ahmad Sulaiman Moamina
                '22c39150-fde2-432e-9516-5dd4d6d474f9');  -- Hassan Al Othairy
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION 'Pipes & Fittings: expected 4 users, matched %', n; END IF;

  UPDATE users SET sales_division_id = sh
  WHERE  company_id = pvc
    AND  id = '5d9af3d9-8134-4efa-b29f-8fc6f35c1b5b';     -- Alseyed Mohammed Diba
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'PVC Sheet: expected 1 user, matched %', n; END IF;
END $$;

SELECT u.full_name, u.role, u.is_active, d.name AS sales_division
FROM   users u
LEFT   JOIN sales_divisions d ON d.id = u.sales_division_id
WHERE  u.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
ORDER  BY d.sort_order NULLS LAST, u.full_name;
-- Expected (11 rows):
--   Ahmad Sulaiman Moamina | salesman   | true | Pipes & Fittings
--   Amer Sulaiman Alburaym | supervisor | true | Pipes & Fittings
--   Hassan Al Othairy      | salesman   | true | Pipes & Fittings
--   Mohamed Hussein        | salesman   | true | Pipes & Fittings
--   Alseyed Mohammed Diba  | supervisor | true | PVC Sheet
--   Hazim Khalid, Malki, Mohamed Kamal, Mueataz Mohammed Ahmed, Nader,
--   Shaikh Osman Shoukat   | ...        |      | NULL


-- ════════════════════════════════════════════════════════════════════════════
-- UNDO — only if needed (remove the leading "-- " to run)
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE users DROP COLUMN IF EXISTS sales_division_id;
-- DROP TABLE IF EXISTS sales_divisions;
