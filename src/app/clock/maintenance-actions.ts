"use server";

import { revalidatePath } from "next/cache";
import { requireMaintenanceStaff } from "@/lib/guard";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "maintenance-photos";

export type MaintenanceJob = {
  id: string;
  title: string;
  note: string | null;
  requestedByName: string;
  decidedAt: string | null;
  /** Signed URL (10 min) for whatever photo the requester attached when
   * raising this job (e.g. a photo of the broken thing) -- null if they
   * didn't attach one, or if signing failed. Maintenance staff need to see
   * what they're actually being sent to fix. */
  requestPhotoUrl: string | null;
};

/**
 * Approved-but-not-yet-done maintenance jobs, across the whole org — not
 * just ones this person raised. Only reachable by app_users.is_maintenance,
 * via the admin client, since the normal approvals RLS policy only lets a
 * staff member read their OWN requests.
 */
export async function listMyMaintenanceJobs(): Promise<MaintenanceJob[] | { error: string }> {
  const guard = await requireMaintenanceStaff("clock.listMaintenanceJobs");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("approvals")
    .select("id, title, note, requested_by, decided_at, request_photo_path")
    .eq("org_id", guard.orgId)
    .eq("kind", "maintenance")
    .eq("status", "approved")
    .is("completed_at", null)
    .order("decided_at", { ascending: true });

  if (error || !rows) return { error: error?.message ?? "Could not load maintenance jobs." };

  const requesterIds = [...new Set(rows.map((r) => r.requested_by as string))];
  const { data: requesters } = requesterIds.length
    ? await admin.from("employees").select("id, full_name").in("id", requesterIds)
    : { data: [] as { id: string; full_name: string }[] };

  const nameById = new Map((requesters ?? []).map((e) => [e.id as string, e.full_name as string]));

  // Whatever photo the requester attached when raising this (kind='maintenance'
  // requests reuse the same request_photo_path every other approval type
  // does) lives in the private approval-photos bucket -- sign a short-lived
  // URL for each one rather than exposing the bucket.
  const withPhoto = rows.filter((r) => r.request_photo_path);
  const photoUrlById = new Map<string, string>();
  if (withPhoto.length) {
    await Promise.all(
      withPhoto.map(async (r) => {
        const { data: signed } = await admin.storage
          .from("approval-photos")
          .createSignedUrl(r.request_photo_path as string, 60 * 10);
        if (signed?.signedUrl) photoUrlById.set(r.id as string, signed.signedUrl);
      })
    );
  }

  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    note: r.note as string | null,
    requestedByName: nameById.get(r.requested_by as string) ?? "Someone",
    decidedAt: r.decided_at as string | null,
    requestPhotoUrl: photoUrlById.get(r.id as string) ?? null,
  }));
}

export type Result = { ok: true } | { ok: false; error: string };

/** Close out a maintenance job with proof — a photo of the finished work. */
export async function completeMaintenanceJob(approvalId: string, formData: FormData): Promise<Result> {
  const guard = await requireMaintenanceStaff("clock.completeMaintenanceJob");
  if (!guard.ok) return { ok: false, error: guard.error };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: "Please attach a photo of the finished job." };
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
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, photo, { contentType: photo.type || "image/jpeg" });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data, error: updateError } = await admin
    .from("approvals")
    .update({
      completed_at: new Date().toISOString(),
      completed_by_name: guard.fullName,
      completion_note: note,
      completion_photo_path: storagePath,
    })
    .eq("id", approvalId)
    .eq("org_id", guard.orgId)
    .eq("kind", "maintenance")
    .is("completed_at", null)
    .select("id")
    .single();

  if (updateError || !data) {
    // Don't leave an orphaned photo behind if the update didn't land (e.g.
    // someone else already closed this job out).
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: updateError?.message ?? "That job is already marked done." };
  }

  revalidatePath("/clock");
  revalidatePath("/approvals");
  return { ok: true };
}
