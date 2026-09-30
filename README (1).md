# Holyweed Work OS

A real, working Work OS for Holyweed Group: employer visibility into what
employees are doing, weekly schedules, a per-branch shop dashboard (sales,
profit, expenses), and a projects board — built on Next.js + Supabase
(Postgres + Auth), replacing the earlier click-through prototype with a
real database and login.

This is **phase 1** of 3:

1. ✅ Real app — auth, database, this codebase.
2. ✅ Tech stack — Next.js (App Router) + Supabase (Postgres/Auth), Tailwind CSS.
3. ⏭️ Next — wire up real data sources (POS/sales, staff clock-in, accounting/expenses) in place of the seeded demo data, one integration at a time.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), create a free project (any region close to Bangkok, e.g. Singapore).
2. In **Project Settings → API**, copy the **Project URL**, **anon public** key, and **service_role secret** key.
3. In the SQL editor, paste and run everything in `supabase/migrations/0001_init.sql`. This creates all tables, and Row Level Security policies that scope every table to your organization — a logged-in user can only ever see Holyweed's own data.

## 2. Configure the app

```bash
cp .env.example .env.local
# then fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and SUPABASE_SERVICE_ROLE_KEY from step 1
```

## 3. Install, seed, run

```bash
npm install
npm run seed   # creates the org, branches, owner login, and demo data
npm run dev    # http://localhost:3000
```

The seed script prints the owner login it created (defaults to
`owner@holyweed.co` / `holyweed-demo-2026` — override with `SEED_OWNER_EMAIL`
/ `SEED_OWNER_PASSWORD` in `.env.local`, or just change the password after
your first login via the Supabase dashboard → Authentication).

## What's real vs. seeded

Auth, the database, and Row Level Security are all real — this is a genuine
multi-user app, not a mock. The **data** (employees, sales, shifts, expenses,
projects) is seeded to match the earlier prototype so the app is immediately
useful to look at. Replacing that seeded data with your real numbers is
phase 3: point `sales_daily` at your POS export, `employees`/`activity_log`
at a clock-in system, and `expenses`/`monthly_finance` at your accounting
tool — each can be wired in independently.

## Adding more logins

Only the owner account is created by the seed script. To add a manager
login: create the user in Supabase → Authentication → Users, then insert a
matching row into `app_users` with their `id`, your `org_id`, `full_name`,
and `role` = `'manager'`.

## Project structure

```
src/app/(app)/        the 5 authenticated views (dashboard/team/schedule/shop/projects)
src/app/login/        sign-in page + server actions
src/components/       Sidebar, Topbar, charts, cards — shared UI
src/lib/supabase/     browser / server / middleware Supabase clients
supabase/migrations/  SQL schema + Row Level Security policies
scripts/seed.ts       demo data loader (uses the service role key)
```

## Deploying

Once you're happy with it locally: push this repo to GitHub, import it into
[Vercel](https://vercel.com), and add the same three environment variables
from `.env.local` in the Vercel project settings. No code changes needed.
