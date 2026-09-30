/**
 * Creates a login for every employee who doesn't have one yet, so staff can
 * clock in on their own phones.
 *
 * Usage:  npm run staff-logins
 *
 * Emails are generated as firstname.lastname@<STAFF_EMAIL_DOMAIN> (default
 * holyweed.local). These don't need to be real inboxes — Supabase just uses
 * them as usernames, and the accounts are created pre-confirmed.
 *
 * Each person gets a random temporary password, printed once at the end.
 * Write them down and hand them out; they aren't stored anywhere retrievable.
 * Re-running the script only touches employees who still have no login.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

loadEnv({ path: ".env.local" });
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const DOMAIN = process.env.STAFF_EMAIL_DOMAIN || "holyweed.local";

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** "Ploy Suwannarat" -> "ploy.suwannarat" */
function slugName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
}

function tempPassword() {
  // 9 URL-safe chars — easy enough to read aloud, random enough to be safe
  // for a first login that the person should change afterwards.
  return randomBytes(7).toString("base64url");
}

async function main() {
  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("id, org_id, full_name, role_title")
    .order("full_name");
  if (empErr) throw empErr;

  const { data: existing, error: exErr } = await supabase
    .from("app_users")
    .select("employee_id")
    .not("employee_id", "is", null);
  if (exErr) throw exErr;

  const linked = new Set((existing ?? []).map((r) => r.employee_id));
  const todo = (employees ?? []).filter((e) => !linked.has(e.id));

  if (todo.length === 0) {
    console.log("Every employee already has a login. Nothing to do.");
    return;
  }

  console.log(`Creating logins for ${todo.length} employee(s)…\n`);
  const created: { name: string; email: string; password: string }[] = [];

  for (const emp of todo) {
    const email = `${slugName(emp.full_name)}@${DOMAIN}`;
    const password = tempPassword();

    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) {
      console.error(`  ✗ ${emp.full_name}: ${authErr.message}`);
      continue;
    }

    const { error: linkErr } = await supabase.from("app_users").insert({
      id: authUser.user.id,
      org_id: emp.org_id,
      full_name: emp.full_name,
      role: "staff",
      employee_id: emp.id,
    });

    if (linkErr) {
      // Roll back the orphaned auth user so a re-run can try again cleanly.
      await supabase.auth.admin.deleteUser(authUser.user.id);
      console.error(`  ✗ ${emp.full_name}: ${linkErr.message}`);
      continue;
    }

    console.log(`  ✓ ${emp.full_name} (${emp.role_title})`);
    created.push({ name: emp.full_name, email, password });
  }

  if (created.length === 0) return;

  console.log("\n" + "=".repeat(58));
  console.log("STAFF LOGINS — write these down now, they are not recoverable");
  console.log("=".repeat(58));
  for (const c of created) {
    console.log(`\n  ${c.name}`);
    console.log(`    email:    ${c.email}`);
    console.log(`    password: ${c.password}`);
  }
  console.log("\n" + "=".repeat(58));
  console.log("Staff sign in at /login on their phone and land on the clock screen.");
  console.log("Ask them to change their password after the first login.");
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
