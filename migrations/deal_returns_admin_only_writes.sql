-- Narrow deal_returns writes from director/admin/head down to ADMIN ONLY.
--
-- Applied 2026-09-29, alongside moving the import screen out of Planning and
-- into /admin-dashboard, which Routes.jsx already wraps in
-- ProtectedRoute requiredRole="admin". The UI gate and the database gate now
-- agree on one role, and the component refuses to render its uploader for
-- anything else as well.
--
-- Why the narrowest role: an imported return changes the Achieved figure on
-- every dashboard and in every target calculation, so the write belongs with
-- whoever already administers the company's data rather than with everyone who
-- can approve a plan.
--
-- SELECT is deliberately UNCHANGED — it still mirrors the deals policies, so
-- each role keeps seeing the returns booked against deals they can already see.
-- That is what the dashboards' returns card reads, and narrowing it would blank
-- the card for everyone but admins.

drop policy if exists "Importers can insert deal returns" on public.deal_returns;
create policy "Importers can insert deal returns"
  on public.deal_returns for insert
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role = 'admin'::user_role
        and (u.company_id = deal_returns.company_id or u.company_id is null)
    )
  );

drop policy if exists "Importers can update deal returns" on public.deal_returns;
create policy "Importers can update deal returns"
  on public.deal_returns for update
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role = 'admin'::user_role
        and (u.company_id = deal_returns.company_id or u.company_id is null)
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role = 'admin'::user_role
        and (u.company_id = deal_returns.company_id or u.company_id is null)
    )
  );

drop policy if exists "Importers can delete deal returns" on public.deal_returns;
create policy "Importers can delete deal returns"
  on public.deal_returns for delete
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role = 'admin'::user_role
        and (u.company_id = deal_returns.company_id or u.company_id is null)
    )
  );

-- Rollback: re-run the policy block in migrations/create_deal_returns.sql,
-- which grants these three to admin, director and head.
