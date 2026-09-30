import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icons";
import { ScheduleGrid } from "@/components/ScheduleGrid";
import { ScheduleControls } from "@/components/ScheduleControls";
import {
  addDays,
  bangkokToday,
  bangkokWeekStart,
  type Branch,
  type Employee,
} from "@/lib/types";
import {
  orderedTypes,
  shiftRangeLabel,
  type ShiftCode,
  type ShiftRequirement,
  type ShiftType,
} from "@/lib/shifts";

export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type ShiftRow = {
  employee_id: string;
  branch_id: string;
  shift_date: string;
  shift_type: ShiftCode;
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";

  // Which week we're looking at. Defaults to this one; the whole point of a
  // roster is being able to reach the weeks that haven't happened yet.
  const thisMonday = bangkokWeekStart();
  const monday = sp.week && ISO_DATE.test(sp.week) ? sp.week : thisMonday;
  const sunday = addDays(monday, 6);
  const today = bangkokToday();

  const supabase = await createClient();

  const [
    { data: branches },
    { data: employees },
    { data: shifts },
    { data: types },
    { data: requirements },
  ] = await Promise.all([
    supabase.from("branches").select("*").returns<Branch[]>(),
    supabase.from("employees").select("*").order("full_name").returns<Employee[]>(),
    supabase
      .from("shifts")
      .select("employee_id, branch_id, shift_date, shift_type")
      .gte("shift_date", monday)
      .lte("shift_date", sunday)
      .returns<ShiftRow[]>(),
    supabase.from("shift_types").select("*").returns<ShiftType[]>(),
    supabase
      .from("shift_requirements")
      .select("branch_id, code, required_staff")
      .returns<ShiftRequirement[]>(),
  ]);

  const branchById = Object.fromEntries((branches ?? []).map((b) => [b.id, b]));
  const allTypes = types ?? [];
  const reqs = requirements ?? [];

  // Filtering by branch has to include people COVERING it this week, not
  // just those whose home branch matches — otherwise anyone splitting their
  // week across both shops vanishes from one of them.
  const roster = (employees ?? [])
    .filter((e) => e.active !== false)
    .filter((e) => {
      if (branch === "all") return true;
      if (branchById[e.branch_id]?.slug === branch) return true;
      return (shifts ?? []).some(
        (s) => s.employee_id === e.id && branchById[s.branch_id]?.slug === branch
      );
    });

  const weekDates = DAYS.map((_, i) => addDays(monday, i));
  const scopedBranches = (branches ?? []).filter(
    (b) => branch === "all" || b.slug === branch
  );

  // Real coverage, computed from what's actually rostered — this replaces a
  // card that used to print the same hardcoded warning every week.
  const gaps: { date: string; day: string; branch: string; label: string; have: number; need: number }[] = [];
  for (const [i, date] of weekDates.entries()) {
    for (const b of scopedBranches) {
      for (const t of orderedTypes(allTypes, b.id)) {
        const need = reqs.find((r) => r.branch_id === b.id && r.code === t.code)?.required_staff ?? 0;
        if (need === 0) continue;
        const have = (shifts ?? []).filter(
          (s) => s.shift_date === date && s.branch_id === b.id && s.shift_type === t.code
        ).length;
        if (have < need) {
          gaps.push({ date, day: DAYS[i], branch: b.name, label: t.label, have, need });
        }
      }
    }
  }

  const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  const rangeLabel = `${fmtDay(monday, { month: "short", day: "numeric" })} – ${fmtDay(sunday, { day: "numeric", month: "short" })}`;

  const weekHref = (m: string) => {
    const p = new URLSearchParams();
    if (branch !== "all") p.set("branch", branch);
    if (m !== thisMonday) p.set("week", m);
    return `/schedule${p.toString() ? "?" + p.toString() : ""}`;
  };

  const isThisWeek = monday === thisMonday;
  const totalShifts = (shifts ?? []).length;

  return (
    <>
      <Topbar
        title="Schedule"
        sub={`${isThisWeek ? "This week" : "Week of"} ${rangeLabel} · ${totalShifts} shift${totalShifts === 1 ? "" : "s"}`}
        branch={branch}
      />

      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <div className="flex items-center gap-2 mb-4 flex-wrap no-print">
          <Link
            href={weekHref(addDays(monday, -7))}
            className="rounded-[9px] border px-3.5 text-[12.5px] font-semibold text-inkSecondary no-underline flex items-center"
            style={{ borderColor: "var(--line-strong)", minHeight: 40 }}
          >
            ← Previous
          </Link>
          <Link
            href={weekHref(thisMonday)}
            className="rounded-[9px] px-3.5 text-[12.5px] font-semibold no-underline flex items-center"
            style={
              isThisWeek
                ? { background: "var(--accent-soft)", color: "var(--accent)", minHeight: 40 }
                : { border: "1px solid var(--line-strong)", color: "var(--ink-secondary)", minHeight: 40 }
            }
          >
            This week
          </Link>
          <Link
            href={weekHref(addDays(monday, 7))}
            className="rounded-[9px] border px-3.5 text-[12.5px] font-semibold text-inkSecondary no-underline flex items-center"
            style={{ borderColor: "var(--line-strong)", minHeight: 40 }}
          >
            Next →
          </Link>
          <span className="text-[12.5px] text-inkMuted ml-1">{rangeLabel}</span>
        </div>

        {gaps.length > 0 && (
          <div
            className="card mb-3.5"
            style={{ borderColor: "var(--critical)", borderStyle: "dashed" }}
          >
            <div className="flex items-start gap-2.5">
              <div
                className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center flex-none"
                style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
              >
                <Icon name="warn" className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.8px] font-semibold">
                  {gaps.length} coverage {gaps.length === 1 ? "gap" : "gaps"} this week
                </div>
                <div className="flex flex-col gap-1 mt-2">
                  {gaps.slice(0, 8).map((g, i) => (
                    <div key={i} className="text-[12.5px] text-inkSecondary">
                      <b className="font-semibold">{g.day}</b> · {g.branch} · {g.label} —{" "}
                      <span className="num" style={{ color: "var(--critical)" }}>
                        {g.have} of {g.need}
                      </span>
                    </div>
                  ))}
                  {gaps.length > 8 && (
                    <div className="text-[12px] text-inkMuted">and {gaps.length - 8} more</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {allTypes.length === 0 ? (
          <div className="card">
            <h3 className="font-display text-[15px] font-semibold">Shifts aren&apos;t set up yet</h3>
            <p className="text-[13px] text-inkSecondary mt-1.5 leading-relaxed m-0">
              Run migration <code className="font-mono">0014_shift_scheduling.sql</code> in Supabase.
              It creates the three shifts — Open 01:00–10:00, Mid 09:00–18:00, Close 17:00–02:00 —
              and this page starts working.
            </p>
          </div>
        ) : (
          <>
            <ScheduleGrid
              employees={roster}
              branches={branches ?? []}
              shifts={shifts ?? []}
              types={allTypes}
              weekDates={weekDates}
              today={today}
              requirements={reqs}
            />
            <ScheduleControls
              monday={monday}
              branches={scopedBranches}
              types={allTypes}
              requirements={reqs}
            />
            <p className="text-[11.5px] text-inkMuted mt-3.5">
              {orderedTypes(allTypes)
                .map((t) => `${t.label} ${shiftRangeLabel(t)}`)
                .join("  ·  ")}
              . A shift belongs to the day it starts, so the Open shift beginning 01:00 Tuesday
              sits under Tuesday, and the Close shift starting 17:00 Monday is still
              Monday&apos;s when it ends at 02:00.
            </p>
          </>
        )}
      </div>
    </>
  );
}
