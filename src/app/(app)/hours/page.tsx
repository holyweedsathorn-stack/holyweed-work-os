import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import {
  entryDurationMs,
  fmtDuration,
  toDecimalHours,
  fmtTimeBKK,
  fmtDateBKK,
  initials,
  type Branch,
  type Employee,
  bangkokDaysAgo,
  type TimeEntry,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES = [
  { id: "week", label: "This week", days: 7 },
  { id: "month", label: "This month", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
];

/** Start of the range, as a Bangkok date string. */
function rangeStart(days: number) {
  return bangkokDaysAgo(days);
}

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const rangeId = sp.range || "week";
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[0];
  const from = rangeStart(range.days);

  const supabase = await createClient();
  const [{ data: branches }, { data: employees }, { data: entries }] = await Promise.all([
    supabase.from("branches").select("*").returns<Branch[]>(),
    supabase.from("employees").select("*").order("full_name").returns<Employee[]>(),
    supabase
      .from("time_entries")
      .select("*")
      .gte("clock_in", from + "T00:00:00+07:00")
      .order("clock_in", { ascending: false })
      .returns<TimeEntry[]>(),
  ]);

  const branchById = Object.fromEntries((branches ?? []).map((b) => [b.id, b]));
  const empById = Object.fromEntries((employees ?? []).map((e) => [e.id, e]));

  const scoped = (entries ?? []).filter(
    (e) => branch === "all" || branchById[e.branch_id]?.slug === branch
  );

  // Totals per employee
  const totals = new Map<string, { ms: number; shifts: number; open: boolean }>();
  for (const e of scoped) {
    const cur = totals.get(e.employee_id) ?? { ms: 0, shifts: 0, open: false };
    cur.ms += entryDurationMs(e);
    cur.shifts += 1;
    if (!e.clock_out) cur.open = true;
    totals.set(e.employee_id, cur);
  }

  const rows = [...totals.entries()]
    .map(([employeeId, t]) => ({ employee: empById[employeeId], ...t }))
    .filter((r) => r.employee)
    .sort((a, b) => b.ms - a.ms);

  const grandMs = rows.reduce((s, r) => s + r.ms, 0);

  function rangeHref(id: string) {
    const p = new URLSearchParams();
    if (branch !== "all") p.set("branch", branch);
    if (id !== "week") p.set("range", id);
    return `/hours${p.toString() ? "?" + p.toString() : ""}`;
  }

  return (
    <>
      <Topbar title="Hours" sub={`${range.label} · for payroll`} branch={branch} />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <div className="flex gap-2 mb-4 flex-wrap">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={rangeHref(r.id)}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
              style={{
                border: `1px solid ${rangeId === r.id ? "var(--ink)" : "var(--line-strong)"}`,
                background: rangeId === r.id ? "var(--ink)" : "var(--surface)",
                color: rangeId === r.id ? "var(--bg)" : "var(--ink-secondary)",
              }}
            >
              {r.label}
            </Link>
          ))}
        </div>

        <div className="grid gap-3.5 mb-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">Total hours</div>
            <div className="num text-[27px] font-semibold mt-2">{fmtDuration(grandMs)}</div>
          </div>
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">People worked</div>
            <div className="num text-[27px] font-semibold mt-2">{rows.length}</div>
          </div>
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">Shifts logged</div>
            <div className="num text-[27px] font-semibold mt-2">{scoped.length}</div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-display text-[15px] font-semibold mb-3.5">Hours per person</h3>
          {rows.length === 0 ? (
            <p className="text-[13px] text-inkMuted">
              No shifts recorded in this period yet. Hours appear here once staff start clocking in.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Team member", "Branch", "Shifts", "Hours", "Decimal"].map((h, i) => (
                      <th
                        key={h}
                        className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold pb-2.5"
                        style={{ textAlign: i >= 2 ? "right" : "left" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const b = branchById[r.employee.branch_id];
                    return (
                      <tr key={r.employee.id}>
                        <td className="py-2.5" style={{ borderTop: "1px solid var(--line)" }}>
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-none"
                              style={{ background: `linear-gradient(155deg, var(--${b?.slug}), #1a3d2b)` }}
                            >
                              {initials(r.employee.full_name)}
                            </div>
                            <div>
                              <b className="block text-[12.5px] font-semibold">{r.employee.full_name}</b>
                              <span className="text-[11px] text-inkMuted">{r.employee.role_title}</span>
                            </div>
                            {r.open && (
                              <span
                                className="chip"
                                style={{ background: "var(--good-soft)", color: "var(--good)" }}
                              >
                                on shift
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-[12.5px]" style={{ borderTop: "1px solid var(--line)" }}>
                          <span className="chip" style={{ background: `var(--${b?.slug}-soft)`, color: `var(--${b?.slug})` }}>
                            {b?.name}
                          </span>
                        </td>
                        <td
                          className="py-2.5 num text-[13px] text-right"
                          style={{ borderTop: "1px solid var(--line)" }}
                        >
                          {r.shifts}
                        </td>
                        <td
                          className="py-2.5 num text-[13px] text-right font-semibold"
                          style={{ borderTop: "1px solid var(--line)" }}
                        >
                          {fmtDuration(r.ms)}
                        </td>
                        <td
                          className="py-2.5 num text-[13px] text-right text-inkMuted"
                          style={{ borderTop: "1px solid var(--line)" }}
                        >
                          {toDecimalHours(r.ms).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rows.some((r) => r.open) && (
            <p className="text-[11.5px] text-inkMuted mt-3">
              Anyone still on shift is counted up to right now, so their total keeps rising until they clock out.
            </p>
          )}
        </div>

        <div className="card mt-3.5">
          <h3 className="font-display text-[15px] font-semibold mb-3.5">Recent shifts</h3>
          {scoped.length === 0 ? (
            <p className="text-[13px] text-inkMuted">Nothing logged yet.</p>
          ) : (
            <div className="flex flex-col">
              {scoped.slice(0, 15).map((e) => {
                const emp = empById[e.employee_id];
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between py-2.5 text-[13px] gap-3"
                    style={{ borderTop: "1px solid var(--line)" }}
                  >
                    <span className="font-medium flex-1 min-w-0 truncate">{emp?.full_name}</span>
                    <span className="text-inkMuted text-[12px]">{fmtDateBKK(e.clock_in)}</span>
                    <span className="text-inkMuted text-[12px] w-[110px] text-right">
                      {fmtTimeBKK(e.clock_in)} – {e.clock_out ? fmtTimeBKK(e.clock_out) : "on shift"}
                    </span>
                    <span className="num font-semibold w-[70px] text-right">{fmtDuration(entryDurationMs(e))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
