"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeShift, type ShiftType } from "@/lib/shifts";

export type TaskResult = { ok: true } | { ok: false; error: string };

/**
 * Today's date in Bangkok, as YYYY-MM-DD. Not exported: in a "use server"
 * file every export must be an async server action.
 */
function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/**
 * Which shift instance this person is in the middle of.
 *
 * A completion belongs to a SHIFT, not to a day. The Close shift runs
 * 17:00-02:00, so someone ticking an item at 01:00 is still working
 * yesterday's shift — recording that under today's date is what let the
 * Open shift start at 01:00 and find its checklist already done.
 *
 * Returns nulls when nobody is rostered, which falls back to keying on the
 * calendar date exactly as before.
 */
async function currentShiftAnchor(employeeId: string) {
  const admin = createAdminClient();
  const today = bangkokToday();
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(Date.now() - 86400000)
  );

  const [{ data: shifts }, { data: types }] = await Promise.all([
    admin
      .from("shifts")
      .select("shift_date, shift_type, branch_id")
      .eq("employee_id", employeeId)
      .in("shift_date", [yesterday, today]),
    admin.from("shift_types").select("*"),
  ]);

  const live = activeShift(
    (shifts ?? []) as { shift_date: string; shift_type: "open" | "mid" | "close"; branch_id: string }[],
    (types ?? []) as ShiftType[]
  );

  return {
    anchorDate: live?.shift_date ?? today,
    shiftCode: live?.shift_type ?? null,
    today,
  };
}

/**
 * Resolve the signed-in person to their employee record. Staff writes are
 * done with the service role (which bypasses RLS), so ownership has to be
 * proven here — a staff member may only ever act as themselves.
 */
async function currentEmployee() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("app_users")
    .select("org_id, role, employee_id")
    .eq("id", user.id)
    .single();

  if (!me?.employee_id) return null;
  return { orgId: me.org_id as string, employeeId: me.employee_id as string };
}

/** Tick or untick one of today's repeating checklist items. */
export async function toggleChecklistItem(templateId: string, done: boolean): Promise<TaskResult> {
  const me = await currentEmployee();
  if (!me) return { ok: false, error: "You are not signed in as a team member." };

  const admin = createAdminClient();
  const { anchorDate, shiftCode, today } = await currentShiftAnchor(me.employeeId);

  // Confirm the template belongs to this org before writing anything.
  const { data: template } = await admin
    .from("task_templates")
    .select("id, org_id")
    .eq("id", templateId)
    .maybeSingle();

  if (!template || template.org_id !== me.orgId) {
    return { ok: false, error: "That task doesn't exist." };
  }

  if (done) {
    const { error } = await admin.from("task_completions").insert({
      org_id: me.orgId,
      template_id: templateId,
      employee_id: me.employeeId,
      task_date: today,
      shift_anchor_date: anchorDate,
      shift_code: shiftCode,
    });
    // 23505 = someone else ticked it a moment ago. That's the desired end
    // state anyway, so treat it as success rather than an error.
    if (error && error.code !== "23505") return { ok: false, error: error.message };
  } else {
    let q = admin
      .from("task_completions")
      .delete()
      .eq("template_id", templateId)
      .eq("shift_anchor_date", anchorDate);
    q = shiftCode === null ? q.is("shift_code", null) : q.eq("shift_code", shiftCode);
    const { error } = await q;
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/clock");
  return { ok: true };
}

const TASK_PHOTO_BUCKET = "task-photos";

/** Mark a one-off task done, with a required photo of the finished work. */
export async function completeTask(taskId: string, formData: FormData): Promise<TaskResult> {
  const me = await currentEmployee();
  if (!me) return { ok: false, error: "You are not signed in as a team member." };

  const admin = createAdminClient();

  const { data: task } = await admin
    .from("tasks")
    .select("id, org_id, assigned_employee_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task || task.org_id !== me.orgId) {
    return { ok: false, error: "That task doesn't exist." };
  }
  // Unassigned tasks are open to anyone at the branch; assigned ones are not.
  if (task.assigned_employee_id && task.assigned_employee_id !== me.employeeId) {
    return { ok: false, error: "That task is assigned to someone else." };
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: "Please attach a photo of the finished task." };
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
  const storagePath = `${me.orgId}/${me.employeeId}/${crypto.randomUUID()}${ext}`;

  const { error: uploadError } = await admin.storage
    .from(TASK_PHOTO_BUCKET)
    .upload(storagePath, photo, { contentType: photo.type || "image/jpeg" });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { error } = await admin
    .from("tasks")
    .update({
      completed_at: new Date().toISOString(),
      completed_by: me.employeeId,
      completion_photo_path: storagePath,
      completion_note: note,
    })
    .eq("id", taskId);

  if (error) {
    await admin.storage.from(TASK_PHOTO_BUCKET).remove([storagePath]);
    return { ok: false, error: error.message };
  }

  revalidatePath("/clock");
  revalidatePath("/tasks");
  return { ok: true };
}

/** Reopen a task — clears the old photo/note, since a redo needs fresh proof. */
export async function reopenTask(taskId: string): Promise<TaskResult> {
  const me = await currentEmployee();
  if (!me) return { ok: false, error: "You are not signed in as a team member." };

  const admin = createAdminClient();

  const { data: task } = await admin
    .from("tasks")
    .select("id, org_id, assigned_employee_id, completion_photo_path")
    .eq("id", taskId)
    .maybeSingle();

  if (!task || task.org_id !== me.orgId) {
    return { ok: false, error: "That task doesn't exist." };
  }
  if (task.assigned_employee_id && task.assigned_employee_id !== me.employeeId) {
    return { ok: false, error: "That task is assigned to someone else." };
  }

  const { error } = await admin
    .from("tasks")
    .update({ completed_at: null, completed_by: null, completion_photo_path: null, completion_note: null })
    .eq("id", taskId);

  if (error) return { ok: false, error: error.message };

  if (task.completion_photo_path) {
    await admin.storage.from(TASK_PHOTO_BUCKET).remove([task.completion_photo_path as string]);
  }

  revalidatePath("/clock");
  revalidatePath("/tasks");
  return { ok: true };
}

/** Let the assignee move their own project along the board. */
export async function updateMyProjectStatus(
  projectId: string,
  status: "todo" | "inprogress" | "review" | "done"
): Promise<TaskResult> {
  const me = await currentEmployee();
  if (!me) return { ok: false, error: "You are not signed in as a team member." };

  const valid = ["todo", "inprogress", "review", "done"];
  if (!valid.includes(status)) return { ok: false, error: "Unknown status." };

  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("id, org_id, assigned_employee_id:assignee_employee_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project || project.org_id !== me.orgId) {
    return { ok: false, error: "That project doesn't exist." };
  }
  if (project.assigned_employee_id !== me.employeeId) {
    return { ok: false, error: "That project is assigned to someone else." };
  }

  const { error } = await admin.from("projects").update({ status }).eq("id", projectId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/clock");
  revalidatePath("/projects");
  return { ok: true };
}
