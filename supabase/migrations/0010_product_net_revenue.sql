-- Holyweed Work OS — product sales: net revenue and import recency (migration 10)
--
-- Two problems this fixes.
--
-- 1. product_sales.revenue held Silom's "Total", which is the ticket price
--    BEFORE discount. Staff allowance lines are rung at full price and then
--    discounted to almost nothing, so they climbed the "Top products" list on
--    money that was never taken. revenue now means net; the gross and the
--    discount are kept beside it so nothing is lost.
--
-- 2. Product reports are exported over whatever range you pick, and those
--    ranges overlap. Nothing recorded WHEN a row was imported, so overlapping
--    imports could only be added together — counting the same August three
--    times. imported_at lets the dashboard prefer the newest import and skip
--    the ones it overlaps.
--
-- Run in the Supabase SQL editor AFTER 0009_monthly_report.sql.

alter table product_sales add column if not exists gross_revenue numeric(12, 2);
alter table product_sales add column if not exists discount numeric(12, 2);
alter table product_sales add column if not exists imported_at timestamptz not null default now();

create index if not exists product_sales_imported_idx
  on product_sales (org_id, imported_at desc);

-- ---------------------------------------------------------------------------
-- Clear the old product rows.
--
-- Every existing row holds a pre-discount figure in a column that now means
-- something else, and there is no way to recover the discount after the fact —
-- it was never stored. Leaving them would mean a dashboard silently mixing two
-- different meanings of "revenue", which is worse than an empty card.
--
-- Nothing is lost that can't be rebuilt: re-import the Sales by Product
-- reports from Silom and the card fills back in, correctly this time.
-- Daily sales, expenses, payroll, staff and tasks are untouched.
-- ---------------------------------------------------------------------------
delete from product_sales;
