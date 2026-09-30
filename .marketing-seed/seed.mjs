// One-off script: uploads the 4 starter marketing PDFs into the
// marketing-plans bucket and rows into marketing_documents. Safe to run
// more than once — it skips a file whose title already exists.
//
// Run AFTER migration 0018_marketing_documents.sql has been applied:
//   node .marketing-seed/seed.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL or service role key in .env.local");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: orgs, error: orgErr } = await admin.from("organizations").select("id").limit(1);
if (orgErr) throw orgErr;
if (!orgs?.length) throw new Error("No organization row found.");
const orgId = orgs[0].id;

const dir = new URL(".", import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));

for (const file of files) {
  const title = file.replace(/\.pdf$/i, "");

  const { data: existing } = await admin
    .from("marketing_documents")
    .select("id")
    .eq("org_id", orgId)
    .eq("title", title)
    .maybeSingle();
  if (existing) {
    console.log(`skip (already exists): ${title}`);
    continue;
  }

  const bytes = readFileSync(path.join(dir, file));
  const storagePath = `${orgId}/${randomUUID()}-${file.replace(/[^a-zA-Z0-9._-]/g, "-")}`;

  const { error: upErr } = await admin.storage
    .from("marketing-plans")
    .upload(storagePath, bytes, { contentType: "application/pdf" });
  if (upErr) {
    console.error(`upload failed for ${title}:`, upErr.message);
    continue;
  }

  const { error: insErr } = await admin
    .from("marketing_documents")
    .insert({ org_id: orgId, title, storage_path: storagePath });
  if (insErr) {
    console.error(`insert failed for ${title}:`, insErr.message);
    await admin.storage.from("marketing-plans").remove([storagePath]);
    continue;
  }

  console.log(`uploaded: ${title}`);
}
