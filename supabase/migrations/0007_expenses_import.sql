-- Holyweed Work OS — real expenses from the branch spreadsheets (migration 7)
--
-- The existing expenses table held one seeded row per category per month.
-- The real sheets are kept per day, per branch, with a description, so the
-- table grows those columns.
--
-- Run in the Supabase SQL editor AFTER 0006_sales_import.sql.

alter table expenses add column if not exists branch_id uuid
  references branches (id) on delete cascade;
alter table expenses add column if not exists expense_date date;
alter table expenses add column if not exists description text;
alter table expenses add column if not exists source text default 'manual';

-- period_month belonged to the seeded demo rows; real rows use expense_date.
alter table expenses alter column period_month drop not null;

-- One row per branch per day per category, so re-importing a month replaces
-- those figures instead of adding them a second time.
create unique index if not exists expenses_daily_key
  on expenses (branch_id, expense_date, category)
  where expense_date is not null;

create index if not exists expenses_date_idx
  on expenses (org_id, expense_date);

-- The import log covers expenses too.
alter table sales_imports drop constraint if exists sales_imports_kind_check;
alter table sales_imports add constraint sales_imports_kind_check
  check (kind in ('daily', 'product', 'expenses'));
