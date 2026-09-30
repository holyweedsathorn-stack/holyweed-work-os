-- A guest who extends mid-stay may pay for the extra nights differently
-- from how the original booking was paid — an OTA booking extended and
-- paid in cash at the desk, say. Each time a stay is extended with a
-- payment attached, it gets its own row here rather than overwriting the
-- one payment_method on hostel_stays, so the cash collected for
-- extensions is real, addable data, not a note. Amount is optional (a
-- date-only change, no charge, logs no row).

create table if not exists hostel_stay_extensions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  stay_id uuid not null references hostel_stays (id) on delete cascade,
  previous_expected_checkout_date date,
  new_expected_checkout_date date,
  nights integer check (nights is null or nights > 0),
  amount_thb numeric check (amount_thb is null or amount_thb >= 0),
  payment_method text check (payment_method in ('ota_collect', 'cash')),
  recorded_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists hostel_stay_extensions_stay_idx
  on hostel_stay_extensions (stay_id, created_at desc);
create index if not exists hostel_stay_extensions_org_idx
  on hostel_stay_extensions (org_id, created_at desc);

alter table hostel_stay_extensions enable row level security;

drop policy if exists "managers read hostel extensions" on hostel_stay_extensions;
create policy "managers read hostel extensions" on hostel_stay_extensions for select
  using (
    org_id in (
      select org_id from app_users
      where app_users.id = auth.uid() and app_users.role in ('owner', 'manager')
    )
  );
