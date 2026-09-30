"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { copyWeekForward, clearWeek, setRequirement } from "@/app/(app)/schedule/actions";
import type { Branch } from "@/lib/types";
import { orderedTypes, type ShiftCode, type ShiftRequirement, type ShiftType } from "@/lib/shifts";

export function ScheduleControls({
  monday,
  branches,
  types,
  requirements,
}: {
  monday: string;
  branches: Branch[];
  types: ShiftType[];
  requirements: ShiftRequirement[];
}) {
  const router = useRouter();
  const [working, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const shown = orderedTypes(types);
  const req = (branchId: string, code: ShiftCode) =>
    requirements.find((r) => r.branch_id === branchId && r.code === code)?.required_staff ?? 1;

  function copy() {
    setMsg(null);
    start(async () => {
      const res = await copyWeekForward(monday);
      if (!res.ok) setMsg({ tone: "bad", text: res.error });
      else {
        setMsg({
          tone: "ok",
          text:
            `Copied ${res.copied} shift${res.copied === 1 ? "" : "s"} into next week` +
            (res.skipped ? `, left ${res.skipped} already there alone.` : "."),
        });
        router.refresh();
      }
    });
  }

  function wipe() {
    setMsg(null);
    setConfirming(false);
    start(async () => {
      const res = await clearWeek(monday);
      if (!res.ok) setMsg({ tone: "bad", text: res.error });
      else {
        setMsg({ tone: "ok", text: "Week cleared." });
        router.refresh();
      }
    });
  }

  function requirement(branchId: string, code: ShiftCode, n: number) {
    setMsg(null);
    start(async () => {
      const res = await setRequirement(branchId, code, n);
      if (!res.ok) setMsg({ tone: "bad", text: res.error });
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-[1fr_1.4fr] mt-3.5">
      <div className="card">
        <h3 className="font-display text-[15px] font-semibold mb-1">Build next week</h3>
        <p className="text-[12.5px] text-inkSecondary m-0 mb-3.5 leading-relaxed">
          Copies this week&apos;s roster onto next week. Shifts already there are left
          alone, so it&apos;s safe to press twice.
        </p>

        {msg && (
          <div
            className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
            style={
              msg.tone === "ok"
                ? { background: "var(--accent-soft)", color: "var(--accent)" }
                : { background: "var(--critical-soft)", color: "var(--critical)" }
            }
          >
            {msg.text}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={working}
            onClick={copy}
            className="rounded-[9px] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--accent)", minHeight: 44 }}
          >
            {working ? "Working…" : "Copy to next week"}
          </button>

          {confirming ? (
            <>
              <button
                type="button"
                disabled={working}
                onClick={wipe}
                className="rounded-[9px] px-4 text-[13px] font-semibold text-white"
                style={{ background: "var(--critical)", minHeight: 44 }}
              >
                Yes, clear it
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-[9px] border px-3 text-[13px] font-semibold text-inkSecondary"
                style={{ borderColor: "var(--line-strong)", minHeight: 44 }}
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={working}
              onClick={() => setConfirming(true)}
              className="rounded-[9px] border px-4 text-[13px] font-semibold text-inkSecondary"
              style={{ borderColor: "var(--line-strong)", minHeight: 44 }}
            >
              Clear this week
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="font-display text-[15px] font-semibold mb-1">Cover needed</h3>
        <p className="text-[12.5px] text-inkSecondary m-0 mb-3.5 leading-relaxed">
          How many budtenders each shift needs. Anything below this shows as a gap above.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 380 }}>
            <thead>
              <tr>
                <th className="text-left text-[11px] uppercase tracking-wide text-inkMuted font-semibold pb-2">
                  Branch
                </th>
                {shown.map((t) => (
                  <th
                    key={t.code}
                    className="text-left text-[11px] uppercase tracking-wide text-inkMuted font-semibold pb-2"
                  >
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 text-[13px] font-semibold" style={{ borderTop: "1px solid var(--line)" }}>
                    {b.name}
                  </td>
                  {shown.map((t) => (
                    <td key={t.code} className="py-2" style={{ borderTop: "1px solid var(--line)" }}>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        defaultValue={req(b.id, t.code)}
                        disabled={working}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (n !== req(b.id, t.code)) requirement(b.id, t.code, n);
                        }}
                        className="num rounded-[8px] border px-2 text-[13px] w-[64px]"
                        style={{
                          borderColor: "var(--line-strong)",
                          background: "var(--surface)",
                          minHeight: 40,
                        }}
                        aria-label={`${b.name} ${t.label} staff needed`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
