-- Holyweed Work OS — staff time clock (migration 2)
--
-- Adds:
--   * staff logins (app_users.role gains 'staff', linked to an employee record)
--   * time_entries: one row per shift worked (clock in -> clock out)
--   * helper functions for role-aware Row Level Security
--   * tightens existing policies so staff cannot write org data or read financials
--
-- Run this in the Supabase SQL editor AFTER 0001_init.sql.

-- ---------------------------------------------------------------------------
-- 1. Staff logins
-- ---------------------------------------------------------------------------
alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check
  check (role in ('owner', 'manager', 'staff'));

alter table app_users add column if not exists employee_id uuid
  references employees (id) on delete cascade;

-- A staff login must point at an employee record; owners/managers must not.
alter table app_users drop constraint if exists app_users_staff_needs_employee;
alter table app_users add constraint app_users_staff_needs_employee
  check (
    (role = 'staff' and employee_id is not null)
    or (role in ('owner', 'manager') and employee_id is null)
  );

create unique index if not exists app_users_employee_id_key
  on app_users (employee_id) where employee_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Time entries
-- ---------------------------------------------------------------------------
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  created_at timestamptz not null default now(),
  -- a shift cannot end before it starts
  constraint time_entries_order check (clock_out is null or clock_out > clock_in)
);

create index if not exists time_entries_employee_idx
  on time_entries (employee_id, clock_in desc);
create index if not exists time_entries_org_idx
  on time_entries (org_id, clock_in desc);

-- At most one open (not yet clocked out) entry per employee. This is what
-- prevents double clock-ins if someone taps the button twice.
create unique index if not exists time_entries_one_open_per_employee
  on time_entries (employee_id) where clock_out is null;

-- ---------------------------------------------------------------------------
-- 3. RLS helper functions
-- ---------------------------------------------------------------------------
create or replace function current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from app_users where id = auth.uid()
$$;

create or replace function current_employee_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select employee_id from app_users where id = auth.uid()
$$;

create or replace function is_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(current_user_role() in ('owner', 'manager'), false)
$$;

-- ---------------------------------------------------------------------------
-- 4. Policies for time_entries
-- ---------------------------------------------------------------------------
alter table time_entries enable row level security;

-- Owners/managers see everything in the org; staff see only their own entries.
drop policy if exists "read time entries" on time_entries;
create policy "read time entries" on time_entries for select
  using (
    org_id = current_org_id()
    and (is_manager() or employee_id = current_employee_id())
  );

-- Staff can only clock themselves in.
drop policy if exists "staff clock in" on time_entries;
create policy "staff clock in" on time_entries for insert
  with check (
    org_id = current_org_id()
    and (is_manager() or employee_id = current_employee_id())
  );

-- Staff can only close out their own shift; managers can correct any.
drop policy if exists "staff clock out" on time_entries;
create policy "staff clock out" on time_entries for update
  using (
    org_id = current_org_id()
    and (is_manager() or employee_id = current_employee_id())
  )
  with check (
    org_id = current_org_id()
    and (is_manager() or employee_id = current_employee_id())
  );

drop policy if exists "managers delete time entries" on time_entries;
create policy "managers delete time entries" on time_entries for delete
  using (org_id = current_org_id() and is_manager());

-- ---------------------------------------------------------------------------
-- 5. Tighten existing policies
--
-- 0001 granted write access to anyone in the org, which was fine when only
-- owners could log in. Now that staff have logins, writes must be
-- manager-only, and financial tables must not be readable by staff at all.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'employees', 'shifts', 'activity_log', 'alerts', 'projects',
    'expenses', 'sales_daily', 'monthly_finance', 'products', 'product_sales'
  ] loop
    execute format('drop policy if exists "owners and managers write" on %I', t);
    execute format(
      'create policy "managers write" on %I for all
         using (org_id = current_org_id() and is_manager())
         with check (org_id = current_org_id() and is_manager())', t);
  end loop;
end $$;

-- Financial tables: managers only, even for reads.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sales_daily', 'monthly_finance', 'expenses', 'products', 'product_sales'
  ] loop
    execute format('drop policy if exists "read own org" on %I', t);
    execute format(
      'create policy "managers read" on %I for select
         using (org_id = current_org_id() and is_manager())', t);
  end loop;
end $$;

-- Staff may read their own app_users row (needed to resolve their role on login)
-- and their colleagues' employee records; that is already covered by the
-- org-scoped "read own org" policies from 0001.
