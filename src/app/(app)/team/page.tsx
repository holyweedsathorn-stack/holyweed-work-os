import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { StaffManager } from "@/components/StaffManager";
import { BranchLocations } from "@/components/BranchLocations";
import { ManagerClockIn } from "@/components/ManagerClockIn";
import {
  initials,
  entryDurationMs,
  fmtDuration,
  fmtTimeBKK,
  type Branch,
  type Employee,
  type TimeEntry,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { on: "On shift", off: "Not clocked in" };
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  on: { bg: "var(--good-soft)", fg: "var(--good)" },
  off: { bg: "var(--surface-2)", fg: "var(--ink-muted)" },
};

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const status = sp.status || "all";
  const supabase = await createClient();

  const [{ data: branches }, { data: employees }, { data: openEntries }, { data: everWorked }] =
    await Promise.all([
      supabase.from("branches").select("*").returns<Branch[]>(),
      supabase.from("employees").select("*").order("full_name").returns<Employee[]>(),
      // Anyone with an entry that has no clock_out is on shift right now.
      supabase.from("time_entries").select("*").is("clock_out", null).returns<TimeEntry[]>(),
      // Anyone who has EVER clocked in cannot be deleted, only archived.
      supabase.from("time_entries").select("employee_id"),
    ]);
  const branchById = Object.fromEntries((branches ?? []).map((b) => [b.id, b]));
  const openByEmployee = new Map((openEntries ?? []).map((e) => [e.employee_id, e]));

  // Archived people stay out of the day-to-day view but keep their hours.
  const roster = (employees ?? []).filter((e) => e.active !== false);

  let list = roster.filter((e) => branch === "all" || branchById[e.branch_id]?.slug === branch);
  if (status !== "all") {
    list = list.filter((e) => (status === "on" ? openByEmployee.has(e.id) : !openByEmployee.has(e.id)));
  }

  function filterHref(s: string) {
    const params: Record<string, string> = {};
    if (branch !== "all") params.branch = branch;
    if (s !== "all") params.status = s;
    const p = new URLSearchParams(params);
    return `/team${p.toString() ? "?" + p.toString() : ""}`;
  }

  return (
    <>
      <Topbar title="Team" sub="Who's working right now" branch={branch} />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            ["all", "All"],
            ["on", "On shift"],
            ["off", "Not clocked in"],
          ].map(([id, label]) => (
            <Link
              key={id}
              href={filterHref(id)}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
              style={{
                border: `1px solid ${status === id ? "var(--ink)" : "var(--line-strong)"}`,
                background: status === id ? "var(--ink)" : "var(--surface)",
                color: status === id ? "var(--bg)" : "var(--ink-secondary)",
              }}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => {
            const open = openByEmployee.get(e.id);
            // Someone who works both shops (a manager covering both
            // branches, say) clocks in by GPS wherever they actually are
            // that day -- while they're on shift, show THAT branch, not
            // their fixed home branch, which can otherwise tag them with
            // a branch they aren't even working right now.
            const b = open ? branchById[open.branch_id] ?? branchById[e.branch_id] : branchById[e.branch_id];
            const statusKey = open ? "on" : "off";
            const st = STATUS_STYLE[statusKey];
            return (
              <div key={e.id} className="card">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-white text-[13px] font-semibold flex-none"
                    style={{ background: `linear-gradient(155deg, var(--${b?.slug}), #1a3d2b)` }}
                  >
                    {initials(e.full_name)}
                  </div>
                  <div>
                    <div className="font-semibold text-[13.8px]">{e.full_name}</div>
                    <div className="text-[11.8px] text-inkMuted">{e.role_title}</div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap mt-3">
                  <span className="chip" style={{ background: st.bg, color: st.fg }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.fg }} />
                    {STATUS_LABEL[statusKey]}
                  </span>
                  <span className="chip" style={{ background: `var(--${b?.slug}-soft)`, color: `var(--${b?.slug})` }}>
                    {b?.name}
                  </span>
                </div>
                <div
                  className="mt-3 text-[12.5px] rounded-[8px] px-2.5 py-2"
                  style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
                >
                  <b className="block text-[10.3px] uppercase tracking-wide text-inkMuted font-bold mb-0.5">
                    {open ? "Working since" : "Last seen"}
                  </b>
                  {open
                    ? `${fmtTimeBKK(open.clock_in)} · ${fmtDuration(entryDurationMs(open))} so far`
                    : "Not clocked in today"}
                </div>
              </div>
            );
          })}
        </div>
        {list.length === 0 && (
          <p className="text-inkMuted text-[13px]">
            {roster.length === 0
              ? "No team members yet — add your staff below."
              : "No team members match this filter."}
          </p>
        )}

        <div className="text-[13px] uppercase tracking-wide text-inkMuted font-bold mt-8 mb-3">
          Clocking in
        </div>
        <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
          <BranchLocations branches={branches ?? []} />
          <ManagerClockIn offShift={roster.filter((e) => !openByEmployee.has(e.id))} />
        </div>

        <div className="text-[13px] uppercase tracking-wide text-inkMuted font-bold mt-8 mb-3">
          Manage roster
        </div>
        <StaffManager
          branches={branches ?? []}
          employees={employees ?? []}
          withHours={Array.from(
            new Set(((everWorked ?? []) as { employee_id: string }[]).map((t) => t.employee_id))
          )}
        />
      </div>
    </>
  );
}
