-- Marketing plan library: a manager-only "Marketing" tab in the Work OS.
--
-- Files live in a private Storage bucket; metadata lives in this table.
-- Uploads/deletes go through the admin client after requireManager() in
-- code (same shape as notifications) — no write policy needed here. The
-- select policy is defense-in-depth in case anything ever reads this table
-- with the user's own client instead.

create table if not exists marketing_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  title text not null,
  storage_path text not null unique,
  uploaded_by uuid references app_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists marketing_documents_org_idx
  on marketing_documents (org_id, created_at desc);

alter table marketing_documents enable row level security;

drop policy if exists "managers read marketing docs" on marketing_documents;
create policy "managers read marketing docs" on marketing_documents for select
  using (
    org_id in (
      select org_id from app_users
      where app_users.id = auth.uid() and app_users.role in ('owner', 'manager')
    )
  );

-- Private bucket for the PDFs themselves. Nothing is served publicly — the
-- app hands out short-lived signed URLs from the admin client, after the
-- same requireManager() check.
insert into storage.buckets (id, name, public)
values ('marketing-plans', 'marketing-plans', false)
on conflict (id) do nothing;
