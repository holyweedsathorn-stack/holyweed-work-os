"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/guard";
import { notify } from "@/lib/notify";

export type Result = { ok: true } | { ok: false; error: string };

/** Add an item to the standing checklist. */
export async function createTemplate(formData: FormData): Promise<Result> {
  const guard = await requireManager("tasks.createTemplate", "Only owners and managers can manage tasks.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const title = String(formData.get("title") || "").trim();
  const branchId = String(formData.get("branch_id") || "") || null;
  const shiftType = String(formData.get("shift_type") || "") || null;

  if (!title) return { ok: false, error: "Please enter what the task is." };

  const admin = createAdminClient();

  // Put new items at the end of the list.
  const { data: last } = await admin
    .from("task_templates")
    .select("sort_order")
    .eq("org_id", guard.orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("task_templates").insert({
    org_id: guard.orgId,
    branch_id: branchId,
    shift_type: shiftType,
    title,
    sort_order: ((last?.sort_order as number) ?? 0) + 10,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteTemplate(templateId: string): Promise<Result> {
  const guard = await requireManager("tasks.deleteTemplate", "Only owners and managers can manage tasks.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("task_templates")
    .delete()
    .eq("id", templateId)
    .eq("org_id", guard.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

/** Assign a one-off job to a person, or leave it open to whoever's on shift. */
export async function createTask(formData: FormData): Promise<Result> {
  const guard = await requireManager("tasks.createTask", "Only owners and managers can manage tasks.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const title = String(formData.get("title") || "").trim();
  const note = String(formData.get("note") || "").trim() || null;
  const assignee = String(formData.get("assigned_employee_id") || "") || null;
  const branchId = String(formData.get("branch_id") || "") || null;
  const dueDate = String(formData.get("due_date") || "") || null;

  if (!title) return { ok: false, error: "Please enter what the task is." };
  if (!assignee && !branchId) {
    return { ok: false, error: "Choose a person, or a branch for anyone on shift." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("tasks").insert({
    org_id: guard.orgId,
    branch_id: branchId,
    assigned_employee_id: assignee,
    title,
    note,
    due_date: dueDate,
  });

  if (error) return { ok: false, error: error.message };

  // Push the assignee immediately, if they have a login (an employee added
  // but not yet invited has no app_users row — nothing to notify, and that's
  // fine, they'll still see it on /clock once they sign in).
  if (assignee) {
    const { data: assigneeUser } = await admin
      .from("app_users")
      .select("id")
      .eq("employee_id", assignee)
      .maybeSingle();

    if (assigneeUser) {
      void notify({
        orgId: guard.orgId,
        recipientAppUserId: assigneeUser.id as string,
        kind: "task_assigned",
        title: "New task",
        body: title,
        link: "/clock",
      });
    }
  }

  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<Result> {
  const guard = await requireManager("tasks.deleteTask", "Only owners and managers can manage tasks.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin.from("tasks").delete().eq("id", taskId).eq("org_id", guard.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}
