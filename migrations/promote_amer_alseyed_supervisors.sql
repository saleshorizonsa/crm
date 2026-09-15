-- JASCO PVC restructuring — Promotions phase (Steps 2 and 3)
-- Date: 2026-09-15
-- company_id: adf8ee78-cf78-4f02-932c-989a214bdd78
--
-- Promotes Amer Sulaiman Alburaym and Alseyed Mohammed Diba to supervisor under
-- Mohamed Kamal, and moves Mohamed Hussein and Ahmad Sulaiman Moamina under Amer.
--
-- BOTH hierarchy columns (reports_to AND supervisor_id) are written on every row.
-- See docs/step4_hierarchy_findings.md for why.
--
-- Hazim Khalid and Mueataz Mohammed Ahmed stay under Shaikh Osman Shoukat
-- (they go with him in the deactivation phase). Not touched here.
--
-- HOW TO RUN (Supabase SQL Editor): run PART A, check the result, run PART B,
-- then run PART C.
--
-- SAFETY: PART B is one DO block, which is atomic. Each UPDATE only matches the
-- row in the exact state recorded on 2026-09-15 (role, reports_to,
-- supervisor_id). If anyone has changed since, the block raises an error and
-- NOTHING is applied.


-- ════════════════════════════════════════════════════════════════════════════
-- PART A — BEFORE CHECK
-- ════════════════════════════════════════════════════════════════════════════
SELECT full_name, role,
       (SELECT full_name FROM users m WHERE m.id = u.reports_to)    AS reports_to,
       (SELECT full_name FROM users m WHERE m.id = u.supervisor_id) AS supervisor_id
FROM   users u
WHERE  u.id IN ('a35acac8-85d7-4e07-821c-5910fc0c3232',   -- Amer
                '5d9af3d9-8134-4efa-b29f-8fc6f35c1b5b',   -- Alseyed
                'ba03074d-8b5b-4378-bd51-6fe1f3ee225e',   -- Mohamed Hussein
                '730d8711-bbcc-4062-b0c7-91daa13b9cb6')   -- Ahmad
ORDER  BY full_name;
-- Expected (4 rows):
--   Ahmad Sulaiman Moamina | salesman | NULL                 | Shaikh Osman Shoukat
--   Alseyed Mohammed Diba  | salesman | Shaikh Osman Shoukat | Shaikh Osman Shoukat
--   Amer Sulaiman Alburaym | salesman | Shaikh Osman Shoukat | Shaikh Osman Shoukat
--   Mohamed Hussein        | salesman | Shaikh Osman Shoukat | Shaikh Osman Shoukat


-- ════════════════════════════════════════════════════════════════════════════
-- PART B — APPLY (all or nothing)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  pvc     constant uuid := 'adf8ee78-cf78-4f02-932c-989a214bdd78';
  kamal   constant uuid := '6fcb06dc-9cb0-4143-9f82-fb77a011024e';
  osman   constant uuid := '43fe17ce-6f03-4290-9606-0dc828805492';
  amer    constant uuid := 'a35acac8-85d7-4e07-821c-5910fc0c3232';
  alseyed constant uuid := '5d9af3d9-8134-4efa-b29f-8fc6f35c1b5b';
  hussein constant uuid := 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e';
  ahmad   constant uuid := '730d8711-bbcc-4062-b0c7-91daa13b9cb6';
  n int;
BEGIN
  -- Step 2.1 — Amer: salesman -> supervisor, reports to Mohamed Kamal
  UPDATE users SET role = 'supervisor', reports_to = kamal, supervisor_id = kamal
  WHERE  id = amer AND company_id = pvc
    AND  role = 'salesman' AND reports_to = osman AND supervisor_id = osman;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Amer: expected 1 row in the recorded state, matched %', n; END IF;

  -- Step 2.2 — Alseyed: salesman -> supervisor, reports to Mohamed Kamal
  UPDATE users SET role = 'supervisor', reports_to = kamal, supervisor_id = kamal
  WHERE  id = alseyed AND company_id = pvc
    AND  role = 'salesman' AND reports_to = osman AND supervisor_id = osman;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Alseyed: expected 1 row in the recorded state, matched %', n; END IF;

  -- Step 3.1 — Mohamed Hussein: reports to Amer
  UPDATE users SET reports_to = amer, supervisor_id = amer
  WHERE  id = hussein AND company_id = pvc
    AND  role = 'salesman' AND reports_to = osman AND supervisor_id = osman;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Mohamed Hussein: expected 1 row in the recorded state, matched %', n; END IF;

  -- Step 3.2 — Ahmad: reports to Amer (reports_to was NULL, supervisor_id was Osman)
  UPDATE users SET reports_to = amer, supervisor_id = amer
  WHERE  id = ahmad AND company_id = pvc
    AND  role = 'salesman' AND reports_to IS NULL AND supervisor_id = osman;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Ahmad: expected 1 row in the recorded state, matched %', n; END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART C — AFTER CHECK
-- ════════════════════════════════════════════════════════════════════════════
SELECT u.role, u.full_name,
       (SELECT full_name FROM users m WHERE m.id = u.reports_to)    AS reports_to,
       (SELECT full_name FROM users m WHERE m.id = u.supervisor_id) AS supervisor_id,
       u.reports_to IS NOT DISTINCT FROM u.supervisor_id            AS columns_agree
FROM   users u
WHERE  u.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
ORDER  BY u.role, u.full_name;
-- Expected (10 rows, columns_agree = true on EVERY row):
--   director   | Nader                  | NULL                   | NULL
--   manager    | Mohamed Kamal          | Nader                  | Nader
--   salesman   | Ahmad Sulaiman Moamina | Amer Sulaiman Alburaym | Amer Sulaiman Alburaym   <- changed
--   salesman   | Hazim Khalid           | Shaikh Osman Shoukat   | Shaikh Osman Shoukat     (unchanged)
--   salesman   | Mohamed Hussein        | Amer Sulaiman Alburaym | Amer Sulaiman Alburaym   <- changed
--   salesman   | Mueataz Mohammed Ahmed | Shaikh Osman Shoukat   | Shaikh Osman Shoukat     (unchanged)
--   supervisor | Alseyed Mohammed Diba  | Mohamed Kamal          | Mohamed Kamal            <- changed
--   supervisor | Amer Sulaiman Alburaym | Mohamed Kamal          | Mohamed Kamal            <- changed
--   supervisor | Shaikh Osman Shoukat   | Mohamed Kamal          | Mohamed Kamal            (unchanged)
--   viewer     | Malki                  | NULL                   | NULL


-- ════════════════════════════════════════════════════════════════════════════
-- UNDO — only if needed. Restores the exact 2026-09-15 state, including
-- Ahmad's NULL reports_to. Remove the leading "-- " from each line to run.
-- ════════════════════════════════════════════════════════════════════════════
-- DO $$
-- DECLARE
--   osman constant uuid := '43fe17ce-6f03-4290-9606-0dc828805492';
-- BEGIN
--   UPDATE users SET role = 'salesman', reports_to = osman, supervisor_id = osman
--   WHERE id IN ('a35acac8-85d7-4e07-821c-5910fc0c3232', '5d9af3d9-8134-4efa-b29f-8fc6f35c1b5b');
--   UPDATE users SET reports_to = osman, supervisor_id = osman
--   WHERE id = 'ba03074d-8b5b-4378-bd51-6fe1f3ee225e';
--   UPDATE users SET reports_to = NULL, supervisor_id = osman
--   WHERE id = '730d8711-bbcc-4062-b0c7-91daa13b9cb6';
-- END $$;
