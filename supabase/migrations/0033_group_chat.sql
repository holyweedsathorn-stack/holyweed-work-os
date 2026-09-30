-- Team chat: one shared thread per org, any signed-in staff member or
-- manager can post, everyone in the org reads it -- no branch split.
-- Unlike the received-items / currency logs (deliberately kept per-branch),
-- a message from Sathorn is exactly the kind of thing a Sukhumvit manager
-- (or someone working both branches, like Naing) needs to see too.
--
-- Written via the admin client after a requireEmployee()/requireManager()
-- check in code, same pattern as received_items and hostel_stays -- the
-- author's name is stored directly rather than only an FK, since a manager
-- account may have no employee record at all.
--
-- branch_id is a *snapshot*, not a live lookup: whichever branch the
-- sender's time_entry was open at the moment they sent the message (same
-- rule as resolveWorkingBranch()), or null if they weren't clocked in at
-- all -- the UI shows that as "Off shift". This is deliberately captured
-- at send time rather than recomputed later, because chat is a historical
-- log, not a live status board like the Team page's branch chip.

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid references branches (id) on delete set null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_org_created_idx
  on chat_messages (org_id, created_at desc);

alter table chat_messages enable row level security;

drop policy if exists "org members read chat" on chat_messages;
create policy "org members read chat" on chat_messages for select
  using (
    org_id in (
      select org_id from app_users where app_users.id = auth.uid()
    )
  );

-- @mentions push a notification to the mentioned person, same pipeline as
-- task assignments and approvals.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'shift_reminder', 'clock_out_reminder', 'task_assigned', 'approval_raised',
  'approval_decided', 'announcement', 'maintenance_assigned', 'item_received',
  'hostel_checkin', 'chat_mention'
));

-- Per-message read receipts: who has actually opened the thread since a
-- given message landed, not just "delivered". One row per (message,
-- reader) -- upserted with ignoreDuplicates so re-marking an already-seen
-- message on every poll is a cheap no-op.

create table if not exists chat_message_reads (
  message_id uuid not null references chat_messages (id) on delete cascade,
  app_user_id uuid not null references app_users (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (message_id, app_user_id)
);

create index if not exists chat_message_reads_message_idx
  on chat_message_reads (message_id);

alter table chat_message_reads enable row level security;

drop policy if exists "org members read receipts" on chat_message_reads;
create policy "org members read receipts" on chat_message_reads for select
  using (
    message_id in (
      select id from chat_messages where org_id in (
        select org_id from app_users where app_users.id = auth.uid()
      )
    )
  );
