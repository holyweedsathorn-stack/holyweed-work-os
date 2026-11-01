-- Two-way sync between the hostel log and the Holy Hostel PMS.
--
-- Guests checked in on a PMS tablet now appear on the hostel log too
-- (src/lib/hostel-pms-sync.ts). They have no passport / room key photo yet
-- -- staff add those later from the log -- and no Work OS staff member
-- checked them in, so those columns can be empty for them. `origin` says
-- which side the guest was first checked in on.
--
-- Run in the Supabase SQL editor AFTER 0043_hostel_pms_link.sql.

alter table hostel_stays alter column room_key_photo_path drop not null;
alter table hostel_stays alter column checked_in_employee_id drop not null;

alter table hostel_stays
  add column if not exists origin text not null default 'workos';

alter table hostel_stays drop constraint if exists hostel_stays_origin_check;
alter table hostel_stays add constraint hostel_stays_origin_check check (origin in ('workos', 'pms'));
