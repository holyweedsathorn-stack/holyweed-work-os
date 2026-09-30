-- Holy Bistro shares the same PromptPay QR / bank account as the Holyweed
-- Sathorn dispensary, so any bistro PromptPay payment lands in the same
-- bank deposits the reconciliation page compares against Silom's dispensary
-- sales -- with nothing on the bank side saying which business it was for.
-- There's no way to split that after the fact from the bank statement
-- alone. This table gives Bistro its own daily sales record, entered by
-- staff at close-out (same "snap it and it's logged" pattern as hostel
-- check-in), so the reconciliation page can add Bistro's own PromptPay
-- total to the POS side of the comparison instead of leaving it missing --
-- which is what was making the shared-account comparison never land on
-- zero even after every bank transaction was correctly tagged.
--
-- Run in the Supabase SQL editor AFTER 0040_bank_branch_transfer.sql.

create table if not exists bistro_sales_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  sale_date date not null,

  cash numeric(12, 2) not null default 0 check (cash >= 0),
  promptpay numeric(12, 2) not null default 0 check (promptpay >= 0),
  grab numeric(12, 2) not null default 0 check (grab >= 0),
  line_man numeric(12, 2) not null default 0 check (line_man >= 0),
  notes text,

  recorded_by_employee_id uuid references employees (id) on delete set null,
  recorded_by_name text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per day -- re-entering the same date (a correction at
  -- checkout, or catching up a missed night) replaces it rather than
  -- creating a duplicate that would double-count in the comparison.
  unique (org_id, sale_date)
);

create index if not exists bistro_sales_daily_org_idx
  on bistro_sales_daily (org_id, sale_date desc);

alter table bistro_sales_daily enable row level security;

drop policy if exists "managers read bistro sales" on bistro_sales_daily;
create policy "managers read bistro sales" on bistro_sales_daily for select
  using (org_id = current_org_id() and is_manager());
