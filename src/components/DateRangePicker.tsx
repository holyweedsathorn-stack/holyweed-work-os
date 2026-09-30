"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Preset = { id: string; label: string };

export const PRESETS: Preset[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "lastmonth", label: "Last month" },
  { id: "90d", label: "Last 90 days" },
];

export function DateRangePicker({
  preset,
  from,
  to,
}: {
  preset: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState(preset === "custom");
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function go(next: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  function choosePreset(id: string) {
    setCustom(false);
    go({ period: id === "month" ? null : id, from: null, to: null });
  }

  function applyCustom() {
    if (!f || !t) return;
    // Tolerate the dates being entered the wrong way round.
    const [a, b] = f <= t ? [f, t] : [t, f];
    go({ period: "custom", from: a, to: b });
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex gap-2 flex-wrap items-center">
        {PRESETS.map((p) => {
          const active = !custom && preset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => choosePreset(p.id)}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
              style={{
                border: `1px solid ${active ? "var(--ink)" : "var(--line-strong)"}`,
                background: active ? "var(--ink)" : "var(--surface)",
                color: active ? "var(--bg)" : "var(--ink-secondary)",
              }}
            >
              {p.label}
            </button>
          );
        })}

        <button
          onClick={() => setCustom((c) => !c)}
          className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
          style={{
            border: `1px solid ${custom || preset === "custom" ? "var(--ink)" : "var(--line-strong)"}`,
            background: custom || preset === "custom" ? "var(--ink)" : "var(--surface)",
            color: custom || preset === "custom" ? "var(--bg)" : "var(--ink-secondary)",
          }}
        >
          Pick dates
        </button>

        <span className="text-[12px] text-inkMuted ml-1">
          {from} → {to}
        </span>
      </div>

      {custom && (
        <div
          className="flex gap-2 items-end flex-wrap rounded-[11px] p-3"
          style={{ background: "var(--surface-2)" }}
        >
          <label className="text-[12px] font-semibold text-inkSecondary">
            From
            <input
              type="date"
              value={f}
              onChange={(e) => setF(e.target.value)}
              className="mt-1 block rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            />
          </label>
          <label className="text-[12px] font-semibold text-inkSecondary">
            To
            <input
              type="date"
              value={t}
              onChange={(e) => setT(e.target.value)}
              className="mt-1 block rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            />
          </label>
          <button
            onClick={applyCustom}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
