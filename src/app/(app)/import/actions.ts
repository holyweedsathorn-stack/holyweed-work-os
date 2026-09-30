"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSilomFile, guessBranchSlug, ParseError } from "@/lib/silom";
import { parseExpenseFile, categoryLabel } from "@/lib/expenses-sheet";
import { requireManager } from "@/lib/guard";

export type PreviewResult =
  | {
      ok: true;
      kind: "daily" | "product" | "expenses";
      shopName: string | null;
      branchSlug: string | null;
      periodStart: string | null;
      periodEnd: string | null;
      rowCount: number;
      totalRevenue: number;
      totalProfit: number | null;
      sample: { label: string; a: string; b: string }[];
      warnings?: string[];
    }
  | { ok: false; error: string };

export type ImportResult =
  | { ok: true; kind: "daily" | "product" | "expenses"; rowCount: number; branchName: string; warnings?: string[] }
  | { ok: false; error: string };
/** Read the uploaded file out of the form, with a size sanity check. */
type FileResult =
  | { ok: false; error: string }
  | { ok: true; file: File; buf: Buffer };

async function fileFrom(formData: FormData): Promise<FileResult> {
  const file = formData.get("file");
  if (!file || typeof file === "string") return { ok: false, error: "Please choose a file to upload." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, error: "That file is larger than 15MB. Export a shorter date range." };
  }
  return { ok: true, file, buf: Buffer.from(await file.arrayBuffer()) };
}

const fmt = (n: number) => "฿" + Math.round(n).toLocaleString("en-US");

/**
 * Read the file and describe what it contains, without writing anything.
 * The file is parsed again on import — cheap, and avoids shuttling the whole
 * dataset back and forth through the browser.
 */
export async function previewImport(formData: FormData): Promise<PreviewResult> {
  const guard = await requireManager("import.previewImport", "Only owners and managers can import sales.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const got = await fileFrom(formData);
  if (!got.ok) return { ok: false, error: got.error };

  // An expense workbook has a month-name tab and category columns; a Silom
  // report has a Shop/From/To preamble. Try Silom first, fall back to expenses.
  let parsed;
  try {
    parsed = parseSilomFile(got.file.name, got.buf);
  } catch (silomErr: any) {
    try {
      const exp = parseExpenseFile(got.file.name, got.buf);
      const total = exp.rows.reduce((s, r) => s + r.amount, 0);

      const byCat = new Map<string, number>();
      for (const r of exp.rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);

      return {
        ok: true,
        kind: "expenses",
        shopName: null,
        branchSlug: guessBranchSlug(got.file.name),
        periodStart: exp.months[0] ? exp.months[0] + "-01" : null,
        periodEnd: exp.months[exp.months.length - 1] ?? null,
        rowCount: exp.rows.length,
        totalRevenue: total,
        totalProfit: null,
        sample: [...byCat.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([cat, amt]) => ({
            label: categoryLabel(cat),
            a: fmt(amt),
            b: `${exp.rows.filter((r) => r.category === cat).length} entries`,
          })),
        warnings: exp.warnings.map((w) => `${w.sheet}: ${w.message}`),
      };
    } catch (expErr: any) {
      const msg = silomErr instanceof ParseError ? silomErr.message : expErr.message;
      return { ok: false, error: msg };
    }
  }

  try {
    const branchSlug = guessBranchSlug(parsed.shopName);

    if (parsed.kind === "daily") {
      const totalRevenue = parsed.rows.reduce((s, r) => s + r.revenue, 0);
      const anyProfit = parsed.rows.some((r) => r.profit != null);
      const totalProfit = anyProfit
        ? parsed.rows.reduce((s, r) => s + (r.profit ?? 0), 0)
        : null;

      return {
        ok: true,
        kind: "daily",
        shopName: parsed.shopName,
        branchSlug,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        rowCount: parsed.rows.length,
        totalRevenue,
        totalProfit,
        sample: parsed.rows.slice(0, 5).map((r) => ({
          label: r.date,
          a: fmt(r.revenue),
          b: r.profit != null ? fmt(r.profit) : "—",
        })),
      };
    }

    const totalRevenue = parsed.rows.reduce((s, r) => s + r.revenue, 0);
    const anyProfit = parsed.rows.some((r) => r.profit != null);
    const totalProfit = anyProfit ? parsed.rows.reduce((s, r) => s + (r.profit ?? 0), 0) : null;

    return {
      ok: true,
      kind: "product",
      shopName: parsed.shopName,
      branchSlug,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      rowCount: parsed.rows.length,
      totalRevenue,
      totalProfit,
      sample: [...parsed.rows]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((r) => ({ label: r.name, a: fmt(r.revenue), b: `${r.units} sold` })),
    };
  } catch (e: any) {
    if (e instanceof ParseError) return { ok: false, error: e.message };
    return { ok: false, error: `Couldn't read that file: ${e.message}` };
  }
}

/**
 * Write the file's contents into the database.
 *
 * Re-importing the same period is safe: daily rows are keyed on
 * (branch, date) and product rows on (product, branch, period), so a second
 * upload of the same export updates the existing figures rather than adding
 * duplicates.
 */
export async function runImport(formData: FormData): Promise<ImportResult> {
  const guard = await requireManager("import.runImport", "Only owners and managers can import sales.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const branchId = String(formData.get("branch_id") || "");
  if (!branchId) return { ok: false, error: "Please choose which branch this file is for." };

  const got = await fileFrom(formData);
  if (!got.ok) return { ok: false, error: got.error };

  const admin = createAdminClient();

  const { data: branch } = await admin
    .from("branches")
    .select("id, name, org_id")
    .eq("id", branchId)
    .single();

  if (!branch || branch.org_id !== guard.orgId) {
    return { ok: false, error: "That branch doesn't belong to your organization." };
  }

  let parsed;
  try {
    parsed = parseSilomFile(got.file.name, got.buf);
  } catch (silomErr: any) {
    // Not a Silom report — try it as an expense workbook.
    try {
      const exp = parseExpenseFile(got.file.name, got.buf);

      const rows = exp.rows.map((r) => ({
        org_id: guard.orgId,
        branch_id: branchId,
        expense_date: r.date,
        category: r.category,
        amount: r.amount,
        description: r.description,
        source: "sheet",
      }));

      // The sheets can list the same category twice for one day; combine
      // those before upserting, or the unique key rejects the batch.
      const merged = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const key = `${r.expense_date}|${r.category}`;
        const prev = merged.get(key);
        if (prev) {
          prev.amount += r.amount;
          prev.description = [prev.description, r.description].filter(Boolean).join("; ") || null;
        } else {
          merged.set(key, { ...r });
        }
      }

      const { error } = await admin
        .from("expenses")
        .upsert([...merged.values()], { onConflict: "branch_id,expense_date,category" });

      if (error) return { ok: false, error: error.message };

      await admin.from("sales_imports").insert({
        org_id: guard.orgId,
        branch_id: branchId,
        kind: "expenses",
        file_name: got.file.name,
        period_start: exp.months[0] ? exp.months[0] + "-01" : null,
        period_end: null,
        row_count: merged.size,
        imported_by: guard.userId,
      });

      revalidatePath("/import");
      revalidatePath("/shop");

      return {
        ok: true,
        kind: "expenses",
        rowCount: merged.size,
        branchName: branch.name as string,
        warnings: exp.warnings.map((w) => `${w.sheet}: ${w.message}`),
      };
    } catch (expErr: any) {
      const msg = silomErr instanceof ParseError ? silomErr.message : expErr.message;
      return { ok: false, error: msg };
    }
  }

  if (parsed.kind === "daily") {
    const rows = parsed.rows.map((r) => ({
      org_id: guard.orgId,
      branch_id: branchId,
      sale_date: r.date,
      revenue: r.revenue,
      gross_sales: r.grossSales,
      discount: r.discount,
      cost: r.cost,
      profit: r.profit,
      bill_count: r.billCount,
      cash: r.cash,
      card: r.card,
      promptpay: r.promptpay,
      delivery: r.delivery,
      source: "silom",
    }));

    const { error } = await admin
      .from("sales_daily")
      .upsert(rows, { onConflict: "branch_id,sale_date" });

    if (error) return { ok: false, error: error.message };
  } else {
    if (!parsed.periodStart || !parsed.periodEnd) {
      return {
        ok: false,
        error:
          "That product report has no From/To dates, so it can't be filed against a period. Re-export it from Silom without editing the file.",
      };
    }

    // Make sure every product exists, matched on PLU code where there is one.
    for (const r of parsed.rows) {
      if (r.pluCode) {
        await admin
          .from("products")
          .upsert(
            {
              org_id: guard.orgId,
              plu_code: r.pluCode,
              name: r.name,
              category: r.category ?? "Uncategorised",
            },
            { onConflict: "org_id,plu_code" }
          );
      } else {
        const { data: existing } = await admin
          .from("products")
          .select("id")
          .eq("org_id", guard.orgId)
          .eq("name", r.name)
          .is("plu_code", null)
          .maybeSingle();
        if (!existing) {
          await admin.from("products").insert({
            org_id: guard.orgId,
            name: r.name,
            category: r.category ?? "Uncategorised",
          });
        }
      }
    }

    // Look up the ids we just ensured exist.
    const { data: products } = await admin
      .from("products")
      .select("id, name, plu_code")
      .eq("org_id", guard.orgId);

    const byPlu = new Map((products ?? []).filter((p) => p.plu_code).map((p) => [p.plu_code, p.id]));
    const byName = new Map((products ?? []).map((p) => [p.name, p.id]));

    const salesRows = parsed.rows
      .map((r) => {
        const productId = (r.pluCode ? byPlu.get(r.pluCode) : null) ?? byName.get(r.name);
        if (!productId) return null;
        return {
          org_id: guard.orgId,
          product_id: productId,
          branch_id: branchId,
          period_start: parsed.periodStart,
          period_end: parsed.periodEnd,
          units: r.units,
          // revenue is net of discount; the gross is kept for reference.
          revenue: r.revenue,
          gross_revenue: r.grossRevenue,
          discount: r.discount,
          cost: r.cost,
          profit: r.profit,
          imported_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as any[];

    const { error } = await admin
      .from("product_sales")
      .upsert(salesRows, { onConflict: "product_id,branch_id,period_start,period_end" });

    if (error) return { ok: false, error: error.message };
  }

  await admin.from("sales_imports").insert({
    org_id: guard.orgId,
    branch_id: branchId,
    kind: parsed.kind,
    file_name: got.file.name,
    period_start: parsed.periodStart,
    period_end: parsed.periodEnd,
    row_count: parsed.rows.length,
    imported_by: guard.userId,
  });

  revalidatePath("/import");
  revalidatePath("/shop");
  revalidatePath("/dashboard");

  return {
    ok: true,
    kind: parsed.kind,
    rowCount: parsed.rows.length,
    branchName: branch.name as string,
  };
}
