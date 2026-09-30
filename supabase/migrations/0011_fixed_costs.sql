-- Holyweed Work OS — rent and utilities per shop (migration 11)
--
-- Rent barely moves month to month; electricity and water move a lot. Neither
-- comes through the POS or the petty-cash sheets when they're paid from the
-- company account, so they're entered here, per branch, per month.
--
-- Run in the Supabase SQL editor AFTER 0010_product_net_revenue.sql.

create table if not exists monthly_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  category text not null check (category in ('rent', 'electricity', 'water', 'internet', 'other')),
  amount numeric(12, 2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, month, category)
);

create index if not exists monthly_fixed_costs_org_idx
  on monthly_fixed_costs (org_id, month);

alter table monthly_fixed_costs enable row level security;

-- Manager-only, like every other financial table: staff can't read costs.
drop policy if exists "managers read fixed costs" on monthly_fixed_costs;
create policy "managers read fixed costs" on monthly_fixed_costs for select
  using (org_id = current_org_id() and is_manager());

drop policy if exists "managers write fixed costs" on monthly_fixed_costs;
create policy "managers write fixed costs" on monthly_fixed_costs for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());
