"use server";

import { revalidatePath } from "next/cache";
import { requireEmployee, requireEmployeeOrManager } from "@/lib/guard";
import { resolveWorkingBranch } from "@/lib/working-branch";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyManagers } from "@/lib/notify";

const BUCKET = "received-items";

export type ItemReportType = "received" | "low_stock";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Staff log a photo during their shift — either something that arrived (a
 * delivery, stock, a package) or something running low that needs
 * reordering. Same log, same bucket, same write path — only `type` differs.
 * Pure record-keeping: no approval step, it just lands in the log for
 * managers to browse. Goes through the admin client after a
 * requireEmployee() check, same pattern as the marketing library and the
 * maintenance flow, rather than a staff-write RLS policy — simpler to get
 * right for a private Storage upload.
 */
export async function logReceivedItem(formData: FormData): Promise<Result> {
  const guard = await requireEmployee("clock.logReceivedItem");
  if (!guard.ok) return { ok: false, error: guard.error };

  const rawType = String(formData.get("type") || "received");
  const type: ItemReportType = rawType === "low_stock" ? "low_stock" : "received";

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: "Please attach a photo." };
  }
  if (!photo.type.startsWith("image/")) {
    return { ok: false, error: "Only photos are supported." };
  }
  if (photo.size > 10 * 1024 * 1024) {
    return { ok: false, error: "That photo is too big (10MB max)." };
  }

  const note = String(formData.get("note") || "").trim().slice(0, 300) || null;

  const extMatch = photo.name.match(/\.[a-zA-Z0-9]+$/);
  const ext = (extMatch?.[0] || ".jpg").toLowerCase();
  const storagePath = `${guard.orgId}/${guard.employeeId}/${crypto.randomUUID()}${ext}`;

  const admin = createAdminClient();
  const branchId = await resolveWorkingBranch(guard.employeeId, guard.branchId);
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, photo, { contentType: photo.type || "image/jpeg" });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { error: insertError } = await admin.from("received_items").insert({
    org_id: guard.orgId,
    branch_id: branchId,
    employee_id: guard.employeeId,
    employee_name: guard.fullName,
    note,
    storage_path: storagePath,
    type,
  });

  if (insertError) {
    // Don't leave an orphaned photo behind if the row failed to write.
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: insertError.message };
  }

  // Fire-and-forget, same as raiseRequest() — a broken push must never turn
  // a successful log into a failed one.
  void notifyManagers({
    orgId: guard.orgId,
    kind: "item_received",
    title:
      type === "low_stock"
        ? `${guard.fullName} flagged low stock`
        : `${guard.fullName} logged a received item`,
    body: note ?? "Photo attached, no note.",
    link: "/received-items",
  });

  revalidatePath("/clock");
  return { ok: true };
}

const LIST_BUCKET = "received-items";
const LIST_SIGNED_URL_TTL = 60 * 10;

/**
 * Reply to a logged item -- most often a manager answering a low-stock
 * flag ("used the other strain instead"), so the staff member who logged
 * it (and anyone else) can see the answer right on the log, no separate
 * message needed. Any signed-in staff member or manager can post one
 * (requireEmployeeOrManager), and posting again replaces the previous
 * reply rather than threading -- one answer per entry, same as the
 * hostel stay notes.
 */
export async function replyToReceivedItem(itemId: string, reply: string): Promise<Result> {
  const guard = await requireEmployeeOrManager("receivedItems.reply");
  if (!guard.ok) return { ok: false, error: guard.error };

  const trimmed = reply.trim().slice(0, 500);

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("received_items")
    .select("id")
    .eq("id", itemId)
    .eq("org_id", guard.orgId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Log entry not found." };

  const { error } = await admin
    .from("received_items")
    .update({
      reply: trimmed || null,
      reply_by_name: trimmed ? guard.actorName : null,
      reply_at: trimmed ? new Date().toISOString() : null,
    })
    .eq("id", itemId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clock");
  revalidatePath("/received-items");
  return { ok: true };
}

/**
 * Mark a low-stock flag (or any logged item) as actually handled -- the
 * replacement strain went out, the reorder landed -- separate from the
 * reply text, which just answers the flag. Toggles: calling it again on an
 * already-resolved item un-marks it, for the "wait, not yet" correction.
 */
export async function toggleReceivedItemResolved(itemId: string): Promise<Result> {
  const guard = await requireEmployeeOrManager("receivedItems.toggleResolved");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("received_items")
    .select("id, resolved_at")
    .eq("id", itemId)
    .eq("org_id", guard.orgId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Log entry not found." };

  const nowResolved = !item.resolved_at;

  const { error } = await admin
    .from("received_items")
    .update({
      resolved_at: nowResolved ? new Date().toISOString() : null,
      resolved_by_name: nowResolved ? guard.actorName : null,
    })
    .eq("id", itemId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clock");
  revalidatePath("/received-items");
  return { ok: true };
}

export type StaffReceivedItem = {
  id: string;
  type: ItemReportType;
  employeeName: string;
  branchName: string;
  note: string | null;
  createdAt: string;
  photoUrl: string | null;
  reply: string | null;
  replyByName: string | null;
  replyAt: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
};

/**
 * The full received/low-stock log across EVERY branch, for any signed-in
 * staff member (requireEmployee, not requireManager). Used to be scoped to
 * whichever branch the viewer is currently resolved to, which meant an
 * item logged at Sathorn yesterday could silently vanish from someone's
 * feed today if their session resolved to a different branch in the
 * meantime -- staff asked to just see everything, so each row carries its
 * own branch name instead of the list being filtered by one.
 */
export async function listReceivedItemsForStaff(): Promise<StaffReceivedItem[] | { error: string }> {
  const guard = await requireEmployee("clock.listReceivedItems");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();

  const [{ data: rows, error }, { data: branches }] = await Promise.all([
    admin
      .from("received_items")
      .select("id, type, employee_name, branch_id, note, storage_path, created_at, reply, reply_by_name, reply_at, resolved_at, resolved_by_name")
      .eq("org_id", guard.orgId)
      .order("created_at", { ascending: false })
      .limit(150),
    admin.from("branches").select("id, name").eq("org_id", guard.orgId),
  ]);

  if (error || !rows) return { error: error?.message ?? "Could not load the received items log." };

  const branchById = new Map((branches ?? []).map((b) => [b.id as string, b.name as string]));

  const items = await Promise.all(
    rows.map(async (row): Promise<StaffReceivedItem> => {
      const { data: signed } = await admin.storage
        .from(LIST_BUCKET)
        .createSignedUrl(row.storage_path as string, LIST_SIGNED_URL_TTL);
      return {
        id: row.id as string,
        type: (row.type as ItemReportType) ?? "received",
        employeeName: row.employee_name as string,
        branchName: branchById.get(row.branch_id as string) ?? "—",
        note: row.note as string | null,
        createdAt: row.created_at as string,
        photoUrl: signed?.signedUrl ?? null,
        reply: row.reply as string | null,
        replyByName: row.reply_by_name as string | null,
        replyAt: row.reply_at as string | null,
        resolvedAt: row.resolved_at as string | null,
        resolvedByName: row.resolved_by_name as string | null,
      };
    })
  );

  return items;
}
