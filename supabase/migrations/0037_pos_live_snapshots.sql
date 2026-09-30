-- Live Silom POS numbers, refreshed by a Vercel Cron job every ~15 minutes
-- (src/app/api/cron/silom-sync/route.ts) since Silom has no API or webhook
-- to push this to us instead. Deliberately separate from `sales_daily`
-- (fed by the Import sales flow, one settled row per finished day) --
-- this table is intraday, keeps a short trail per branch, and the app only
-- ever reads the latest row per branch off it. Nothing here overwrites or
-- feeds into the historical reporting tables.
create table if not exists pos_live_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,

  source text not null default 'silom',
  captured_at timestamptz not null default now(),

  sales numeric(12, 2),
  profit numeric(12, 2),
  discount numeric(12, 2),
  bill_count integer,
  avg_bill numeric(12, 2),
  grand_total numeric(12, 2),

  created_at timestamptz not null default now()
);

-- "latest snapshot per branch" is the only query the dashboard ever runs.
create index if not exists pos_live_snapshots_branch_idx
  on pos_live_snapshots (branch_id, captured_at desc);

alter table pos_live_snapshots enable row level security;

-- Same pattern as `refusals`: managers/staff read through RLS, but nothing
-- writes through it. The cron route uses the service-role admin client,
-- which bypasses RLS entirely, so there is deliberately no insert policy.
drop policy if exists "org members read live sales" on pos_live_snapshots;
create policy "org members read live sales" on pos_live_snapshots for select
  using (org_id in (select org_id from app_users where app_users.id = auth.uid()));

-- This only grows, ~4/hour/branch. Keep 14 days -- plenty for "what's
-- happening today", nothing here is meant as a historical record.
-- Run this from the monthly close, or schedule it with pg_cron if you want
-- it automatic:
--   delete from pos_live_snapshots where captured_at < now() - interval '14 days';
