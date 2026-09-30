"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clockInFor } from "@/app/(app)/team/actions";
import type { Employee } from "@/lib/types";

/**
 * The release valve.
 *
 * Clock-in is refused away from the shop, so a dead phone, a denied location
 * permission or a bad fix inside a concrete building would otherwise stop a
 * real shift from starting. A manager starts it instead, and the entry is
 * marked as manager-assisted so the override stays visible.
 */
export function ManagerClockIn({ offShift }: { offShift: Employee[] }) {
  const router = useRouter();
  const [working, start] = useTransition();
  const [who, setWho] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function go() {
    if (!who) return;
    setError(null);
    setDone(null);
    const name = offShift.find((e) => e.id === who)?.full_name ?? "They";
    start(async () => {
      const res = await clockInFor(who);
      if (!res.ok) setError(res.error);
      else {
        setDone(`${name} is clocked in. The shift is marked as started by you.`);
        setWho("");
        router.refresh();
      }
    });
  }

  return (
    <div className="card">
      <h3 className="font-display text-[15px] font-semibold mb-1">Clock someone in</h3>
      <p className="text-[12.5px] text-inkSecondary m-0 mb-3.5 leading-relaxed">
        For when the location check won&apos;t let someone in and you can see they&apos;re at
        work. Recorded as started by you, not by them.
      </p>

      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}
      {done && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {done}
        </div>
      )}

      <div className="flex gap-2">
        <label className="sr-only" htmlFor="who">
          Who to clock in
        </label>
        <select
          id="who"
          value={who}
          disabled={working || offShift.length === 0}
          onChange={(e) => setWho(e.target.value)}
          className="flex-1 min-w-0 rounded-[9px] border px-3 text-[13.5px]"
          style={{
            borderColor: "var(--line-strong)",
            background: "var(--surface)",
            minHeight: 44,
          }}
        >
          <option value="">
            {offShift.length === 0 ? "Everyone is on shift" : "Pick someone…"}
          </option>
          {offShift.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={working || !who}
          onClick={go}
          className="rounded-[9px] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)", minHeight: 44 }}
        >
          {working ? "…" : "Clock in"}
        </button>
      </div>
    </div>
  );
}
