import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { LineChart } from "@/components/LineChart";
import { BarList } from "@/components/BarList";
import { DateRangePicker } from "@/components/DateRangePicker";
import { resolveRange, daysBetween, CATEGORY_LABEL } from "@/lib/range";
import { fmtTHB, addDays, type Branch } from "@/lib/types";
import { pickNonOverlappingWindows, skippedNote, type Window } from "@/lib/windows";
import { LiveSalesStrip } from "@/components/LiveSalesStrip";

export const dynamic = "force-dynamic";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const range = resolveRange(sp.period, sp.from, sp.to);
  const supabase = await createClient();

  // The comparison window is the same length, immediately before this one.
  const span = daysBetween(range.from, range.to);
  const prevTo = addDays(range.from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));

  const [{ data: branches }, { data: sales }, { data: expenses }, { data: productSales }, { data: liveSnapshots }] =
    await Promise.all([
      supabase.from("branches").select("*").returns<Branch[]>(),
      supabase
        .from("sales_daily")
        .select("*")
        .gte("sale_date", prevFrom)
        .lte("sale_date", range.to)
        .order("sale_date", { ascending: true }),
      supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", range.from)
        .lte("expense_date", range.to),
      supabase.from("product_sales").select("*, product:products(name, category)"),
      // Most recent Silom snapshot per branch -- pared down to "one per
      // branch" below, since the DB just holds a short trail of them.
      supabase
        .from("pos_live_snapshots")
        .select("*")
        .order("captured_at", { ascending: false })
        .limit(20),
    ]);

  const latestSnapshotByBranch = new Map<string, any>();
  for (const snap of (liveSnapshots ?? []) as any[]) {
    if (!latestSnapshotByBranch.has(snap.branch_id)) latestSnapshotByBranch.set(snap.branch_id, snap);
  }

  const branchById = Object.fromEntries((branches ?? []).map((b) => [b.id, b]));
  const inBranch = (bid: string | null) =>
    branch === "all" || (bid ? branchById[bid]?.slug === branch : true);

  // ---------------------------------------------------------------- sales
  const bySlugDate = new Map<string, Record<string, number>>();
  const dailyRevenue = new Map<string, number>();
  let revenue = 0;
  let cost = 0;
  let grossProfit = 0;
  let haveProfit = false;
  let prevRevenue = 0;

  for (const row of sales ?? []) {
    const slug = branchById[row.branch_id]?.slug;
    if (!slug) continue;
    const inWindow = row.sale_date >= range.from && row.sale_date <= range.to;

    if (inWindow) {
      if (!bySlugDate.has(row.sale_date)) bySlugDate.set(row.sale_date, {});
      bySlugDate.get(row.sale_date)![slug] = Number(row.revenue) || 0;
    }

    if (!inBranch(row.branch_id)) continue;

    if (inWindow) {
      const rev = Number(row.revenue) || 0;
      revenue += rev;
      cost += Number(row.cost) || 0;
      dailyRevenue.set(row.sale_date, (dailyRevenue.get(row.sale_date) ?? 0) + rev);
      if (row.profit != null) {
        grossProfit += Number(row.profit) || 0;
        haveProfit = true;
      }
    } else if (row.sale_date >= prevFrom && row.sale_date <= prevTo) {
      prevRevenue += Number(row.revenue) || 0;
    }
  }

  const revDelta = prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  // ------------------------------------------------------------- expenses
  const scopedExpenses = (expenses ?? []).filter(
    (e: any) => e.expense_date && inBranch(e.branch_id)
  );
  const expenseTotals = new Map<string, number>();
  const dailyExpense = new Map<string, number>();

  for (const e of scopedExpenses as any[]) {
    const label = CATEGORY_LABEL[e.category] ?? e.category;
    const amt = Number(e.amount) || 0;
    expenseTotals.set(label, (expenseTotals.get(label) ?? 0) + amt);
    dailyExpense.set(e.expense_date, (dailyExpense.get(e.expense_date) ?? 0) + amt);
  }

  const expenseTotal = [...expenseTotals.values()].reduce((s, v) => s + v, 0);
  const expenseRows = [...expenseTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      color: i === 0 ? "var(--accent)" : i === 1 ? "var(--accent2)" : "var(--ink-muted)",
    }));

  const netAfterExpenses = (haveProfit ? grossProfit : revenue - cost) - expenseTotal;
  const margin = revenue ? ((grossProfit / revenue) * 100).toFixed(1) : "0.0";

  // ------------------------------------------------------------- products
  // Product rows cover the period of their export, so include any that overlap.
  const overlapping = (productSales ?? []).filter(
    (p: any) =>
      p.period_start &&
      p.period_start <= range.to &&
      (p.period_end ?? p.period_start) >= range.from &&
      inBranch(p.branch_id)
  );
  // Those exports overlap each other — the same August can appear in three
  // separate imports. Count each stretch of time once, preferring the newest.
  const windowsByKey = new Map<string, Window>();
  for (const p of overlapping as any[]) {
    const key = `${p.branch_id}|${p.period_start}|${p.period_end}`;
    const seen = windowsByKey.get(key);
    const importedAt = p.imported_at ?? "";
    if (!seen || importedAt > seen.importedAt) {
      windowsByKey.set(key, {
        key,
        start: p.period_start,
        end: p.period_end ?? p.period_start,
        importedAt,
      });
    }
  }
  const allWindows = [...windowsByKey.values()];
  const useWindows = pickNonOverlappingWindows(allWindows);
  const useKeys = new Set(useWindows.map((w) => w.key));
  const duplicateNote = skippedNote(allWindows);

  const counted = (overlapping as any[]).filter((p) =>
    useKeys.has(`${p.branch_id}|${p.period_start}|${p.period_end}`)
  );

  const productPeriods = [
    ...new Set(counted.map((p: any) => `${p.period_start} → ${p.period_end}`)),
  ];

  const productTotals = new Map<string, number>();
  for (const p of counted) {
    const name = p.product?.name ?? "Product";
    productTotals.set(name, (productTotals.get(name) ?? 0) + Number(p.revenue || 0));
  }
  const productRows = [...productTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value], i) => ({
      label,
      value,
      color: i < 2 ? "var(--accent)" : "var(--ink-muted)",
    }));

  // --------------------------------------------------------------- charts
  const dates = [...bySlugDate.keys()].sort();
  const fmtDate = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  const branchSeries = (slug: "sathorn" | "sukhumvit", label: string) => ({
    key: slug,
    label,
    color: `var(--${slug})`,
    data: dates.map((d) => ({ x: fmtDate(d), y: bySlugDate.get(d)?.[slug] || 0 })),
  });

  const salesSeries =
    branch === "sukhumvit"
      ? [branchSeries("sukhumvit", "Sukhumvit 22")]
      : branch === "sathorn"
        ? [branchSeries("sathorn", "Sathorn")]
        : [branchSeries("sathorn", "Sathorn"), branchSeries("sukhumvit", "Sukhumvit 22")];

  // Real revenue vs real spend, day by day — no seeded figures.
  const revVsExp = [
    {
      key: "rev",
      label: "Revenue",
      color: "var(--accent)",
      data: dates.map((d) => ({ x: fmtDate(d), y: dailyRevenue.get(d) || 0 })),
    },
    {
      key: "exp",
      label: "Expenses",
      color: "var(--warning)",
      data: dates.map((d) => ({ x: fmtDate(d), y: dailyExpense.get(d) || 0 })),
    },
  ];

  const branchLabel =
    branch === "all" ? "All branches" : (branches ?? []).find((b) => b.slug === branch)?.name;
  const tickEvery = Math.max(1, Math.ceil(dates.length / 12));
  const noData = dates.length === 0;

  return (
    <>
      <Topbar
        title="Shop dashboard"
        sub={`${branchLabel} · ${range.from} → ${range.to}`}
        branch={branch}
      />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <LiveSalesStrip
          branches={(branches ?? []).filter((b) => branch === "all" || b.slug === branch)}
          latestByBranch={latestSnapshotByBranch}
        />

        <DateRangePicker preset={range.preset} from={range.from} to={range.to} />

        {noData && (
          <div className="card mb-4">
            <p className="text-[13px] text-inkMuted">
              No sales recorded in this period. Pick another range, or import the Silom report for
              these dates from <b>Import sales</b>.
            </p>
          </div>
        )}

        <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
              Revenue
            </div>
            <div className="num text-[27px] font-semibold mt-2">{fmtTHB(revenue)}</div>
            {revDelta !== null && (
              <div
                className="mt-2 text-[12.5px] font-semibold"
                style={{ color: revDelta >= 0 ? "var(--good)" : "var(--critical)" }}
              >
                {revDelta >= 0 ? "▲" : "▼"} {Math.abs(revDelta).toFixed(1)}% vs previous {span} days
              </div>
            )}
          </div>

          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
              {haveProfit ? "Gross profit" : "Revenue less cost"}
            </div>
            <div className="num text-[27px] font-semibold mt-2">
              {fmtTHB(haveProfit ? grossProfit : revenue - cost)}
            </div>
            <div className="mt-2 text-[12.5px] font-semibold" style={{ color: "var(--good)" }}>
              {margin}% margin
            </div>
          </div>

          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
              Expenses
            </div>
            <div className="num text-[27px] font-semibold mt-2">{fmtTHB(expenseTotal)}</div>
            <div className="mt-2 text-[12.5px] text-inkMuted">from your expense sheets</div>
          </div>

          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
              After expenses
            </div>
            <div className="num text-[27px] font-semibold mt-2">{fmtTHB(netAfterExpenses)}</div>
            <div
              className="mt-2 text-[12.5px] font-semibold"
              style={{ color: netAfterExpenses >= 0 ? "var(--good)" : "var(--critical)" }}
            >
              {netAfterExpenses >= 0 ? "in profit" : "at a loss"}
            </div>
          </div>
        </div>

        <div className="grid gap-3.5 mt-3.5 items-start grid-cols-1 lg:grid-cols-[2fr_1fr]">
          <div className="card">
            <div className="flex items-baseline justify-between mb-3.5 flex-wrap gap-2">
              <h3 className="font-display text-[15px] font-semibold">Sales by day</h3>
              <div className="flex gap-4 text-[12px] text-inkSecondary font-medium">
                {salesSeries.map((s) => (
                  <span key={s.key} className="flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 rounded" style={{ background: s.color }} /> {s.label}
                  </span>
                ))}
              </div>
            </div>
            {noData ? (
              <p className="text-[13px] text-inkMuted">Nothing to plot for these dates.</p>
            ) : (
              <LineChart series={salesSeries} area height={230} xTickEvery={tickEvery} yFormat="thbk" />
            )}
          </div>

          <div className="card">
            <h3 className="font-display text-[15px] font-semibold mb-3.5">Expense breakdown</h3>
            {expenseRows.length === 0 ? (
              <p className="text-[13px] text-inkMuted">No expenses recorded for these dates.</p>
            ) : (
              <BarList rows={expenseRows} fmt={fmtTHB} />
            )}
          </div>
        </div>

        <div className="grid gap-3.5 mt-3.5 items-start grid-cols-1 lg:grid-cols-[2fr_1fr]">
          <div className="card">
            <div className="flex items-baseline justify-between mb-3.5 flex-wrap gap-2">
              <h3 className="font-display text-[15px] font-semibold">Revenue vs. expenses</h3>
              <div className="flex gap-4 text-[12px] text-inkSecondary font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 rounded" style={{ background: "var(--accent)" }} />{" "}
                  Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 rounded" style={{ background: "var(--warning)" }} />{" "}
                  Expenses
                </span>
              </div>
            </div>
            {noData ? (
              <p className="text-[13px] text-inkMuted">Nothing to plot for these dates.</p>
            ) : (
              <LineChart series={revVsExp} height={210} xTickEvery={tickEvery} yFormat="thbk" />
            )}
          </div>

          <div className="card">
            <h3 className="font-display text-[15px] font-semibold mb-1">Top products</h3>
            {productPeriods.length > 0 && (
              <p className="text-[11.5px] text-inkMuted mb-3">
                Money actually taken, after discounts. Covers the imported period
                {productPeriods.length > 1 ? "s" : ""} {productPeriods.join(", ")} — not the exact
                dates above. {duplicateNote}
              </p>
            )}
            {productRows.length === 0 ? (
              <p className="text-[13px] text-inkMuted">
                No product data covering these dates. Import a Sales by Product report.
              </p>
            ) : (
              <BarList rows={productRows} fmt={fmtTHB} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
