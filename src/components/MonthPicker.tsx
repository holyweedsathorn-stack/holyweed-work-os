"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/report";

export function MonthPicker({ month, options }: { month: string; options: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: string) {
    const p = new URLSearchParams(params.toString());
    p.set("month", next);
    router.push(`${pathname}?${p.toString()}`);
  }

  const idx = options.indexOf(month);
  const older = idx >= 0 && idx < options.length - 1 ? options[idx + 1] : null;
  const newer = idx > 0 ? options[idx - 1] : null;

  const arrow =
    "rounded-[9px] px-2.5 py-2 text-[13px] font-semibold disabled:opacity-35";
  const arrowStyle = {
    border: "1px solid var(--line-strong)",
    background: "var(--surface)",
  } as const;

  return (
    <div className="flex items-center gap-2 mb-4 no-print">
      <button
        onClick={() => older && go(older)}
        disabled={!older}
        aria-label="Previous month"
        className={arrow}
        style={arrowStyle}
      >
        ←
      </button>

      <select
        value={month}
        onChange={(e) => go(e.target.value)}
        className="rounded-[9px] border px-3 py-2 text-[13.5px] font-semibold outline-none focus:border-accent"
        style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>

      <button
        onClick={() => newer && go(newer)}
        disabled={!newer}
        aria-label="Next month"
        className={arrow}
        style={arrowStyle}
      >
        →
      </button>

      <button
        onClick={() => window.print()}
        className="ml-auto rounded-[9px] px-4 py-2 text-[13px] font-semibold"
        style={{ background: "var(--ink)", color: "var(--bg)" }}
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
