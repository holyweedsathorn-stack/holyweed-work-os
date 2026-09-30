import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. This BYPASSES Row Level Security and can
 * create/delete auth users, so it must only ever be used inside server
 * actions, and only after confirming the caller is an owner or manager
 * (see requireManager() in @/lib/guard, which also records every refusal).
 *
 * The key comes from SUPABASE_SERVICE_ROLE_KEY, which has no NEXT_PUBLIC_
 * prefix and therefore never reaches the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local and restart the dev server."
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
