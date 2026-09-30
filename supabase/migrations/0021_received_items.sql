-- Staff-side "I received this" log: a quick photo + short note whenever
-- something arrives during a shift (a delivery, stock, a package). No
-- approval step — this is pure record-keeping so managers can see it, not
-- something that needs a decision. Written via the admin client after a
-- requireEmployee() check in code, same pattern as the marketing/maintenance
-- features, rather than a staff-write RLS policy.

create table if not exists received_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  employee_name text not null,
  note text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists received_items_org_idx
  on received_items (org_id, created_at desc);

alter table received_items enable row level security;

drop policy if exists "managers read received items" on received_items;
create policy "managers read received items" on received_items for select
  using (
    org_id in (
      select org_id from app_users
      where app_users.id = auth.uid() and app_users.role in ('owner', 'manager')
    )
  );

insert into storage.buckets (id, name, public)
values ('received-items', 'received-items', false)
on conflict (id) do nothing;

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'shift_reminder', 'clock_out_reminder', 'task_assigned', 'approval_raised',
  'approval_decided', 'announcement', 'maintenance_assigned', 'item_received'
));
