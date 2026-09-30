-- Holyweed Work OS — month-end report (migration 9)
--
-- Sales and shop expenses already come in from the imports. The one thing the
-- app can't derive is payroll: base salary is fairly stable but incentives
-- change every month, so they're entered per person per month here.
--
-- Run in the Supabase SQL editor AFTER 0008_fix_upsert_indexes.sql.

create table if not exists payroll_month (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  -- 'YYYY-MM'. Text rather than a date because a month is what it means.
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  base_salary numeric(12, 2) not null default 0,
  incentive numeric(12, 2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, month)
);

create index if not exists payroll_month_org_idx on payroll_month (org_id, month);

alter table payroll_month enable row level security;

-- Payroll is manager-only, even to read: staff must not see each other's pay.
drop policy if exists "managers read payroll" on payroll_month;
create policy "managers read payroll" on payroll_month for select
  using (org_id = current_org_id() and is_manager());

drop policy if exists "managers write payroll" on payroll_month;
create policy "managers write payroll" on payroll_month for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());

-- ---------------------------------------------------------------------------
-- A place for the one or two sentences of context a month always needs
-- ("air-con repaired at Sathorn", "electricity bill covers two months").
-- ---------------------------------------------------------------------------
create table if not exists month_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (org_id, month)
);

alter table month_notes enable row level security;

drop policy if exists "managers read month notes" on month_notes;
create policy "managers read month notes" on month_notes for select
  using (org_id = current_org_id() and is_manager());

drop policy if exists "managers write month notes" on month_notes;
create policy "managers write month notes" on month_notes for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());
