"use server";

import { revalidatePath } from "next/cache";
import { requireEmployee } from "@/lib/guard";
import { resolveWorkingBranch } from "@/lib/working-branch";
import { createAdminClient } from "@/lib/supabase/admin";

export type Result = { ok: true } | { ok: false; error: string };

const ALLOWED_CURRENCIES = new Set(["USD", "EUR", "GBP", "CNY", "JPY", "AUD"]);

/**
 * Record a completed foreign-cash transaction: the currency, amount, the
 * rate that was shown at the time, the flat fee, and the THB total actually
 * collected. This is a record of what happened, not a re-priced live
 * conversion — the numbers come from what the staff member saw on screen,
 * the same way a note on a paper request is trusted. Goes through the admin
 * client after requireEmployee(), same pattern as the rest of this session's
 * staff-logging features.
 */
export async function logCurrencyTransaction(input: {
  currencyCode: string;
  foreignAmount: number;
  rateThbPerUnit: number;
  feeThb: number;
  totalThb: number;
}): Promise<Result> {
  const guard = await requireEmployee("clock.logCurrencyTransaction");
  if (!guard.ok) return { ok: false, error: guard.error };

  const code = String(input.currencyCode || "").toUpperCase();
  if (!ALLOWED_CURRENCIES.has(code)) return { ok: false, error: "Unknown currency." };

  const { foreignAmount, rateThbPerUnit, feeThb, totalThb } = input;
  const allFinite = [foreignAmount, rateThbPerUnit, feeThb, totalThb].every((n) => Number.isFinite(n));
  if (!allFinite) return { ok: false, error: "Something about that amount didn't add up." };
  if (foreignAmount <= 0 || rateThbPerUnit <= 0 || totalThb <= 0 || feeThb < 0) {
    return { ok: false, error: "Amounts must be positive." };
  }

  const admin = createAdminClient();
  const branchId = await resolveWorkingBranch(guard.employeeId, guard.branchId);
  const { error } = await admin.from("currency_transactions").insert({
    org_id: guard.orgId,
    branch_id: branchId,
    employee_id: guard.employeeId,
    employee_name: guard.fullName,
    currency_code: code,
    foreign_amount: foreignAmount,
    rate_thb_per_unit: rateThbPerUnit,
    fee_thb: feeThb,
    total_thb: totalThb,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clock");
  return { ok: true };
}

export type MyBranchCurrencyTransaction = {
  id: string;
  employeeName: string;
  currencyCode: string;
  foreignAmount: number;
  rateThbPerUnit: number;
  feeThb: number;
  totalThb: number;
  createdAt: string;
};

/**
 * Recent foreign-cash transactions for the CURRENT staff member's own
 * branch — so anyone on shift can see who accepted what, at what rate, and
 * when, without calling around. Any signed-in staff member can read this
 * (requireEmployee, not requireManager); the full month-by-month rollup
 * with totals stays manager-only on /currency-log.
 */
export async function listMyBranchCurrencyTransactions(): Promise<
  MyBranchCurrencyTransaction[] | { error: string }
> {
  const guard = await requireEmployee("clock.listCurrencyTransactions");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const branchId = await resolveWorkingBranch(guard.employeeId, guard.branchId);
  const { data: rows, error } = await admin
    .from("currency_transactions")
    .select("id, employee_name, currency_code, foreign_amount, rate_thb_per_unit, fee_thb, total_thb, created_at")
    .eq("org_id", guard.orgId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error || !rows) return { error: error?.message ?? "Could not load the currency log." };

  return rows.map((r) => ({
    id: r.id as string,
    employeeName: r.employee_name as string,
    currencyCode: r.currency_code as string,
    foreignAmount: Number(r.foreign_amount),
    rateThbPerUnit: Number(r.rate_thb_per_unit),
    feeThb: Number(r.fee_thb),
    totalThb: Number(r.total_thb),
    createdAt: r.created_at as string,
  }));
}
