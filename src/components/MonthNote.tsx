"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMonthNote } from "@/app/(app)/report/actions";

/** A line or two of context that the numbers alone don't explain. */
export function MonthNote({ month, initial }: { month: string; initial: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      {body.trim() && (
        <p className="text-[13px] whitespace-pre-wrap print-only mb-2">{body}</p>
      )}
      <div className="no-print">
        <textarea
          value={body}
          rows={3}
          placeholder="Anything worth remembering about this month — a big repair, an unusual electricity bill, a closed day."
          onChange={(e) => {
            setBody(e.target.value);
            setSaved(false);
          }}
          className="w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent"
          style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => {
              setError(null);
              start(async () => {
                const res = await saveMonthNote(month, body);
                if (res.ok) {
                  setSaved(true);
                  router.refresh();
                } else {
                  setError(res.error);
                }
              });
            }}
            disabled={pending}
            className="rounded-[9px] px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-50"
            style={{ border: "1px solid var(--line-strong)", background: "var(--surface)" }}
          >
            {pending ? "Saving…" : "Save note"}
          </button>
          {saved && <span className="text-[12.5px]" style={{ color: "var(--good)" }}>Saved.</span>}
          {error && (
            <span className="text-[12.5px]" style={{ color: "var(--critical)" }}>{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
