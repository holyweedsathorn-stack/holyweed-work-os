"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export type ChecklistBusiness = "leadership" | "holyweed" | "bistro" | "hostel";
export type ChecklistFrequency = "daily" | "weekly" | "monthly";

export type ChecklistItem = {
  id: string;
  business: ChecklistBusiness;
  frequency: ChecklistFrequency;
  title: string;
  done: boolean;
};

// Bangkok is a fixed UTC+7 with no DST — shift "now" and read its UTC parts
// as if they were local, rather than pulling in a timezone library.
function bangkokNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(weekNo)}`;
}

function periodKeyFor(frequency: ChecklistFrequency): string {
  const now = bangkokNow();
  if (frequency === "daily") {
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  }
  if (frequency === "monthly") {
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  }
  return isoWeekKey(now);
}

/**
 * A first-time manager's recurring routine across all of Holy Group:
 * leadership habits plus per-business daily/weekly/monthly checks.
 * Completion is scoped to the current period_key, so items reset on their
 * own — a new day/week/month simply has no completion row yet.
 */
export async function listChecklist(): Promise<ChecklistItem[] | { error: string }> {
  const guard = await requireManager("checklist.list");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const { data: items, error } = await admin
    .from("manager_checklist_items")
    .select("id, business, frequency, title, sort_order")
    .eq("org_id", guard.orgId)
    .eq("active", true)
    .order("business", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error || !items) return { error: error?.message ?? "Could not load the checklist." };

  const periods: Record<ChecklistFrequency, string> = {
    daily: periodKeyFor("daily"),
    weekly: periodKeyFor("weekly"),
    monthly: periodKeyFor("monthly"),
  };

  const { data: completions, error: compError } = await admin
    .from("manager_checklist_completions")
    .select("item_id, period_key")
    .eq("org_id", guard.orgId)
    .in("period_key", Object.values(periods));

  if (compError) return { error: compError.message };

  const doneSet = new Set(
    (completions ?? []).map((c) => `${c.item_id as string}:${c.period_key as string}`)
  );

  return items.map((it) => {
    const frequency = it.frequency as ChecklistFrequency;
    return {
      id: it.id as string,
      business: it.business as ChecklistBusiness,
      frequency,
      title: it.title as string,
      done: doneSet.has(`${it.id as string}:${periods[frequency]}`),
    };
  });
}

export type ChecklistResult = { ok: true } | { ok: false; error: string };

export async function toggleChecklistItem(
  itemId: string,
  frequency: ChecklistFrequency,
  done: boolean
): Promise<ChecklistResult> {
  const guard = await requireManager(
    "checklist.toggle",
    "Only owners and managers can update the checklist."
  );
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const periodKey = periodKeyFor(frequency);

  if (done) {
    const { error } = await admin.from("manager_checklist_completions").upsert(
      {
        org_id: guard.orgId,
        item_id: itemId,
        period_key: periodKey,
        completed_by: guard.userId,
      },
      { onConflict: "item_id,period_key" }
    );
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin
      .from("manager_checklist_completions")
      .delete()
      .eq("org_id", guard.orgId)
      .eq("item_id", itemId)
      .eq("period_key", periodKey);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/checklist");
  return { ok: true };
}
