-- Holyweed Work OS — clock-in location check (migration 13)
--
-- Clocking in only works at the shop. Each branch gets a reference point and a
-- radius; the clock screen sends the phone's position and the server compares.
--
-- Three deliberate rules, all enforced in src/app/clock/actions.ts:
--
--   1. Clock OUT is never blocked. Someone who walks home having forgotten to
--      clock out must still be able to close the shift — otherwise the
--      "one open entry per employee" index locks them out of tomorrow.
--   2. A branch with no lat/lng set is NOT checked. Deploying this must not
--      stop anyone clocking in before the owner has set the locations.
--   3. A poor GPS fix gets the benefit of its own error margin: the check is
--      (distance - accuracy) > radius, so "250m away +/- 300m" passes.
--      Beyond +/- 500m the reading is treated as unusable.
--
-- Run in the Supabase SQL editor AFTER 0012_approvals_refusals.sql.

-- ---------------------------------------------------------------------------
-- 1. Where each branch is
-- ---------------------------------------------------------------------------
alter table branches add column if not exists lat double precision;
alter table branches add column if not exists lng double precision;
alter table branches add column if not exists geofence_m integer not null default 200;
alter table branches add column if not exists location_set_at timestamptz;
alter table branches add column if not exists location_set_by uuid
  references app_users (id) on delete set null;

alter table branches drop constraint if exists branches_geofence_sane;
alter table branches add constraint branches_geofence_sane
  check (geofence_m between 25 and 5000);

alter table branches drop constraint if exists branches_latlng_together;
alter table branches add constraint branches_latlng_together
  check ((lat is null and lng is null) or (lat is not null and lng is not null));

comment on column branches.geofence_m is
  'How far from lat/lng a clock-in is still accepted, in metres. Null lat/lng = no check.';

-- Managers set this; the existing "managers write" policy on branches covers
-- it. Staff already read branches through the org-wide read policy, which they
-- need in order to be told which shop they are too far from.

-- ---------------------------------------------------------------------------
-- 2. Where each clock-in and clock-out happened
-- ---------------------------------------------------------------------------
alter table time_entries add column if not exists clock_in_lat double precision;
alter table time_entries add column if not exists clock_in_lng double precision;
alter table time_entries add column if not exists clock_in_accuracy_m double precision;
alter table time_entries add column if not exists clock_in_distance_m double precision;

alter table time_entries add column if not exists clock_out_lat double precision;
alter table time_entries add column if not exists clock_out_lng double precision;
alter table time_entries add column if not exists clock_out_distance_m double precision;

-- 'self'    the person clocked themselves in, location checked
-- 'manager' a manager clocked them in — the release valve for a bad GPS fix
alter table time_entries add column if not exists clock_in_method text
  not null default 'self';

alter table time_entries drop constraint if exists time_entries_method_check;
alter table time_entries add constraint time_entries_method_check
  check (clock_in_method in ('self', 'manager'));

comment on column time_entries.clock_in_distance_m is
  'Metres from the branch reference point at clock-in. Null = branch had no '
  'location set, or a manager clocked them in.';

-- Find manager-assisted and far-away clock-ins quickly.
create index if not exists time_entries_method_idx
  on time_entries (org_id, clock_in_method, clock_in desc)
  where clock_in_method = 'manager';

-- ---------------------------------------------------------------------------
-- 3. A blocked clock-in is a refusal, so give it its own reason
-- ---------------------------------------------------------------------------
alter table refusals drop constraint if exists refusals_reason_check;
alter table refusals add constraint refusals_reason_check
  check (reason in (
    'not_signed_in', 'not_manager', 'wrong_employee',
    'expired_token', 'used_token', 'wrong_location', 'other'
  ));
