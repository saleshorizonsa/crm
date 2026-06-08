-- Allow admins and directors to update any user row (e.g. set supervisor_id /
-- reporting line, company, status from the admin panel).
--
-- Symptom this fixes: setting a user's superior shows "No Superior" afterwards
-- because the UPDATE silently affected 0 rows — the default RLS only let a user
-- update their own row (auth.uid() = id), so admin edits to OTHER users never
-- persisted. The client-side upsert in user creation has no .select(), so it
-- returned no error either.
--
-- Run in Supabase SQL Editor. Safe / additive.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Admins and directors update users'
  ) THEN
    CREATE POLICY "Admins and directors update users"
      ON users FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM users me
          WHERE me.id = auth.uid()
          AND me.role IN ('admin', 'director')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users me
          WHERE me.id = auth.uid()
          AND me.role IN ('admin', 'director')
        )
      );
  END IF;
END $$;

-- Also allow admins/directors to INSERT user profile rows (covers the
-- create-user upsert path when no trigger pre-creates the row).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Admins and directors insert users'
  ) THEN
    CREATE POLICY "Admins and directors insert users"
      ON users FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users me
          WHERE me.id = auth.uid()
          AND me.role IN ('admin', 'director')
        )
      );
  END IF;
END $$;
