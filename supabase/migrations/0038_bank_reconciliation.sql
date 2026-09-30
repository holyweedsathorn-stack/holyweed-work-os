-- Bank ↔ POS reconciliation (migration 38)
--
-- Naing uploads a bank statement PDF; the app parses every transaction,
-- auto-tags the obvious ones (OTA payouts like Airbnb/Booking.com, plain
-- withdrawals), and leaves the rest ("Transfer in-PromptPay...", "Deposit
-- (SDCH)", etc.) as `uncategorized` for a one-time bulk tag to a branch as
-- POS income. Once tagged `pos_sale`, a day's bank deposits are compared
-- against that branch's `sales_daily.promptpay` for the same day -- the
-- correct comparison, since cash and card sales never touch this account.
--
-- Run in the Supabase SQL editor AFTER 0037_pos_live_snapshots.sql.

create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  label text not null,
  bank_name text,
  account_number_masked text,
  created_at timestamptz not null default now()
);

create table if not exists bank_statements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  bank_account_id uuid not null references bank_accounts (id) on delete cascade,
  period_start date,
  period_end date,
  source_filename text,
  row_count integer not null default 0,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bank_statements_account_idx
  on bank_statements (bank_account_id, created_at desc);

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  bank_account_id uuid not null references bank_accounts (id) on delete cascade,
  statement_id uuid not null references bank_statements (id) on delete cascade,

  txn_date date not null,
  txn_time time,
  direction text not null check (direction in ('in', 'out')),
  amount numeric(12, 2) not null,
  balance_after numeric(12, 2),
  description text not null,

  -- 'other' covers withdrawals, interest, and anything the owner has
  -- decided isn't sales income. 'uncategorized' is the only one that needs
  -- attention -- it's an inbound transfer nobody has tagged yet.
  category text not null default 'uncategorized'
    check (category in ('uncategorized', 'pos_sale', 'ota_payout', 'other')),
  branch_id uuid references branches (id) on delete set null,

  created_at timestamptz not null default now(),

  -- Re-uploading the same statement (or an overlapping one) is safe: the
  -- same row just doesn't insert twice. date+time+amount+description is
  -- distinctive enough here since the description carries the sender's own
  -- transfer reference number.
  unique (bank_account_id, txn_date, txn_time, amount, description)
);

create index if not exists bank_transactions_recon_idx
  on bank_transactions (org_id, txn_date, category);

alter table bank_accounts enable row level security;
alter table bank_statements enable row level security;
alter table bank_transactions enable row level security;

drop policy if exists "managers read bank accounts" on bank_accounts;
create policy "managers read bank accounts" on bank_accounts for select
  using (org_id = current_org_id() and is_manager());

drop policy if exists "managers read bank statements" on bank_statements;
create policy "managers read bank statements" on bank_statements for select
  using (org_id = current_org_id() and is_manager());

drop policy if exists "managers read bank transactions" on bank_transactions;
create policy "managers read bank transactions" on bank_transactions for select
  using (org_id = current_org_id() and is_manager());

-- Categorizing a transaction (picking pos_sale + a branch) happens from the
-- reconciliation page itself, by a manager, through the admin client --
-- same "reads through RLS, writes through the service role" pattern as
-- pos_live_snapshots and sales_imports.
