"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/guard";
import { addDays } from "@/lib/types";
import type { ShiftCode } from "@/lib/shifts";

export type Result = { ok: true } | { ok: false; error: string };
export type CopyResult = { ok: true; copied: number; skipped: number } | { ok: false; error: string };

const DENY = "Only owners and managers can change the roster.";
const CODES: ShiftCode[] = ["open", "mid", "close"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Put someone on a shift for a day, or take them off it.
 *
 * One shift per person per day: the grid has one cell per person per day, so
 * assigning replaces whatever was there rather than stacking a second shift
 * nobody can see. The database still permits doubles (the unique index is on
 * employee + date + type) for when that's wanted.
 *
 * The branch belongs to the SHIFT, not to the person. Someone can be at
 * Sathorn on Monday and Sukhumvit 22 on Wednesday; taking the branch off the
 * employee record made that impossible to express. Omitting it falls back to
 * their home branch, which is what happens for everyone who only works one.
 */
export async function setShift(
  employeeId: string,
  date: string,
  code: ShiftCode | null,
  branchId?: string
): Promise<Result> {
  const guard = await requireManager("schedule.setShift", DENY);
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!ISO_DATE.test(date)) return { ok: false, error: "That isn't a valid date." };
  if (code !== null && !CODES.includes(code)) return { ok: false, error: "Unknown shift." };

  const admin = createAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("branch_id, active")
    .eq("id", employeeId)
    .eq("org_id", guard.orgId)
    .single();

  if (!employee) return { ok: false, error: "Could not find that person." };
  if (employee.active === false) return { ok: false, error: "That person is archived." };

  const { error: delErr } = await admin
    .from("shifts")
    .delete()
    .eq("org_id", guard.orgId)
    .eq("employee_id", employeeId)
    .eq("shift_date", date);

  if (delErr) return { ok: false, error: delErr.message };

  if (code) {
    let targetBranch = employee.branch_id as string;
    if (branchId) {
      // Never take a branch id on trust — confirm it is this org's.
      const { data: b } = await admin
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("org_id", guard.orgId)
        .maybeSingle();
      if (!b) return { ok: false, error: "That branch doesn't exist." };
      targetBranch = branchId;
    }

    const { error } = await admin.from("shifts").insert({
      org_id: guard.orgId,
      employee_id: employeeId,
      branch_id: targetBranch,
      shift_date: date,
      shift_type: code,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/schedule");
  revalidatePath("/clock");
  return { ok: true };
}

/**
 * Duplicate a week onto the following one.
 *
 * Rosters repeat — this is the difference between six taps a week and fifty.
 * Existing shifts in the target week are left alone rather than overwritten,
 * so running it twice is harmless and a week you've already adjusted doesn't
 * get flattened.
 */
export async function copyWeekForward(fromMonday: string): Promise<CopyResult> {
  const guard = await requireManager("schedule.copyWeekForward", DENY);
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!ISO_DATE.test(fromMonday)) return { ok: false, error: "That isn't a valid week." };

  const admin = createAdminClient();
  const fromSunday = addDays(fromMonday, 6);
  const toMonday = addDays(fromMonday, 7);
  const toSunday = addDays(toMonday, 6);

  const [{ data: source }, { data: existing }] = await Promise.all([
    admin
      .from("shifts")
      .select("employee_id, branch_id, shift_date, shift_type")
      .eq("org_id", guard.orgId)
      .gte("shift_date", fromMonday)
      .lte("shift_date", fromSunday),
    admin
      .from("shifts")
      .select("employee_id, shift_date, shift_type")
      .eq("org_id", guard.orgId)
      .gte("shift_date", toMonday)
      .lte("shift_date", toSunday),
  ]);

  if (!source || source.length === 0) {
    return { ok: false, error: "There's nothing in that week to copy." };
  }

  const taken = new Set(
    (existing ?? []).map((s) => `${s.employee_id}:${s.shift_date}:${s.shift_type}`)
  );

  const rows = source
    .map((s) => ({
      org_id: guard.orgId,
      employee_id: s.employee_id as string,
      branch_id: s.branch_id as string,
      shift_date: addDays(s.shift_date as string, 7),
      shift_type: s.shift_type as string,
    }))
    .filter((r) => !taken.has(`${r.employee_id}:${r.shift_date}:${r.shift_type}`));

  const skipped = source.length - rows.length;
  if (rows.length === 0) {
    return { ok: false, error: "Next week already has all of these shifts." };
  }

  const { error } = await admin.from("shifts").insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/schedule");
  revalidatePath("/clock");
  return { ok: true, copied: rows.length, skipped };
}

/** Wipe a week, for when it's easier to start again than to unpick it. */
export async function clearWeek(monday: string): Promise<Result> {
  const guard = await requireManager("schedule.clearWeek", DENY);
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!ISO_DATE.test(monday)) return { ok: false, error: "That isn't a valid week." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("shifts")
    .delete()
    .eq("org_id", guard.orgId)
    .gte("shift_date", monday)
    .lte("shift_date", addDays(monday, 6));

  if (error) return { ok: false, error: error.message };
  revalidatePath("/schedule");
  revalidatePath("/clock");
  return { ok: true };
}

/** How many people this branch needs on this shift. Drives the gap warnings. */
export async function setRequirement(
  branchId: string,
  code: ShiftCode,
  required: number
): Promise<Result> {
  const guard = await requireManager("schedule.setRequirement", DENY);
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!CODES.includes(code)) return { ok: false, error: "Unknown shift." };

  const n = Math.round(Number(required));
  if (!Number.isFinite(n) || n < 0 || n > 20) {
    return { ok: false, error: "Pick a number between 0 and 20." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("shift_requirements")
    .upsert(
      { org_id: guard.orgId, branch_id: branchId, code, required_staff: n },
      { onConflict: "branch_id,code" }
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/schedule");
  return { ok: true };
}
