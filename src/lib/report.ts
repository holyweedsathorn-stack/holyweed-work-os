import { bangkokToday } from "@/lib/types";

/**
 * Builds the month-end report from data the app already holds:
 *
 *   sales_daily     -> revenue, discounts, cost of goods, gross profit (POS)
 *   expenses        -> shop running costs, plus salary advances paid from
 *                      petty cash (which are NOT an extra cost — they're part
 *                      of the salary earned, just handed over early)
 *   payroll_month   -> salary and incentives earned, entered per month
 *
 * Everything here is pure so the numbers can be checked without a database.
 */

export type SalesTotals = {
  grossSales: number;
  discount: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  bills: number;
  daysWithSales: number;
  /** Cash collected at the till, per Silom's "Cash" column. */
  cash: number;
  /** Card + PromptPay + delivery-app payments, which settle straight to the bank. */
  electronic: number;
};

export type BranchSales = SalesTotals & {
  branchId: string;
  name: string;
  slug: string;
};

export type PayrollLine = {
  employeeId: string;
  name: string;
  branchName: string;
  base: number;
  incentive: number;
  total: number;
  /** True when the figures were carried over from an earlier month, not saved for this one. */
  carried: boolean;
};

export type ExpenseLine = { branchName: string; category: string; label: string; amount: number };

/** Rent and utilities, entered by hand because nothing exports them. */
export const FIXED_COST_CATEGORIES = [
  "rent",
  "electricity",
  "water",
  "internet",
  "other",
] as const;

export type FixedCostCategory = (typeof FIXED_COST_CATEGORIES)[number];

export const FIXED_COST_LABEL: Record<FixedCostCategory, string> = {
  rent: "Rent",
  electricity: "Electricity",
  water: "Water",
  internet: "Internet",
  other: "Other fixed cost",
};

/**
 * Rent and internet are contracts — the same figure every month until it
 * changes, so they carry forward. Electricity and water are read off a meter
 * and start blank, because a carried-over guess that gets saved by accident
 * is worse than an empty box.
 */
export const CARRIES_FORWARD: Record<FixedCostCategory, boolean> = {
  rent: true,
  electricity: false,
  water: false,
  internet: true,
  other: false,
};

export type FixedCostInput = {
  branchId: string;
  branchName: string;
  category: FixedCostCategory;
  amount: number;
  /** Brought over from an earlier month rather than saved for this one. */
  carried: boolean;
};

export type MonthReport = {
  month: string;
  monthLabel: string;
  /** Days of the month that have happened — the whole month once it's over. */
  daysElapsed: number;
  daysInMonth: number;
  branches: BranchSales[];
  combined: SalesTotals;
  gaps: { name: string; missing: number }[];
  payroll: PayrollLine[];
  payrollBase: number;
  payrollIncentive: number;
  payrollTotal: number;
  advances: ExpenseLine[];
  advancesTotal: number;
  remainingPayable: number;
  shopExpenses: ExpenseLine[];
  shopExpensesTotal: number;
  fixedCosts: FixedCostInput[];
  fixedCostsByBranch: { branchId: string; branchName: string; total: number }[];
  fixedCostsTotal: number;
  operatingTotal: number;
  netProfit: number;
  cashBank: CashBank;
};

export type CashBank = {
  /** Cash collected at the till, per Silom's "Cash" column. */
  cashCollected: number;
  /** Card + PromptPay + delivery-app payments, which settle straight to the bank. */
  electronicCollected: number;
  /** Days of sales in the period that predate this split being captured. */
  daysMissingBreakdown: number;
  totalDays: number;
  /**
   * Cash paid out of the till rather than the bank: shop expenses and the
   * whole team's salary & incentives, both paid straight from today's till
   * cash.
   */
  cashPaidOut: number;
  /** What should physically be sitting in the shop, ready to bank. */
  cashToDeposit: number;
  /** Electronic sales less bills paid straight from the company bank account. */
  bankPaidOut: number;
  bankNetThisMonth: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  operating: "Running costs",
  cogs: "Cost of goods",
  other: "Uncategorised",
  salary: "Salary advances",
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** "2026-07" -> "July 2026" */
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** First and last day of the month, as YYYY-MM-DD. */
export function monthBounds(month: string) {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
}

/** The months worth offering in the picker: this month back through `count`. */
export function recentMonths(count = 18, today = bangkokToday()): string[] {
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

const emptyTotals = (): SalesTotals => ({
  grossSales: 0,
  discount: 0,
  netRevenue: 0,
  cogs: 0,
  grossProfit: 0,
  bills: 0,
  daysWithSales: 0,
  cash: 0,
  electronic: 0,
});

export type BranchRow = { id: string; name: string; slug: string };
export type SalesRow = {
  branch_id: string;
  sale_date: string;
  revenue: unknown;
  gross_sales?: unknown;
  discount?: unknown;
  cost?: unknown;
  profit?: unknown;
  bill_count?: unknown;
  cash?: unknown;
  card?: unknown;
  promptpay?: unknown;
  delivery?: unknown;
};
export type ExpenseRow = {
  branch_id: string | null;
  expense_date: string | null;
  category: string;
  amount: unknown;
};
export type PayrollInput = {
  employeeId: string;
  name: string;
  branchName: string;
  base: number;
  incentive: number;
  carried: boolean;
};

export function buildMonthReport(opts: {
  month: string;
  branches: BranchRow[];
  sales: SalesRow[];
  expenses: ExpenseRow[];
  payroll: PayrollInput[];
  fixedCosts?: FixedCostInput[];
  today?: string;
}): MonthReport {
  const { month, branches, sales, expenses, payroll } = opts;
  const fixedCosts = opts.fixedCosts ?? [];
  const today = opts.today ?? bangkokToday();
  const total = daysInMonth(month);
  // A month still running is only judged on the days that have happened.
  const daysElapsed = today.slice(0, 7) === month ? Number(today.slice(8, 10)) : total;

  // ------------------------------------------------------------ sales
  const byBranch = new Map<string, BranchSales>();
  const seenDates = new Map<string, Set<string>>();
  for (const b of branches) {
    byBranch.set(b.id, { ...emptyTotals(), branchId: b.id, name: b.name, slug: b.slug });
    seenDates.set(b.id, new Set());
  }

  // Cash vs. electronic split, from Silom's Cash/Credit/PromptPay/Delivery
  // columns. Rows imported before that split was captured carry all four as
  // null — those are counted separately rather than silently treated as zero,
  // so an old month doesn't quietly under-report cash on hand.
  let daysMissingBreakdown = 0;
  let totalDays = 0;

  for (const row of sales) {
    const t = byBranch.get(row.branch_id);
    if (!t) continue;
    const revenue = n(row.revenue);
    t.netRevenue += revenue;
    // Older rows predate the fuller import, so fall back sensibly.
    t.grossSales += row.gross_sales == null ? revenue : n(row.gross_sales);
    t.discount += n(row.discount);
    t.cogs += n(row.cost);
    t.grossProfit += row.profit == null ? revenue - n(row.cost) : n(row.profit);
    t.bills += n(row.bill_count);
    seenDates.get(row.branch_id)!.add(row.sale_date);

    totalDays += 1;
    const hasBreakdown =
      row.cash != null || row.card != null || row.promptpay != null || row.delivery != null;
    if (!hasBreakdown) {
      daysMissingBreakdown += 1;
    } else {
      t.cash += n(row.cash);
      t.electronic += n(row.card) + n(row.promptpay) + n(row.delivery);
    }
  }

  const branchSales = [...byBranch.values()];
  for (const t of branchSales) t.daysWithSales = seenDates.get(t.branchId)!.size;

  const combined = branchSales.reduce<SalesTotals>((a, b) => {
    a.grossSales += b.grossSales;
    a.discount += b.discount;
    a.netRevenue += b.netRevenue;
    a.cogs += b.cogs;
    a.grossProfit += b.grossProfit;
    a.bills += b.bills;
    a.cash += b.cash;
    a.electronic += b.electronic;
    return a;
  }, emptyTotals());
  combined.daysWithSales = Math.max(0, ...branchSales.map((b) => b.daysWithSales));

  const gaps = branchSales
    .map((b) => ({ name: b.name, missing: daysElapsed - b.daysWithSales }))
    .filter((g) => g.missing > 0);

  // ------------------------------------------------------------ expenses
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const bucket = new Map<string, ExpenseLine>();
  for (const e of expenses) {
    if (!e.expense_date) continue;
    const bn = e.branch_id ? (branchName.get(e.branch_id) ?? "Unassigned") : "Unassigned";
    const key = `${bn}|${e.category}`;
    const line = bucket.get(key) ?? {
      branchName: bn,
      category: e.category,
      label: CATEGORY_LABEL[e.category] ?? e.category,
      amount: 0,
    };
    line.amount += n(e.amount);
    bucket.set(key, line);
  }
  const allLines = [...bucket.values()].sort(
    (a, b) => a.branchName.localeCompare(b.branchName) || a.label.localeCompare(b.label)
  );

  // Advances are money already handed over against salary earned. Counting them
  // as a separate expense would charge the same wage to the month twice.
  const advances = allLines.filter((l) => l.category === "salary");
  const shopExpenses = allLines.filter((l) => l.category !== "salary");

  const advancesTotal = advances.reduce((s, l) => s + l.amount, 0);
  const shopExpensesTotal = shopExpenses.reduce((s, l) => s + l.amount, 0);

  // ------------------------------------------------------------ payroll
  const payrollLines: PayrollLine[] = payroll
    .map((p) => ({ ...p, total: p.base + p.incentive }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const payrollBase = payrollLines.reduce((s, p) => s + p.base, 0);
  const payrollIncentive = payrollLines.reduce((s, p) => s + p.incentive, 0);
  const payrollTotal = payrollBase + payrollIncentive;

  // ------------------------------------------------------- fixed costs
  const fixedByBranch = new Map<string, { branchId: string; branchName: string; total: number }>();
  for (const f of fixedCosts) {
    const row = fixedByBranch.get(f.branchId) ?? {
      branchId: f.branchId,
      branchName: f.branchName,
      total: 0,
    };
    row.total += f.amount;
    fixedByBranch.set(f.branchId, row);
  }
  const fixedCostsByBranch = [...fixedByBranch.values()].sort((a, b) =>
    a.branchName.localeCompare(b.branchName)
  );
  const fixedCostsTotal = fixedCosts.reduce((s, f) => s + f.amount, 0);

  const operatingTotal = payrollTotal + shopExpensesTotal + fixedCostsTotal;

  // ------------------------------------------------------- cash & bank
  // Shop expenses and the whole team's salary & incentives are paid straight
  // out of today's till cash — so both come off before what's left is ready
  // to deposit.
  const cashPaidOut = shopExpensesTotal + payrollTotal;
  const cashToDeposit = combined.cash - cashPaidOut;
  // Rent and utilities are paid straight from the company bank account.
  const bankPaidOut = fixedCostsTotal;
  const bankNetThisMonth = combined.electronic - bankPaidOut;

  const cashBank: CashBank = {
    cashCollected: combined.cash,
    electronicCollected: combined.electronic,
    daysMissingBreakdown,
    totalDays,
    cashPaidOut,
    cashToDeposit,
    bankPaidOut,
    bankNetThisMonth,
  };

  return {
    month,
    monthLabel: monthLabel(month),
    daysElapsed,
    daysInMonth: total,
    branches: branchSales,
    combined,
    gaps,
    payroll: payrollLines,
    payrollBase,
    payrollIncentive,
    payrollTotal,
    advances,
    advancesTotal,
    remainingPayable: payrollTotal - advancesTotal,
    shopExpenses,
    shopExpensesTotal,
    fixedCosts,
    fixedCostsByBranch,
    fixedCostsTotal,
    operatingTotal,
    netProfit: combined.grossProfit - operatingTotal,
    cashBank,
  };
}
