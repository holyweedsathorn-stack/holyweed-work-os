"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/guard";
import { notifyMaintenanceTeam } from "@/lib/notify";

export type Result = { ok: true } | { ok: false; error: string };

const DENY_MSG = "Only owners and managers can decide requests.";

/**
 * Approve or deny a pending request.
 *
 * Deciding does NOT execute anything: an approved expense turns green, it does
 * not post a row into `expenses`. Acting on a decision is a separate, per-kind
 * job and deliberately not automatic.
 */
export async function decideApproval(
  approvalId: string,
  decision: "approved" | "denied",
  note: string
): Promise<Result> {
  const guard = await requireManager("approvals.decideApproval", DENY_MSG);
  if (!guard.ok) return { ok: false, error: guard.error };

  if (decision !== "approved" && decision !== "denied") {
    return { ok: false, error: "That isn't a decision." };
  }

  const reason = note.trim().slice(0, 500);
  if (decision === "denied" && !reason) {
    return { ok: false, error: "Please say why, so they know what to do next." };
  }

  const admin = createAdminClient();

  // Scoped to the caller's org AND to status = 'pending', so a stale tab can't
  // overwrite a decision someone already made.
  const { data, error } = await admin
    .from("approvals")
    .update({
      status: decision,
      decided_by: guard.userId,
      decided_at: new Date().toISOString(),
      decision_note: reason || null,
    })
    .eq("id", approvalId)
    .eq("org_id", guard.orgId)
    .eq("status", "pending")
    .select("id, kind, title");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "That request was already decided. Refresh to see it." };
  }

  // Maintenance requests don't go anywhere on their own when approved (see
  // the comment above) — this is the one exception: approving it is the
  // signal to actually push the job to Sithu & Naing Ye.
  const decided = data[0];
  if (decision === "approved" && decided.kind === "maintenance") {
    void notifyMaintenanceTeam({
      orgId: guard.orgId,
      title: "Maintenance approved",
      body: decided.title as string,
      link: "/clock",
    });
  }

  revalidatePath("/approvals");
  revalidatePath("/clock");
  return { ok: true };
}
