"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/guard";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "marketing-plans";
const SIGNED_URL_TTL = 60 * 10; // 10 minutes — plenty for opening a tab, short if leaked.

export type MarketingDoc = {
  id: string;
  title: string;
  createdAt: string;
  url: string | null; // null if the signed URL failed to generate — still listed, just not openable
};

export type MarketingResult = { ok: true } | { ok: false; error: string };

/**
 * List the org's marketing plans with a fresh signed URL each.
 *
 * Always goes through the admin client: the bucket is private, and a
 * signed URL from the admin client works regardless of RLS, so this is the
 * one place that actually has to prove the caller is a manager in code.
 */
export async function listMarketingDocuments(): Promise<MarketingDoc[] | { error: string }> {
  const guard = await requireManager("marketing.list");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("marketing_documents")
    .select("id, title, storage_path, created_at")
    .eq("org_id", guard.orgId)
    .order("created_at", { ascending: false });

  if (error || !rows) return { error: error?.message ?? "Could not load the marketing plans." };

  const docs = await Promise.all(
    rows.map(async (row): Promise<MarketingDoc> => {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL);
      return {
        id: row.id as string,
        title: row.title as string,
        createdAt: row.created_at as string,
        url: signed?.signedUrl ?? null,
      };
    })
  );

  return docs;
}

/** Upload a new marketing plan PDF. */
export async function uploadMarketingDocument(formData: FormData): Promise<MarketingResult> {
  const guard = await requireManager(
    "marketing.upload",
    "Only owners and managers can upload marketing plans."
  );
  if (!guard.ok) return { ok: false, error: guard.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose a PDF to upload." };
  }
  if (file.type !== "application/pdf") {
    return { ok: false, error: "Only PDF files are supported." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, error: "That file is too big (20MB max)." };
  }

  const title =
    String(formData.get("title") || "").trim().slice(0, 120) ||
    file.name.replace(/\.pdf$/i, "").slice(0, 120);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
  const storagePath = `${guard.orgId}/${crypto.randomUUID()}-${safeName}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: "application/pdf" });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { error: insertError } = await admin.from("marketing_documents").insert({
    org_id: guard.orgId,
    title,
    storage_path: storagePath,
    uploaded_by: guard.userId,
  });

  if (insertError) {
    // Don't leave an orphaned file behind if the row failed to write.
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: insertError.message };
  }

  revalidatePath("/marketing");
  return { ok: true };
}

/** Remove a marketing plan — both the row and the underlying file. */
export async function deleteMarketingDocument(id: string): Promise<MarketingResult> {
  const guard = await requireManager(
    "marketing.delete",
    "Only owners and managers can remove marketing plans."
  );
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: row, error: fetchError } = await admin
    .from("marketing_documents")
    .select("storage_path")
    .eq("id", id)
    .eq("org_id", guard.orgId)
    .single();

  if (fetchError || !row) return { ok: false, error: "Could not find that plan." };

  await admin.storage.from(BUCKET).remove([row.storage_path as string]);

  const { error: deleteError } = await admin
    .from("marketing_documents")
    .delete()
    .eq("id", id)
    .eq("org_id", guard.orgId);

  if (deleteError) return { ok: false, error: deleteError.message };

  revalidatePath("/marketing");
  return { ok: true };
}
