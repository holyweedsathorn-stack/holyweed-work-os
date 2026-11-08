-- Holy Bistro rent and electricity per month (migration 45)
--
-- Holy Bistro has no branch of its own in this schema (see
-- 0041_bistro_sales_daily.sql), so its rent and electricity can't go into
-- monthly_fixed_costs, which is keyed by branch. They get their own small
-- table, one row per month and category, shown as a "Holy Bistro" column
-- in the Monthly report's Rent & utilities section and counted in its
-- operating costs and bank payments.
--
-- This table was first created by hand in the Supabase SQL editor; the file
-- records the same SQL so the schema can be rebuilt from migrations. Safe to
-- run again: every statement is idempotent.
--
-- Run in the Supabase SQL editor AFTER 0044_hostel_pms_two_way.sql.

create table if not exists bistro_monthly_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  category text not null check (category in ('rent', 'electricity')),
  amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, month, category)
);

alter table bistro_monthly_costs enable row level security;

-- Manager-only, like every other financial table: staff can't read costs.
drop policy if exists "managers read bistro costs" on bistro_monthly_costs;
create policy "managers read bistro costs" on bistro_monthly_costs for select
  using (org_id = current_org_id() and is_manager());

drop policy if exists "managers write bistro costs" on bistro_monthly_costs;
create policy "managers write bistro costs" on bistro_monthly_costs for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());
