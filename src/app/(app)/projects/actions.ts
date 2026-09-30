"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/guard";

export type Result = { ok: true } | { ok: false; error: string };

const STATUSES = ["todo", "inprogress", "review", "done"] as const;
const PRIORITIES = ["low", "med", "high"] as const;
function readForm(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const branchId = String(formData.get("branch_id") || "") || null;
  const assignee = String(formData.get("assignee_employee_id") || "") || null;
  const dueDate = String(formData.get("due_date") || "") || null;
  const priority = String(formData.get("priority") || "med");
  const status = String(formData.get("status") || "todo");
  return { title, branchId, assignee, dueDate, priority, status };
}

export async function createProject(formData: FormData): Promise<Result> {
  const guard = await requireManager("projects.createProject", "Only owners and managers can manage projects.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const f = readForm(formData);
  if (!f.title) return { ok: false, error: "Please give the project a name." };
  if (!PRIORITIES.includes(f.priority as any)) return { ok: false, error: "Unknown priority." };
  if (!STATUSES.includes(f.status as any)) return { ok: false, error: "Unknown status." };

  const admin = createAdminClient();
  const { error } = await admin.from("projects").insert({
    org_id: guard.orgId,
    title: f.title,
    branch_id: f.branchId,
    assignee_employee_id: f.assignee,
    due_date: f.dueDate,
    priority: f.priority,
    status: f.status,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/projects");
  revalidatePath("/clock");
  return { ok: true };
}

export async function updateProject(formData: FormData): Promise<Result> {
  const guard = await requireManager("projects.updateProject", "Only owners and managers can manage projects.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing project." };

  const f = readForm(formData);
  if (!f.title) return { ok: false, error: "Please give the project a name." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("projects")
    .update({
      title: f.title,
      branch_id: f.branchId,
      assignee_employee_id: f.assignee,
      due_date: f.dueDate,
      priority: f.priority,
      status: f.status,
    })
    .eq("id", id)
    .eq("org_id", guard.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/projects");
  revalidatePath("/clock");
  return { ok: true };
}

/** Move a project one column left or right on the board. */
export async function setProjectStatus(projectId: string, status: string): Promise<Result> {
  const guard = await requireManager("projects.setProjectStatus", "Only owners and managers can manage projects.");
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!STATUSES.includes(status as any)) return { ok: false, error: "Unknown status." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("projects")
    .update({ status })
    .eq("id", projectId)
    .eq("org_id", guard.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/projects");
  revalidatePath("/clock");
  return { ok: true };
}

export async function deleteProject(projectId: string): Promise<Result> {
  const guard = await requireManager("projects.deleteProject", "Only owners and managers can manage projects.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("org_id", guard.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/projects");
  revalidatePath("/clock");
  return { ok: true };
}

/**
 * Remove every project at once. Used to clear the seeded demo board before
 * putting real work on it.
 */
export async function deleteAllProjects(): Promise<Result> {
  const guard = await requireManager("projects.deleteAllProjects", "Only owners and managers can manage projects.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin.from("projects").delete().eq("org_id", guard.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/projects");
  revalidatePath("/clock");
  return { ok: true };
}
