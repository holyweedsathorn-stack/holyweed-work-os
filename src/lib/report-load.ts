import { createClient } from "@/lib/supabase/server";
import type { Branch, Employee } from "@/lib/types";
import {
  buildMonthReport,
  monthBounds,
  monthLabel,
  FIXED_COST_CATEGORIES,
  CARRIES_FORWARD,
  BISTRO_COST_CATEGORIES,
  type BistroCostInput,
  type MonthReport,
  type PayrollInput,
  type FixedCostInput,
  type FixedCostCategory,
} from "@/lib/report";

export type LoadedMonthReport = {
  report: MonthReport;
  branches: Branch[];
  /** Month the salaries were carried over from, when none are saved for this month yet. */
  carriedFrom: string | null;
  /** "Notes for this month", as saved. */
  noteBody: string;
};

/**
 * Everything the Monthly report shows for one month, read as the signed-in
 * user. Shared by the /report page and the PDF document (/report-document),
 * so the two can never disagree about a figure.
 */
export async function loadMonthReport(month: string): Promise<LoadedMonthReport> {
  const { from, to } = monthBounds(month);
  const supabase = await createClient();

  const [
    { data: branches },
    { data: employees },
    { data: sales },
    { data: expenses },
    { data: payrollThis },
    { data: payrollPrior },
    { data: note },
    { data: fixedThis },
    { data: fixedPrior },
    { data: bistroThis },
    { data: bistroPrior },
  ] = await Promise.all([
    supabase.from("branches").select("*").order("name").returns<Branch[]>(),
    supabase.from("employees").select("*").order("full_name").returns<Employee[]>(),
    supabase
      .from("sales_daily")
      .select(
        "branch_id, sale_date, revenue, gross_sales, discount, cost, profit, bill_count, cash, card, promptpay, delivery"
      )
      .gte("sale_date", from)
      .lte("sale_date", to),
    supabase
      .from("expenses")
      .select("branch_id, expense_date, category, amount")
      .gte("expense_date", from)
      .lte("expense_date", to),
    supabase.from("payroll_month").select("*").eq("month", month),
    // For carry-forward: the most recent month already filled in.
    supabase
      .from("payroll_month")
      .select("*")
      .lt("month", month)
      .order("month", { ascending: false }),
    supabase.from("month_notes").select("body").eq("month", month).maybeSingle(),
    supabase.from("monthly_fixed_costs").select("*").eq("month", month),
    // For carry-forward: rent and internet from the most recent month set.
    supabase
      .from("monthly_fixed_costs")
      .select("*")
      .lt("month", month)
      .order("month", { ascending: false }),
    supabase.from("bistro_monthly_costs").select("month, category, amount").eq("month", month),
    // For carry-forward: Holy Bistro rent from the most recent month set.
    supabase
      .from("bistro_monthly_costs")
      .select("month, category, amount")
      .lt("month", month)
      .order("month", { ascending: false }),
  ]);

  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const roster = (employees ?? []).filter((e) => e.active !== false);

  const savedById = new Map((payrollThis ?? []).map((p: any) => [p.employee_id as string, p]));

  // Latest prior figures per person, used when this month is still blank.
  const priorById = new Map<string, any>();
  for (const p of (payrollPrior ?? []) as any[]) {
    if (!priorById.has(p.employee_id)) priorById.set(p.employee_id, p);
  }
  const carriedFrom =
    savedById.size === 0 && (payrollPrior ?? []).length > 0
      ? monthLabel(((payrollPrior ?? []) as any[])[0].month as string)
      : null;

  const payroll: PayrollInput[] = roster.map((e) => {
    const saved = savedById.get(e.id);
    const prior = priorById.get(e.id);
    const src = saved ?? prior;
    return {
      employeeId: e.id,
      name: e.full_name,
      branchName: branchName.get(e.branch_id) ?? "—",
      base: Number(src?.base_salary ?? 0) || 0,
      incentive: Number(saved?.incentive ?? 0) || 0, // incentives never carry over
      carried: !saved && !!prior,
    };
  });

  // Rent and internet carry over from the last month they were set; metered
  // bills start blank so a stale figure can't be saved by accident.
  const fixedSaved = new Map(
    ((fixedThis ?? []) as any[]).map((f) => [`${f.branch_id}|${f.category}`, f])
  );
  const fixedPriorByKey = new Map<string, any>();
  for (const f of (fixedPrior ?? []) as any[]) {
    const k = `${f.branch_id}|${f.category}`;
    if (!fixedPriorByKey.has(k)) fixedPriorByKey.set(k, f);
  }

  const fixedCosts: FixedCostInput[] = (branches ?? []).flatMap((b) =>
    FIXED_COST_CATEGORIES.map((c) => {
      const k = `${b.id}|${c}`;
      const saved = fixedSaved.get(k);
      const prior = CARRIES_FORWARD[c] ? fixedPriorByKey.get(k) : null;
      const src = saved ?? prior;
      return {
        branchId: b.id,
        branchName: b.name,
        category: c as FixedCostCategory,
        amount: Number(src?.amount ?? 0) || 0,
        carried: !saved && !!prior,
      };
    })
  );

  // Holy Bistro has no branch row, so its rent and electricity live in their
  // own table. Same rule as the branches: rent carries over from the latest
  // earlier month, electricity starts blank.
  const bistroSaved = new Map(((bistroThis ?? []) as any[]).map((r) => [r.category as string, r]));
  const bistroPriorByCat = new Map<string, any>();
  for (const r of (bistroPrior ?? []) as any[]) {
    if (!bistroPriorByCat.has(r.category)) bistroPriorByCat.set(r.category, r);
  }
  const bistroCosts: BistroCostInput[] = BISTRO_COST_CATEGORIES.map((c) => {
    const saved = bistroSaved.get(c);
    const prior = CARRIES_FORWARD[c] ? bistroPriorByCat.get(c) : null;
    const src = saved ?? prior;
    return { category: c, amount: Number(src?.amount ?? 0) || 0, carried: !saved && !!prior };
  });

  const report = buildMonthReport({
    month,
    branches: (branches ?? []).map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
    sales: (sales ?? []) as any[],
    expenses: (expenses ?? []) as any[],
    payroll,
    fixedCosts,
    bistroCosts,
  });

  return { report, branches: branches ?? [], carriedFrom, noteBody: ((note as any)?.body as string) ?? "" };
}
