"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeMaintenanceJob, type MaintenanceJob } from "@/app/clock/maintenance-actions";

/** One approved job, with an inline "mark done + photo" form. */
export function MaintenanceJobRow({ job }: { job: MaintenanceJob }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [working, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await completeMaintenanceJob(job.id, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--line-strong)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate">{job.title}</div>
          <div className="text-[11.5px] text-inkMuted truncate">Requested by {job.requestedByName}</div>
          {job.note && <div className="text-[12px] text-inkSecondary mt-1">{job.note}</div>}
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

      {job.requestPhotoUrl && (
        <a href={job.requestPhotoUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private, short-lived signed URL isn't a candidate for next/image's remote-pattern allowlist */}
          <img
            src={job.requestPhotoUrl}
            alt="Photo attached to the request"
            className="rounded-[9px] object-cover"
            style={{ width: 96, height: 96, border: "1px solid var(--line-strong)" }}
          />
        </a>
      )}

      {error && (
        <div
          className="rounded-[9px] px-3 py-2 text-[12.5px] font-medium mt-2"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {open && (
        <form ref={formRef} action={submit} className="flex flex-col gap-2.5 mt-3">
          <label className="text-[12px] font-semibold text-inkSecondary">
            Photo of the finished job
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
              placeholder="Replaced the hinge"
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
