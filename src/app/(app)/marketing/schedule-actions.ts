"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export type ScheduleBusiness = "shared" | "holyweed" | "bistro" | "hostel";
export type SchedulePhase = "days_1_30" | "days_31_60" | "days_61_90";

export type ScheduleTask = {
  id: string;
  business: ScheduleBusiness;
  phase: SchedulePhase;
  title: string;
  done: boolean;
};

/** List every task in the org's 90-day marketing execution schedule. */
export async function listScheduleTasks(): Promise<ScheduleTask[] | { error: string }> {
  const guard = await requireManager("marketing.schedule.list");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("marketing_schedule_tasks")
    .select("id, business, phase, title, done")
    .eq("org_id", guard.orgId)
    .order("phase", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error || !data) return { error: error?.message ?? "Could not load the schedule." };
  return data as ScheduleTask[];
}

export type ScheduleResult = { ok: true } | { ok: false; error: string };

/** Check or uncheck one task. */
export async function toggleScheduleTask(id: string, done: boolean): Promise<ScheduleResult> {
  const guard = await requireManager(
    "marketing.schedule.toggle",
    "Only owners and managers can update the execution schedule."
  );
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("marketing_schedule_tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("org_id", guard.orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/marketing");
  return { ok: true };
}
