import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkColumn(table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return error ? `MISSING (${error.message})` : "present";
}

console.log("app_users.is_maintenance:", await checkColumn("app_users", "is_maintenance"));
console.log("approvals.completed_at:", await checkColumn("approvals", "completed_at"));
console.log("approvals.completion_photo_path:", await checkColumn("approvals", "completion_photo_path"));
console.log("tasks.completion_photo_path:", await checkColumn("tasks", "completion_photo_path"));
console.log("manager_checklist_items table:", await checkColumn("manager_checklist_items", "id"));
console.log("received_items.type:", await checkColumn("received_items", "type"));
console.log("currency_transactions table:", await checkColumn("currency_transactions", "id"));

const { data: buckets, error: bErr } = await admin.storage.listBuckets();
console.log("buckets:", bErr ? bErr.message : buckets.map((b) => b.id).join(", "));

const { data: maint } = await admin.from("app_users").select("full_name, role, is_maintenance").eq("is_maintenance", true);
console.log("maintenance-flagged users:", JSON.stringify(maint));
