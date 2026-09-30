"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export type CurrencyTransaction = {
  id: string;
  employeeName: string;
  branchName: string;
  currencyCode: string;
  foreignAmount: number;
  rateThbPerUnit: number;
  feeThb: number;
  totalThb: number;
  createdAt: string;
};

export type CurrencySummary = {
  count: number;
  totalThb: number;
  byCurrency: { code: string; count: number; totalThb: number }[];
};

export type CurrencyLogResult =
  | { transactions: CurrencyTransaction[]; summary: CurrencySummary }
  | { error: string };

/**
 * Every completed foreign-cash transaction in a given Bangkok month, newest
 * first, plus a rollup by currency — what "check on who was on shift and
 * what the rate was" at month end actually needs.
 *
 * `month` is "YYYY-MM" in Bangkok local time; we convert that to a UTC
 * range since Bangkok is a fixed UTC+7 with no DST.
 */
export async function listCurrencyTransactions(month: string): Promise<CurrencyLogResult> {
  const guard = await requireManager("currencyLog.list");
  if (!guard.ok) return { error: guard.error };

  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return { error: "Invalid month." };
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const startUtc = new Date(Date.UTC(year, monthIndex, 1) - BANGKOK_OFFSET_MS);
  const endUtc = new Date(Date.UTC(year, monthIndex + 1, 1) - BANGKOK_OFFSET_MS);

  const admin = createAdminClient();
  const [{ data: rows, error }, { data: branches }] = await Promise.all([
    admin
      .from("currency_transactions")
      .select(
        "id, employee_name, branch_id, currency_code, foreign_amount, rate_thb_per_unit, fee_thb, total_thb, created_at"
      )
      .eq("org_id", guard.orgId)
      .gte("created_at", startUtc.toISOString())
      .lt("created_at", endUtc.toISOString())
      .order("created_at", { ascending: false }),
    admin.from("branches").select("id, name").eq("org_id", guard.orgId),
  ]);

  if (error || !rows) return { error: error?.message ?? "Could not load the currency log." };

  const branchById = new Map((branches ?? []).map((b) => [b.id as string, b.name as string]));

  const transactions: CurrencyTransaction[] = rows.map((r) => ({
    id: r.id as string,
    employeeName: r.employee_name as string,
    branchName: branchById.get(r.branch_id as string) ?? "—",
    currencyCode: r.currency_code as string,
    foreignAmount: Number(r.foreign_amount),
    rateThbPerUnit: Number(r.rate_thb_per_unit),
    feeThb: Number(r.fee_thb),
    totalThb: Number(r.total_thb),
    createdAt: r.created_at as string,
  }));

  const byCurrencyMap = new Map<string, { count: number; totalThb: number }>();
  let totalThb = 0;
  for (const t of transactions) {
    totalThb += t.totalThb;
    const bucket = byCurrencyMap.get(t.currencyCode) ?? { count: 0, totalThb: 0 };
    bucket.count += 1;
    bucket.totalThb += t.totalThb;
    byCurrencyMap.set(t.currencyCode, bucket);
  }

  const summary: CurrencySummary = {
    count: transactions.length,
    totalThb,
    byCurrency: [...byCurrencyMap.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.totalThb - a.totalThb),
  };

  return { transactions, summary };
}

/**
 * Remove a single currency-transaction row (mistaken entry or test data).
 * Managers only; scoped to their own org so a stray id can't touch another org's row.
 */
export async function deleteCurrencyTransaction(id: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireManager("currencyLog.delete");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("currency_transactions")
    .delete()
    .eq("id", id)
    .eq("org_id", guard.orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/currency-log");
  return { ok: true };
}
