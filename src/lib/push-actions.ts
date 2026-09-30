"use server";

import { createClient } from "@/lib/supabase/server";

export type PushResult = { ok: true } | { ok: false; error: string };

type SubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * Save (or refresh) a push subscription for the signed-in person — staff,
 * manager or owner, anyone with an app_users row.
 *
 * Written with the USER client, not the admin client: the "manage own push
 * subscription" RLS policy is what allows this, the same shape as
 * clockIn() and raiseRequest(). Upserted on `endpoint`, since re-subscribing
 * on the same device (e.g. after clearing permission) reuses the same one.
 */
export async function savePushSubscription(sub: SubscriptionInput): Promise<PushResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, error: "That subscription looks incomplete." };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      app_user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: null,
    },
    { onConflict: "endpoint" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Drop a subscription — called when the browser tells us it's gone stale. */
export async function removePushSubscription(endpoint: string): Promise<PushResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("app_user_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
