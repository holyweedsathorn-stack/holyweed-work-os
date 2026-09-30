"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Nudge staff to put the app on their home screen.
 *
 * Android fires `beforeinstallprompt`, so there is a real one-tap button.
 * iOS has no such event and never will — Safari only installs through the
 * Share sheet — so iPhone users get the three steps written out instead.
 * Once installed, the app runs in standalone display mode and this disappears.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(true); // assume installed until proven otherwise
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari's own flag, which predates display-mode
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(!!isStandalone);

    const ua = window.navigator.userAgent;
    // iPadOS 13+ reports itself as a Mac, so check for touch as well.
    setIsIOS(
      /iPad|iPhone|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document)
    );

    try {
      if (window.localStorage.getItem("hw-install-dismissed") === "1") setDismissed(true);
    } catch {
      // Private mode or blocked storage — just show the prompt.
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function hide() {
    setDismissed(true);
    try {
      window.localStorage.setItem("hw-install-dismissed", "1");
    } catch {
      // Nothing to do — it just reappears next time.
    }
  }

  if (standalone || dismissed) return null;
  if (!deferred && !isIOS) return null;

  return (
    <div
      className="rounded-card p-4"
      style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-[9px] flex-none flex items-center justify-center text-white font-display font-bold text-[16px]"
          style={{ background: "var(--accent)" }}
        >
          H
        </div>
        <div className="min-w-0 flex-1">
          <b className="text-[14px] font-semibold block" style={{ color: "var(--accent)" }}>
            Put this on your home screen
          </b>
          <p className="text-[12.5px] text-inkSecondary m-0 mt-1 leading-relaxed">
            Then clocking in is one tap, with no browser and no typing the address.
          </p>

          {deferred ? (
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={async () => {
                  await deferred.prompt();
                  await deferred.userChoice;
                  setDeferred(null);
                }}
                className="rounded-[9px] px-4 text-[13px] font-semibold text-white"
                style={{ background: "var(--accent)", minHeight: 44 }}
              >
                Add to home screen
              </button>
              <button
                type="button"
                onClick={hide}
                className="rounded-[9px] px-3 text-[13px] font-semibold text-inkSecondary"
                style={{ minHeight: 44 }}
              >
                Not now
              </button>
            </div>
          ) : (
            <>
              <ol className="text-[12.5px] text-inkSecondary mt-2.5 mb-0 pl-4 leading-relaxed">
                <li>
                  Tap the <b className="font-semibold">Share</b> button at the bottom of Safari
                </li>
                <li>
                  Scroll down and tap <b className="font-semibold">Add to Home Screen</b>
                </li>
                <li>
                  Tap <b className="font-semibold">Add</b>
                </li>
              </ol>
              <button
                type="button"
                onClick={hide}
                className="text-[12.5px] font-semibold mt-2.5"
                style={{ color: "var(--ink-muted)", minHeight: 44 }}
              >
                Don&apos;t show this again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
