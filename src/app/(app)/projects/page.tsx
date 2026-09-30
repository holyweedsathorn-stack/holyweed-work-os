import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { ProjectBoard, type BoardProject } from "@/components/ProjectBoard";
import { bangkokToday, type Branch, type Employee } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const supabase = await createClient();

  const [{ data: branches }, { data: employees }, { data: projects }] = await Promise.all([
    supabase.from("branches").select("*").returns<Branch[]>(),
    supabase.from("employees").select("*").order("full_name").returns<Employee[]>(),
    supabase
      .from("projects")
      .select("id, title, branch_id, assignee_employee_id, due_date, priority, status")
      .order("due_date", { ascending: true, nullsFirst: false })
      .returns<BoardProject[]>(),
  ]);

  const branchById = Object.fromEntries((branches ?? []).map((b) => [b.id, b]));

  // A project with no branch belongs to both, so it shows under either filter.
  const items = (projects ?? []).filter(
    (p) => branch === "all" || !p.branch_id || branchById[p.branch_id]?.slug === branch
  );

  const open = items.filter((p) => p.status !== "done").length;
  const today = bangkokToday();
  const overdue = items.filter(
    (p) => p.due_date && p.due_date < today && p.status !== "done"
  ).length;

  return (
    <>
      <Topbar
        title="Projects"
        sub={`${open} open${overdue ? ` · ${overdue} overdue` : ""}`}
        branch={branch}
      />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <ProjectBoard
          branches={branches ?? []}
          employees={employees ?? []}
          projects={items}
          today={today}
        />
      </div>
    </>
  );
}
