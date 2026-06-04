-- RLS policies for customer_history table
-- Run in Supabase SQL Editor

CREATE POLICY "Admin deletes history"
  ON customer_history FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin','director','manager')
    )
  );

CREATE POLICY "Admin updates history"
  ON customer_history FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin','director','manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin','director','manager')
    )
  );
