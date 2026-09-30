-- Holyweed Work OS — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`) on a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core tenancy
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Login accounts (owner / manager). Mirrors auth.users 1:1 for people who can
-- sign in. Regular staff (employees table below) don't need accounts yet —
-- their activity comes from POS/attendance integrations in a later phase.
create table app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('owner', 'manager')),
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  slug text not null check (slug in ('sathorn', 'sukhumvit')),
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

-- ---------------------------------------------------------------------------
-- Team & activity
-- ---------------------------------------------------------------------------
create table employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  full_name text not null,
  role_title text not null,
  status text not null default 'off' check (status in ('on', 'break', 'off')),
  current_task text,
  clocked_in_at timestamptz,
  created_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  shift_date date not null,
  shift_type text not null check (shift_type in ('open', 'mid', 'close')),
  created_at timestamptz not null default now()
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind text not null check (kind in ('sale', 'ops', 'stock', 'alert')),
  message text not null
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid references branches (id) on delete cascade,
  severity text not null check (severity in ('warning', 'critical')),
  title text not null,
  sub text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shop dashboard: sales, expenses, products
-- ---------------------------------------------------------------------------
create table sales_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  sale_date date not null,
  revenue numeric(12, 2) not null default 0,
  unique (branch_id, sale_date)
);

create table monthly_finance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  month date not null, -- first of month
  revenue numeric(12, 2) not null default 0,
  expenses numeric(12, 2) not null default 0,
  unique (org_id, month)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  period_month date not null,
  category text not null,
  amount numeric(12, 2) not null default 0
);

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  category text not null
);

create table product_sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  period_month date not null,
  units integer not null default 0,
  revenue numeric(12, 2) not null default 0
);

-- ---------------------------------------------------------------------------
-- Projects (kanban)
-- ---------------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  title text not null,
  branch_id uuid references branches (id) on delete set null,
  assignee_employee_id uuid references employees (id) on delete set null,
  due_date date,
  priority text not null default 'med' check (priority in ('low', 'med', 'high')),
  status text not null default 'todo' check (status in ('todo', 'inprogress', 'review', 'done')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security — every table is scoped to the caller's organization.
-- ---------------------------------------------------------------------------
create function current_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from app_users where id = auth.uid()
$$;

alter table organizations enable row level security;
alter table app_users enable row level security;
alter table branches enable row level security;
alter table employees enable row level security;
alter table shifts enable row level security;
alter table activity_log enable row level security;
alter table alerts enable row level security;
alter table sales_daily enable row level security;
alter table monthly_finance enable row level security;
alter table expenses enable row level security;
alter table products enable row level security;
alter table product_sales enable row level security;
alter table projects enable row level security;

create policy "read own org" on organizations for select using (id = current_org_id());
create policy "read own org" on app_users for select using (org_id = current_org_id());
create policy "read own org" on branches for select using (org_id = current_org_id());
create policy "read own org" on employees for select using (org_id = current_org_id());
create policy "read own org" on shifts for select using (org_id = current_org_id());
create policy "read own org" on activity_log for select using (org_id = current_org_id());
create policy "read own org" on alerts for select using (org_id = current_org_id());
create policy "read own org" on sales_daily for select using (org_id = current_org_id());
create policy "read own org" on monthly_finance for select using (org_id = current_org_id());
create policy "read own org" on expenses for select using (org_id = current_org_id());
create policy "read own org" on products for select using (org_id = current_org_id());
create policy "read own org" on product_sales for select using (org_id = current_org_id());
create policy "read own org" on projects for select using (org_id = current_org_id());

-- Owners & managers can write org data (employees, projects, alerts, ...).
-- Staff have no login yet, so writes stay owner/manager-only for now; a later
-- phase can add narrower policies once employee logins or integrations exist.
create policy "owners and managers write" on employees for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "owners and managers write" on shifts for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "owners and managers write" on activity_log for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "owners and managers write" on alerts for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "owners and managers write" on projects for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "owners and managers write" on expenses for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "owners and managers write" on sales_daily for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "owners and managers write" on monthly_finance for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "owners and managers write" on products for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "owners and managers write" on product_sales for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
