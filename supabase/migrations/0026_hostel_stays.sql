-- Hostel guest check-in / check-out log: passport photo, room key photo,
-- room (and bed, for a dorm), booking source, and how it was paid. A record
-- of who's actually in the building right now and who's already left — not
-- a booking system, just the same "photo + a few facts, no approval needed"
-- pattern as received_items and the maintenance/task completion photos.

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
