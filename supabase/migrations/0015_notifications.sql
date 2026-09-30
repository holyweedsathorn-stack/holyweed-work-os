-- Push notifications: subscriptions + the notification log itself.
-- Design: claude/notifications-design.md (kept in the Claude project, not this repo).
--
-- Written idempotently (if not exists / drop-then-create for policies) so it
-- can be re-run safely if an earlier attempt got partway through.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (app_user_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  recipient_app_user_id uuid not null references app_users (id) on delete cascade,

  kind text not null check (kind in (
    'shift_reminder', 'clock_out_reminder', 'task_assigned', 'approval_raised', 'approval_decided'
  )),
  title text not null,
  body text not null,
  link text, -- relative path to open on tap, e.g. '/approvals'

  -- De-dupe key for cron-driven kinds, e.g. 'shift:<shift_id>:start' or
  -- 'clockout:<time_entry_id>'. Null for one-off event-triggered kinds, which
  -- always send (a task assignment or an approval request is never repeated).
  dedupe_key text,

  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_sent_at timestamptz,
  push_error text -- last send error, if any. Never blocks the row from existing.
);

create index if not exists notifications_recipient_idx
  on notifications (recipient_app_user_id, created_at desc);

-- Stops a future cron job from re-sending the same reminder every time it runs.
create unique index if not exists notifications_dedupe
  on notifications (recipient_app_user_id, dedupe_key)
  where dedupe_key is not null;

alter table push_subscriptions enable row level security;
alter table notifications enable row level security;

-- People manage their own subscription through the user client, same as
-- clockIn() and raiseRequest() — the policy is the guard.
drop policy if exists "manage own push subscription" on push_subscriptions;
create policy "manage own push subscription" on push_subscriptions for all
  using (app_user_id = auth.uid())
  with check (app_user_id = auth.uid());

-- People read and mark-read only their own notifications.
drop policy if exists "read own notifications" on notifications;
create policy "read own notifications" on notifications for select
  using (recipient_app_user_id = auth.uid());

drop policy if exists "mark own notifications read" on notifications;
create policy "mark own notifications read" on notifications for update
  using (recipient_app_user_id = auth.uid())
  with check (recipient_app_user_id = auth.uid());

-- Nobody inserts through RLS. notify() always writes with the admin client,
-- after the caller's right to notify that person has already been checked
-- in code (same shape as approvals and refusals).
