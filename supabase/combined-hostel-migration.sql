-- Combined migration: run this ONE file in the Supabase SQL editor to apply
-- 0026, 0027 and 0028 together (the hostel check-in/out feature, multiple
-- passport photos per check-in, and the full OTA channel list).
--
-- Safe to run even if some of these were already applied individually —
-- every statement below is written to be re-run without error.

-- ============================================================
-- 0026_hostel_stays.sql
-- ============================================================

create table if not exists hostel_stays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,

  guest_name text,
  room_type text not null check (room_type in ('private', 'dorm')),
  room_number text not null,
  bed_number text,
  booking_source text not null check (
    booking_source in ('booking_com', 'agoda', 'airbnb', 'hostelworld', 'direct', 'other')
  ),
  payment_method text not null check (payment_method in ('ota_collect', 'cash')),

  passport_photo_path text not null,
  room_key_photo_path text not null,

  checked_in_at timestamptz not null default now(),
  checked_in_employee_id uuid not null references employees (id) on delete cascade,
  checked_in_employee_name text not null,

  checked_out_at timestamptz,
  checked_out_employee_id uuid references employees (id) on delete set null,
  checked_out_employee_name text,

  created_at timestamptz not null default now()
);

create index if not exists hostel_stays_org_idx
  on hostel_stays (org_id, checked_in_at desc);

create index if not exists hostel_stays_open_idx
  on hostel_stays (org_id, branch_id)
  where checked_out_at is null;

alter table hostel_stays enable row level security;

drop policy if exists "managers read hostel stays" on hostel_stays;
create policy "managers read hostel stays" on hostel_stays for select
  using (
    org_id in (
      select org_id from app_users
      where app_users.id = auth.uid() and app_users.role in ('owner', 'manager')
    )
  );

insert into storage.buckets (id, name, public)
values ('hostel-checkins', 'hostel-checkins', false)
on conflict (id) do nothing;

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'shift_reminder', 'clock_out_reminder', 'task_assigned', 'approval_raised',
  'approval_decided', 'announcement', 'maintenance_assigned', 'item_received',
  'hostel_checkin'
));

-- ============================================================
-- 0027_hostel_multi_passport.sql
-- ============================================================

alter table hostel_stays add column if not exists passport_photo_paths text[];

update hostel_stays
set passport_photo_paths = array[passport_photo_path]
where passport_photo_paths is null and passport_photo_path is not null;

alter table hostel_stays alter column passport_photo_path drop not null;

-- ============================================================
-- 0028_hostel_more_booking_sources.sql
-- ============================================================

alter table hostel_stays drop constraint if exists hostel_stays_booking_source_check;
alter table hostel_stays add constraint hostel_stays_booking_source_check check (
  booking_source in (
    'booking_com', 'agoda', 'airbnb', 'hostelworld', 'expedia', 'trip_com', 'direct', 'other'
  )
);

-- ============================================================
-- 0029_hostel_expected_checkout.sql
-- ============================================================

alter table hostel_stays add column if not exists expected_checkout_date date;

-- ============================================================
-- 0030_hostel_notes.sql
-- ============================================================

alter table hostel_stays add column if not exists notes text;
alter table hostel_stays add column if not exists notes_updated_by text;
alter table hostel_stays add column if not exists notes_updated_at timestamptz;

-- ============================================================
-- 0031_hostel_stay_extensions.sql
-- ============================================================

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
