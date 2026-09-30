"use client";

import { useEffect, useState } from "react";
import { isSubscribed, pushPermission, pushSupported, subscribeToPush } from "@/lib/push-client";

/**
 * "Enable notifications" banner — same shape and dismissal pattern as
 * InstallPrompt.tsx (localStorage-remembered dismissal, hides itself once
 * unnecessary).
 *
 * Deliberately does NOT auto-prompt on mount: a permission prompt that
 * fires without a tap gets auto-denied by some browsers and, once denied,
 * can't be re-asked from script. The person has to tap first.
 */
export function EnableNotifications() {
  const [status, setStatus] = useState<"checking" | "offer" | "asking" | "denied" | "done" | "hidden">(
    "checking"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!pushSupported()) {
        if (!cancelled) setStatus("hidden");
        return;
      }

      try {
        if (window.localStorage.getItem("hw-notify-dismissed") === "1") {
          if (!cancelled) setStatus("hidden");
          return;
        }
      } catch {
        // Private mode or blocked storage — fall through and offer anyway.
      }

      const permission = pushPermission();
      if (permission === "denied") {
        if (!cancelled) setStatus("hidden"); // Was denied at the OS/browser level — nothing we can do here.
        return;
      }

      const already = await isSubscribed();
      if (!cancelled) setStatus(already ? "hidden" : "offer");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setStatus("asking");
    setError(null);
    const result = await subscribeToPush();
    if (result.ok) {
      setStatus("done");
    } else {
      setError(result.error);
      setStatus("offer");
    }
  }

  function dismiss() {
    setStatus("hidden");
    try {
      window.localStorage.setItem("hw-notify-dismissed", "1");
    } catch {
      // Nothing to do — it just reappears next time.
    }
  }

  if (status === "checking" || status === "hidden" || status === "done") return null;

  return (
    <div className="rounded-card p-4" style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-[9px] flex-none flex items-center justify-center text-white font-display font-bold text-[16px]"
          style={{ background: "var(--accent)" }}
        >
          !
        </div>
        <div className="min-w-0 flex-1">
          <b className="text-[14px] font-semibold block" style={{ color: "var(--accent)" }}>
            Turn on notifications
          </b>
          <p className="text-[12.5px] text-inkSecondary m-0 mt-1 leading-relaxed">
            Get a phone alert for approval requests, assigned tasks, and clock-in/out reminders —
            even when the app isn't open.
          </p>
          {error && (
            <p className="text-[12px] m-0 mt-1" style={{ color: "var(--danger, #b3441c)" }}>
              {error}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={enable}
              disabled={status === "asking"}
              className="text-[13px] font-semibold px-3 py-1.5 rounded-[8px] text-white"
              style={{ background: "var(--accent)" }}
            >
              {status === "asking" ? "Enabling…" : "Enable notifications"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="text-[13px] font-medium px-3 py-1.5 rounded-[8px]"
              style={{ color: "var(--ink-muted, #6b7066)" }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
