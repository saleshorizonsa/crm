-- Audit of expected_close_date moves, so the Pipeline Origin Breakdown can show
-- "Transferred to Future": deals pushed OUT of a period rather than lost in it.
--
-- There is no history of past close-date edits anywhere, so this can only ever
-- describe changes made from the day it is applied. Periods before that show an
-- empty Transferred-to-Future line, which is correct rather than misleading.
--
-- Written by the app (DealModal) right after a deal saves, best-effort: until
-- this migration is applied the insert fails with 42P01 and is swallowed, so the
-- deal still saves normally and the feature simply stays empty.

create table if not exists public.deal_close_date_changes (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  old_date    date not null,
  new_date    date not null,
  changed_by  uuid references public.users(id) on delete set null,
  changed_at  timestamptz not null default now()
);

-- The breakdown reads by company and by the period the deal was pushed out of.
create index if not exists deal_close_date_changes_company_old_date_idx
  on public.deal_close_date_changes (company_id, old_date);
create index if not exists deal_close_date_changes_deal_idx
  on public.deal_close_date_changes (deal_id);

alter table public.deal_close_date_changes enable row level security;

-- Readable by anyone in the same company: the card is a team view, and the row
-- carries no more than the deal itself already does.
drop policy if exists "deal_close_date_changes readable in company" on public.deal_close_date_changes;
create policy "deal_close_date_changes readable in company"
  on public.deal_close_date_changes for select
  using (
    company_id is null
    or company_id in (select u.company_id from public.users u where u.id = auth.uid())
  );

-- Written only as yourself, for a deal you can see. Append-only by design: no
-- update or delete policy, so an audit row cannot be quietly rewritten.
drop policy if exists "deal_close_date_changes insert own" on public.deal_close_date_changes;
create policy "deal_close_date_changes insert own"
  on public.deal_close_date_changes for insert
  with check (
    changed_by = auth.uid()
    and exists (select 1 from public.deals d where d.id = deal_id)
  );
