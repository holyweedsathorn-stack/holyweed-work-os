"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createProject,
  updateProject,
  setProjectStatus,
  deleteProject,
  deleteAllProjects,
} from "@/app/(app)/projects/actions";
import { initials, type Branch, type Employee } from "@/lib/types";

export type BoardProject = {
  id: string;
  title: string;
  branch_id: string | null;
  assignee_employee_id: string | null;
  due_date: string | null;
  priority: "low" | "med" | "high";
  status: "todo" | "inprogress" | "review" | "done";
};

const COLUMNS: { id: BoardProject["status"]; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "inprogress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const PRIO_COLOR: Record<string, string> = {
  high: "var(--critical)",
  med: "var(--warning)",
  low: "var(--good)",
};

const inputStyle = { borderColor: "var(--line-strong)", background: "var(--surface)" } as const;
const inputClass =
  "mt-1 w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-[12px] font-semibold text-inkSecondary block">
      {label}
      {children}
    </label>
  );
}

function ProjectForm({
  branches,
  employees,
  project,
  onCancel,
  onSaved,
}: {
  branches: Branch[];
  employees: Employee[];
  project?: BoardProject;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editing = !!project;

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = editing ? await updateProject(formData) : await createProject(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="card mb-4">
      <h3 className="font-display text-[15px] font-semibold mb-3">
        {editing ? "Edit project" : "New project"}
      </h3>
      <form action={submit} className="flex flex-col gap-3">
        {editing && <input type="hidden" name="id" value={project!.id} />}

        <Field label="Project name">
          <input
            name="title"
            required
            defaultValue={project?.title}
            placeholder="e.g. Sukhumvit display wall refit"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Field label="Branch">
            <select
              name="branch_id"
              defaultValue={project?.branch_id ?? ""}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">Both branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assign to">
            <select
              name="assignee_employee_id"
              defaultValue={project?.assignee_employee_id ?? ""}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">Nobody yet</option>
              {employees
                .filter((e) => e.active !== false)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Due date">
            <input
              type="date"
              name="due_date"
              defaultValue={project?.due_date ?? ""}
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          <Field label="Priority">
            <select
              name="priority"
              defaultValue={project?.priority ?? "med"}
              className={inputClass}
              style={inputStyle}
            >
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
        </div>

        <Field label="Status">
          <select
            name="status"
            defaultValue={project?.status ?? "todo"}
            className={inputClass}
            style={inputStyle}
          >
            {COLUMNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <p
            className="text-[12.5px] font-medium rounded-[9px] px-3 py-2"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Create project"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
            style={{ border: "1px solid var(--line-strong)" }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProjectBoard({
  branches,
  employees,
  projects,
  today,
}: {
  branches: Branch[];
  employees: Employee[];
  projects: BoardProject[];
  today: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "new" | string>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const editing = mode !== "idle" && mode !== "new" ? projects.find((p) => p.id === mode) : undefined;

  const branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
  const empById = Object.fromEntries(employees.map((e) => [e.id, e]));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function move(p: BoardProject, dir: -1 | 1) {
    const i = COLUMNS.findIndex((c) => c.id === p.status);
    const next = COLUMNS[i + dir];
    if (next) run(() => setProjectStatus(p.id, next.id));
  }

  return (
    <div>
      {error && (
        <div
          className="card mb-4 text-[13px] font-medium"
          style={{ borderColor: "var(--critical)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {mode === "new" && (
        <ProjectForm
          branches={branches}
          employees={employees}
          onCancel={() => setMode("idle")}
          onSaved={() => {
            setMode("idle");
            router.refresh();
          }}
        />
      )}

      {editing && (
        <ProjectForm
          branches={branches}
          employees={employees}
          project={editing}
          onCancel={() => setMode("idle")}
          onSaved={() => {
            setMode("idle");
            router.refresh();
          }}
        />
      )}

      {mode === "idle" && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <button
            onClick={() => setMode("new")}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            + New project
          </button>
          {projects.length > 0 && (
            <button
              onClick={() => {
                if (
                  confirm(
                    `Delete all ${projects.length} projects? Use this to clear the sample projects before adding your real ones. This cannot be undone.`
                  )
                ) {
                  run(() => deleteAllProjects());
                }
              }}
              disabled={pending}
              className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
              style={{ border: "1px solid var(--line-strong)", color: "var(--critical)" }}
            >
              Clear all
            </button>
          )}
          <span className="text-[12px] text-inkMuted">
            {projects.length} project{projects.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      <div className="flex gap-3.5 overflow-x-auto pb-2 items-start">
        {COLUMNS.map((col, colIndex) => {
          const cards = projects.filter((p) => p.status === col.id);
          return (
            <div
              key={col.id}
              className="rounded-[14px] p-3 flex-none"
              style={{ background: "var(--surface-2)", width: 280 }}
            >
              <div className="flex items-center justify-between px-1 pb-3">
                <h4 className="text-[12.5px] font-bold uppercase tracking-wide text-inkSecondary">
                  {col.label}
                </h4>
                <span
                  className="num text-[11px] rounded-[6px] px-1.5 py-0.5"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    color: "var(--ink-muted)",
                  }}
                >
                  {cards.length}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {cards.map((p) => {
                  const b = p.branch_id ? branchById[p.branch_id] : null;
                  const person = p.assignee_employee_id ? empById[p.assignee_employee_id] : null;
                  const overdue = p.due_date && p.due_date < today && p.status !== "done";
                  const soon =
                    p.due_date &&
                    !overdue &&
                    p.due_date <= new Date(new Date(today).getTime() + 2 * 86400000).toISOString().slice(0, 10) &&
                    p.status !== "done";

                  return (
                    <div key={p.id} className="card" style={{ padding: 12 }}>
                      <div className="mb-2">
                        <span
                          className="chip"
                          style={
                            b
                              ? { background: `var(--${b.slug}-soft)`, color: `var(--${b.slug})` }
                              : { background: "var(--surface-2)", color: "var(--ink-muted)" }
                          }
                        >
                          {b ? b.name : "Both branches"}
                        </span>
                      </div>

                      <div className="text-[13px] font-semibold leading-snug mb-2.5">{p.title}</div>

                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex items-center gap-1.5 text-[10.6px] font-bold uppercase tracking-wide text-inkMuted">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: PRIO_COLOR[p.priority] }}
                          />
                          {p.priority}
                        </span>
                        {p.due_date && (
                          <span
                            className="text-[11.3px] font-medium"
                            style={{
                              color: overdue
                                ? "var(--critical)"
                                : soon
                                  ? "var(--warning)"
                                  : "var(--ink-muted)",
                            }}
                          >
                            {overdue ? "overdue · " : ""}
                            {new Date(p.due_date + "T00:00:00Z").toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        {person ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div
                              className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-[9.5px] font-semibold flex-none"
                              style={{ background: "linear-gradient(155deg, var(--accent), #1a5c37)" }}
                            >
                              {initials(person.full_name)}
                            </div>
                            <span className="text-[11.3px] text-inkSecondary font-medium truncate">
                              {person.full_name.split(" ")[0]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11.3px] text-inkMuted">Unassigned</span>
                        )}

                        <div className="flex gap-1 flex-none">
                          <button
                            onClick={() => move(p, -1)}
                            disabled={pending || colIndex === 0}
                            title="Move left"
                            className="rounded-[6px] px-1.5 py-0.5 text-[12px] font-bold disabled:opacity-30"
                            style={{ border: "1px solid var(--line-strong)" }}
                          >
                            ←
                          </button>
                          <button
                            onClick={() => move(p, 1)}
                            disabled={pending || colIndex === COLUMNS.length - 1}
                            title="Move right"
                            className="rounded-[6px] px-1.5 py-0.5 text-[12px] font-bold disabled:opacity-30"
                            style={{ border: "1px solid var(--line-strong)" }}
                          >
                            →
                          </button>
                        </div>
                      </div>

                      <div
                        className="flex gap-1.5 mt-2 pt-2"
                        style={{ borderTop: "1px solid var(--line)" }}
                      >
                        <button
                          onClick={() => setMode(p.id)}
                          disabled={pending}
                          className="rounded-[6px] px-2 py-0.5 text-[11.5px] font-semibold"
                          style={{ border: "1px solid var(--line-strong)" }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${p.title}"?`)) run(() => deleteProject(p.id));
                          }}
                          disabled={pending}
                          className="rounded-[6px] px-2 py-0.5 text-[11.5px] font-semibold"
                          style={{ border: "1px solid var(--line-strong)", color: "var(--critical)" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}

                {cards.length === 0 && (
                  <p className="text-[12px] text-inkMuted px-1 py-2">Nothing here.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
