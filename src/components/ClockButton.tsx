"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clockIn, clockOut } from "@/app/clock/actions";
import { fmtDuration } from "@/lib/types";
import { getFix } from "@/lib/geo-client";

export function ClockButton({
  isOpen,
  clockInAt,
}: {
  isOpen: boolean;
  clockInAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Live-ticking elapsed time while on shift.
  const [elapsed, setElapsed] = useState<string>("");
  useEffect(() => {
    if (!isOpen || !clockInAt) {
      setElapsed("");
      return;
    }
    const tick = () => setElapsed(fmtDuration(Date.now() - new Date(clockInAt).getTime()));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [isOpen, clockInAt]);

  async function handle() {
    setError(null);
    setLocating(true);
    // Clocking out is not location-checked, so don't make anyone wait as long
    // for a fix that only gets recorded.
    const fix = await getFix(isOpen ? 5000 : 12000);
    setLocating(false);

    startTransition(async () => {
      const res = isOpen ? await clockOut(fix) : await clockIn(fix);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const busy = pending || locating;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {isOpen && (
        <div className="text-center">
          <div className="text-[12px] uppercase tracking-wide text-inkMuted font-semibold">On shift</div>
          <div className="num text-[34px] font-semibold mt-1">{elapsed || "0h 00m"}</div>
        </div>
      )}

      <button
        onClick={handle}
        disabled={busy}
        className="w-full rounded-[16px] py-6 text-[19px] font-semibold transition-opacity disabled:opacity-60"
        style={{
          background: isOpen ? "var(--critical)" : "var(--accent)",
          color: isOpen ? "#fff" : "var(--accent-ink)",
        }}
      >
        {locating
          ? "Checking where you are…"
          : pending
            ? "One moment…"
            : isOpen
              ? "Clock out"
              : "Clock in"}
      </button>

      {error && (
        <p
          className="text-[13px] font-medium text-center rounded-[9px] px-3 py-2.5 w-full leading-relaxed"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
