import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClockButton } from "@/components/ClockButton";
import { StaffTasks, type ChecklistItem, type OneOffTask, type MyProject } from "@/components/StaffTasks";
import { RequestForm } from "@/components/RequestForm";
import { ReceivedItemForm } from "@/components/ReceivedItemForm";
import { ReceivedItemsFeed } from "@/components/ReceivedItemsFeed";
import { PmsFrontDesk } from "@/components/PmsFrontDesk";
import { HostelStaysFeed } from "@/components/HostelStaysFeed";
import { BistroSalesForm } from "@/components/BistroSalesForm";
import { BistroSalesFeed } from "@/components/BistroSalesFeed";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CurrencyRates } from "@/components/CurrencyRates";
import { CurrencyLogFeed } from "@/components/CurrencyLogFeed";
import { MaintenanceJobs } from "@/components/MaintenanceJobs";
import { InstallPrompt } from "@/components/InstallPrompt";
import { EnableNotifications } from "@/components/EnableNotifications";
import { MyShifts } from "@/components/MyShifts";
import { ChatWidget } from "@/components/ChatWidget";
import { activeShift, type ShiftCode, type ShiftType } from "@/lib/shifts";
import { signOut } from "@/app/login/actions";
import {
  entryDurationMs,
  fmtDuration,
  fmtTimeBKK,
  fmtDateBKK,
  initials,
  type TimeEntry,
  type Approval,
  addDays,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** Today's date in Bangkok, as YYYY-MM-DD. */
function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/**
 * The staff-facing screen: clock in or out, then what they're meant to be
 * doing this shift. Deliberately one mobile-sized column — this is opened
 * on a phone, one-handed, during a shift.
 */
export default async function ClockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("app_users")
    .select("full_name, role, employee_id, is_maintenance")
    .eq("id", user.id)
    .single();

  if (!me) redirect("/login");
  // Owners/managers have no employee record to clock — send them to the dashboard.
  if (!me.employee_id) redirect("/dashboard");

  const today = bangkokToday();

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, role_title, branch_id, branch:branches(name, slug)")
    .eq("id", me.employee_id)
    .single();

  const [
    { data: entries },
    { data: templates },
    { data: completions },
    { data: tasksRaw },
    { data: projectsRaw },
    { data: myShiftRows },
    { data: shiftTypeRows },
    { data: branchRows },
    { data: myApprovals },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("*")
      .eq("employee_id", me.employee_id)
      .order("clock_in", { ascending: false })
      .limit(10)
      .returns<TimeEntry[]>(),
    supabase
      .from("task_templates")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("task_completions")
      .select("template_id, employee_id, shift_anchor_date, shift_code")
      .gte("shift_anchor_date", addDays(today, -1))
      .lte("shift_anchor_date", today),
    supabase
      .from("tasks")
      .select("*")
      .or(`assigned_employee_id.eq.${me.employee_id},assigned_employee_id.is.null`)
      .order("due_date", { ascending: true }),
    supabase
      .from("projects")
      .select("id, title, status, due_date, assignee_employee_id")
      .eq("assignee_employee_id", me.employee_id)
      .neq("status", "done"),
    supabase
      .from("shifts")
      .select("shift_date, shift_type, branch_id")
      .eq("employee_id", me.employee_id)
      .gte("shift_date", addDays(today, -1))
      .lte("shift_date", addDays(today, 6))
      .order("shift_date"),
    supabase.from("shift_types").select("*"),
    supabase.from("branches").select("*"),
    supabase
      .from("approvals")
      .select("*")
      .eq("requested_by", me.employee_id)
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<Approval[]>(),
  ]);

  const open = (entries ?? []).find((e) => e.clock_out === null) ?? null;
  const past = (entries ?? []).filter((e) => e.clock_out !== null).slice(0, 7);

  const weekMs = past
    .filter((e) => Date.now() - new Date(e.clock_in).getTime() < 7 * 86400000)
    .reduce((sum, e) => sum + entryDurationMs(e), 0);

  const branch = (employee as any)?.branch;
  const myBranchId = (employee as any)?.branch_id;

  // Checklist: items for this branch (or both branches), matching today's
  // shift type if they're scheduled for one.
  const myShifts = (myShiftRows ?? []) as {
    shift_date: string;
    shift_type: ShiftCode;
    branch_id: string;
  }[];
  const shiftTypes = (shiftTypeRows ?? []) as ShiftType[];

  // Which shift is running RIGHT NOW, which is not the same question as
  // "which shift is dated today" once shifts cross midnight.
  const live = activeShift(myShifts, shiftTypes);
  const shiftType = live?.shift_type ?? null;
  const anchorDate = live?.shift_date ?? today;
  const doneMap = new Map(
    (completions ?? [])
      .filter(
        (c: any) =>
          c.shift_anchor_date === anchorDate && (c.shift_code ?? null) === shiftType
      )
      .map((c: any) => [c.template_id, c.employee_id])
  );

  const checklist: ChecklistItem[] = (templates ?? [])
    .filter((t: any) => !t.branch_id || t.branch_id === myBranchId)
    .filter((t: any) => !t.shift_type || !shiftType || t.shift_type === shiftType)
    .map((t: any) => ({
      id: t.id,
      title: t.title,
      done: doneMap.has(t.id),
      doneBy: null,
    }));

  const tasks: OneOffTask[] = (tasksRaw ?? [])
    // Branch scoping is only for the "open to whoever's on shift" tasks
    // (assigned_employee_id null) -- a task a manager assigned to THIS
    // person by name has to show up for them no matter what branch got
    // picked on the manager's task form, or it silently vanishes the
    // moment those two fields don't match.
    .filter((t: any) => t.assigned_employee_id === me.employee_id || !t.branch_id || t.branch_id === myBranchId)
    .map((t: any) => ({
      id: t.id,
      title: t.title,
      note: t.note,
      done: !!t.completed_at,
      due: t.due_date ? fmtDateBKK(t.due_date) : null,
      photoAttached: !!t.completion_photo_path,
    }));

  const projects: MyProject[] = (projectsRaw ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    due: p.due_date ? fmtDateBKK(p.due_date) : null,
  }));

  return (
    <div className="min-h-screen flex justify-center px-4 py-8" style={{ background: "var(--bg)" }}>
      <ChatWidget currentUserName={employee?.full_name ?? me.full_name} />
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[15px] font-semibold flex-none"
            style={{ background: `linear-gradient(155deg, var(--${branch?.slug ?? "accent"}), #1a3d2b)` }}
          >
            {initials(employee?.full_name ?? me.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px] truncate">
              {employee?.full_name ?? me.full_name}
            </div>
            <div className="text-[12px] text-inkMuted truncate">
              {employee?.role_title}
              {branch?.name ? ` · ${branch.name}` : ""}
            </div>
          </div>
          <form action={signOut}>
            <button type="submit" className="text-[12px] text-inkMuted underline">
              Sign out
            </button>
          </form>
        </div>

        <div className="card flex flex-col items-center gap-4 py-8">
          <ClockButton isOpen={!!open} clockInAt={open?.clock_in ?? null} />
          {open && <p className="text-[12px] text-inkMuted">Started at {fmtTimeBKK(open.clock_in)}</p>}
        </div>

        <InstallPrompt />
        <EnableNotifications />

        {me.is_maintenance ? (
          <MaintenanceJobs />
        ) : (
          <>
            <CurrencyRates />
            <CurrencyLogFeed />
          </>
        )}

        {/* Tasks only appear once they're actually on shift — otherwise the
            screen nags people about work on their day off. */}
        {open ? (
          <StaffTasks checklist={checklist} tasks={tasks} projects={projects} />
        ) : (
          (checklist.length > 0 || tasks.length > 0 || projects.length > 0) && (
            <div className="card">
              <p className="text-[13px] text-inkMuted">
                Clock in to see your checklist and tasks for the shift.
              </p>
            </div>
          )
        )}

        <CollapsibleSection title="Your schedule" subtitle="Next 7 days">
          <MyShifts
            shifts={myShifts.filter((s) => s.shift_date >= today)}
            types={shiftTypes}
            branches={(branchRows ?? []) as any}
            today={today}
          />
        </CollapsibleSection>

        <RequestForm mine={myApprovals ?? []} />

        <ReceivedItemForm />

        <CollapsibleSection title="Received & low stock" subtitle="Photo history, all branches">
          <ReceivedItemsFeed />
        </CollapsibleSection>

        <CollapsibleSection title="Hostel" subtitle="Guest check-in & log">
          <PmsFrontDesk />
          <HostelStaysFeed />
        </CollapsibleSection>

        <CollapsibleSection title="Bistro" subtitle="End-of-day sales">
          <BistroSalesForm />
          <BistroSalesFeed />
        </CollapsibleSection>

        <div className="card">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-[15px] font-semibold">Recent shifts</h2>
            <span className="text-[12px] text-inkMuted">{fmtDuration(weekMs)} this week</span>
          </div>
          {past.length === 0 ? (
            <p className="text-[13px] text-inkMuted">No completed shifts yet.</p>
          ) : (
            <div className="flex flex-col">
              {past.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between py-2.5 text-[13px]"
                  style={{ borderTop: "1px solid var(--line)" }}
                >
                  <span className="text-inkSecondary">{fmtDateBKK(e.clock_in)}</span>
                  <span className="text-inkMuted text-[12px]">
                    {fmtTimeBKK(e.clock_in)} – {e.clock_out ? fmtTimeBKK(e.clock_out) : "—"}
                  </span>
                  <span className="num font-semibold">{fmtDuration(entryDurationMs(e))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
