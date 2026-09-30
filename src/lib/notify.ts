import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidContact = process.env.VAPID_CONTACT_EMAIL;

if (vapidPublicKey && vapidPrivateKey && vapidContact) {
  webpush.setVapidDetails(vapidContact, vapidPublicKey, vapidPrivateKey);
}

export type NotificationKind =
  | "shift_reminder"
  | "clock_out_reminder"
  | "task_assigned"
  | "approval_raised"
  | "approval_decided"
  | "announcement"
  | "maintenance_assigned"
  | "item_received"
  | "hostel_checkin"
  | "chat_mention";

/**
 * Log a notification and push it to every device the recipient has
 * subscribed from.
 *
 * Modeled on logRefusal() in @/lib/guard: this NEVER throws. A failed or
 * misconfigured push must not take down the approval / task-assignment /
 * clock action that triggered it — the row still lands in `notifications`
 * (so there's an in-app record) even if the push itself fails or VAPID
 * keys are not set yet.
 *
 * `dedupeKey` is for cron-driven reminders that must only ever fire once
 * per shift/entry (e.g. "shift:<id>:start") — pass null for one-off
 * event-triggered kinds (a task assignment, an approval request), which
 * always send.
 */
export async function notify(input: {
  orgId: string;
  recipientAppUserId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string;
  dedupeKey?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: row, error } = await admin
      .from("notifications")
      .insert({
        org_id: input.orgId,
        recipient_app_user_id: input.recipientAppUserId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        dedupe_key: input.dedupeKey ?? null,
      })
      .select("id")
      .single();

    // 23505 on notifications_dedupe = already sent this reminder. Fine, skip.
    if (error || !row) return;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidContact) {
      // Keys not configured yet — the notification is logged (visible in an
      // eventual in-app bell) but nothing is pushed. Not an error.
      return;
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("app_user_id", input.recipientAppUserId);

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
          },
          JSON.stringify({ title: input.title, body: input.body, link: input.link ?? "/" })
        );
        await admin.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", row.id);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is dead (uninstalled, permission revoked, etc). Prune it.
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          await admin
            .from("notifications")
            .update({ push_error: String(err) })
            .eq("id", row.id);
        }
      }
    }
  } catch {
    // Swallowed on purpose, same reasoning as logRefusal(): a broken
    // notification pipeline must never break the action that called it.
  }
}

/** Notify every owner/manager in an org — the approval-raised use case. */
export async function notifyManagers(input: {
  orgId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: managers } = await admin
    .from("app_users")
    .select("id")
    .eq("org_id", input.orgId)
    .in("role", ["owner", "manager"]);

  await Promise.all(
    (managers ?? []).map((m) =>
      notify({
        orgId: input.orgId,
        recipientAppUserId: m.id as string,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link,
      })
    )
  );
}

/**
 * Announcement broadcast — everyone with a login in the org, staff and
 * managers alike. Unlike notifyManagers(), this is not tied to one kind of
 * event; it's the "tell everybody" button.
 */
export async function notifyEveryone(input: {
  orgId: string;
  title: string;
  body: string;
  link?: string;
}): Promise<{ sent: number }> {
  const admin = createAdminClient();
  const { data: everyone } = await admin
    .from("app_users")
    .select("id")
    .eq("org_id", input.orgId);

  const recipients = everyone ?? [];
  await Promise.all(
    recipients.map((u) =>
      notify({
        orgId: input.orgId,
        recipientAppUserId: u.id as string,
        kind: "announcement",
        title: input.title,
        body: input.body,
        link: input.link,
      })
    )
  );
  return { sent: recipients.length };
}

/**
 * Notify the maintenance team (app_users flagged is_maintenance) — used once
 * a manager approves a 'maintenance' kind request, not when it's first
 * raised (managers already get that via notifyManagers/approval_raised).
 */
export async function notifyMaintenanceTeam(input: {
  orgId: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: team } = await admin
    .from("app_users")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("is_maintenance", true);

  await Promise.all(
    (team ?? []).map((m) =>
      notify({
        orgId: input.orgId,
        recipientAppUserId: m.id as string,
        kind: "maintenance_assigned",
        title: input.title,
        body: input.body,
        link: input.link,
      })
    )
  );
}
