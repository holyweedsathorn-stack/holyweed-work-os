"use server";

import { requireManager } from "@/lib/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ItemReportType } from "@/app/clock/received-item-actions";

const BUCKET = "received-items";
const SIGNED_URL_TTL = 60 * 10; // 10 minutes — plenty for opening a photo, short if leaked.

export type ReceivedItem = {
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
 * Every logged photo, newest first, with a fresh signed URL each — same
 * pattern as the marketing library. Covers both "received" and "low_stock"
 * types; the page groups these by date and tags each by type.
 */
export async function listReceivedItems(): Promise<ReceivedItem[] | { error: string }> {
  const guard = await requireManager("receivedItems.list");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();

  const [{ data: rows, error }, { data: branches }] = await Promise.all([
    admin
      .from("received_items")
      .select("id, type, employee_name, branch_id, note, storage_path, created_at, reply, reply_by_name, reply_at, resolved_at, resolved_by_name")
      .eq("org_id", guard.orgId)
      .order("created_at", { ascending: false })
      .limit(300),
    admin.from("branches").select("id, name").eq("org_id", guard.orgId),
  ]);

  if (error || !rows) return { error: error?.message ?? "Could not load received items." };

  const branchById = new Map((branches ?? []).map((b) => [b.id as string, b.name as string]));

  const items = await Promise.all(
    rows.map(async (row): Promise<ReceivedItem> => {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL);
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
