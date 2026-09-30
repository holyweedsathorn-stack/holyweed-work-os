-- Holyweed Work OS — real shift scheduling (migration 14)
--
-- The shop trades 24 hours. The three shifts are:
--
--     Open   01:00 - 10:00   (takes over at the quiet hour, runs into morning)
--     Mid    09:00 - 18:00   (the middle of the trading day)
--     Close  17:00 - 02:00   (crosses midnight; on duty for the 00:00 report)
--
-- Until now a shift was just a date plus a type, and the times lived as
-- constants in one .tsx file — where they were also wrong. Two of the three
-- shifts cross midnight, which broke two things:
--
--   * /clock looked up "the shift whose date is today", so at 00:30 a
--     Close worker matched nothing and was shown EVERY checklist item.
--   * task_completions was unique per (template, calendar date), so the
--     Close shift ticking an item at 01:00 wrote it under the next day
--     and the Open shift found their list already done.
--
-- Both follow from treating a shift as belonging to one calendar day. It
-- doesn't. Shifts now carry a start time and a duration, and a shift is
-- anchored to the date it STARTS (the user's choice): the shift beginning
-- 01:00 Tuesday belongs to Tuesday.
--
-- Run in the Supabase SQL editor AFTER 0013_clock_location.sql.

-- ---------------------------------------------------------------------------
-- 1. What each shift actually is
-- ---------------------------------------------------------------------------
create table if not exists shift_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,

  -- null = applies to every branch. Both branches run the same three shifts
  -- today; this column is what lets one of them diverge later without a
  -- migration.
  branch_id uuid references branches (id) on delete cascade,

  -- Stable identifier. Kept as open/mid/close because task_templates already
  -- references these values; the human-facing name lives in `label`.
  code text not null check (code in ('open', 'mid', 'close')),
  label text not null,

  start_time time not null,
  -- Duration rather than an end time, so crossing midnight needs no special
  -- case: ends_at is always starts_at + duration.
  duration_minutes integer not null check (duration_minutes between 30 and 1440),

  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One definition per code per scope. Partial indexes because Postgres does not
-- treat two NULL branch_ids as equal in a plain unique constraint.
create unique index if not exists shift_types_org_code
  on shift_types (org_id, code) where branch_id is null;
create unique index if not exists shift_types_branch_code
  on shift_types (branch_id, code) where branch_id is not null;

-- ---------------------------------------------------------------------------
-- 2. How many people each shift needs
-- ---------------------------------------------------------------------------
create table if not exists shift_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  code text not null check (code in ('open', 'mid', 'close')),
  required_staff integer not null default 1 check (required_staff between 0 and 20),
  unique (branch_id, code)
);

-- ---------------------------------------------------------------------------
-- 3. Nobody gets rostered onto the same shift twice
-- ---------------------------------------------------------------------------
-- Deliberately keyed on the shift as well as the day: someone CAN work a
-- double (Day then Evening), they just can't be put on one shift twice.
create unique index if not exists shifts_one_per_employee_shift
  on shifts (employee_id, shift_date, shift_type);

create index if not exists shifts_week_idx on shifts (org_id, shift_date);

-- ---------------------------------------------------------------------------
-- 4. Checklist completions belong to a SHIFT, not to a calendar date
-- ---------------------------------------------------------------------------
alter table task_completions add column if not exists shift_anchor_date date;
alter table task_completions add column if not exists shift_code text;

alter table task_completions drop constraint if exists task_completions_shift_code_check;
alter table task_completions add constraint task_completions_shift_code_check
  check (shift_code is null or shift_code in ('open', 'mid', 'close'));

-- Existing rows predate shifts having times; the calendar date is the best
-- anchor available for them and is correct for every Day shift.
update task_completions set shift_anchor_date = task_date where shift_anchor_date is null;

alter table task_completions alter column shift_anchor_date set default current_date;

-- Replace "one tick per item per day" with "one tick per item per shift".
-- Without this, the Evening closer and the Night opener fight over the same row.
drop index if exists task_completions_one_per_day;
create unique index if not exists task_completions_one_per_shift
  on task_completions (template_id, shift_anchor_date, coalesce(shift_code, '-'));

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
alter table shift_types enable row level security;
alter table shift_requirements enable row level security;

-- Staff read both: the clock screen needs the times to work out which shift is
-- running, and everyone should be able to see the roster they're on.
drop policy if exists "read own org" on shift_types;
create policy "read own org" on shift_types for select
  using (org_id = current_org_id());

drop policy if exists "read own org" on shift_requirements;
create policy "read own org" on shift_requirements for select
  using (org_id = current_org_id());

drop policy if exists "managers write" on shift_types;
create policy "managers write" on shift_types for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());

drop policy if exists "managers write" on shift_requirements;
create policy "managers write" on shift_requirements for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());

-- ---------------------------------------------------------------------------
-- 6. Seed the real shifts — 24-hour cover, one hour of overlap at each handover
-- ---------------------------------------------------------------------------
insert into shift_types (org_id, branch_id, code, label, start_time, duration_minutes, sort_order)
select o.id, null, t.code, t.label, t.start_time, t.mins, t.ord
from organizations o
cross join (values
  ('open',  'Open',  time '01:00', 540, 10),
  ('mid',   'Mid',   time '09:00', 540, 20),
  ('close', 'Close', time '17:00', 540, 30)
) as t(code, label, start_time, mins, ord)
where not exists (
  select 1 from shift_types s where s.org_id = o.id and s.branch_id is null and s.code = t.code
);

-- Correct the definitions on re-run. The insert above is guarded by NOT
-- EXISTS, so without this a project that ran an earlier version of this
-- migration would keep the wrong times.
update shift_types s set
  label = t.label,
  start_time = t.start_time,
  duration_minutes = t.mins,
  sort_order = t.ord
from (values
  ('open',  'Open',  time '01:00', 540, 10),
  ('mid',   'Mid',   time '09:00', 540, 20),
  ('close', 'Close', time '17:00', 540, 30)
) as t(code, label, start_time, mins, ord)
where s.code = t.code and s.branch_id is null;

-- One person per shift per branch to start with. Change these on the Schedule
-- page; the coverage warnings read straight from here.
insert into shift_requirements (org_id, branch_id, code, required_staff)
select b.org_id, b.id, c.code, 1
from branches b
cross join (values ('open'), ('mid'), ('close')) as c(code)
where not exists (
  select 1 from shift_requirements r where r.branch_id = b.id and r.code = c.code
);
