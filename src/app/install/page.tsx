import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Install Holyweed Work OS",
  robots: { index: false, follow: false },
};

/**
 * A page meant to be printed and pinned up in the staff area.
 *
 * Public on purpose — it contains nothing but instructions, and a card that
 * needs a login to read is no use taped to a wall.
 */
export default function InstallPage() {
  return (
    <div className="min-h-screen flex justify-center px-5 py-10" style={{ background: "var(--bg)" }}>
      <div className="w-full" style={{ maxWidth: 640 }}>
        <div className="card print-page" style={{ padding: 32 }}>
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-12 h-12 rounded-[12px] flex items-center justify-center text-white font-display font-bold text-[22px]"
              style={{ background: "var(--accent)" }}
            >
              H
            </div>
            <div>
              <h1 className="font-display text-[22px] font-semibold leading-tight m-0">
                Holyweed Work OS
              </h1>
              <p className="text-[13px] text-inkSecondary m-0 mt-0.5">
                Clock in, your checklist, and asking for time off
              </p>
            </div>
          </div>

          <div
            className="flex gap-6 items-center rounded-card p-5 mb-6"
            style={{ background: "var(--surface-2)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/install-qr.svg"
              alt="QR code linking to app.holyweedbkk.com/clock"
              width={150}
              height={150}
              style={{ width: 150, height: 150, flex: "none", imageRendering: "pixelated" }}
            />
            <div className="min-w-0">
              <div className="text-[12px] font-bold uppercase tracking-wider text-inkMuted">
                Point your camera here
              </div>
              <div className="font-mono text-[15px] font-semibold mt-1.5 break-all">
                app.holyweedbkk.com/clock
              </div>
              <p className="text-[12.5px] text-inkSecondary m-0 mt-2 leading-relaxed">
                Sign in with the email and password from your invite link. If you haven&apos;t had
                one, ask a manager.
              </p>
            </div>
          </div>

          <h2 className="font-display text-[16px] font-semibold mb-3">
            Add it to your home screen
          </h2>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div>
              <div
                className="chip mb-2.5"
                style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
              >
                iPhone — Safari
              </div>
              <ol className="text-[13px] text-inkSecondary pl-4 m-0 leading-relaxed">
                <li>Open the link in Safari</li>
                <li>
                  Tap <b className="font-semibold">Share</b> at the bottom
                </li>
                <li>
                  Tap <b className="font-semibold">Add to Home Screen</b>
                </li>
                <li>
                  Tap <b className="font-semibold">Add</b>
                </li>
              </ol>
            </div>

            <div>
              <div
                className="chip mb-2.5"
                style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
              >
                Android — Chrome
              </div>
              <ol className="text-[13px] text-inkSecondary pl-4 m-0 leading-relaxed">
                <li>Open the link in Chrome</li>
                <li>
                  Tap <b className="font-semibold">Add to home screen</b> when it appears
                </li>
                <li>
                  Or: menu <b className="font-semibold">⋮</b> →{" "}
                  <b className="font-semibold">Add to Home screen</b>
                </li>
              </ol>
            </div>
          </div>

          <div
            className="rounded-card p-4 mt-6"
            style={{ background: "var(--warning-soft)", border: "1px solid var(--line-strong)" }}
          >
            <b className="text-[13.5px] font-semibold" style={{ color: "var(--warning)" }}>
              Allow location when it asks
            </b>
            <p
              className="text-[12.5px] m-0 mt-1 leading-relaxed"
              style={{ color: "var(--warning)" }}
            >
              Clocking in only works at the shop, so the app checks where you are. Clocking out
              works anywhere. If it says you&apos;re too far away but you&apos;re standing at the
              till, step outside for a moment or ask a manager to clock you in.
            </p>
          </div>

          <p className="text-[11.5px] text-inkMuted mt-6 mb-0">
            Trouble signing in? Ask a manager for a new invite link — they expire after 14 days.
          </p>
        </div>
      </div>
    </div>
  );
}
