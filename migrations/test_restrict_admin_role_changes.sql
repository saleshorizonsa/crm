-- TEST for restrict_admin_role_changes.sql — changes NOTHING (ends in ROLLBACK)
-- Date: 2026-09-16
--
-- Acts as real JASCO users through the real RLS policies and the trigger: it
-- switches to the `authenticated` role and sets the JWT claims Supabase itself
-- sets for each person. Every write is undone by the ROLLBACK at the end.
--
-- Each test records exactly what happened:
--   BLOCKED   the database refused with insufficient_privilege (the trigger)
--   1 row     the update went through
--   0 rows    RLS hid the row
--   ERROR: …  anything else — a real problem with the test, never a pass
--
-- HOW TO RUN (Supabase SQL Editor): run the migration first, then run this
-- whole file at once. Read the final table: every row should say PASS.

BEGIN;

SELECT set_config('t.results', '', true);
SELECT set_config('t.director', (SELECT id::text FROM public.users WHERE role = 'director' AND full_name = 'Nader' AND is_active LIMIT 1), true);
SELECT set_config('t.admin',    (SELECT id::text FROM public.users WHERE role = 'admin' AND email = 'itsupport@aljazera.com' AND is_active LIMIT 1), true);
SELECT set_config('t.salesman', '22c39150-fde2-432e-9516-5dd4d6d474f9', true);  -- Hassan Al Othairy
SELECT set_config('t.manager',  '6fcb06dc-9cb0-4143-9f82-fb77a011024e', true);  -- Mohamed Kamal

SET LOCAL ROLE authenticated;

-- ═══ As the DIRECTOR (Nader) ═══════════════════════════════════════════════
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.director'), 'role', 'authenticated')::text, true);

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET role = 'admin'::user_role WHERE id = current_setting('t.salesman')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  PERFORM set_config('t.results', current_setting('t.results') || 'D1|Director sets a salesman''s role to admin|BLOCKED|' || r || E'\n', true);
END $$;

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET role = 'admin'::user_role WHERE id = current_setting('t.director')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  PERFORM set_config('t.results', current_setting('t.results') || 'D2|Director sets HIS OWN role to admin|BLOCKED|' || r || E'\n', true);
END $$;

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET role = 'director'::user_role WHERE id = current_setting('t.admin')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  PERFORM set_config('t.results', current_setting('t.results') || 'D3|Director demotes the admin (admin -> director)|BLOCKED|' || r || E'\n', true);
END $$;

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET full_name = 'Hassan Al Othairy (test)' WHERE id = current_setting('t.salesman')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  PERFORM set_config('t.results', current_setting('t.results') || 'D4|Director edits a user''s name (no regression)|1 row|' || r || E'\n', true);
END $$;

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET is_active = false WHERE id = current_setting('t.salesman')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  PERFORM set_config('t.results', current_setting('t.results') || 'D5|Director edits is_active (no regression)|1 row|' || r || E'\n', true);
END $$;

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET reports_to = current_setting('t.manager')::uuid, supervisor_id = current_setting('t.manager')::uuid
        WHERE id = current_setting('t.salesman')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  PERFORM set_config('t.results', current_setting('t.results') || 'D6|Director edits reports_to / supervisor_id (no regression)|1 row|' || r || E'\n', true);
END $$;

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET role = 'supervisor'::user_role WHERE id = current_setting('t.salesman')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  PERFORM set_config('t.results', current_setting('t.results') || 'D7|Director changes a NON-admin role, salesman -> supervisor (still allowed)|1 row|' || r || E'\n', true);
END $$;

-- ═══ As the ADMIN (IT Support) ═════════════════════════════════════════════
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true);

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET role = 'admin'::user_role WHERE id = current_setting('t.manager')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  PERFORM set_config('t.results', current_setting('t.results') || 'A1|Admin sets a user''s role to admin (still allowed)|1 row|' || r || E'\n', true);
END $$;

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET role = 'manager'::user_role WHERE id = current_setting('t.manager')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  PERFORM set_config('t.results', current_setting('t.results') || 'A2|Admin changes that admin back to manager (still allowed)|1 row|' || r || E'\n', true);
END $$;

-- ═══ As a SALESMAN (Hassan), on his own row ════════════════════════════════
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.salesman'), 'role', 'authenticated')::text, true);

DO $$ DECLARE n int; r text; BEGIN
  BEGIN UPDATE public.users SET role = 'admin'::user_role WHERE id = current_setting('t.salesman')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT; r := n || CASE WHEN n = 1 THEN ' row' ELSE ' rows' END;
  EXCEPTION WHEN insufficient_privilege THEN r := 'BLOCKED'; WHEN OTHERS THEN r := 'ERROR: ' || SQLERRM; END;
  -- Refused by the trigger (BLOCKED) or never visible to him (0 rows): both are safe.
  IF r = '0 rows' THEN r := 'BLOCKED'; END IF;
  PERFORM set_config('t.results', current_setting('t.results') || 'S1|Salesman sets HIS OWN role to admin|BLOCKED|' || r || E'\n', true);
END $$;

RESET ROLE;

-- ═══ RESULTS — every row should say PASS ═══════════════════════════════════
SELECT CASE WHEN split_part(line, '|', 3) = split_part(line, '|', 4) THEN 'PASS' ELSE 'FAIL' END AS result,
       split_part(line, '|', 1) AS id,
       split_part(line, '|', 2) AS test,
       split_part(line, '|', 3) AS expected,
       split_part(line, '|', 4) AS actual
FROM   regexp_split_to_table(rtrim(current_setting('t.results'), E'\n'), E'\n') AS line;

ROLLBACK;   -- nothing above is kept
