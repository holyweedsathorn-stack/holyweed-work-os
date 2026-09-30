"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTemplate,
  deleteTemplate,
  createTask,
  deleteTask,
} from "@/app/(app)/tasks/actions";
import type { Branch, Employee } from "@/lib/types";

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

export function TaskManager({
  branches,
  employees,
  templates,
  tasks,
}: {
  branches: Branch[];
  employees: Employee[];
  templates: any[];
  tasks: any[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<"none" | "template" | "task">("none");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  const branchName = (id: string | null) =>
    id ? branches.find((b) => b.id === id)?.name ?? "—" : "Both branches";
  const empName = (id: string | null) =>
    id ? employees.find((e) => e.id === id)?.full_name ?? "—" : null;

  return (
    <div className="flex flex-col gap-3.5">
      {error && (
        <div
          className="card text-[13px] font-medium"
          style={{ borderColor: "var(--critical)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {/* ---------------- Repeating checklist ---------------- */}
      <div className="card">
        <div className="flex items-baseline justify-between mb-1 gap-3 flex-wrap">
          <h3 className="font-display text-[15px] font-semibold">Shift checklist</h3>
          <button
            onClick={() => setAdding(adding === "template" ? "none" : "template")}
            className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {adding === "template" ? "Cancel" : "+ Add item"}
          </button>
        </div>
        <p className="text-[12px] text-inkMuted mb-3">
          These appear for staff every shift and reset each day.
        </p>

        {adding === "template" && (
          <form
            action={(fd) => run(() => createTemplate(fd), () => setAdding("none"))}
            className="flex flex-col gap-3 mb-4 p-3 rounded-[9px]"
            style={{ background: "var(--surface-2)" }}
          >
            <Field label="Task">
              <input
                name="title"
                required
                placeholder="e.g. Count the cash drawer"
                className={inputClass}
                style={inputStyle}
              />
            </Field>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <Field label="Branch">
                <select name="branch_id" className={inputClass} style={inputStyle} defaultValue="">
                  <option value="">Both branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Which shift">
                <select name="shift_type" className={inputClass} style={inputStyle} defaultValue="">
                  <option value="">Every shift</option>
                  <option value="open">Opening only</option>
                  <option value="mid">Mid only</option>
                  <option value="close">Closing only</option>
                </select>
              </Field>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="self-start rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {pending ? "Adding…" : "Add to checklist"}
            </button>
          </form>
        )}

        {templates.length === 0 ? (
          <p className="text-[13px] text-inkMuted">No checklist items yet.</p>
        ) : (
          <div className="flex flex-col">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 py-2 text-[13px] flex-wrap"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <span className="flex-1 min-w-[160px]">{t.title}</span>
                <span className="chip" style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}>
                  {branchName(t.branch_id)}
                </span>
                <span className="chip" style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}>
                  {t.shift_type ? `${t.shift_type} shift` : "every shift"}
                </span>
                <button
                  onClick={() => {
                    if (confirm(`Remove "${t.title}" from the checklist?`)) {
                      run(() => deleteTemplate(t.id));
                    }
                  }}
                  disabled={pending}
                  className="rounded-[7px] px-2.5 py-1 text-[12px] font-semibold"
                  style={{ border: "1px solid var(--line-strong)", color: "var(--critical)" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- One-off tasks ---------------- */}
      <div className="card">
        <div className="flex items-baseline justify-between mb-1 gap-3 flex-wrap">
          <h3 className="font-display text-[15px] font-semibold">One-off tasks</h3>
          <button
            onClick={() => setAdding(adding === "task" ? "none" : "task")}
            className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {adding === "task" ? "Cancel" : "+ Assign task"}
          </button>
        </div>
        <p className="text-[12px] text-inkMuted mb-3">
          Given to one person, or left open to whoever is on shift at a branch.
        </p>

        {adding === "task" && (
          <form
            action={(fd) => run(() => createTask(fd), () => setAdding("none"))}
            className="flex flex-col gap-3 mb-4 p-3 rounded-[9px]"
            style={{ background: "var(--surface-2)" }}
          >
            <Field label="Task">
              <input
                name="title"
                required
                placeholder="e.g. Call Green Valley about the delivery"
                className={inputClass}
                style={inputStyle}
              />
            </Field>
            <Field label="Extra detail (optional)">
              <input
                name="note"
                placeholder="Anything they need to know"
                className={inputClass}
                style={inputStyle}
              />
            </Field>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              <Field label="Assign to">
                <select
                  name="assigned_employee_id"
                  className={inputClass}
                  style={inputStyle}
                  defaultValue=""
                >
                  <option value="">Anyone on shift</option>
                  {employees
                    .filter((e) => e.active !== false)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Branch">
                <select name="branch_id" className={inputClass} style={inputStyle} defaultValue="">
                  <option value="">Both branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due (optional)">
                <input type="date" name="due_date" className={inputClass} style={inputStyle} />
              </Field>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="self-start rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {pending ? "Assigning…" : "Assign task"}
            </button>
          </form>
        )}

        {tasks.length === 0 ? (
          <p className="text-[13px] text-inkMuted">No one-off tasks.</p>
        ) : (
          <div className="flex flex-col">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 py-2 text-[13px] flex-wrap"
                style={{ borderTop: "1px solid var(--line)", opacity: t.completed_at ? 0.6 : 1 }}
              >
                <span
                  className="flex-1 min-w-[160px]"
                  style={{ textDecoration: t.completed_at ? "line-through" : "none" }}
                >
                  {t.title}
                </span>
                <span className="chip" style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}>
                  {empName(t.assigned_employee_id) ?? `anyone · ${branchName(t.branch_id)}`}
                </span>
                {t.completed_at && (
                  <span className="chip" style={{ background: "var(--good-soft)", color: "var(--good)" }}>
                    done
                  </span>
                )}
                {t.photoUrl && (
                  <a
                    href={t.photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    View photo
                  </a>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Delete "${t.title}"?`)) run(() => deleteTask(t.id));
                  }}
                  disabled={pending}
                  className="rounded-[7px] px-2.5 py-1 text-[12px] font-semibold"
                  style={{ border: "1px solid var(--line-strong)", color: "var(--critical)" }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
