-- Foreign-cash transaction log: every time staff actually accept and
-- complete a foreign-currency payment (via the Exchange rates quick
-- convert), record who did it, on which branch, what currency/amount, the
-- rate shown at that moment, the flat fee, and the THB total collected.
-- This is what lets a manager reconstruct "who was on shift and what was
-- the rate" at month end — it's a record of what happened, not something
-- that needs approval.

create table if not exists currency_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  employee_name text not null,
  currency_code text not null,
  foreign_amount numeric not null check (foreign_amount > 0),
  rate_thb_per_unit numeric not null check (rate_thb_per_unit > 0),
  fee_thb numeric not null default 0 check (fee_thb >= 0),
  total_thb numeric not null check (total_thb > 0),
  created_at timestamptz not null default now()
);

create index if not exists currency_transactions_org_idx
  on currency_transactions (org_id, created_at desc);

alter table currency_transactions enable row level security;

drop policy if exists "managers read currency transactions" on currency_transactions;
create policy "managers read currency transactions" on currency_transactions for select
  using (
    org_id in (
      select org_id from app_users
      where app_users.id = auth.uid() and app_users.role in ('owner', 'manager')
    )
  );
