"use server";

import { revalidatePath } from "next/cache";
import { requireEmployee } from "@/lib/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Bistro's own end-of-day sales, entered by staff at close-out. Holy
 * Bistro shares the same PromptPay QR / bank account as the Holyweed
 * Sathorn dispensary, so there is no way to split bistro's PromptPay
 * income out of the bank statement after the fact -- this is the only
 * record of it, and it's what lets the reconciliation page's shared-account
 * comparison actually reach zero (see bistro_sales_daily migration).
 *
 * One row per calendar date (unique org_id, sale_date) -- re-submitting the
 * same date updates it in place rather than creating a duplicate that
 * would double-count on the reconciliation page.
 */
export async function recordBistroSales(input: {
  saleDate: string;
  cash: number;
  promptpay: number;
  grab: number;
  lineMan: number;
  notes?: string | null;
}): Promise<Result> {
  const guard = await requireEmployee("clock.recordBistroSales");
  if (!guard.ok) return { ok: false, error: guard.error };

  const saleDate = input.saleDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return { ok: false, error: "That date doesn't look right." };

  const { cash, promptpay, grab, lineMan } = input;
  const allFinite = [cash, promptpay, grab, lineMan].every((n) => Number.isFinite(n));
  if (!allFinite) return { ok: false, error: "Something about those amounts didn't add up." };
  if (cash < 0 || promptpay < 0 || grab < 0 || lineMan < 0) {
    return { ok: false, error: "Amounts can't be negative." };
  }

  const notes = (input.notes ?? "").trim().slice(0, 1000) || null;

  const admin = createAdminClient();
  const { error } = await admin.from("bistro_sales_daily").upsert(
    {
      org_id: guard.orgId,
      sale_date: saleDate,
      cash,
      promptpay,
      grab,
      line_man: lineMan,
      notes,
      recorded_by_employee_id: guard.employeeId,
      recorded_by_name: guard.fullName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,sale_date" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clock");
  revalidatePath("/reconciliation");
  return { ok: true };
}

export type BistroSalesEntry = {
  id: string;
  saleDate: string;
  cash: number;
  promptpay: number;
  grab: number;
  lineMan: number;
  total: number;
  notes: string | null;
  recordedByName: string;
  updatedAt: string;
};

/**
 * Recent Bistro daily entries, org-wide -- Bistro isn't a separate branch
 * in this schema, it's tracked under Sathorn (see the reconciliation
 * thread from Sept 2026) -- so any staff member can see what's already
 * been logged and whether today's has gone in yet.
 */
export async function listRecentBistroSales(): Promise<BistroSalesEntry[] | { error: string }> {
  const guard = await requireEmployee("clock.listBistroSales");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("bistro_sales_daily")
    .select("id, sale_date, cash, promptpay, grab, line_man, notes, recorded_by_name, updated_at")
    .eq("org_id", guard.orgId)
    .order("sale_date", { ascending: false })
    .limit(30);

  if (error || !rows) return { error: error?.message ?? "Could not load Bistro sales." };

  return rows.map((r) => {
    const cash = Number(r.cash);
    const promptpay = Number(r.promptpay);
    const grab = Number(r.grab);
    const lineMan = Number(r.line_man);
    return {
      id: r.id as string,
      saleDate: r.sale_date as string,
      cash,
      promptpay,
      grab,
      lineMan,
      total: cash + promptpay + grab + lineMan,
      notes: r.notes as string | null,
      recordedByName: r.recorded_by_name as string,
      updatedAt: r.updated_at as string,
    };
  });
}
