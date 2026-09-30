-- Manager checklist: a first-time-manager's recurring routine across all of
-- Holy Group, combining leadership habits with per-business daily/weekly/
-- monthly operational checks. Completion is scoped to a period_key so items
-- reset automatically (a new day/week/month has no completion row yet)
-- while history is preserved.

create table if not exists manager_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  business text not null check (business in ('leadership', 'holyweed', 'bistro', 'hostel')),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  title text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists manager_checklist_items_org_idx
  on manager_checklist_items (org_id, business, frequency, sort_order);

alter table manager_checklist_items enable row level security;

drop policy if exists "managers read checklist items" on manager_checklist_items;
create policy "managers read checklist items" on manager_checklist_items for select
  using (
    org_id in (
      select org_id from app_users
      where app_users.id = auth.uid() and app_users.role in ('owner', 'manager')
    )
  );

create table if not exists manager_checklist_completions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  item_id uuid not null references manager_checklist_items (id) on delete cascade,
  period_key text not null,
  completed_by uuid references app_users (id) on delete set null,
  completed_at timestamptz not null default now(),
  unique (item_id, period_key)
);

create index if not exists manager_checklist_completions_lookup_idx
  on manager_checklist_completions (org_id, period_key);

alter table manager_checklist_completions enable row level security;

drop policy if exists "managers read checklist completions" on manager_checklist_completions;
create policy "managers read checklist completions" on manager_checklist_completions for select
  using (
    org_id in (
      select org_id from app_users
      where app_users.id = auth.uid() and app_users.role in ('owner', 'manager')
    )
  );

insert into manager_checklist_items (org_id, business, frequency, title, sort_order)
select o.id, t.business, t.frequency, t.title, t.sort_order
from organizations o
cross join (values
  ('leadership', 'daily', 'Clear overnight notifications & pending approvals', 1),
  ('leadership', 'daily', 'Quick check-in (in person, call, or camera) with all 3 locations', 2),
  ('leadership', 'daily', 'Glance at yesterday''s sales & attendance on the dashboard', 3),
  ('holyweed', 'daily', 'Confirm opening: staff clocked in, till float counted', 1),
  ('holyweed', 'daily', 'Check stock levels & flag anything low for reorder', 2),
  ('holyweed', 'daily', 'Compliance spot-check: license posted, staff ID badges, lab-test certs accessible', 3),
  ('holyweed', 'daily', 'Closing: cash reconciliation done, store locked & alarmed', 4),
  ('bistro', 'daily', 'Confirm opening prep: stock checked, walk-in temps logged, POS working', 1),
  ('bistro', 'daily', 'Brief staff on specials / 86''d items before service', 2),
  ('bistro', 'daily', 'Mid-shift check: dine-in + Grab/LINE MAN orders flowing smoothly', 3),
  ('bistro', 'daily', 'Closing: cash reconciliation, cleaning checklist signed off', 4),
  ('hostel', 'daily', 'All check-ins/check-outs handled, rooms turned over on time', 1),
  ('hostel', 'daily', 'Walk common areas & rooftop for cleanliness/safety', 2),
  ('hostel', 'daily', 'Guest requests or issues from today logged and resolved', 3),
  ('leadership', 'weekly', 'Review each business''s dashboard for the week (sales trend, labor cost)', 1),
  ('leadership', 'weekly', 'Give at least one specific piece of positive feedback to a staff member', 2),
  ('leadership', 'weekly', 'Check in with a shift lead/supervisor at each location', 3),
  ('leadership', 'weekly', 'Review the approvals & refusal log for recurring problems', 4),
  ('leadership', 'weekly', 'Confirm next week''s shift schedule is published for all 3 businesses', 5),
  ('holyweed', 'weekly', 'Review restock needs and place orders', 1),
  ('bistro', 'weekly', 'Review delivery-platform ratings & respond to reviews', 1),
  ('hostel', 'weekly', 'Review OTA listings & ratings across booking platforms', 1),
  ('leadership', 'monthly', 'Review the profit dashboard (sales, expenses, margin) per business', 1),
  ('leadership', 'monthly', 'Full inventory/stock audit at each business', 2),
  ('leadership', 'monthly', 'Team meeting — share wins, address recurring issues', 3),
  ('leadership', 'monthly', 'Compliance check: Holyweed licensing, Bistro food safety, Hostel listings', 4),
  ('leadership', 'monthly', 'Review progress on the 90-day marketing execution schedule', 5)
) as t(business, frequency, title, sort_order)
where not exists (
  select 1 from manager_checklist_items existing where existing.org_id = o.id
);
