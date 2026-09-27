-- ============================================================================
-- APPLIED to production 2026-09-27 (migration `enable_users_rls`), after a
-- rolled-back dry run of this exact text plus a 14-probe-per-role sweep over
-- admin, director, manager, supervisor, salesman, viewer and anon. The live
-- results matched the dry run cell for cell; see the ONE AMENDMENT note below.
--
-- Rollback, if a role turns out to be locked out:
--   alter table public.users disable row level security;
-- (the policies can stay in place while disabled — they are inert, which is
--  exactly the state this migration exists to leave behind.)
--
-- Problem: public.users has RLS DISABLED. The two "Admins and directors ..."
-- policies are inert, so any authenticated user can read or write any column on
-- any of the 36 rows through the API — including role and company_id. Verified
-- by probe: a manager-role JWT updated another user's row successfully.
--
-- Two constraints shape everything below.
--
--   1. A policy ON users may not SELECT FROM users — it re-enters itself and
--      fails with 42P17 (infinite recursion). Both existing policies do exactly
--      that, which is why they cannot simply be switched on. Every predicate
--      here uses auth.uid() directly or a SECURITY DEFINER helper, which runs as
--      the (postgres) owner and so bypasses RLS.
--
--   2. 66 policies on ~35 other tables read users in a subquery
--      (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()), and
--      hierarchy variants). Once users has RLS, those subqueries are filtered by
--      the SELECT policy below. If it ever fails to return the caller's own row,
--      deals, contacts, targets, planning and the rest silently return nothing.
--      Hence: the SELECT policy returns the caller's own row FIRST, always.
-- ============================================================================

begin;

-- ── 1. Access-check functions: invoker -> SECURITY DEFINER ──────────────────
-- These five are privileged access checks used inside other tables' policies
-- (contacts, tasks, deals). As invoker they read users as the caller, so once
-- users has RLS their answers would depend on however narrow that policy is —
-- a too-narrow policy would silently deny contact and task access rather than
-- error. As definer they keep answering the same way they do today.
--
-- search_path is pinned on each (advisor: function_search_path_mutable), plus on
-- the three definer helpers that were already missing it. ALTER, not CREATE, so
-- the bodies are untouched.
alter function public.can_manage_user_contacts(manager_id uuid, target_user_id uuid) security definer;
alter function public.can_manage_user_contacts(manager_id uuid, target_user_id uuid) set search_path = public;

alter function public.can_manage_user_tasks(manager_id uuid, task_created_by uuid, task_assigned_to uuid) security definer;
alter function public.can_manage_user_tasks(manager_id uuid, task_created_by uuid, task_assigned_to uuid) set search_path = public;

alter function public.can_user_access_data(requesting_user_id uuid, data_owner_id uuid) security definer;
alter function public.can_user_access_data(requesting_user_id uuid, data_owner_id uuid) set search_path = public;

alter function public.get_accessible_companies(user_id uuid) security definer;
alter function public.get_accessible_companies(user_id uuid) set search_path = public;

alter function public.validate_target_assignment() security definer;
alter function public.validate_target_assignment() set search_path = public;

-- Already definer, but with a mutable search_path:
alter function public.get_user_company_id() set search_path = public;
alter function public.get_user_subordinates(user_id uuid) set search_path = public;
alter function public.can_assign_target_to_user(assigner_id uuid, assignee_id uuid) set search_path = public;

-- ── 2. Helper: the caller's own role, without touching RLS ──────────────────
-- A policy on users cannot read users. This definer function can, so the
-- policies below ask it instead. STABLE so it is evaluated once per statement.
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.role::text
  from   users u
  where  u.id = auth.uid()
    and  u.is_active = true
$$;

grant execute on function public.current_user_role() to authenticated, anon, service_role;

-- ── 3. Column guard for the manager carve-out ───────────────────────────────
-- RLS is row-level: a policy cannot say "only this column". The narrow manager
-- write (sales_division_id, from "Manage division members") is therefore allowed
-- by the policy at row level and constrained to one column here.
--
-- Same shape as the existing enforce_user_role_change trigger: it returns NEW
-- when auth.uid() is null, so the service role, the SQL editor, the signup
-- trigger and the edge functions are unaffected.
--
-- The comparison is made on the whole row as jsonb minus the columns a manager
-- may move, so a column added to users later is protected automatically instead
-- of being forgotten here.
--
-- ONE AMENDMENT to the reviewed draft, made during the dry run: full_name is
-- also allowed, but ONLY on the caller's own row. /account-settings is linked
-- in the header user menu for every role and saves users.full_name for the
-- signed-in user (AccountSettings.jsx handleSave -> updateUserProfile). Without
-- this, that page would raise 42501 for manager, supervisor, salesman and
-- viewer. Someone else's row (downline only, per the policy) stays
-- sales_division_id and nothing else — proved by the downName probe.
create or replace function public.enforce_users_column_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id   uuid := auth.uid();
  caller_role text;
begin
  if caller_id is null then
    return new;                       -- server-side: not a browser session
  end if;

  caller_role := public.current_user_role();

  if caller_role in ('admin', 'director') then
    return new;                       -- full write, exactly as today
  end if;

  if new.id = caller_id then
    -- Own row: Account Settings (linked in the header for every role) saves
    -- full_name; sales_division_id is the manager self-service carve-out.
    if (to_jsonb(new) - 'sales_division_id' - 'full_name' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'sales_division_id' - 'full_name' - 'updated_at') then
      raise exception 'Only an administrator or director can change a user''s details.'
        using errcode = 'insufficient_privilege';
    end if;
  else
    -- Someone else's row (downline only, per the policy): division and nothing else.
    if (to_jsonb(new) - 'sales_division_id' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'sales_division_id' - 'updated_at') then
      raise exception 'Only an administrator or director can change a user''s details.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_users_column_scope_trg on public.users;
create trigger enforce_users_column_scope_trg
  before update on public.users
  for each row execute function public.enforce_users_column_scope();

-- ── 4. Policies ─────────────────────────────────────────────────────────────
drop policy if exists "Admins and directors insert users" on public.users;
drop policy if exists "Admins and directors update users" on public.users;
drop policy if exists "users_select_own_and_company" on public.users;
drop policy if exists "users_insert_admin_director" on public.users;
drop policy if exists "users_update_admin_director" on public.users;
drop policy if exists "users_update_own_division" on public.users;

-- SELECT: own row, then the whole company; admins see every company (the admin
-- dashboard manages users across companies). Own row is first and unconditional
-- so the sign-in profile read in AuthContext can never fail, and so the 66
-- policies that resolve the caller's company through users keep resolving.
create policy "users_select_own_and_company"
  on public.users for select
  using (
    id = auth.uid()
    or company_id = public.get_user_company_id()
    or public.current_user_role() = 'admin'
  );

-- INSERT: unchanged intent — admin/director only. Signup and invitations do not
-- rely on this: handle_new_user, create_crm_user and accept_invitation are
-- SECURITY DEFINER, and the create-user edge function uses the service role.
create policy "users_insert_admin_director"
  on public.users for insert
  with check ( public.current_user_role() in ('admin', 'director') );

-- UPDATE, path 1: admin/director, any row in their company (admins anywhere).
create policy "users_update_admin_director"
  on public.users for update
  using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'director' and company_id = public.get_user_company_id())
  )
  with check (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'director' and company_id = public.get_user_company_id())
  );

-- UPDATE, path 2: the manager self-service carve-out. Rows: himself or anyone in
-- his supervisor_id subtree. Columns: sales_division_id only, enforced by the
-- trigger above. can_manage_user_contacts is the same downline test the contacts
-- and deals policies already use, and is SECURITY DEFINER as of step 1.
create policy "users_update_own_division"
  on public.users for update
  using (
    id = auth.uid()
    or public.can_manage_user_contacts(auth.uid(), id)
  )
  with check (
    id = auth.uid()
    or public.can_manage_user_contacts(auth.uid(), id)
  );

-- No DELETE policy: deleting a user stays a service-role action (the delete-user
-- edge function), as it is today. Consequence, measured: the Delete User button
-- on the legacy /user-management page (no role guard, no nav link, the only
-- caller of userService.deleteUser) now affects 0 rows and reports no error, so
-- it silently does nothing. Today that same button lets ANY signed-in user
-- delete ANY user row, so this is a net improvement; fixing the page properly
-- means routing it through the service-role edge function.

alter table public.users enable row level security;

-- ── 5. The two empty BI tables ──────────────────────────────────────────────
-- Both are empty (0 rows) and referenced nowhere in the app. RLS on with no
-- policy denies every API caller while leaving the service role free. Dropping
-- them would be cleaner still — raised separately, not decided here.
alter table public.bi_users enable row level security;
alter table public.bi_refresh_history enable row level security;

commit;

-- ── Rollback, if a role turns out to be locked out ──────────────────────────
-- alter table public.users disable row level security;
-- (the policies can stay in place while disabled — they are inert, which is
--  exactly the state this migration exists to leave behind.)
