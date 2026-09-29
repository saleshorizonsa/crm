-- Sales returns (credit notes) imported from the ERP, so Achieved (Invoiced)
-- reconciles with what the ERP actually recognises as revenue.
--
-- SIGN CONVENTION: return_amount is stored POSITIVE and SUBTRACTED from
-- Achieved. Nothing here ever writes to deals.amount or deals.final_amount —
-- the original invoice figures stay exactly as invoiced, and a return is a
-- separate, dated event.
--
-- PERIOD ATTRIBUTION: a return reduces the month it HAPPENED in (return_date),
-- not the month the original invoice was raised. A January invoice returned in
-- March reduces March's Achieved, leaving January's history untouched. This is
-- what keeps past months stable once they have been reported.

create table if not exists public.deal_returns (
  id                uuid primary key default gen_random_uuid(),
  -- Nullable on purpose: a credit note whose invoice we cannot match is still
  -- worth storing for audit, but only a MATCHED return (deal_id not null) can
  -- be attributed to an owner and so reduce Achieved.
  deal_id           uuid references public.deals(id) on delete cascade,
  company_id        uuid not null references public.companies(id) on delete cascade,
  return_date       date not null,
  -- The three natural-key columns default to '' rather than NULL: Postgres
  -- treats NULLs as distinct in a unique constraint, which would let a blank
  -- item_code duplicate without limit.
  credit_note_no    text not null default '',
  invoice_no        text not null default '',
  item_code         text not null default '',
  item_description  text,
  materials_group   text,
  return_qty        numeric,
  unit_price        numeric,
  -- Positive. See the sign convention above.
  return_amount     numeric not null check (return_amount >= 0),
  customer_id       text,
  customer_name     text,
  salesman_id       text,
  sales_branch      text,
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now()
);

-- Re-importing the same file, or overlapping weekly and monthly exports, must
-- not double-count. A credit note line is identified by credit note + invoice +
-- item; the same credit note can legitimately carry several item lines, which
-- is why item_code is part of the key rather than just the first two columns.
-- A CONSTRAINT rather than an expression index, because only a constraint can
-- be an ON CONFLICT target, and the import upserts against it.
alter table public.deal_returns
  drop constraint if exists deal_returns_natural_key;
alter table public.deal_returns
  add constraint deal_returns_natural_key
  unique (company_id, credit_note_no, invoice_no, item_code);

create index if not exists deal_returns_deal_id_idx on public.deal_returns (deal_id);
-- Achieved reads returns by company over a date window, for a set of owners.
create index if not exists deal_returns_company_date_idx
  on public.deal_returns (company_id, return_date);

comment on table public.deal_returns is
  'ERP sales returns / credit notes. return_amount is positive and is SUBTRACTED from Achieved in the month of return_date. Never modifies deals.amount / deals.final_amount.';
comment on column public.deal_returns.return_amount is
  'Positive amount of the return (ERP "Net value"). Subtracted from Achieved.';
comment on column public.deal_returns.return_date is
  'ERP "Date". The month this return reduces — NOT the original invoice month.';
comment on column public.deal_returns.deal_id is
  'Matched via deals.invoice_number = invoice_no. NULL when no invoice matched; such rows are stored for audit but do not reduce Achieved.';

alter table public.deal_returns enable row level security;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Mirrors the deals policies: you see a return if you can see the deal it
-- belongs to (own deal, your subordinate's, your subordinate's subordinate's,
-- or you are admin/director in that company). Unmatched rows (deal_id null)
-- fall back to company membership, so the importer can still review them.
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
      and deal_returns.company_id in (select u.company_id from public.users u where u.id = auth.uid())
    )
  );

-- Writes are the import, which is gated in the UI to director/admin/head — the
-- same roles that gate Planning's Historical Data tab. Enforced here too, so
-- the gate is not UI-only (the lesson from opportunities/future_orders, whose
-- policies check company membership alone).
drop policy if exists "Importers can insert deal returns" on public.deal_returns;
create policy "Importers can insert deal returns"
  on public.deal_returns for insert
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role = any (array['admin'::user_role, 'director'::user_role, 'head'::user_role])
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
        and u.role = any (array['admin'::user_role, 'director'::user_role, 'head'::user_role])
        and (u.company_id = deal_returns.company_id or u.company_id is null)
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role = any (array['admin'::user_role, 'director'::user_role, 'head'::user_role])
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
        and u.role = any (array['admin'::user_role, 'director'::user_role, 'head'::user_role])
        and (u.company_id = deal_returns.company_id or u.company_id is null)
    )
  );

-- Rollback:
--   drop table public.deal_returns;
