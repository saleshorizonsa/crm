-- Fix: an admin could not import a file containing any UNMATCHED credit note.
--
-- Reported as "new row violates row-level security policy for table
-- deal_returns" on INSERT, which points at the insert policy. It was not the
-- insert policy — that one is correct and passes for a company-less admin.
--
-- What actually happened, reproduced under RLS as the failing account:
--
--   matched row (deal_id set) + RETURNING      -> SUCCEEDED
--   unmatched row (deal_id null) + RETURNING   -> 42501, the reported error
--   unmatched row, no RETURNING                -> SUCCEEDED
--
-- The importer calls .select() after its upsert, PostgREST turns that into
-- INSERT ... RETURNING, and PostgreSQL applies SELECT policies to returned
-- rows. A row the inserter cannot SEE therefore fails the INSERT with the
-- wording of a WITH CHECK violation — which is why the insert policy looked
-- guilty. One unmatched line in the file rejects the whole batch.
--
-- The unmatched branch read:
--     deal_returns.company_id in (select u.company_id from users u
--                                 where u.id = auth.uid())
-- Every admin account in this database has company_id = null, so that is
-- "company_id IN (NULL)" -> NULL -> not true. No admin could see, and so could
-- not insert, an unmatched return for any company.
--
-- It now mirrors the matched branch: people in that company see it, and so do
-- admins/directors who administer it, company-less ones included. No other
-- role gains anything — company members already had this access.

drop policy if exists "Users can view deal returns based on role" on public.deal_returns;
create policy "Users can view deal returns based on role"
  on public.deal_returns for select
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_returns.deal_id
        and (
          d.owner_id = auth.uid()
          or exists (select 1 from public.users s
                     where s.id = d.owner_id and s.supervisor_id = auth.uid())
          or exists (select 1 from public.users s
                     join public.users ss on ss.supervisor_id = s.id
                     where ss.id = d.owner_id and s.supervisor_id = auth.uid())
          or exists (select 1 from public.users u
                     where u.id = auth.uid()
                       and u.role = any (array['admin'::user_role, 'director'::user_role])
                       and (u.company_id = d.company_id or u.company_id is null))
        )
    )
    or (
      deal_returns.deal_id is null
      and exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and (
            u.company_id = deal_returns.company_id
            or (u.role = any (array['admin'::user_role, 'director'::user_role])
                and u.company_id is null)
          )
      )
    )
  );

-- Rollback: the policy block in migrations/create_deal_returns.sql.
