"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireEmployee, logRefusal } from "@/lib/guard";
import { checkFix, distanceMetres, fmtDistance, type Fix, type GeoVerdict } from "@/lib/geo";
import { activeShift, type ShiftCode, type ShiftType } from "@/lib/shifts";

type BranchGeo = {
  name: string;
  lat: number | null;
  lng: number | null;
  geofence_m: number;
};

/** Postgres "column does not exist" — migration 0013 has not been run yet. */
const UNDEFINED_COLUMN = "42703";

/**
 * Read the branch's reference point, tolerating a database that predates
 * migration 0013.
 *
 * Deploy order is not guaranteed — the code may reach production before the
 * SQL is run. Clocking in is what the whole team does every morning, so a
 * missing column has to mean "no location check", never "nobody works today".
 */
async function branchGeo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  branchId: string
): Promise<BranchGeo | null> {
  const { data, error } = await supabase
    .from("branches")
    .select("name, lat, lng, geofence_m")
    .eq("id", branchId)
    .maybeSingle<BranchGeo>();

  if (error) return null;
  return data;
}

/**
 * Which shop this person is actually due at right now.
 *
 * The branch belongs to the SHIFT, not to the employee record: someone can be
 * at Sathorn on Monday and Sukhumvit 22 on Wednesday. Measuring their
 * clock-in against their home branch would refuse them at the shop they were
 * rostered to. Falls back to the home branch when nobody is rostered, and
 * when the roster tables predate migration 0014.
 */
async function workingBranch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  fallback: string
): Promise<string> {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });
  const today = fmt.format(new Date());
  const yesterday = fmt.format(new Date(Date.now() - 86400000));

  const [{ data: shifts, error: shiftErr }, { data: types, error: typeErr }] = await Promise.all([
    supabase
      .from("shifts")
      .select("shift_date, shift_type, branch_id")
      .eq("employee_id", employeeId)
      .in("shift_date", [yesterday, today]),
    supabase.from("shift_types").select("*"),
  ]);

  if (shiftErr || typeErr) return fallback;

  const live = activeShift(
    (shifts ?? []) as { shift_date: string; shift_type: ShiftCode; branch_id: string }[],
    (types ?? []) as ShiftType[]
  );
  return live?.branch_id ?? fallback;
}

/**
 * Clock the signed-in staff member in, at the shop.
 *
 * Location is judged here, on the server — the phone reports where it thinks
 * it is, and this decides. A branch with no coordinates set is not checked at
 * all, so this can ship before the owner has been round both shops.
 *
 * Safety: the DB has a unique index allowing only one open entry per employee,
 * so a double-tap can't create two overlapping shifts — the second insert fails
 * and we surface it as a friendly message rather than a crash.
 */
export async function clockIn(fix: Fix | null = null) {
  const guard = await requireEmployee("clock.clockIn");
  if (!guard.ok) return { error: guard.error };

  const supabase = await createClient();
  // Where they are DUE, which is not necessarily their home branch.
  const branchId = await workingBranch(supabase, guard.employeeId, guard.branchId);
  const geo = await branchGeo(supabase, branchId);

  const verdict: GeoVerdict = geo ? checkFix(geo, fix) : { ok: true, distance: null };

  if (!verdict.ok) {
    // A blocked clock-in is a refusal like any other — it belongs in the log,
    // where the owner can see it, rather than dying silently on a phone.
    await logRefusal({
      action: "clock.clockIn",
      reason: "wrong_location",
      orgId: guard.orgId,
      actorUserId: guard.userId,
      actorEmployeeId: guard.employeeId,
      actorLabel: `${guard.fullName} (staff)`,
      detail:
        verdict.distance == null
          ? `No location — ${geo?.name ?? "branch"}`
          : `${fmtDistance(verdict.distance)} from ${geo?.name ?? "branch"}` +
            (fix ? ` (fix +/- ${Math.round(fix.accuracy)}m)` : ""),
    });
    return { error: verdict.error };
  }

  const base = {
    org_id: guard.orgId,
    employee_id: guard.employeeId,
    // Record where the shift actually was, not where they usually work.
    branch_id: branchId,
  };

  let { error } = await supabase.from("time_entries").insert({
    ...base,
    clock_in_lat: fix?.lat ?? null,
    clock_in_lng: fix?.lng ?? null,
    clock_in_accuracy_m: fix?.accuracy ?? null,
    clock_in_distance_m: verdict.distance,
    clock_in_method: "self",
  });

  // Same reasoning as branchGeo: an un-migrated database still has to clock
  // people in. The shift is recorded; only the location detail is lost.
  if (error?.code === UNDEFINED_COLUMN) {
    ({ error } = await supabase.from("time_entries").insert(base));
  }

  if (error) {
    // 23505 = unique_violation -> the "one open entry per employee" index
    if (error.code === "23505") return { error: "You are already clocked in." };
    return { error: error.message };
  }

  revalidatePath("/clock");
  return { ok: true };
}

/**
 * Close out the signed-in staff member's open shift.
 *
 * Deliberately NOT location-checked. Someone who gets home and realises they
 * forgot to clock out has to be able to close the shift — blocking them would
 * leave the entry open forever, and the one-open-entry index would then stop
 * them clocking in tomorrow. Where they were is recorded, not enforced.
 */
export async function clockOut(fix: Fix | null = null) {
  const guard = await requireEmployee("clock.clockOut");
  if (!guard.ok) return { error: guard.error };

  const supabase = await createClient();

  const { data: open } = await supabase
    .from("time_entries")
    .select("id")
    .eq("employee_id", guard.employeeId)
    .is("clock_out", null)
    .maybeSingle();

  if (!open) return { error: "You are not clocked in." };

  let outDistance: number | null = null;
  if (fix) {
    const branchId = await workingBranch(supabase, guard.employeeId, guard.branchId);
    const geo = await branchGeo(supabase, branchId);
    if (geo?.lat != null && geo.lng != null) {
      outDistance = distanceMetres(fix.lat, fix.lng, geo.lat, geo.lng);
    }
  }

  const closedAt = new Date().toISOString();

  let { error } = await supabase
    .from("time_entries")
    .update({
      clock_out: closedAt,
      clock_out_lat: fix?.lat ?? null,
      clock_out_lng: fix?.lng ?? null,
      clock_out_distance_m: outDistance,
    })
    .eq("id", open.id);

  if (error?.code === UNDEFINED_COLUMN) {
    ({ error } = await supabase
      .from("time_entries")
      .update({ clock_out: closedAt })
      .eq("id", open.id));
  }

  if (error) return { error: error.message };

  revalidatePath("/clock");
  return { ok: true };
}
