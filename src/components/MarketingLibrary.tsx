"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMarketingDocument,
  uploadMarketingDocument,
  type MarketingDoc,
} from "@/app/(app)/marketing/actions";

const inputClass =
  "w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent";
const inputStyle = {
  borderColor: "var(--line-strong)",
  background: "var(--surface)",
  minHeight: 46,
} as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/**
 * Manager-only marketing plan library. Files live in a private Storage
 * bucket — every "View" link is a fresh signed URL handed down from the
 * server component that rendered this, and every write goes through a
 * server action gated by requireManager().
 */
export function MarketingLibrary({ docs }: { docs: MarketingDoc[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [working, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await uploadMarketingDocument(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  function remove(id: string, title: string) {
    if (!confirm(`Remove "${title}"? This can't be undone.`)) return;
    setError(null);
    start(async () => {
      const res = await deleteMarketingDocument(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-[15px] font-semibold">Marketing plans</h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[12.5px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Upload plan
          </button>
        )}
      </div>

      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {open && (
        <form ref={formRef} action={submit} className="flex flex-col gap-3 mb-4">
          <label className="text-[12px] font-semibold text-inkSecondary">
            Title
            <input
              name="title"
              maxLength={120}
              placeholder="Holy Bistro Marketing Plan"
              className={inputClass + " mt-1.5"}
              style={inputStyle}
            />
          </label>

          <label className="text-[12px] font-semibold text-inkSecondary">
            PDF file
            <input
              name="file"
              type="file"
              accept="application/pdf"
              required
              className={inputClass + " mt-1.5 py-2"}
              style={inputStyle}
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={working}
              className="flex-1 rounded-[11px] text-[15px] font-bold text-white disabled:opacity-60"
              style={{ background: "var(--accent)", minHeight: 50 }}
            >
              {working ? "Uploading…" : "Upload"}
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
      )}

      {docs.length === 0 ? (
        <p className="text-[13px] text-inkMuted m-0">
          No marketing plans uploaded yet.
        </p>
      ) : (
        <div className="flex flex-col">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2.5 py-2.5"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold truncate">{d.title}</div>
                <div className="text-[11.5px] text-inkMuted">Added {fmtDate(d.createdAt)}</div>
              </div>
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12.5px] font-semibold flex-none"
                  style={{ color: "var(--accent)" }}
                >
                  View
                </a>
              ) : (
                <span className="text-[12px] text-inkMuted flex-none">Unavailable</span>
              )}
              <button
                type="button"
                disabled={working}
                onClick={() => remove(d.id, d.title)}
                className="text-[12px] text-inkMuted underline flex-none"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
