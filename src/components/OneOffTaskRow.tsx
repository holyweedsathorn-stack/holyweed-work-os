"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeTask, reopenTask } from "@/app/clock/task-actions";
import type { OneOffTask } from "./StaffTasks";

/**
 * One assigned task. Open tasks expand into a "mark done" form that
 * requires a photo of the finished work; done tasks show a photo-logged
 * note and a plain reopen link (reopening clears the old photo since a
 * redo needs fresh proof).
 */
export function OneOffTaskRow({ task }: { task: OneOffTask }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [working, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submitComplete(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await completeTask(task.id, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function submitReopen() {
    setError(null);
    start(async () => {
      const res = await reopenTask(task.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (task.done) {
    return (
      <div className="py-3" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="flex items-start justify-between gap-3">
          <span className="text-[13.5px]" style={{ color: "var(--ink-muted)", textDecoration: "line-through" }}>
            {task.title}
          </span>
          <button
            type="button"
            disabled={working}
            onClick={submitReopen}
            className="text-[12px] text-inkMuted underline flex-none disabled:opacity-60"
          >
            Reopen
          </button>
        </div>
        {task.photoAttached && (
          <div className="text-[11.5px] mt-1" style={{ color: "var(--accent)" }}>
            ✓ Photo logged
          </div>
        )}
        {error && (
          <div className="text-[12px] font-medium mt-1.5" style={{ color: "var(--critical)" }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-3" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px]">{task.title}</div>
          {task.note && <div className="text-[12px] text-inkMuted mt-0.5">{task.note}</div>}
          {task.due && <div className="text-[11.5px] text-inkMuted mt-0.5">Due {task.due}</div>}
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[12.5px] font-semibold flex-none"
            style={{ color: "var(--accent)" }}
          >
            Mark done
          </button>
        )}
      </div>

      {error && (
        <div
          className="rounded-[9px] px-3 py-2 text-[12.5px] font-medium mt-2"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {open && (
        <form ref={formRef} action={submitComplete} className="flex flex-col gap-2.5 mt-3">
          <label className="text-[12px] font-semibold text-inkSecondary">
            Photo of the finished task
            <input
              name="photo"
              type="file"
              accept="image/*"
              required
              className="w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            />
          </label>
          <label className="text-[12px] font-semibold text-inkSecondary">
            Anything to add? (optional)
            <input
              name="note"
              maxLength={300}
              placeholder="Restocked and wiped down"
              className="w-full rounded-[9px] border px-3 text-[13.5px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 44 }}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={working}
              className="flex-1 rounded-[10px] text-[14px] font-bold text-white disabled:opacity-60"
              style={{ background: "var(--accent)", minHeight: 46 }}
            >
              {working ? "Uploading…" : "Done"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[10px] border px-4 text-[13px] font-semibold text-inkSecondary"
              style={{ borderColor: "var(--line-strong)", minHeight: 46 }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
