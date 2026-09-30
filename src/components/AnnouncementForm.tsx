"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendAnnouncement } from "@/app/clock/announcement-actions";

const inputClass =
  "w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent";
const inputStyle = {
  borderColor: "var(--line-strong)",
  background: "var(--surface)",
  minHeight: 46,
} as const;

/**
 * Manager/owner-side: push one message to every app_user in the org at
 * once. Same shape as RequestForm's collapsed-composer pattern, minus the
 * per-item history — an announcement isn't something you track state on,
 * just something you fire and confirm.
 */
export function AnnouncementForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [working, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await sendAnnouncement(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      formRef.current?.reset();
      setSentTo(res.sent);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-[15px] font-semibold">Announcement</h2>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setSentTo(null);
            }}
            className="text-[12.5px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            New announcement
          </button>
        )}
      </div>

      {sentTo !== null && !open && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          Sent to {sentTo} {sentTo === 1 ? "person" : "people"}.
        </div>
      )}

      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {open ? (
        <form ref={formRef} action={submit} className="flex flex-col gap-3">
          <label className="text-[12px] font-semibold text-inkSecondary">
            Title
            <input
              name="title"
              required
              maxLength={120}
              placeholder="Closed early tonight"
              className={inputClass + " mt-1.5"}
              style={inputStyle}
            />
          </label>

          <label className="text-[12px] font-semibold text-inkSecondary">
            Message
            <textarea
              name="body"
              required
              rows={3}
              maxLength={500}
              placeholder="We're closing at 22:00 tonight for a private event. Thanks all!"
              className="w-full rounded-[9px] border px-3 py-2.5 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={working}
              className="flex-1 rounded-[11px] text-[15px] font-bold text-white disabled:opacity-60"
              style={{ background: "var(--accent)", minHeight: 50 }}
            >
              {working ? "Sending…" : "Send to everyone"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[11px] border px-5 text-[14px] font-semibold text-inkSecondary"
              style={{ borderColor: "var(--line-strong)", minHeight: 50 }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        sentTo === null && (
          <p className="text-[13px] text-inkMuted m-0">
            Push a message to every staff member and manager at once — a closure, an event, a
            heads-up.
          </p>
        )
      )}
    </div>
  );
}
