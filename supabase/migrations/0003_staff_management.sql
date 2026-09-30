-- Holyweed Work OS — staff roster management (migration 3)
--
-- Adds the fields needed to manage a real team: a phone number, and an
-- "active" flag so someone who leaves can be archived without destroying
-- their recorded hours (which payroll may still need).
--
-- Run in the Supabase SQL editor AFTER 0002_timeclock.sql.

alter table employees add column if not exists phone text;
alter table employees add column if not exists active boolean not null default true;

create index if not exists employees_active_idx on employees (org_id, active);

-- The demo seed filled these in; they're no longer used now that live status
-- comes from time_entries. Kept (not dropped) so the original seed script still
-- runs, but nothing reads them any more.
comment on column employees.status is 'Deprecated: live status is derived from time_entries.';
comment on column employees.current_task is 'Deprecated: unused since the time clock was added.';
comment on column employees.clocked_in_at is 'Deprecated: use time_entries.clock_in.';
