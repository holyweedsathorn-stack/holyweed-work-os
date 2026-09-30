import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { KpiCard } from "@/components/KpiCard";
import { Icon } from "@/components/Icons";
import { DateRangePicker } from "@/components/DateRangePicker";
import { PulseBar } from "@/components/PulseBar";
import { EnableNotifications } from "@/components/EnableNotifications";
import { AnnouncementForm } from "@/components/AnnouncementForm";
import { resolveRange, daysBetween } from "@/lib/range";
import { fmtTHB, addDays, type Branch, type Employee, type ActivityLogEntry, type Alert } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_COLOR: Record<string, string> = {
  sale: "var(--good)",
  ops: "var(--accent)",
  stock: "var(--accent2)",
  alert: "var(--critical)",
};

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const range = resolveRange(sp.period, sp.from, sp.to);
  const supabase = await createClient();

  const span = daysBetween(range.from, range.to);
  const prevTo = addDays(range.from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));

  const [
    { data: branches },
    { data: employeesAll },
    { data: activity },
    { data: alerts },
    { data: sales },
    { data: expenses },
    { data: openEntries },
  ] = await Promise.all([
    supabase.from("branches").select("*").returns<Branch[]>(),
    supabase.from("employees").select("*").returns<Employee[]>(),
    supabase
      .from("activity_log")
      .select("*, employee:employees(full_name)")
      .order("occurred_at", { ascending: false })
      .limit(10)
      .returns<ActivityLogEntry[]>(),
    supabase.from("alerts").select("*").eq("resolved", false).returns<Alert[]>(),
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
    supabase.from("time_entries").select("employee_id, branch_id").is("clock_out", null),
  ]);

  const branchById = Object.fromEntries((branches ?? []).map((b) => [b.id, b]));
  const inBranch = (bid: string | null) =>
    branch === "all" || (bid ? branchById[bid]?.slug === branch : true);

  const employees = (employeesAll ?? []).filter(
    (e) => (branch === "all" || branchById[e.branch_id]?.slug === branch) && e.active !== false
  );
  const onShiftIds = new Set((openEntries ?? []).map((e: any) => e.employee_id));
  const onShift = employees.filter((e) => onShiftIds.has(e.id)).length;

  // ------------------------------------------------------- range totals
  let revenue = 0;
  let cost = 0;
  let grossProfit = 0;
  let haveProfit = false;
  let prevRevenue = 0;
  const perBranch = new Map<string, number>();

  for (const row of sales ?? []) {
    const slug = branchById[row.branch_id]?.slug;
    if (!slug) continue;
    const inWindow = row.sale_date >= range.from && row.sale_date <= range.to;

    if (inWindow) {
      perBranch.set(row.branch_id, (perBranch.get(row.branch_id) ?? 0) + (Number(row.revenue) || 0));
    }

    if (!inBranch(row.branch_id)) continue;

    if (inWindow) {
      revenue += Number(row.revenue) || 0;
      cost += Number(row.cost) || 0;
      if (row.profit != null) {
        grossProfit += Number(row.profit) || 0;
        haveProfit = true;
      }
    } else if (row.sale_date >= prevFrom && row.sale_date <= prevTo) {
      prevRevenue += Number(row.revenue) || 0;
    }
  }

  const revDelta = prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  const expenseTotal = (expenses ?? [])
    .filter((e: any) => e.expense_date && inBranch(e.branch_id))
    .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

  const profit = haveProfit ? grossProfit : revenue - cost;
  const net = profit - expenseTotal;
  const margin = revenue ? ((profit / revenue) * 100).toFixed(1) : "0.0";

  const feedItems = (activity ?? []).filter(
    (a) => branch === "all" || branchById[a.branch_id]?.slug === branch
  );
  const alertItems = (alerts ?? []).filter(
    (a) => branch === "all" || !a.branch_id || branchById[a.branch_id ?? ""]?.slug === branch
  );

  const rangeLabel =
    range.preset === "today"
      ? "today"
      : range.preset === "month"
        ? "this month"
        : `${range.from} → ${range.to}`;

  return (
    <>
      <Topbar
        title="Overview"
        sub={`${branch === "all" ? "All branches" : (branches ?? []).find((b) => b.slug === branch)?.name} · ${rangeLabel}`}
        branch={branch}
      />
      <PulseBar />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <EnableNotifications />
        <AnnouncementForm />
        <DateRangePicker preset={range.preset} from={range.from} to={range.to} />

        <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Revenue"
            value={fmtTHB(revenue)}
            delta={
              revDelta !== null
                ? {
                    dir: revDelta >= 0 ? "up" : "down",
                    text: `${Math.abs(revDelta).toFixed(1)}% vs previous ${span} days`,
                  }
                : undefined
            }
          />
          <KpiCard
            label={haveProfit ? "Gross profit" : "Revenue less cost"}
            value={fmtTHB(profit)}
            delta={{ dir: "up", text: `${margin}% margin` }}
          />
          <KpiCard
            label="After expenses"
            value={fmtTHB(net)}
            delta={{
              dir: net >= 0 ? "up" : "down",
              text: net >= 0 ? "in profit" : "at a loss",
            }}
          />
          <KpiCard label="Staff on shift" value={`${onShift} / ${employees.length}`} />
        </div>

        <div className="text-[13px] uppercase tracking-wide text-inkMuted font-bold mt-7 mb-3">
          Branches
        </div>
        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2">
          {(branches ?? [])
            .filter((b) => branch === "all" || b.slug === branch)
            .map((b) => {
              const rev = perBranch.get(b.id) ?? 0;
              const staff = (employeesAll ?? []).filter(
                (e) => e.branch_id === b.id && onShiftIds.has(e.id)
              ).length;
              const share = revenue ? ((rev / revenue) * 100).toFixed(0) : "0";
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-3 p-3.5 rounded-[9px]"
                  style={{ border: "1px solid var(--line)" }}
                >
                  <div className="w-1 self-stretch rounded" style={{ background: `var(--${b.slug})` }} />
                  <div className="flex-1">
                    <div className="font-semibold text-[13px]">{b.name}</div>
                    <div className="num text-[16px] mt-0.5">{fmtTHB(rev)}</div>
                    <div className="text-[11.5px] text-inkMuted mt-0.5">
                      {branch === "all" ? `${share}% of total · ` : ""}
                      {staff} staff on shift now
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="grid gap-3.5 mt-3.5 items-start grid-cols-1 lg:grid-cols-[2fr_1fr]">
          <div className="card">
            <div className="flex items-baseline justify-between mb-3.5">
              <h3 className="font-display text-[15px] font-semibold">Live activity</h3>
            </div>
            <div>
              {feedItems.map((a) => (
                <div key={a.id} className="flex gap-2.5 py-2.5" style={{ borderTop: "1px solid var(--line)" }}>
                  <div
                    className="w-[7px] h-[7px] rounded-full mt-1.5 flex-none"
                    style={{ background: KIND_COLOR[a.kind] }}
                  />
                  <div>
                    <div className="text-[13px]">
                      <b className="font-semibold">{a.employee?.full_name}</b> {a.message}
                    </div>
                    <div className="text-[11.5px] text-inkMuted mt-0.5">
                      {new Date(a.occurred_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Bangkok",
                      })}{" "}
                      · {branchById[a.branch_id]?.name}
                    </div>
                  </div>
                </div>
              ))}
              {feedItems.length === 0 && (
                <p className="text-inkMuted text-[13px]">No activity yet for this branch.</p>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="font-display text-[15px] font-semibold mb-3.5">Needs attention</h3>
            {alertItems.map((a) => (
              <div
                key={a.id}
                className="flex gap-2.5 py-2.5 items-start"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <div
                  className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center flex-none"
                  style={{ background: `var(--${a.severity}-soft)`, color: `var(--${a.severity})` }}
                >
                  <Icon name="warn" className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[12.8px] font-semibold">{a.title}</div>
                  <div className="text-[11.8px] text-inkMuted mt-0.5">{a.sub}</div>
                </div>
              </div>
            ))}
            {alertItems.length === 0 && (
              <p className="text-inkMuted text-[13px]">Nothing needs attention right now.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
