import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One gate for every server action that uses the admin client.
 *
 * The admin (service-role) client bypasses Row Level Security, so the caller's
 * right to act has to be proven here in code. This used to be copy-pasted into
 * five action files; it lives here now so that every refusal is recorded in one
 * place rather than five.
 */

export type Role = "owner" | "manager" | "staff";

export type Guard =
  | { ok: true; orgId: string; userId: string; role: "owner" | "manager" }
  | { ok: false; error: string };

export type StaffGuard =
  | {
      ok: true;
      orgId: string;
      userId: string;
      employeeId: string;
      branchId: string;
      fullName: string;
    }
  | { ok: false; error: string };

export type RefusalReason =
  | "not_signed_in"
  | "not_manager"
  | "wrong_employee"
  | "expired_token"
  | "used_token"
  | "wrong_location"
  | "other";

/**
 * Record something the app refused.
 *
 * Never throws and never returns an error: an audit log that can take down a
 * working feature is worse than no audit log at all. Callers do not await a
 * result they can act on — they just fire it and carry on.
 */
export async function logRefusal(input: {
  action: string;
  reason: RefusalReason;
  actorLabel: string;
  orgId?: string | null;
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("refusals").insert({
      org_id: input.orgId ?? null,
      actor_user_id: input.actorUserId ?? null,
      actor_employee_id: input.actorEmployeeId ?? null,
      actor_label: input.actorLabel,
      action: input.action,
      reason: input.reason,
      detail: input.detail ?? null,
    });
  } catch {
    // Swallowed on purpose. If the log is down, the app still works.
  }
}

/**
 * Prove the caller is an owner or manager, and record it when they are not.
 *
 * @param action  dotted name of the caller, e.g. "tasks.createTemplate".
 *                It ends up in the access log, so make it greppable.
 * @param denyMessage  what the user sees if they are signed in but not a
 *                manager. Defaults to something generic.
 */
export async function requireManager(
  action: string,
  denyMessage = "Only owners and managers can do that."
): Promise<Guard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await logRefusal({ action, reason: "not_signed_in", actorLabel: "not signed in" });
    return { ok: false, error: "You are not signed in." };
  }

  const { data: me } = await supabase
    .from("app_users")
    .select("org_id, role, full_name")
    .eq("id", user.id)
    .single();

  if (!me || (me.role !== "owner" && me.role !== "manager")) {
    await logRefusal({
      action,
      reason: "not_manager",
      orgId: me?.org_id ?? null,
      actorUserId: user.id,
      actorLabel: me ? `${me.full_name} (${me.role})` : "account with no profile",
      detail: denyMessage,
    });
    return { ok: false, error: denyMessage };
  }

  return {
    ok: true,
    orgId: me.org_id as string,
    userId: user.id,
    role: me.role as "owner" | "manager",
  };
}

/**
 * Prove the caller is a signed-in staff member with a linked employee record.
 * Used by the clock screen and by staff raising a request.
 */
/**
 * Prove the caller is a signed-in staff member AND flagged as maintenance
 * team (app_users.is_maintenance) — used by the clock-screen maintenance
 * job list/completion, which needs to see and close out jobs raised by
 * OTHER staff, not just their own requests.
 */
export async function requireMaintenanceStaff(action: string): Promise<StaffGuard> {
  const guard = await requireEmployee(action);
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: me } = await admin
    .from("app_users")
    .select("is_maintenance")
    .eq("id", guard.userId)
    .single();

  if (!me?.is_maintenance) {
    await logRefusal({
      action,
      reason: "other",
      orgId: guard.orgId,
      actorUserId: guard.userId,
      actorEmployeeId: guard.employeeId,
      actorLabel: guard.fullName,
      detail: "Not flagged as maintenance team",
    });
    return { ok: false, error: "This account isn't part of the maintenance team." };
  }

  return guard;
}

export type ActorGuard =
  | { ok: true; orgId: string; actorName: string }
  | { ok: false; error: string };

/**
 * Prove the caller is either a linked staff member or an owner/manager —
 * for things both sides can do, like editing a shared note on a hostel
 * stay. Tries the staff link first (the common case), then falls back to
 * the manager role for an account that isn't linked to an employee record.
 */
export async function requireEmployeeOrManager(action: string): Promise<ActorGuard> {
  // Silent: this is just a probe for "is this account staff-linked" -- an
  // owner/manager account will legitimately fail it on every single call,
  // and logging that as a refusal would flood the refusal log with noise
  // for an action that goes on to succeed via the manager fallback below.
  // A real refusal (neither staff nor manager) still gets logged, by
  // requireManager()'s own check just below.
  const staff = await requireEmployee(action, { silent: true });
  if (staff.ok) return { ok: true, orgId: staff.orgId, actorName: staff.fullName };

  const manager = await requireManager(action);
  if (manager.ok) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: me } = await supabase
      .from("app_users")
      .select("full_name")
      .eq("id", user?.id ?? "")
      .maybeSingle();
    return { ok: true, orgId: manager.orgId, actorName: (me?.full_name as string) ?? "Manager" };
  }

  return { ok: false, error: staff.error };
}

export async function requireEmployee(
  action: string,
  opts?: { silent?: boolean }
): Promise<StaffGuard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (!opts?.silent) {
      await logRefusal({ action, reason: "not_signed_in", actorLabel: "not signed in" });
    }
    return { ok: false, error: "You are not signed in." };
  }

  const { data: me } = await supabase
    .from("app_users")
    .select("org_id, role, full_name, employee_id")
    .eq("id", user.id)
    .single();

  if (!me?.employee_id) {
    if (!opts?.silent) {
      await logRefusal({
        action,
        reason: "wrong_employee",
        orgId: me?.org_id ?? null,
        actorUserId: user.id,
        actorLabel: me ? `${me.full_name} (${me.role})` : "account with no profile",
        detail: "Account is not linked to an employee record",
      });
    }
    return { ok: false, error: "This account is not linked to an employee record." };
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("branch_id, full_name")
    .eq("id", me.employee_id)
    .single();

  if (!employee) {
    if (!opts?.silent) {
      await logRefusal({
        action,
        reason: "wrong_employee",
        orgId: me.org_id,
        actorUserId: user.id,
        actorEmployeeId: me.employee_id,
        actorLabel: `${me.full_name} (${me.role})`,
        detail: "Employee record missing or archived",
      });
    }
    return { ok: false, error: "Could not find your employee record." };
  }

  return {
    ok: true,
    orgId: me.org_id as string,
    userId: user.id,
    employeeId: me.employee_id as string,
    branchId: employee.branch_id as string,
    fullName: (employee.full_name as string) ?? (me.full_name as string),
  };
}
