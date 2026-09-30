-- Holyweed Work OS — real sales data from Silom POS (migration 6)
--
-- The Silom exports carry Cost and Profit per day and per product, so the
-- dashboard can stop estimating margin and show the real figures.
--
-- Run in the Supabase SQL editor AFTER 0005_tasks.sql.

-- ---------------------------------------------------------------------------
-- Daily sales: keep the whole picture, not just revenue
-- ---------------------------------------------------------------------------
alter table sales_daily add column if not exists gross_sales numeric(12, 2);
alter table sales_daily add column if not exists discount numeric(12, 2);
alter table sales_daily add column if not exists cost numeric(12, 2);
alter table sales_daily add column if not exists profit numeric(12, 2);
alter table sales_daily add column if not exists bill_count integer;
alter table sales_daily add column if not exists source text default 'manual';

-- ---------------------------------------------------------------------------
-- Products: match on Silom's PLU code so re-imports update rather than duplicate
-- ---------------------------------------------------------------------------
alter table products add column if not exists plu_code text;

create unique index if not exists products_org_plu_key
  on products (org_id, plu_code) where plu_code is not null;

-- ---------------------------------------------------------------------------
-- Product sales: per branch, over the exported date range
-- ---------------------------------------------------------------------------
alter table product_sales add column if not exists branch_id uuid
  references branches (id) on delete cascade;
alter table product_sales add column if not exists cost numeric(12, 2);
alter table product_sales add column if not exists profit numeric(12, 2);
alter table product_sales add column if not exists period_start date;
alter table product_sales add column if not exists period_end date;

-- Cannabis sells by weight, so quantities are fractional (0.5g, 22.5g).
-- The original integer column would silently round those away.
alter table product_sales alter column units type numeric(12, 3) using units::numeric;

-- period_month came from the seeded demo data; real imports use the range.
alter table product_sales alter column period_month drop not null;

create unique index if not exists product_sales_period_key
  on product_sales (product_id, branch_id, period_start, period_end)
  where period_start is not null;

-- ---------------------------------------------------------------------------
-- A record of what was imported, so a bad import can be traced
-- ---------------------------------------------------------------------------
create table if not exists sales_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  kind text not null check (kind in ('daily', 'product')),
  file_name text,
  period_start date,
  period_end date,
  row_count integer not null default 0,
  imported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sales_imports_org_idx
  on sales_imports (org_id, created_at desc);

alter table sales_imports enable row level security;

drop policy if exists "managers read imports" on sales_imports;
create policy "managers read imports" on sales_imports for select
  using (org_id = current_org_id() and is_manager());

drop policy if exists "managers write imports" on sales_imports;
create policy "managers write imports" on sales_imports for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());
