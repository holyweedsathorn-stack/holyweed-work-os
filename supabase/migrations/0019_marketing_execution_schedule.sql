-- 90-day marketing execution schedule as an actual in-app checklist, so
-- managers follow it inside the Work OS instead of a separate Claude doc.
-- Seeded once per org from the plan's own rollout sections; re-running this
-- migration is a no-op for any org that already has rows here.

create table if not exists marketing_schedule_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  business text not null check (business in ('shared', 'holyweed', 'bistro', 'hostel')),
  phase text not null check (phase in ('days_1_30', 'days_31_60', 'days_61_90')),
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists marketing_schedule_tasks_org_idx
  on marketing_schedule_tasks (org_id, business, phase, sort_order);

alter table marketing_schedule_tasks enable row level security;

drop policy if exists "managers read schedule tasks" on marketing_schedule_tasks;
create policy "managers read schedule tasks" on marketing_schedule_tasks for select
  using (
    org_id in (
      select org_id from app_users
      where app_users.id = auth.uid() and app_users.role in ('owner', 'manager')
    )
  );

insert into marketing_schedule_tasks (org_id, business, phase, title, sort_order, done, done_at)
select o.id, t.business, t.phase, t.title, t.sort_order, t.done,
       case when t.done then now() else null end
from organizations o
cross join (values
  ('shared', 'days_1_30', 'Compliant framing set (Holyweed stays legitimacy-only — this prototype''s working assumption, not a lawyer''s sign-off)', 1, true),
  ('shared', 'days_1_30', 'Pick the shared loyalty/CRM platform all three will use', 2, false),
  ('shared', 'days_31_60', 'Shared QR/LINE loyalty account live across all three', 1, false),
  ('shared', 'days_61_90', 'First cross-business KPI review', 1, false),

  ('holyweed', 'days_1_30', 'Compliance audit — practitioner coverage, storage, PT 33 record-keeping vs April 2026 rules', 1, false),
  ('holyweed', 'days_1_30', 'Replace "buy 3g get 2g free" with milestone loyalty (perk at visit 5, bigger at visit 10)', 2, false),
  ('holyweed', 'days_1_30', 'Agree cross-referral scripts with hostel/bistro staff', 3, false),
  ('holyweed', 'days_31_60', 'Join the shared QR/LINE loyalty account', 1, false),
  ('holyweed', 'days_31_60', 'Begin a consistent, non-incentivized review ask; reply to every review', 2, false),
  ('holyweed', 'days_61_90', 'Publish compliant educational content (PT 33 consultation, first-visit expectations, licensing changes)', 1, false),
  ('holyweed', 'days_61_90', 'Pair a milestone reward with a bistro/hostel perk', 2, false),
  ('holyweed', 'days_61_90', 'First KPI review: repeat-customer rate, average basket value, cross-referral rate, review velocity & rating', 3, false),

  ('bistro', 'days_1_30', 'Launch the food + drink bundle menu at a clear price', 1, false),
  ('bistro', 'days_1_30', 'Agree cross-referral handoff scripts with hostel and dispensary staff', 2, false),
  ('bistro', 'days_1_30', 'Get the Google Business Profile live', 3, false),
  ('bistro', 'days_1_30', 'Start a consistent, non-incentivized review ask', 4, false),
  ('bistro', 'days_1_30', 'Start posting from the content calendar', 5, false),
  ('bistro', 'days_31_60', 'Launch the signature recurring weekly night', 1, false),
  ('bistro', 'days_31_60', 'Publish the group/private-event booking package', 2, false),
  ('bistro', 'days_31_60', 'Join the shared QR/LINE loyalty account', 3, false),
  ('bistro', 'days_61_90', 'Add a premium event-night menu tier', 1, false),
  ('bistro', 'days_61_90', 'Pair a loyalty milestone with a rooftop/dispensary-adjacent perk', 2, false),
  ('bistro', 'days_61_90', 'First KPI review: average check per table, weekday vs weekend split, cross-referral rate, group/private booking count, review velocity & rating, repeat-guest rate', 3, false),

  ('hostel', 'days_1_30', 'OTA listing audit across Booking.com, Agoda, Airbnb, Trip.com, Hostelworld, Expedia', 1, false),
  ('hostel', 'days_1_30', 'Consolidate Agoda''s duplicate listings', 2, false),
  ('hostel', 'days_1_30', 'Launch the direct-booking incentive', 3, false),
  ('hostel', 'days_1_30', 'Agree the welcome-desk script', 4, false),
  ('hostel', 'days_31_60', 'Train the dorm to private to penthouse upsell path live', 1, false),
  ('hostel', 'days_31_60', 'Join the shared QR/LINE loyalty account', 2, false),
  ('hostel', 'days_31_60', 'Start a consistent post-checkout review request', 3, false),
  ('hostel', 'days_61_90', 'Launch the penthouse night package', 1, false),
  ('hostel', 'days_61_90', 'Repeat-guest outreach to lapsed direct bookers', 2, false),
  ('hostel', 'days_61_90', 'First KPI review: direct-booking share, occupancy rate by room type, ADR, RevPAR, cross-referral rate, review velocity & rating', 3, false)
) as t(business, phase, title, sort_order, done)
where not exists (
  select 1 from marketing_schedule_tasks existing where existing.org_id = o.id
);
