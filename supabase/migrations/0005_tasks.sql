-- Holyweed Work OS — shift tasks (migration 5)
--
-- Three pieces:
--   task_templates   the standing checklist (same items every shift)
--   task_completions which template was ticked off, on which date, by whom
--   tasks            one-off jobs assigned to a person for a given day
--
-- Repeating tasks are NOT copied into rows each morning. The checklist is
-- derived: templates for your branch, minus what's already been completed
-- today. That means no scheduled job to run, and nothing to clean up.
--
-- Run in the Supabase SQL editor AFTER 0004_invites.sql.

-- ---------------------------------------------------------------------------
-- Repeating checklist items
-- ---------------------------------------------------------------------------
create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,

  -- null branch = applies to both branches
  branch_id uuid references branches (id) on delete cascade,

  -- null shift_type = show on every shift; otherwise only open/mid/close
  shift_type text check (shift_type in ('open', 'mid', 'close')),

  title text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists task_templates_org_idx
  on task_templates (org_id, active, sort_order);

-- ---------------------------------------------------------------------------
-- Completions of the repeating items, one per template per day
-- ---------------------------------------------------------------------------
create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  template_id uuid not null references task_templates (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  task_date date not null,
  completed_at timestamptz not null default now()
);

-- One tick per item per day: if two people open the app at once, the second
-- insert fails rather than double-recording.
create unique index if not exists task_completions_one_per_day
  on task_completions (template_id, task_date);

create index if not exists task_completions_date_idx
  on task_completions (org_id, task_date);

-- ---------------------------------------------------------------------------
-- One-off tasks
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid references branches (id) on delete cascade,

  -- null assignee = anyone working at that branch can pick it up
  assigned_employee_id uuid references employees (id) on delete cascade,

  title text not null,
  note text,
  due_date date,
  completed_at timestamptz,
  completed_by uuid references employees (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tasks_assignee_idx
  on tasks (assigned_employee_id, completed_at);
create index if not exists tasks_org_idx on tasks (org_id, due_date);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Reads are org-wide: staff need to see the checklist and their own tasks.
-- Writes go through server actions using the service role, which check the
-- caller is either a manager or the assigned person — so no staff write
-- policies are granted here.
-- ---------------------------------------------------------------------------
alter table task_templates enable row level security;
alter table task_completions enable row level security;
alter table tasks enable row level security;

drop policy if exists "read own org" on task_templates;
create policy "read own org" on task_templates for select
  using (org_id = current_org_id());

drop policy if exists "read own org" on task_completions;
create policy "read own org" on task_completions for select
  using (org_id = current_org_id());

drop policy if exists "read own org" on tasks;
create policy "read own org" on tasks for select
  using (org_id = current_org_id());

drop policy if exists "managers write" on task_templates;
create policy "managers write" on task_templates for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());

drop policy if exists "managers write" on task_completions;
create policy "managers write" on task_completions for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());

drop policy if exists "managers write" on tasks;
create policy "managers write" on tasks for all
  using (org_id = current_org_id() and is_manager())
  with check (org_id = current_org_id() and is_manager());

-- ---------------------------------------------------------------------------
-- A starting checklist so the feature isn't empty on day one.
-- Edit or delete these in the app under Tasks.
-- ---------------------------------------------------------------------------
insert into task_templates (org_id, branch_id, shift_type, title, sort_order)
select o.id, null, 'open', t.title, t.ord
from organizations o
cross join (values
  ('Unlock and check the shop is tidy', 10),
  ('Count the cash drawer and record the opening float', 20),
  ('Check display stock and restock any gaps', 30),
  ('Turn on lights, music and signage', 40)
) as t(title, ord)
where not exists (select 1 from task_templates where org_id = o.id);

insert into task_templates (org_id, branch_id, shift_type, title, sort_order)
select o.id, null, 'close', t.title, t.ord
from organizations o
cross join (values
  ('Count the cash drawer and record the closing total', 110),
  ('Restock shelves ready for tomorrow', 120),
  ('Clean surfaces and equipment', 130),
  ('Lock up and set the alarm', 140)
) as t(title, ord)
where not exists (
  select 1 from task_templates where org_id = o.id and shift_type = 'close'
);
