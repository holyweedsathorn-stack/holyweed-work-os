"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/guard";

export type Result = { ok: true } | { ok: false; error: string };

const MONTH = /^\d{4}-\d{2}$/;

const money = (v: number) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Two decimals is as fine as money gets, and caps silly input.
  return Math.min(Math.round(n * 100) / 100, 99_999_999);
};

export type PayrollEntry = { employeeId: string; base: number; incentive: number };

/** Record salary and incentives for one month. Replaces whatever was there. */
export async function savePayroll(month: string, entries: PayrollEntry[]): Promise<Result> {
  const guard = await requireManager("report.savePayroll", "Only owners and managers can see payroll.");
  if (!guard.ok) return guard;
  if (!MONTH.test(month)) return { ok: false, error: "That isn't a valid month." };

  const admin = createAdminClient();

  // Only people on this org's roster, so a tampered form can't write elsewhere.
  const { data: roster } = await admin
    .from("employees")
    .select("id")
    .eq("org_id", guard.orgId);
  const allowed = new Set((roster ?? []).map((e) => e.id as string));

  const rows = entries
    .filter((e) => allowed.has(e.employeeId))
    .map((e) => ({
      org_id: guard.orgId,
      employee_id: e.employeeId,
      month,
      base_salary: money(e.base),
      incentive: money(e.incentive),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return { ok: false, error: "Nothing to save." };

  const { error } = await admin
    .from("payroll_month")
    .upsert(rows, { onConflict: "employee_id,month" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/report");
  return { ok: true };
}

export type FixedCostEntry = {
  branchId: string;
  category: "rent" | "electricity" | "water" | "internet" | "other";
  amount: number;
};

const FIXED_CATEGORIES = new Set(["rent", "electricity", "water", "internet", "other"]);

/** Record rent and utilities for one month, per branch. Replaces what's there. */
export async function saveFixedCosts(
  month: string,
  entries: FixedCostEntry[]
): Promise<Result> {
  const guard = await requireManager("report.saveFixedCosts", "Only owners and managers can see payroll.");
  if (!guard.ok) return guard;
  if (!MONTH.test(month)) return { ok: false, error: "That isn't a valid month." };

  const admin = createAdminClient();

  // Only this org's branches, so a tampered form can't write to another shop.
  const { data: branches } = await admin
    .from("branches")
    .select("id")
    .eq("org_id", guard.orgId);
  const allowed = new Set((branches ?? []).map((b) => b.id as string));

  const rows = entries
    .filter((e) => allowed.has(e.branchId) && FIXED_CATEGORIES.has(e.category))
    .map((e) => ({
      org_id: guard.orgId,
      branch_id: e.branchId,
      month,
      category: e.category,
      amount: money(e.amount),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return { ok: false, error: "Nothing to save." };

  const { error } = await admin
    .from("monthly_fixed_costs")
    .upsert(rows, { onConflict: "branch_id,month,category" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/report");
  return { ok: true };
}

/** A line or two of context for the month, shown on the report. */
export async function saveMonthNote(month: string, body: string): Promise<Result> {
  const guard = await requireManager("report.saveMonthNote", "Only owners and managers can see payroll.");
  if (!guard.ok) return guard;
  if (!MONTH.test(month)) return { ok: false, error: "That isn't a valid month." };

  const admin = createAdminClient();
  const { error } = await admin.from("month_notes").upsert(
    {
      org_id: guard.orgId,
      month,
      body: body.slice(0, 2000),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,month" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/report");
  return { ok: true };
}
