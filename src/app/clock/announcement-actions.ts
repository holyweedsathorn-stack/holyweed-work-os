"use server";

import { requireManager } from "@/lib/guard";
import { notifyEveryone } from "@/lib/notify";

export type AnnouncementResult = { ok: true; sent: number } | { ok: false; error: string };

/**
 * Send a push to every signed-in person in the org — staff, managers and
 * the owner. Owner/manager only, same gate as everything else that reaches
 * more than one person at once.
 *
 * No history list of past announcements yet (that's the same "later, free
 * byproduct" in-app bell as the rest of the notifications work) — this is
 * fire-and-forget, same as the other notify() call sites.
 */
export async function sendAnnouncement(formData: FormData): Promise<AnnouncementResult> {
  const guard = await requireManager("announcements.send", "Only owners and managers can send an announcement.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const title = String(formData.get("title") || "").trim().slice(0, 120);
  const body = String(formData.get("body") || "").trim().slice(0, 500);

  if (!title) return { ok: false, error: "Please give it a short title." };
  if (!body) return { ok: false, error: "Please write the message." };

  const { sent } = await notifyEveryone({
    orgId: guard.orgId,
    title,
    body,
    link: "/clock",
  });

  return { ok: true, sent };
}
