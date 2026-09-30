"use client";

import { useState } from "react";

/**
 * A section that starts closed and expands on tap — for anything that
 * isn't part of every shift (the hostel desk, say, for staff who mostly
 * work Holyweed or the Bistro) so it doesn't sit open and take up screen
 * space on days nobody needs it. The header itself is styled like a card so
 * it reads as a section even while collapsed; whatever's inside (usually
 * its own cards) only mounts once opened.
 */
export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="card flex items-center justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <div className="font-display text-[15px] font-semibold">{title}</div>
          {subtitle && <div className="text-[12px] text-inkMuted mt-0.5">{subtitle}</div>}
        </div>
        <span className="text-[12px] font-semibold flex-none" style={{ color: "var(--accent)" }}>
          {open ? "Hide ▲" : "Show ▼"}
        </span>
      </button>

      {open && children}
    </div>
  );
}
