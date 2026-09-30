"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/guard";
import {
  parseBankStatementPdf,
  autoCategory,
  typeKeyOf,
  SHARED_ACCOUNT,
  StatementParseError,
  type ParsedStatement,
} from "@/lib/bank-statement";

export type PreviewResult =
  | {
      ok: true;
      accountName: string | null;
      accountNumber: string | null;
      periodStart: string | null;
      periodEnd: string | null;
      rowCount: number;
      totalIn: number;
      totalOut: number;
      autoTagged: { otaPayout: number; other: number; uncategorized: number };
      skipped: { count: number; samples: string[] };
      possibleDuplicates: { count: number; samples: string[] };
    }
  | { ok: false; error: string; needsPassword?: boolean };

export type ImportResult =
  | {
      ok: true;
      rowCount: number;
      newRowCount: number;
      bankAccountLabel: string;
      skipped: { count: number; samples: string[] };
      possibleDuplicates: { count: number; samples: string[] };
    }
  | { ok: false; error: string; needsPassword?: boolean };

async function fileFrom(formData: FormData): Promise<{ ok: true; buf: Buffer; name: string } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!file || typeof file === "string") return { ok: false, error: "Please choose a PDF to upload." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, error: "That file is larger than 20MB." };
  }
  return { ok: true, buf: Buffer.from(await file.arrayBuffer()), name: file.name };
}

function summarize(parsed: ParsedStatement) {
  const totalIn = parsed.transactions.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
  const totalOut = parsed.transactions.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);
  const autoTagged = { otaPayout: 0, other: 0, uncategorized: 0 };
  for (const t of parsed.transactions) {
    const c = autoCategory(t);
    if (c === "ota_payout") autoTagged.otaPayout++;
    else if (c === "other") autoTagged.other++;
    else autoTagged.uncategorized++;
  }
  return { totalIn, totalOut, autoTagged };
}

/** Parse the PDF and describe what's in it, without writing anything. */
export async function previewStatement(formData: FormData): Promise<PreviewResult> {
  const guard = await requireManager("reconciliation.previewStatement", "Only owners and managers can upload bank statements.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const got = await fileFrom(formData);
  if (!got.ok) return { ok: false, error: got.error };

  const password = String(formData.get("password") || "") || undefined;

  try {
    const parsed = await parseBankStatementPdf(got.buf, password);
    const { totalIn, totalOut, autoTagged } = summarize(parsed);
    return {
      ok: true,
      accountName: parsed.accountName,
      accountNumber: parsed.accountNumber,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      rowCount: parsed.transactions.length,
      totalIn,
      totalOut,
      autoTagged,
      skipped: parsed.skipped,
      possibleDuplicates: parsed.possibleDuplicates,
    };
  } catch (e: any) {
    if (e instanceof StatementParseError) {
      return { ok: false, error: e.message, needsPassword: e.reason === "password_required" || e.reason === "wrong_password" };
    }
    return { ok: false, error: `Couldn't read that PDF: ${e?.message ?? e}` };
  }
}

function maskAccountNumber(n: string | null): string {
  if (!n) return "unknown account";
  return n.length > 4 ? "••••" + n.slice(-4) : n;
}

/**
 * Parse the PDF again (cheap -- a few seconds) and write every transaction.
 * Re-uploading the same or an overlapping statement is safe: the unique
 * constraint on bank_transactions means an already-stored row is skipped,
 * not duplicated, and its category (if a manager already tagged it) is left
 * untouched.
 */
export async function importStatement(formData: FormData): Promise<ImportResult> {
  const guard = await requireManager("reconciliation.importStatement", "Only owners and managers can upload bank statements.");
  if (!guard.ok) return { ok: false, error: guard.error };

  const got = await fileFrom(formData);
  if (!got.ok) return { ok: false, error: got.error };

  const password = String(formData.get("password") || "") || undefined;

  let parsed: ParsedStatement;
  try {
    parsed = await parseBankStatementPdf(got.buf, password);
  } catch (e: any) {
    if (e instanceof StatementParseError) {
      return { ok: false, error: e.message, needsPassword: e.reason === "password_required" || e.reason === "wrong_password" };
    }
    return { ok: false, error: `Couldn't read that PDF: ${e?.message ?? e}` };
  }

  const admin = createAdminClient();

  // One bank_accounts row per distinct account number in this org --
  // reuse it across statements instead of creating a new one each upload.
  const maskedNumber = maskAccountNumber(parsed.accountNumber);
  let bankAccountId: string;
  {
    const { data: existing } = await admin
      .from("bank_accounts")
      .select("id")
      .eq("org_id", guard.orgId)
      .eq("account_number_masked", maskedNumber)
      .maybeSingle();
    if (existing) {
      bankAccountId = existing.id as string;
    } else {
      const { data: created, error } = await admin
        .from("bank_accounts")
        .insert({
          org_id: guard.orgId,
          label: parsed.accountName ? `${parsed.accountName} (${maskedNumber})` : maskedNumber,
          bank_name: parsed.bankName,
          account_number_masked: maskedNumber,
        })
        .select("id")
        .single();
      if (error || !created) return { ok: false, error: error?.message ?? "Couldn't create the bank account record." };
      bankAccountId = created.id as string;
    }
  }

  const { data: statement, error: stmtErr } = await admin
    .from("bank_statements")
    .insert({
      org_id: guard.orgId,
      bank_account_id: bankAccountId,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      source_filename: got.name,
      row_count: parsed.transactions.length,
      uploaded_by: guard.userId,
    })
    .select("id")
    .single();
  if (stmtErr || !statement) return { ok: false, error: stmtErr?.message ?? "Couldn't save the statement record." };

  // Krungthai only prints minute-level timestamps, so two transactions can
  // (and often do) share the exact same txn_date + txn_time -- a busy day
  // easily has hundreds of PromptPay deposits. line_seq preserves the
  // order they actually appear in the PDF (always true chronological
  // order) as the tiebreaker for those ties, so the reconciliation
  // ledger's running-balance check doesn't mistake a same-minute pair
  // stored out of order for missing money. Continue numbering after
  // whatever's already stored for this account, so a second upload still
  // stacks after the first rather than colliding with it.
  const { data: maxSeqRow } = await admin
    .from("bank_transactions")
    .select("line_seq")
    .eq("bank_account_id", bankAccountId)
    .order("line_seq", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const startSeq = (maxSeqRow?.line_seq ?? 0) + 1;

  const rows = parsed.transactions.map((t, i) => ({
    org_id: guard.orgId,
    bank_account_id: bankAccountId,
    statement_id: statement.id,
    txn_date: t.date,
    txn_time: t.time,
    direction: t.direction,
    amount: t.amount,
    balance_after: t.balanceAfter,
    description: t.description,
    category: autoCategory(t),
    line_seq: startSeq + i,
  }));

  // ignoreDuplicates: a row that already exists (matched by the unique key)
  // is left as-is, including any category a manager already set on it --
  // re-uploading never clobbers work already done.
  const { data: inserted, error: insertErr } = await admin
    .from("bank_transactions")
    .upsert(rows, {
      onConflict: "bank_account_id,txn_date,txn_time,amount,description",
      ignoreDuplicates: true,
    })
    .select("id");
  if (insertErr) return { ok: false, error: insertErr.message };

  revalidatePath("/reconciliation");

  return {
    ok: true,
    rowCount: parsed.transactions.length,
    newRowCount: inserted?.length ?? 0,
    bankAccountLabel: parsed.accountName ? `${parsed.accountName} (${maskedNumber})` : maskedNumber,
    skipped: parsed.skipped,
    possibleDuplicates: parsed.possibleDuplicates,
  };
}

export type CategorizeResult = { ok: true; updated: number } | { ok: false; error: string };

/**
 * Bulk-tag every still-uncategorized inbound transaction whose description
 * starts with `typeKey` (e.g. "Transfer in-PromptPay (MORISD)") as POS
 * income for one branch, or for every branch combined if the account is
 * shared. This is the main categorizing action on the page -- a statement's
 * ~1,000 rows usually collapse into a handful of these patterns, so tagging
 * by pattern instead of one row at a time is what makes a new statement
 * usable in a couple of clicks.
 */
export async function categorizePatternAsPosSale(typeKey: string, branchId: string): Promise<CategorizeResult> {
  const guard = await requireManager("reconciliation.categorize", "Only owners and managers can categorize transactions.");
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!typeKey) return { ok: false, error: "Nothing selected." };

  const admin = createAdminClient();

  let resolvedBranchId: string | null = null;
  if (branchId !== SHARED_ACCOUNT) {
    const { data: branch } = await admin.from("branches").select("id, org_id").eq("id", branchId).single();
    if (!branch || branch.org_id !== guard.orgId) return { ok: false, error: "That branch doesn't belong to your organization." };
    resolvedBranchId = branchId;
  }

  const { error, count } = await admin
    .from("bank_transactions")
    .update({ category: "pos_sale", branch_id: resolvedBranchId }, { count: "exact" })
    .eq("org_id", guard.orgId)
    .eq("category", "uncategorized")
    .eq("direction", "in")
    // ilike, not like: typeKeyOf() title-cases sender names for a stable,
    // consistent group key, but the bank prints the same person's name in
    // different case from row to row ("Andrew tjoe" vs "ANDREW TJOE") --
    // a case-sensitive match here would silently tag only some of them.
    .ilike("description", `${typeKey}%`);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/reconciliation");
  return { ok: true, updated: count ?? 0 };
}

/**
 * Bulk-tag every still-uncategorized inbound transaction whose description
 * starts with `typeKey` as a hostel guest's direct bank-wire payment --
 * separate from `pos_sale` because these never touch Silom/PromptPay at
 * all, so comparing them against PromptPay sales would just manufacture a
 * permanent mismatch. Compared instead against hostel_stays.amount_thb for
 * bank_transfer-paid check-ins on the same day (see the reconciliation
 * page's hostelComparisonRows).
 */
export async function categorizePatternAsHostelTransfer(typeKey: string, branchId: string): Promise<CategorizeResult> {
  const guard = await requireManager("reconciliation.categorize", "Only owners and managers can categorize transactions.");
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!typeKey) return { ok: false, error: "Nothing selected." };

  const admin = createAdminClient();

  let resolvedBranchId: string | null = null;
  if (branchId !== SHARED_ACCOUNT) {
    const { data: branch } = await admin.from("branches").select("id, org_id").eq("id", branchId).single();
    if (!branch || branch.org_id !== guard.orgId) return { ok: false, error: "That branch doesn't belong to your organization." };
    resolvedBranchId = branchId;
  }

  const { error, count } = await admin
    .from("bank_transactions")
    .update({ category: "hostel_transfer", branch_id: resolvedBranchId }, { count: "exact" })
    .eq("org_id", guard.orgId)
    .eq("category", "uncategorized")
    .eq("direction", "in")
    // ilike, not like: typeKeyOf() title-cases sender names for a stable,
    // consistent group key, but the bank prints the same person's name in
    // different case from row to row ("Andrew tjoe" vs "ANDREW TJOE") --
    // a case-sensitive match here would silently tag only some of them.
    .ilike("description", `${typeKey}%`);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/reconciliation");
  return { ok: true, updated: count ?? 0 };
}

/**
 * Bulk-tag every still-uncategorized inbound transaction whose description
 * starts with `typeKey` as a branch's tab/running-account revenue -- a
 * customer who buys now and settles later in one lump sum by bank
 * transfer, with no PromptPay record (it's not a QR sale) and no hostel
 * check-in to match against (it's not a booking). Real revenue for the
 * branch, just shown as a running total instead of a day-by-day
 * comparison, since there's nothing on the other side to compare against.
 */
export async function categorizePatternAsBranchTransfer(typeKey: string, branchId: string): Promise<CategorizeResult> {
  const guard = await requireManager("reconciliation.categorize", "Only owners and managers can categorize transactions.");
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!typeKey) return { ok: false, error: "Nothing selected." };
  if (!branchId) return { ok: false, error: "Choose a branch." };
  // Unlike a PromptPay QR or a hostel booking, a tab is always run at one
  // specific place -- "shared account" has no meaning here, and silently
  // storing branch_id = null would make these transactions vanish from
  // the Tab / running-account card entirely (it skips rows with no
  // branch), the exact kind of silent-drop bug this reconciliation work
  // has been about fixing.
  if (branchId === SHARED_ACCOUNT) {
    return { ok: false, error: "A tab has to belong to one specific branch -- choose it from the dropdown instead of \"All branches (shared account)\"." };
  }

  const admin = createAdminClient();

  const { data: branch } = await admin.from("branches").select("id, org_id").eq("id", branchId).single();
  if (!branch || branch.org_id !== guard.orgId) return { ok: false, error: "That branch doesn't belong to your organization." };

  const { error, count } = await admin
    .from("bank_transactions")
    .update({ category: "branch_transfer", branch_id: branchId }, { count: "exact" })
    .eq("org_id", guard.orgId)
    .eq("category", "uncategorized")
    .eq("direction", "in")
    // ilike, not like -- see the note on categorizePatternAsHostelTransfer.
    .ilike("description", `${typeKey}%`);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/reconciliation");
  return { ok: true, updated: count ?? 0 };
}

/** Mark every transaction matching a pattern as not sales-related (a refund, a personal transfer, etc.). */
export async function categorizePatternAsOther(typeKey: string): Promise<CategorizeResult> {
  const guard = await requireManager("reconciliation.categorize", "Only owners and managers can categorize transactions.");
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!typeKey) return { ok: false, error: "Nothing selected." };

  const admin = createAdminClient();
  const { error, count } = await admin
    .from("bank_transactions")
    .update({ category: "other", branch_id: null }, { count: "exact" })
    .eq("org_id", guard.orgId)
    .eq("category", "uncategorized")
    .eq("direction", "in")
    // ilike, not like: typeKeyOf() title-cases sender names for a stable,
    // consistent group key, but the bank prints the same person's name in
    // different case from row to row ("Andrew tjoe" vs "ANDREW TJOE") --
    // a case-sensitive match here would silently tag only some of them.
    .ilike("description", `${typeKey}%`);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/reconciliation");
  return { ok: true, updated: count ?? 0 };
}
