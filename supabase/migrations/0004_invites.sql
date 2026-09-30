-- Holyweed Work OS — invite links (migration 4)
--
-- Replaces "owner generates a password and passes it on" with a private,
-- expiring invite link. The person opens it and sets their own password.
-- Nobody can create an account without a valid, unused, unexpired invite.
--
-- Run in the Supabase SQL editor AFTER 0003_staff_management.sql.

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,

  -- Long random string that forms the URL: /invite/<token>
  token text not null unique,

  -- What this person becomes when they accept.
  role text not null check (role in ('owner', 'manager', 'staff')),

  -- Staff invites attach to an existing employee record; owner/manager don't.
  employee_id uuid references employees (id) on delete cascade,

  full_name text not null,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),

  constraint invites_staff_needs_employee check (
    (role = 'staff' and employee_id is not null)
    or (role in ('owner', 'manager') and employee_id is null)
  )
);

create index if not exists invites_token_idx on invites (token);
create index if not exists invites_org_idx on invites (org_id, accepted_at);

-- Only one live invite per employee at a time; issuing a new one supersedes
-- the old (the app deletes outstanding invites before creating a fresh one).
create unique index if not exists invites_one_open_per_employee
  on invites (employee_id) where employee_id is not null and accepted_at is null;

alter table invites enable row level security;

-- Managers can see and manage invites for their own org. The accept flow runs
-- server-side with the service role, so no public read policy is needed here —
-- an anonymous visitor can never list or read invite rows.
drop policy if exists "managers manage invites" on invites;
create policy "managers manage invites" on invites for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());
