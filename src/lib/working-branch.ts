import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Which branch a staff member is actually working right now, for stamping
 * something they log (a received item, a currency transaction) — not
 * necessarily their fixed "home" branch on the employee record, since some
 * staff (managers especially) cover shifts at either location.
 *
 * Simple rule: use the branch of their currently open time_entry (where
 * they clocked in for this shift). If they aren't clocked in right now,
 * fall back to their home branch on the employee record.
 */
export async function resolveWorkingBranch(employeeId: string, fallbackBranchId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: open } = await admin
    .from("time_entries")
    .select("branch_id")
    .eq("employee_id", employeeId)
    .is("clock_out", null)
    .maybeSingle();

  return (open?.branch_id as string) ?? fallbackBranchId;
}
