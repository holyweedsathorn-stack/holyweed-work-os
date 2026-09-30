"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  toggleChecklistItem,
  updateMyProjectStatus,
} from "@/app/clock/task-actions";
import { OneOffTaskRow } from "./OneOffTaskRow";

export type ChecklistItem = { id: string; title: string; done: boolean; doneBy?: string | null };
export type OneOffTask = {
  id: string;
  title: string;
  note: string | null;
  done: boolean;
  due: string | null;
  photoAttached?: boolean;
};
export type MyProject = {
  id: string;
  title: string;
  status: "todo" | "inprogress" | "review" | "done";
  due: string | null;
};

const STATUS_LABEL: Record<MyProject["status"], string> = {
  todo: "Not started",
  inprogress: "Working on it",
  review: "Ready for review",
  done: "Done",
};

function Check({ done }: { done: boolean }) {
  return (
    <span
      className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center flex-none"
      style={{
        border: `1.5px solid ${done ? "var(--accent)" : "var(--line-strong)"}`,
        background: done ? "var(--accent)" : "transparent",
      }}
    >
      {done && (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
          <path
            d="M5 12.5l4.5 4.5L19 7"
            fill="none"
            stroke="var(--accent-ink)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

export function StaffTasks({
  checklist,
  tasks,
  projects,
}: {
  checklist: ChecklistItem[];
  tasks: OneOffTask[];
  projects: MyProject[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  const remaining = checklist.filter((c) => !c.done).length;
  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  const nothingAtAll =
    checklist.length === 0 && tasks.length === 0 && projects.length === 0;

  if (nothingAtAll) {
    return (
      <div className="card">
        <p className="text-[13px] text-inkMuted">
          Nothing assigned to you right now. Enjoy your shift.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          className="text-[12.5px] font-medium rounded-[9px] px-3 py-2"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </p>
      )}

      {checklist.length > 0 && (
        <div className="card">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-[15px] font-semibold">Today&apos;s checklist</h2>
            <span className="text-[12px] text-inkMuted">
              {remaining === 0 ? "All done" : `${remaining} left`}
            </span>
          </div>
          <div className="flex flex-col">
            {checklist.map((item) => (
              <button
                key={item.id}
                disabled={pending}
                onClick={() => run(() => toggleChecklistItem(item.id, !item.done))}
                className="flex items-start gap-3 py-3 text-left disabled:opacity-60"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <Check done={item.done} />
                <span className="flex-1">
                  <span
                    className="block text-[13.5px]"
                    style={{
                      color: item.done ? "var(--ink-muted)" : "var(--ink)",
                      textDecoration: item.done ? "line-through" : "none",
                    }}
                  >
                    {item.title}
                  </span>
                  {item.done && item.doneBy && (
                    <span className="block text-[11.5px] text-inkMuted mt-0.5">
                      Done by {item.doneBy}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(openTasks.length > 0 || doneTasks.length > 0) && (
        <div className="card">
          <h2 className="font-display text-[15px] font-semibold mb-3">Your tasks</h2>
          <div className="flex flex-col">
            {[...openTasks, ...doneTasks].map((t) => (
              <OneOffTaskRow key={t.id} task={t} />
            ))}
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="card">
          <h2 className="font-display text-[15px] font-semibold mb-1">Your projects</h2>
          <p className="text-[12px] text-inkMuted mb-3">
            Bigger jobs assigned to you. Update where you&apos;re up to.
          </p>
          <div className="flex flex-col">
            {projects.map((p) => (
              <div key={p.id} className="py-3" style={{ borderTop: "1px solid var(--line)" }}>
                <div className="text-[13.5px] font-medium">{p.title}</div>
                {p.due && <div className="text-[11.5px] text-inkMuted mt-0.5">Due {p.due}</div>}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {(["todo", "inprogress", "review", "done"] as const).map((s) => (
                    <button
                      key={s}
                      disabled={pending}
                      onClick={() => run(() => updateMyProjectStatus(p.id, s))}
                      className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-60"
                      style={{
                        border: `1px solid ${p.status === s ? "var(--accent)" : "var(--line-strong)"}`,
                        background: p.status === s ? "var(--accent-soft)" : "transparent",
                        color: p.status === s ? "var(--accent)" : "var(--ink-secondary)",
                      }}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
