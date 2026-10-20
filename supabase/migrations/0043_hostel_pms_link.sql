-- Link a hostel log entry to its booking in the Holy Hostel PMS.
--
-- The clock screen now lists today's PMS arrivals and in-house guests
-- (src/lib/pms.ts). Checking one of them in here also marks the PMS
-- booking checked in, and checking them out here marks it checked out, so
-- nobody types the same check-in twice. These columns remember which PMS
-- booking a stay belongs to, and whether the PMS is up to date with it:
-- if the PMS can't be reached at check-out, the stay is still checked out
-- here and pms_sync_error says what to retry.
--
-- Stays logged by hand (walk-ins not in the PMS, or from before this)
-- simply leave pms_booking_id empty.
--
-- Run in the Supabase SQL editor AFTER 0042_bank_transactions_line_seq.sql.

alter table hostel_stays
  add column if not exists pms_booking_id text,
  add column if not exists pms_ref text,
  add column if not exists pms_synced_at timestamptz,
  add column if not exists pms_sync_error text;

-- One log entry per PMS booking, so a double tap can't check the same
-- booking in twice.
create unique index if not exists hostel_stays_pms_booking_idx
  on hostel_stays (org_id, pms_booking_id)
  where pms_booking_id is not null;
