import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/guard";
import { Topbar } from "@/components/Topbar";
import { TaskManager } from "@/components/TaskManager";
import { fmtTimeBKK, type Branch, type Employee } from "@/lib/types";

export const dynamic = "force-dynamic";

function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const supabase = await createClient();
  const today = bangkokToday();

  const [
    { data: branches },
    { data: employees },
    { data: templates },
    { data: completions },
    { data: tasks },
  ] = await Promise.all([
    supabase.from("branches").select("*").returns<Branch[]>(),
    supabase.from("employees").select("*").order("full_name").returns<Employee[]>(),
    supabase.from("task_templates").select("*").eq("active", true).order("sort_order"),
    supabase.from("task_completions").select("*").eq("task_date", today),
    supabase.from("tasks").select("*").order("created_at", { ascending: false }),
  ]);

  const branchById = Object.fromEntries((branches ?? []).map((b) => [b.id, b]));
  const empById = Object.fromEntries((employees ?? []).map((e) => [e.id, e]));

  const inBranch = (bid: string | null) =>
    branch === "all" || !bid || branchById[bid]?.slug === branch;

  const scopedTemplates = (templates ?? []).filter((t: any) => inBranch(t.branch_id));
  const scopedTasksRaw = (tasks ?? []).filter((t: any) => inBranch(t.branch_id));

  // Signed URLs for any completed tasks that have a photo attached. Private
  // bucket, so this goes through the admin client, gated on requireManager()
  // in code — this page is already manager-only via the (app) layout, but
  // the admin client's own convention is to prove the role again here too.
  const photoGuard = await requireManager("tasks.viewCompletionPhotos");
  const photoUrlById = new Map<string, string>();
  if (photoGuard.ok) {
    const admin = createAdminClient();
    const withPhotos = scopedTasksRaw.filter((t: any) => t.completion_photo_path);
    await Promise.all(
      withPhotos.map(async (t: any) => {
        const { data: signed } = await admin.storage
          .from("task-photos")
          .createSignedUrl(t.completion_photo_path as string, 60 * 10);
        if (signed?.signedUrl) photoUrlById.set(t.id, signed.signedUrl);
      })
    );
  }

  const scopedTasks = scopedTasksRaw.map((t: any) => ({
    ...t,
    photoUrl: photoUrlById.get(t.id) ?? null,
  }));

  const doneToday = new Set((completions ?? []).map((c: any) => c.template_id));
  const checklistDone = scopedTemplates.filter((t: any) => doneToday.has(t.id)).length;
  const openTasks = scopedTasks.filter((t: any) => !t.completed_at).length;

  return (
    <>
      <Topbar title="Tasks" sub="Shift checklist and assigned jobs" branch={branch} />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <div className="grid gap-3.5 mb-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
              Checklist done today
            </div>
            <div className="num text-[27px] font-semibold mt-2">
              {checklistDone}{" "}
              <span className="text-[15px] text-inkMuted">/ {scopedTemplates.length}</span>
            </div>
          </div>
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
              Open tasks
            </div>
            <div className="num text-[27px] font-semibold mt-2">{openTasks}</div>
          </div>
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
              Checklist items
            </div>
            <div className="num text-[27px] font-semibold mt-2">{scopedTemplates.length}</div>
          </div>
        </div>

        {completions && completions.length > 0 && (
          <div className="card mb-3.5">
            <h3 className="font-display text-[15px] font-semibold mb-3">Completed today</h3>
            <div className="flex flex-col">
              {(completions ?? []).map((c: any) => {
                const t = (templates ?? []).find((x: any) => x.id === c.template_id);
                if (!t) return null;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-2 text-[13px] gap-3"
                    style={{ borderTop: "1px solid var(--line)" }}
                  >
                    <span className="flex-1 min-w-0 truncate">{t.title}</span>
                    <span className="text-inkMuted text-[12px]">
                      {empById[c.employee_id]?.full_name ?? "—"}
                    </span>
                    <span className="text-inkMuted text-[12px]">{fmtTimeBKK(c.completed_at)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <TaskManager
          branches={branches ?? []}
          employees={employees ?? []}
          templates={scopedTemplates}
          tasks={scopedTasks}
        />
      </div>
    </>
  );
}
