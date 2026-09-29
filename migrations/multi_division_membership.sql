-- Multi-division membership: a person can belong to 2–4 sales divisions.
--
-- users.sales_division_id is UNCHANGED and stays the PRIMARY division. This
-- table holds only the ADDITIONAL ones, so nothing that reads the old column
-- today changes meaning, and a single-division user has no rows here at all.
--
-- No role is involved anywhere: the table is keyed by user_id, so a
-- contributor-flagged manager or supervisor splits across divisions by exactly
-- the same mechanism as a salesman.

create table if not exists public.user_sales_divisions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  division_id uuid not null references public.sales_divisions(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- One row per person per division. The primary division may also appear here
  -- without harm: every read unions the two and de-duplicates.
  unique (user_id, division_id)
);

create index if not exists user_sales_divisions_user_idx on public.user_sales_divisions (user_id);
create index if not exists user_sales_divisions_division_idx on public.user_sales_divisions (division_id);
create index if not exists user_sales_divisions_company_idx on public.user_sales_divisions (company_id);

comment on table public.user_sales_divisions is
  'ADDITIONAL sales divisions a user belongs to, beyond users.sales_division_id (their primary). Keyed by user_id only — applies to every role. No hard cap; the UI offers up to 4 divisions total per person.';

alter table public.user_sales_divisions enable row level security;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Mirrors how sales_divisions and users are read: anyone in the company can
-- see who belongs to which division (it is org-chart information, already
-- visible through users.sales_division_id today).
drop policy if exists "Company members read division membership" on public.user_sales_divisions;
create policy "Company members read division membership"
  on public.user_sales_divisions for select
  using (
    company_id in (select u.company_id from public.users u where u.id = auth.uid())
  );

-- Writes match who may already set users.sales_division_id through the
-- "Manage division members" panel: manager, supervisor, director, head, admin,
-- within their own company. Enforced here as well as in the UI.
drop policy if exists "Leads manage division membership" on public.user_sales_divisions;
create policy "Leads manage division membership"
  on public.user_sales_divisions for all
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role = any (array['manager'::user_role, 'supervisor'::user_role,
                                'director'::user_role, 'head'::user_role, 'admin'::user_role])
        and (u.company_id = user_sales_divisions.company_id or u.company_id is null)
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role = any (array['manager'::user_role, 'supervisor'::user_role,
                                'director'::user_role, 'head'::user_role, 'admin'::user_role])
        and (u.company_id = user_sales_divisions.company_id or u.company_id is null)
    )
  );

-- ── DEAL ATTRIBUTION ───────────────────────────────────────────────────────
-- Until now a deal's division was INFERRED from its owner's single division.
-- With an owner in several divisions that inference is ambiguous, so the deal
-- carries its own division. Nullable: a deal whose owner has no division is
-- Unassigned, exactly as today.
alter table public.deals
  add column if not exists division_id uuid references public.sales_divisions(id);

create index if not exists deals_division_id_idx on public.deals (division_id);

comment on column public.deals.division_id is
  'The division this deal counts toward. Backfilled from the owner''s primary division, which is what was previously inferred — so historical figures are unchanged.';

-- Backfill makes today's inference explicit, so no total moves: every existing
-- deal gets the division its owner had. Only fills NULLs, so re-running is safe.
update public.deals d
   set division_id = u.sales_division_id
  from public.users u
 where u.id = d.owner_id
   and d.division_id is null
   and u.sales_division_id is not null;

-- Rollback:
--   alter table public.deals drop column division_id;
--   drop table public.user_sales_divisions;
