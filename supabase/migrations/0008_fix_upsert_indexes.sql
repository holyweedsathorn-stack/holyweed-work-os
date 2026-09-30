-- Holyweed Work OS — fix the import upsert keys (migration 8)
--
-- 0006 and 0007 created these unique indexes with a WHERE clause, e.g.
--     ... where period_start is not null
-- Postgres will not use a *partial* unique index to resolve ON CONFLICT, so
-- every import failed with:
--     "there is no unique or exclusion constraint matching the ON CONFLICT
--      specification"
--
-- Dropping the predicate fixes it and costs nothing: Postgres treats NULLs as
-- distinct in a unique index, so the older seeded rows (which have NULL in
-- these columns) still coexist happily.
--
-- Run in the Supabase SQL editor AFTER 0007_expenses_import.sql.

drop index if exists product_sales_period_key;
create unique index if not exists product_sales_period_key
  on product_sales (product_id, branch_id, period_start, period_end);

drop index if exists products_org_plu_key;
create unique index if not exists products_org_plu_key
  on products (org_id, plu_code);

drop index if exists expenses_daily_key;
create unique index if not exists expenses_daily_key
  on expenses (branch_id, expense_date, category);
