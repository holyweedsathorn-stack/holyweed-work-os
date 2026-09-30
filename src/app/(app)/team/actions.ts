"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/guard";

export type Result = { ok: true } | { ok: false; error: string };
export type InviteResult =
  | { ok: true; inviteUrl: string; name: string }
  | { ok: false; error: string };

/** 32 random bytes — not guessable, and single-use. */
function inviteToken() {
  return randomBytes(32).toString("base64url");
}

/** Absolute base URL of this deployment, so invite links work anywhere. */
async function baseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Issue a fresh invite, replacing any outstanding one for the same person. */
async function issueInvite(opts: {
  orgId: string;
  fullName: string;
  role: "staff" | "manager" | "owner";
  employeeId: string | null;
}): Promise<InviteResult> {
  const admin = createAdminClient();

  if (opts.employeeId) {
    await admin.from("invites").delete().eq("employee_id", opts.employeeId).is("accepted_at", null);
  }

  const token = inviteToken();
  const { error } = await admin.from("invites").insert({
    org_id: opts.orgId,
    token,
    role: opts.role,
    employee_id: opts.employeeId,
    full_name: opts.fullName,
  });

  if (error) return { ok: false, error: error.message };

  return { ok: true, inviteUrl: `${await baseUrl()}/invite/${token}`, name: opts.fullName };
}

/**
 * Add a team member and generate the invite link they'll use to set up their
 * own login. Nothing is sent automatically — you pass the link on yourself.
 */
export async function createStaff(formData: FormData): Promise<InviteResult> {
  const guard = await requireManager("team.createStaff", "Only owners and managers can manage staff.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const fullName = String(formData.get("full_name") || "").trim();
  const roleTitle = String(formData.get("role_title") || "").trim();
  const branchId = String(formData.get("branch_id") || "");
  const phone = String(formData.get("phone") || "").trim() || null;
  const withInvite = formData.get("with_login") === "on";

  if (!fullName) return { ok: false, error: "Please enter the person's name." };
  if (!roleTitle) return { ok: false, error: "Please enter a job title." };
  if (!branchId) return { ok: false, error: "Please choose a branch." };

  const admin = createAdminClient();

  const { data: employee, error: empErr } = await admin
    .from("employees")
    .insert({
      org_id: guard.orgId,
      branch_id: branchId,
      full_name: fullName,
      role_title: roleTitle,
      phone,
      active: true,
    })
    .select()
    .single();

  if (empErr) return { ok: false, error: empErr.message };

  if (!withInvite) {
    revalidatePath("/team");
    return { ok: true, inviteUrl: "", name: fullName };
  }

  const res = await issueInvite({
    orgId: guard.orgId,
    fullName,
    role: "staff",
    employeeId: employee.id,
  });

  revalidatePath("/team");
  if (!res.ok) {
    return {
      ok: false,
      error: `${fullName} was added to the team, but the invite link couldn't be created: ${res.error}. Use "Invite" on their row to try again.`,
    };
  }
  return res;
}

/** Generate (or replace) the invite link for an existing employee. */
export async function inviteStaff(employeeId: string): Promise<InviteResult> {
  const guard = await requireManager("team.inviteStaff", "Only owners and managers can manage staff.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, full_name, org_id")
    .eq("id", employeeId)
    .single();

  if (!employee) return { ok: false, error: "Could not find that team member." };

  // If they already have a login, replace it so this also serves as
  // "they forgot their password".
  const { data: existing } = await admin
    .from("app_users")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const res = await issueInvite({
    orgId: employee.org_id,
    fullName: employee.full_name,
    role: "staff",
    employeeId: employee.id,
  });
  revalidatePath("/team");
  return res;
}

/**
 * Invite a business partner or manager. They get no employee record and never
 * appear on the clock — they land on the dashboard like you do.
 */
export async function invitePartner(formData: FormData): Promise<InviteResult> {
  const guard = await requireManager("team.invitePartner", "Only owners and managers can manage staff.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const fullName = String(formData.get("full_name") || "").trim();
  const role = String(formData.get("role") || "manager") as "owner" | "manager";

  if (!fullName) return { ok: false, error: "Please enter their name." };
  if (role !== "owner" && role !== "manager") {
    return { ok: false, error: "Choose either owner or manager." };
  }

  const res = await issueInvite({ orgId: guard.orgId, fullName, role, employeeId: null });
  revalidatePath("/team");
  return res;
}

export async function updateStaff(formData: FormData): Promise<Result> {
  const guard = await requireManager("team.updateStaff", "Only owners and managers can manage staff.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const id = String(formData.get("id") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const roleTitle = String(formData.get("role_title") || "").trim();
  const branchId = String(formData.get("branch_id") || "");
  const phone = String(formData.get("phone") || "").trim() || null;

  if (!id) return { ok: false, error: "Missing team member." };
  if (!fullName) return { ok: false, error: "Please enter the person's name." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("employees")
    .update({ full_name: fullName, role_title: roleTitle, branch_id: branchId, phone })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  // Keep the login's display name in step with the roster.
  await admin.from("app_users").update({ full_name: fullName }).eq("employee_id", id);

  revalidatePath("/team");
  return { ok: true };
}

/** Archive someone who has left, keeping their recorded hours intact. */
export async function setStaffActive(employeeId: string, active: boolean): Promise<Result> {
  const guard = await requireManager("team.setStaffActive", "Only owners and managers can manage staff.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();

  if (!active) {
    // Close any shift they left open, so it doesn't tick up forever.
    await admin
      .from("time_entries")
      .update({ clock_out: new Date().toISOString() })
      .eq("employee_id", employeeId)
      .is("clock_out", null);
  }

  const { error } = await admin.from("employees").update({ active }).eq("id", employeeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/team");
  return { ok: true };
}

/**
 * Permanently remove someone. Refused if they have recorded hours — archiving
 * is the right move there, so payroll history survives.
 */
export async function deleteStaff(employeeId: string): Promise<Result> {
  const guard = await requireManager("team.deleteStaff", "Only owners and managers can manage staff.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();

  const { count } = await admin
    .from("time_entries")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "This person has recorded hours, so deleting them would erase that payroll history. Archive them instead.",
    };
  }

  const { data: login } = await admin
    .from("app_users")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (login) await admin.auth.admin.deleteUser(login.id);

  const { error } = await admin.from("employees").delete().eq("id", employeeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/team");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Clock-in location (migration 0013)
// ---------------------------------------------------------------------------

/** Postgres "column does not exist" — migration 0013 has not been run yet. */
const UNDEFINED_COLUMN = "42703";
const NEEDS_MIGRATION =
  "The clock-in location feature isn't set up in the database yet — run migration 0013.";

/**
 * Anchor a branch to where the manager is standing right now.
 *
 * Deliberately not a map picker: the person setting this is in the shop, and a
 * phone's own fix is more honest than dragging a pin over a satellite photo of
 * a street that has been rebuilt twice since it was taken.
 *
 * The fix used to SET the point has to be a good one — everyone else's
 * clock-in is judged against it, so a sloppy anchor quietly mis-measures the
 * whole team.
 */
export async function setBranchLocation(
  branchId: string,
  lat: number,
  lng: number,
  accuracy: number
): Promise<Result> {
  const guard = await requireManager(
    "team.setBranchLocation",
    "Only owners and managers can set where a branch is."
  );
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, error: "That doesn't look like a valid position." };
  }
  if (!Number.isFinite(accuracy) || accuracy > 100) {
    return {
      ok: false,
      error: `Your phone can only place you to within ${Math.round(accuracy)}m. Step outside the shop door and try again — everyone's clock-in gets measured from this point.`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("branches")
    .update({
      lat,
      lng,
      location_set_at: new Date().toISOString(),
      location_set_by: guard.userId,
    })
    .eq("id", branchId)
    .eq("org_id", guard.orgId);

  if (error?.code === UNDEFINED_COLUMN) return { ok: false, error: NEEDS_MIGRATION };
  if (error) return { ok: false, error: error.message };
  revalidatePath("/team");
  return { ok: true };
}

/** How far from the reference point still counts as "at the shop". */
export async function setBranchRadius(branchId: string, metres: number): Promise<Result> {
  const guard = await requireManager(
    "team.setBranchRadius",
    "Only owners and managers can change the clock-in radius."
  );
  if (!guard.ok) return { ok: false, error: guard.error };

  const m = Math.round(Number(metres));
  if (!Number.isFinite(m) || m < 25 || m > 5000) {
    return { ok: false, error: "Pick a radius between 25m and 5000m." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("branches")
    .update({ geofence_m: m })
    .eq("id", branchId)
    .eq("org_id", guard.orgId);

  if (error?.code === UNDEFINED_COLUMN) return { ok: false, error: NEEDS_MIGRATION };
  if (error) return { ok: false, error: error.message };
  revalidatePath("/team");
  return { ok: true };
}

/** Stop checking location on this branch. */
export async function clearBranchLocation(branchId: string): Promise<Result> {
  const guard = await requireManager(
    "team.clearBranchLocation",
    "Only owners and managers can change where a branch is."
  );
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("branches")
    .update({ lat: null, lng: null, location_set_at: null, location_set_by: null })
    .eq("id", branchId)
    .eq("org_id", guard.orgId);

  if (error?.code === UNDEFINED_COLUMN) return { ok: false, error: NEEDS_MIGRATION };
  if (error) return { ok: false, error: error.message };
  revalidatePath("/team");
  return { ok: true };
}

/**
 * Clock someone in by hand — the release valve.
 *
 * Clock-in is refused away from the shop, so a phone with a bad fix, a denied
 * permission or no GPS at all would otherwise stop a real shift from starting.
 * A manager can start it instead, and the entry is marked 'manager' so the
 * override is visible rather than indistinguishable from a normal clock-in.
 */
export async function clockInFor(employeeId: string): Promise<Result> {
  const guard = await requireManager(
    "team.clockInFor",
    "Only owners and managers can clock someone in."
  );
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("branch_id, active")
    .eq("id", employeeId)
    .eq("org_id", guard.orgId)
    .single();

  if (!employee) return { ok: false, error: "Could not find that person." };
  if (employee.active === false) return { ok: false, error: "That person is archived." };

  const base = {
    org_id: guard.orgId,
    employee_id: employeeId,
    branch_id: employee.branch_id,
  };

  let { error } = await admin
    .from("time_entries")
    .insert({ ...base, clock_in_method: "manager" });

  // An un-migrated database still has to be able to start a shift.
  if (error?.code === UNDEFINED_COLUMN) {
    ({ error } = await admin.from("time_entries").insert(base));
  }

  if (error) {
    if (error.code === "23505") return { ok: false, error: "They're already clocked in." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/team");
  revalidatePath("/clock");
  return { ok: true };
}
