"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideApproval } from "@/app/(app)/approvals/actions";
import {
  APPROVAL_KIND_LABEL,
  BRANCH_COLOR,
  fmtAgo,
  fmtDateBKK,
  fmtTHB,
  initials,
  type Approval,
  type Branch,
} from "@/lib/types";

export function ApprovalQueue({
  pending: items,
  branches,
  photoUrlById,
}: {
  pending: Approval[];
  branches: Branch[];
  photoUrlById?: Map<string, string>;
}) {
  const router = useRouter();
  const [working, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [denying, setDenying] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const branchById = Object.fromEntries(branches.map((b) => [b.id, b]));

  function decide(id: string, decision: "approved" | "denied", note: string) {
    setError(null);
    start(async () => {
      const res = await decideApproval(id, decision, note);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDenying(null);
      setReason("");
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="card text-center py-10">
        <div className="font-display text-[16px] font-semibold">Nothing waiting on you</div>
        <p className="text-[13px] text-inkSecondary mt-1.5">
          Requests your team raises from the clock screen land here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div
          className="rounded-[9px] px-3.5 py-2.5 text-[13px] font-medium"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {items.map((a) => {
        const branch = a.branch_id ? branchById[a.branch_id] : null;
        const isDenying = denying === a.id;
        return (
          <div key={a.id} className="card flex gap-3.5 items-start">
            <div
              className="w-9 h-9 flex-none rounded-full flex items-center justify-center text-white text-[12.5px] font-semibold"
              style={{ background: "linear-gradient(155deg, var(--accent), #1a5c37)" }}
            >
              {initials(a.requester?.full_name ?? "?")}
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <b className="text-[14.5px] font-semibold">{a.requester?.full_name ?? "Unknown"}</b>
                <span className="chip" style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}>
                  {APPROVAL_KIND_LABEL[a.kind]}
                </span>
                {branch && (
                  <span
                    className="chip"
                    style={{
                      background: `color-mix(in srgb, ${BRANCH_COLOR[branch.slug]} 14%, transparent)`,
                      color: BRANCH_COLOR[branch.slug],
                    }}
                  >
                    {branch.name}
                  </span>
                )}
                <span className="num ml-auto text-[12px] text-inkMuted">{fmtAgo(a.created_at)}</span>
              </div>

              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="text-[15px] font-semibold">{a.title}</span>
                {a.amount != null && (
                  <span className="num text-[15px] font-semibold" style={{ color: "var(--accent2)" }}>
                    {fmtTHB(a.amount)}
                  </span>
                )}
                {a.ref_date && (
                  <span className="num text-[13px] text-inkSecondary">{fmtDateBKK(a.ref_date)}</span>
                )}
              </div>

              {a.note && (
                <p className="text-[13.5px] leading-relaxed text-inkSecondary m-0">{a.note}</p>
              )}

              {photoUrlById?.get(a.id) && (
                <a
                  href={photoUrlById.get(a.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12.5px] font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  View attached photo
                </a>
              )}

              {isDenying ? (
                <div className="flex flex-col gap-2 mt-1">
                  <label className="text-[12px] font-semibold text-inkSecondary" htmlFor={`why-${a.id}`}>
                    Why not? They'll see this.
                  </label>
                  <input
                    id={`why-${a.id}`}
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="We're two down that week"
                    className="w-full rounded-[9px] border px-3 py-2.5 text-[13.5px] outline-none focus:border-accent"
                    style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => decide(a.id, "denied", reason)}
                      className="rounded-[9px] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
                      style={{ background: "var(--critical)", minHeight: 44 }}
                    >
                      {working ? "Saving…" : "Confirm deny"}
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => {
                        setDenying(null);
                        setReason("");
                      }}
                      className="rounded-[9px] border px-4 text-[13px] font-semibold text-inkSecondary"
                      style={{ borderColor: "var(--line-strong)", minHeight: 44 }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => decide(a.id, "approved", "")}
                    className="rounded-[9px] px-[18px] text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "var(--accent)", minHeight: 44 }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => {
                      setDenying(a.id);
                      setReason("");
                    }}
                    className="rounded-[9px] border px-[18px] text-[13px] font-semibold text-inkSecondary"
                    style={{ borderColor: "var(--line-strong)", minHeight: 44 }}
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
