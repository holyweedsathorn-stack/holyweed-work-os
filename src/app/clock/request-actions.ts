"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEmployee } from "@/lib/guard";
import { APPROVAL_KINDS, type ApprovalKind } from "@/lib/types";
import { notifyManagers } from "@/lib/notify";

export type Result = { ok: true } | { ok: false; error: string };

const PHOTO_BUCKET = "approval-photos";

/**
 * Staff raise a request.
 *
 * This deliberately writes with the USER's client, not the admin client, so
 * the "staff raise request" row-level policy is what allows the insert — the
 * same shape as clocking in. The policy also refuses to let anyone pre-fill a
 * decision field, so a crafted form can't self-approve.
 */
export async function raiseRequest(formData: FormData): Promise<Result> {
  const guard = await requireEmployee("clock.raiseRequest");
  if (!guard.ok) return { ok: false, error: guard.error };

  const kind = String(formData.get("kind") || "") as ApprovalKind;
  const spec = APPROVAL_KINDS.find((k) => k.id === kind);
  if (!spec) return { ok: false, error: "Pick what kind of request this is." };

  const title = String(formData.get("title") || "").trim().slice(0, 200);
  if (!title) return { ok: false, error: `Please fill in "${spec.what}".` };

  const note = String(formData.get("note") || "").trim().slice(0, 1000) || null;

  let amount: number | null = null;
  if (spec.amount) {
    const raw = String(formData.get("amount") || "").replace(/[, ]/g, "");
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) {
      return { ok: false, error: "Please enter how much, in baht." };
    }
    amount = Math.min(Math.round(n * 100) / 100, 9_999_999);
  }

  let refDate: string | null = null;
  if (spec.date) {
    const raw = String(formData.get("ref_date") || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { ok: false, error: "Please pick which day." };
    }
    refDate = raw;
  }

  // A photo is optional here -- a receipt, a screenshot, whatever backs
  // the request up. Uploaded via the admin client (same as every other
  // photo feature; the bucket is private), but the approvals row itself
  // still goes in through the user's own session below, so the
  // self-approval RLS guard on that insert is untouched.
  let photoPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) {
      return { ok: false, error: "Only photos are supported for the attachment." };
    }
    if (photo.size > 10 * 1024 * 1024) {
      return { ok: false, error: "That photo is too big (10MB max)." };
    }
    const extMatch = photo.name.match(/\.[a-zA-Z0-9]+$/);
    const ext = (extMatch?.[0] || ".jpg").toLowerCase();
    photoPath = `${guard.orgId}/${guard.employeeId}/${crypto.randomUUID()}${ext}`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from(PHOTO_BUCKET)
      .upload(photoPath, photo, { contentType: photo.type || "image/jpeg" });
    if (uploadError) return { ok: false, error: uploadError.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("approvals").insert({
    org_id: guard.orgId,
    branch_id: guard.branchId,
    requested_by: guard.employeeId,
    kind,
    title,
    note,
    amount,
    ref_date: refDate,
    status: "pending",
    request_photo_path: photoPath,
  });

  if (error) {
    if (photoPath) {
      // Don't leave an orphaned photo behind if the row failed to write.
      await createAdminClient().storage.from(PHOTO_BUCKET).remove([photoPath]);
    }
    // 23505 = the "one pending request per person, per kind, per date" index.
    if (error.code === "23505") {
      return { ok: false, error: "You've already asked for that. It's still waiting." };
    }
    return { ok: false, error: error.message };
  }

  // Fire-and-forget: notify() never throws, so this can't turn a successful
  // request into a failed one. Owners/managers get pushed immediately
  // instead of having to check /approvals themselves.
  void notifyManagers({
    orgId: guard.orgId,
    kind: "approval_raised",
    title: `${guard.fullName} requested ${spec.label.toLowerCase()}`,
    body: title,
    link: "/approvals",
  });

  revalidatePath("/clock");
  revalidatePath("/approvals");
  return { ok: true };
}

/** Withdraw your own request, while it is still pending. */
export async function cancelRequest(approvalId: string): Promise<Result> {
  const guard = await requireEmployee("clock.cancelRequest");
  if (!guard.ok) return { ok: false, error: guard.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvals")
    .update({ status: "cancelled" })
    .eq("id", approvalId)
    .eq("requested_by", guard.employeeId)
    .eq("status", "pending")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "That request has already been decided." };
  }

  revalidatePath("/clock");
  revalidatePath("/approvals");
  return { ok: true };
}
