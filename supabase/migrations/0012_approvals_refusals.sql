-- Holyweed Work OS — approvals & refusal log (migration 12)
--
-- Two features that share one migration:
--
--   approvals   things staff ask the owner for (leave, shift swap, expense,
--               discount, write-off). The "waiting on you" queue.
--   refusals    things the APP refused — wrong role, expired invite token,
--               not signed in. The access log.
--
-- These are deliberately separate. A denied leave request is a human saying
-- no; a refusal is the system blocking someone. Mixing them would make both
-- numbers meaningless.
--
-- Also adds pulse(), the four numbers on the status bar, as one round trip.
--
-- Run in the Supabase SQL editor AFTER 0011_fixed_costs.sql.

-- ---------------------------------------------------------------------------
-- 1. Approvals
-- ---------------------------------------------------------------------------
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid references branches (id) on delete cascade,

  requested_by uuid not null references employees (id) on delete cascade,

  kind text not null check (kind in (
    'shift_swap', 'leave', 'expense', 'discount', 'write_off', 'other'
  )),
  title text not null,
  note text,

  -- expense / discount / write_off carry an amount; the rest don't.
  amount numeric(12, 2),

  -- The date the request is ABOUT (the shift, the day off) — not when it was
  -- raised, which is created_at.
  ref_date date,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'cancelled')),

  decided_by uuid references app_users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,

  created_at timestamptz not null default now(),

  -- A decision is either complete or absent, never half-written.
  constraint approvals_decision_consistent check (
    (status in ('pending', 'cancelled') and decided_at is null and decided_by is null)
    or (status in ('approved', 'denied') and decided_at is not null)
  )
);

-- The queue: "what is waiting on me", newest first.
create index if not exists approvals_pending_idx
  on approvals (org_id, created_at desc) where status = 'pending';

-- Per-person history for the staff detail panel.
create index if not exists approvals_requester_idx
  on approvals (requested_by, created_at desc);

-- Stops double-submits exactly the way time_entries stops double clock-ins:
-- one open request per person, per kind, per date. A second tap gets 23505.
create unique index if not exists approvals_one_pending
  on approvals (requested_by, kind, ref_date)
  where status = 'pending' and ref_date is not null;

alter table approvals enable row level security;

-- Managers see the whole org; staff see only what they raised.
drop policy if exists "read approvals" on approvals;
create policy "read approvals" on approvals for select
  using (
    org_id = current_org_id()
    and (is_manager() or requested_by = current_employee_id())
  );

-- Staff may file a pending request in their own name, and may not pre-fill
-- any decision field.
drop policy if exists "staff raise request" on approvals;
create policy "staff raise request" on approvals for insert
  with check (
    org_id = current_org_id()
    and requested_by = current_employee_id()
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and decision_note is null
  );

-- Staff may withdraw their own pending request and nothing else. The
-- with-check clause is what stops someone approving their own expense.
drop policy if exists "staff cancel own request" on approvals;
create policy "staff cancel own request" on approvals for update
  using (
    org_id = current_org_id()
    and requested_by = current_employee_id()
    and status = 'pending'
  )
  with check (
    org_id = current_org_id()
    and requested_by = current_employee_id()
    and status = 'cancelled'
    and decided_by is null
    and decided_at is null
  );

drop policy if exists "managers write approvals" on approvals;
create policy "managers write approvals" on approvals for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());

-- ---------------------------------------------------------------------------
-- 2. Refusals (the access log)
-- ---------------------------------------------------------------------------
create table if not exists refusals (
  id uuid primary key default gen_random_uuid(),

  -- Nullable: someone who isn't signed in belongs to no org yet.
  org_id uuid references organizations (id) on delete cascade,

  actor_user_id uuid references app_users (id) on delete set null,
  actor_employee_id uuid references employees (id) on delete set null,

  -- Who it was, in words, snapshotted at the time: "Nok (staff)".
  -- The point of an access log is that it survives the person being deleted,
  -- so this is deliberately NOT a join.
  actor_label text not null,

  -- Dotted server-action name: 'tasks.createTemplate', 'report.setFixedCosts'.
  action text not null,

  reason text not null check (reason in (
    'not_signed_in', 'not_manager', 'wrong_employee',
    'expired_token', 'used_token', 'other'
  )),
  detail text,

  occurred_at timestamptz not null default now()
);

create index if not exists refusals_org_time_idx
  on refusals (org_id, occurred_at desc);
create index if not exists refusals_actor_idx
  on refusals (actor_employee_id, occurred_at desc);

alter table refusals enable row level security;

-- Managers read. NOBODY writes through RLS: inserts come only from the
-- service-role client in server code, which bypasses RLS entirely. That is
-- deliberate — a log anyone can append to is not a log.
drop policy if exists "managers read refusals" on refusals;
create policy "managers read refusals" on refusals for select
  using (org_id = current_org_id() and is_manager());

comment on table refusals is
  'Access log: what the APP refused. A request blocked by RLS before it '
  'reaches a server action never lands here — those are in Supabase''s logs.';

-- ---------------------------------------------------------------------------
-- 3. pulse() — the four status-bar numbers in one round trip
--
-- "Today" and "this week" mean today and this week IN BANGKOK, not UTC.
-- ---------------------------------------------------------------------------
create or replace function pulse()
returns table (
  on_shift integer,
  on_shift_sathorn integer,
  on_shift_sukhumvit integer,
  pending_approvals integer,
  refused_today integer,
  hours_this_week numeric
)
language sql
security definer
stable
set search_path = public
as $$
  with me as (select current_org_id() as org_id),
  open_entries as (
    select t.branch_id
    from time_entries t, me
    where t.org_id = me.org_id and t.clock_out is null
  )
  select
    (select count(*) from open_entries)::int,
    (select count(*) from open_entries o
       join branches b on b.id = o.branch_id where b.slug = 'sathorn')::int,
    (select count(*) from open_entries o
       join branches b on b.id = o.branch_id where b.slug = 'sukhumvit')::int,
    (select count(*) from approvals a, me
       where a.org_id = me.org_id and a.status = 'pending')::int,
    (select count(*) from refusals r, me
       where r.org_id = me.org_id
         and r.occurred_at >= date_trunc('day', now() at time zone 'Asia/Bangkok')
                              at time zone 'Asia/Bangkok')::int,
    coalesce((
      select round(sum(
        extract(epoch from (coalesce(t.clock_out, now()) - t.clock_in)) / 3600
      )::numeric, 1)
      from time_entries t, me
      where t.org_id = me.org_id
        and t.clock_in >= date_trunc('week', now() at time zone 'Asia/Bangkok')
                          at time zone 'Asia/Bangkok'
    ), 0);
$$;

revoke all on function pulse() from public;
grant execute on function pulse() to authenticated;
