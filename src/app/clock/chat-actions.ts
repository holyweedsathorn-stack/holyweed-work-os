"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEmployee, requireManager } from "@/lib/guard";
import { notify } from "@/lib/notify";

export type ChatMessage = {
  id: string;
  authorName: string;
  body: string;
  branchName: string | null; // null = wasn't clocked in when they sent it ("Off shift")
  createdAt: string;
  seenBy: string[]; // names of other people who have opened the thread since this landed
  seenByMe: boolean; // has the CURRENT viewer opened the thread since this landed
};

type ListResult = { ok: true; items: ChatMessage[] } | { ok: false; error: string };
type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Who's posting, plus enough to stamp a message: an org id and display
 * name always, an employee id only on the staff path (a pure owner/manager
 * account has none) -- same fallback requireEmployeeOrManager() uses, but
 * kept local here because sendChatMessage() also needs the employee id to
 * look up the sender's open shift, and the app_user id to skip notifying
 * someone who @mentions themselves.
 */
async function actor(): Promise<
  | { ok: true; orgId: string; appUserId: string; employeeId: string | null; actorName: string }
  | { ok: false; error: string }
> {
  // Silent: same reasoning as requireEmployeeOrManager() in guard.ts --
  // this is a probe, not the final word, and a manager account fails it
  // on every single call. requireManager() below logs the real refusal
  // if that also fails.
  const staff = await requireEmployee("chat.actor", { silent: true });
  if (staff.ok) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return {
      ok: true,
      orgId: staff.orgId,
      appUserId: user?.id ?? "",
      employeeId: staff.employeeId,
      actorName: staff.fullName,
    };
  }

  const manager = await requireManager("chat.actor");
  if (manager.ok) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: me } = await supabase
      .from("app_users")
      .select("full_name, employee_id")
      .eq("id", user?.id ?? "")
      .maybeSingle();
    return {
      ok: true,
      orgId: manager.orgId,
      appUserId: user?.id ?? "",
      employeeId: (me?.employee_id as string) ?? null,
      actorName: (me?.full_name as string) ?? "Manager",
    };
  }

  return { ok: false, error: staff.error };
}

/**
 * The whole team in one thread, no branch split -- unlike the received-
 * items and currency logs, a message from Sathorn is exactly the kind of
 * thing a Sukhumvit manager (or someone working both, like Naing) needs to
 * see too. Both staff and managers post and read here.
 */
export async function listChatMessages(): Promise<ListResult> {
  const me = await actor();
  if (!me.ok) return { ok: false, error: me.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_messages")
    .select("id, author_name, body, created_at, branch:branches(name)")
    .eq("org_id", me.orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: error.message };

  const rows = data ?? [];
  const ids = rows.map((m: any) => m.id as string);

  // Who has actually opened the thread since each message landed. Matched
  // to the message author by name (chat_messages has no author app_user
  // id, same as received_items.reply_by_name) so a sender never sees
  // themselves in their own "seen by" list.
  const seenByMessage = new Map<string, Set<string>>();
  const seenByMeSet = new Set<string>();
  if (ids.length > 0) {
    const { data: reads } = await admin
      .from("chat_message_reads")
      .select("message_id, app_user_id, reader:app_users(full_name)")
      .in("message_id", ids);
    for (const r of reads ?? []) {
      const messageId = (r as any).message_id as string;
      if ((r as any).app_user_id === me.appUserId) seenByMeSet.add(messageId);
      const name = (r as any).reader?.full_name as string | undefined;
      if (!name) continue;
      const set = seenByMessage.get(messageId) ?? new Set<string>();
      set.add(name);
      seenByMessage.set(messageId, set);
    }
  }

  const items: ChatMessage[] = rows
    .map((m: any) => {
      const seen = Array.from(seenByMessage.get(m.id) ?? []).filter((name) => name !== m.author_name);
      return {
        id: m.id,
        authorName: m.author_name,
        body: m.body,
        branchName: (m.branch?.name as string) ?? null,
        createdAt: m.created_at,
        seenBy: seen.sort(),
        // The sender obviously doesn't need to "read" their own message.
        seenByMe: m.author_name === me.actorName || seenByMeSet.has(m.id),
      };
    })
    .reverse(); // oldest first, so the thread reads top-to-bottom like a chat

  return { ok: true, items };
}

/**
 * Mark messages as seen by the caller -- called whenever the widget is
 * open and has a message on screen. Upserted with ignoreDuplicates so
 * re-marking an already-seen message on every poll is a cheap no-op, not
 * a growing table of redundant rows.
 */
export async function markChatSeen(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  const me = await actor();
  if (!me.ok) return;

  const admin = createAdminClient();
  await admin
    .from("chat_message_reads")
    .upsert(
      messageIds.map((id) => ({ message_id: id, app_user_id: me.appUserId })),
      { onConflict: "message_id,app_user_id", ignoreDuplicates: true }
    );
}

/** Names to power the @mention picker -- everyone signed in at this org. */
export async function listChatTeamNames(): Promise<string[]> {
  const me = await actor();
  if (!me.ok) return [];

  const admin = createAdminClient();
  const { data } = await admin.from("app_users").select("full_name").eq("org_id", me.orgId);

  return Array.from(new Set((data ?? []).map((r: any) => r.full_name as string).filter(Boolean))).sort();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function sendChatMessage(body: string): Promise<SendResult> {
  const me = await actor();
  if (!me.ok) return { ok: false, error: me.error };

  const trimmed = body.trim().slice(0, 1000);
  if (!trimmed) return { ok: false, error: "Type something first." };

  const admin = createAdminClient();

  // Snapshot which branch (if any) the sender was clocked in at right now
  // -- this is a historical log entry, not a live status, so it's captured
  // once at send time rather than recomputed whenever the thread is read.
  let branchId: string | null = null;
  if (me.employeeId) {
    const { data: open } = await admin
      .from("time_entries")
      .select("branch_id")
      .eq("employee_id", me.employeeId)
      .is("clock_out", null)
      .maybeSingle();
    branchId = (open?.branch_id as string) ?? null;
  }

  const { error } = await admin.from("chat_messages").insert({
    org_id: me.orgId,
    branch_id: branchId,
    author_name: me.actorName,
    body: trimmed,
  });

  if (error) return { ok: false, error: error.message };

  // @mentions push a notification to the person named, same pipeline as a
  // task assignment or an approval. Longest names are matched first so
  // "@Naing" doesn't get chopped off by a shorter name that's a prefix of it.
  const { data: people } = await admin
    .from("app_users")
    .select("id, full_name")
    .eq("org_id", me.orgId)
    .neq("id", me.appUserId);

  const named = (people ?? []).filter((p: any) => p.full_name) as { id: string; full_name: string }[];
  if (named.length > 0) {
    const byLengthDesc = [...named].sort((a, b) => b.full_name.length - a.full_name.length);
    const pattern = byLengthDesc.map((p) => escapeRegExp(p.full_name)).join("|");
    const re = new RegExp(`@(${pattern})(?![A-Za-z0-9])`, "gi");
    const mentioned = new Set<string>();
    for (const match of trimmed.matchAll(re)) {
      const hit = named.find((p) => p.full_name.toLowerCase() === match[1].toLowerCase());
      if (hit) mentioned.add(hit.id);
    }

    await Promise.all(
      Array.from(mentioned).map((appUserId) =>
        notify({
          orgId: me.orgId,
          recipientAppUserId: appUserId,
          kind: "chat_mention",
          title: `${me.actorName} mentioned you`,
          body: trimmed.slice(0, 140),
        })
      )
    );
  }

  revalidatePath("/clock");
  return { ok: true };
}
