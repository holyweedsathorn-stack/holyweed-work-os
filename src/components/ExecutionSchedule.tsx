"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  toggleScheduleTask,
  type ScheduleBusiness,
  type SchedulePhase,
  type ScheduleTask,
} from "@/app/(app)/marketing/schedule-actions";

const BUSINESS_ORDER: ScheduleBusiness[] = ["shared", "holyweed", "bistro", "hostel"];
const BUSINESS_LABEL: Record<ScheduleBusiness, string> = {
  shared: "Shared (ecosystem-wide)",
  holyweed: "Holyweed Dispensary",
  bistro: "Holy Bistro",
  hostel: "Holy Hostel",
};

const PHASE_ORDER: SchedulePhase[] = ["days_1_30", "days_31_60", "days_61_90"];
const PHASE_LABEL: Record<SchedulePhase, string> = {
  days_1_30: "Days 1–30",
  days_31_60: "Days 31–60",
  days_61_90: "Days 61–90",
};

/**
 * The 90-day marketing rollout as an in-app checklist, grouped by business
 * then phase. Mirrors the execution-schedule doc, but here checking a box
 * actually persists — this is the "follow along" surface, the doc is the
 * narrative version.
 */
export function ExecutionSchedule({ tasks: initial }: { tasks: ScheduleTask[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(task: ScheduleTask) {
    const nextDone = !task.done;
    setError(null);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: nextDone } : t)));
    start(async () => {
      const res = await toggleScheduleTask(task.id, nextDone);
      if (!res.ok) {
        // Revert on failure — the optimistic flip didn't stick.
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)));
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3.5 mt-3.5">
      <div className="text-[13px] uppercase tracking-wide text-inkMuted font-bold">
        90-day execution schedule
      </div>

      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {BUSINESS_ORDER.map((business) => {
        const businessTasks = tasks.filter((t) => t.business === business);
        if (businessTasks.length === 0) return null;
        const doneCount = businessTasks.filter((t) => t.done).length;

        return (
          <div key={business} className="card">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-display text-[15px] font-semibold">{BUSINESS_LABEL[business]}</h3>
              <span className="text-[12px] font-semibold text-inkMuted num">
                {doneCount}/{businessTasks.length} done
              </span>
            </div>

            <div className="w-full rounded-full h-1.5 mb-4 overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${businessTasks.length ? (doneCount / businessTasks.length) * 100 : 0}%`,
                  background: "var(--accent)",
                }}
              />
            </div>

            {PHASE_ORDER.map((phase) => {
              const phaseTasks = businessTasks.filter((t) => t.phase === phase);
              if (phaseTasks.length === 0) return null;
              return (
                <div key={phase} className="mb-3.5 last:mb-0">
                  <div className="text-[11.5px] font-bold text-inkMuted mb-1.5">
                    {PHASE_LABEL[phase]}
                  </div>
                  <div className="flex flex-col gap-1">
                    {phaseTasks.map((task) => (
                      <label
                        key={task.id}
                        className="flex items-start gap-2.5 py-1.5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => toggle(task)}
                          className="mt-0.5 flex-none"
                          style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
                        />
                        <span
                          className="text-[13px] leading-snug"
                          style={{
                            color: task.done ? "var(--ink-muted)" : "var(--ink)",
                            textDecoration: task.done ? "line-through" : "none",
                          }}
                        >
                          {task.title}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
