"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { raiseRequest, cancelRequest } from "@/app/clock/request-actions";
import {
  APPROVAL_KINDS,
  fmtAgo,
  fmtTHB,
  type Approval,
  type ApprovalKind,
} from "@/lib/types";

const inputClass =
  "w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent";
const inputStyle = {
  borderColor: "var(--line-strong)",
  background: "var(--surface)",
  minHeight: 46,
} as const;

/**
 * Staff-side: ask for something, and see where your asks got to.
 *
 * The pills pick the `kind`, and the kind decides which of the two nullable
 * columns the form fills in — an amount for money, a date for a day. That's
 * the whole reason the table needs no catch-all payload column.
 */
export function RequestForm({ mine }: { mine: Approval[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [working, start] = useTransition();
  const [kind, setKind] = useState<ApprovalKind>("leave");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);

  const spec = APPROVAL_KINDS.find((k) => k.id === kind) ?? APPROVAL_KINDS[0];
  const pending = mine.filter((a) => a.status === "pending");
  const recent = mine.filter((a) => a.status !== "pending").slice(0, 3);

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await raiseRequest(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      formRef.current?.reset();
      setSent(true);
      setOpen(false);
      router.refresh();
    });
  }

  function withdraw(id: string) {
    setError(null);
    start(async () => {
      const res = await cancelRequest(id);
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
        <h2 className="font-display text-[15px] font-semibold">Ask for something</h2>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setSent(false);
            }}
            className="text-[12.5px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            New request
          </button>
        )}
      </div>

      {sent && !open && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          Sent. You&apos;ll see the answer here.
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

      {open && (
        <form ref={formRef} action={submit} className="flex flex-col gap-3 mb-4">
          <input type="hidden" name="kind" value={kind} />

          <div className="flex flex-wrap gap-1.5">
            {APPROVAL_KINDS.map((k) => {
              const on = k.id === kind;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className="rounded-full px-3.5 text-[13px] font-semibold border"
                  style={{
                    minHeight: 44,
                    borderColor: on ? "var(--accent)" : "var(--line-strong)",
                    background: on ? "var(--accent-soft)" : "var(--surface)",
                    color: on ? "var(--accent)" : "var(--ink-secondary)",
                  }}
                >
                  {k.label}
                </button>
              );
            })}
          </div>

          <label className="text-[12px] font-semibold text-inkSecondary">
            {spec.what}
            <input
              name="title"
              required
              maxLength={200}
              placeholder={spec.hint}
              className={inputClass + " mt-1.5"}
              style={inputStyle}
            />
          </label>

          {spec.amount && (
            <label className="text-[12px] font-semibold text-inkSecondary">
              How much (baht)
              <input
                name="amount"
                inputMode="decimal"
                required
                placeholder="2,400"
                className={inputClass + " mt-1.5 num font-mono"}
                style={inputStyle}
              />
            </label>
          )}

          {spec.date && (
            <label className="text-[12px] font-semibold text-inkSecondary">
              Which day
              <input
                name="ref_date"
                type="date"
                required
                className={inputClass + " mt-1.5"}
                style={inputStyle}
              />
            </label>
          )}

          <label className="text-[12px] font-semibold text-inkSecondary">
            Anything else to say? (optional)
            <textarea
              name="note"
              rows={2}
              maxLength={1000}
              placeholder="Mint can cover the close"
              className="w-full rounded-[9px] border px-3 py-2.5 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            />
          </label>

          <label className="text-[12px] font-semibold text-inkSecondary">
            Photo (optional)
            <input
              name="photo"
              type="file"
              accept="image/*"
              className="block w-full text-[13px] mt-1.5"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={working}
              className="flex-1 rounded-[11px] text-[15px] font-bold text-white disabled:opacity-60"
              style={{ background: "var(--accent)", minHeight: 50 }}
            >
              {working ? "Sending…" : "Send"}
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

      {pending.length === 0 && recent.length === 0 && !open ? (
        <p className="text-[13px] text-inkMuted m-0">
          Time off, a shift swap, something you had to buy — ask here and it goes straight to
          the office.
        </p>
      ) : (
        <div className="flex flex-col">
          {[...pending, ...recent].map((a) => {
            const tone =
              a.status === "approved"
                ? { bg: "var(--accent-soft)", fg: "var(--accent)", label: "Approved" }
                : a.status === "denied"
                  ? { bg: "var(--critical-soft)", fg: "var(--critical)", label: "Not this time" }
                  : a.status === "cancelled"
                    ? { bg: "var(--surface-2)", fg: "var(--ink-secondary)", label: "Withdrawn" }
                    : { bg: "var(--warning-soft)", fg: "var(--warning)", label: "Waiting" };
            return (
              <div
                key={a.id}
                className="flex items-center gap-2.5 py-2.5"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">
                    {a.title}
                    {a.amount != null && <span className="num"> · {fmtTHB(a.amount)}</span>}
                  </div>
                  <div className="text-[11.5px] text-inkMuted">
                    {a.status === "pending" ? `sent ${fmtAgo(a.created_at)}` : null}
                    {a.status === "denied" && a.decision_note ? `“${a.decision_note}”` : null}
                    {a.status === "approved" && a.decided_at ? fmtAgo(a.decided_at) : null}
                  </div>
                </div>
                {a.status === "pending" && (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => withdraw(a.id)}
                    className="text-[12px] text-inkMuted underline flex-none"
                  >
                    Withdraw
                  </button>
                )}
                <span className="chip flex-none" style={{ background: tone.bg, color: tone.fg }}>
                  {tone.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
