"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFixedCosts } from "@/app/(app)/report/actions";
import { fmtTHB } from "@/lib/types";
import {
  FIXED_COST_CATEGORIES,
  FIXED_COST_LABEL,
  CARRIES_FORWARD,
  type FixedCostCategory,
  type FixedCostInput,
} from "@/lib/report";

type BranchCol = { id: string; name: string };

/**
 * Rent and utilities, one column per shop. Rent and internet arrive already
 * filled from last month because they're contracts; the metered bills start
 * empty so last month's figure can't be saved by mistake.
 */
export function FixedCostsEditor({
  month,
  monthLabel,
  branches,
  lines,
}: {
  month: string;
  monthLabel: string;
  branches: BranchCol[];
  lines: FixedCostInput[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const key = (branchId: string, cat: string) => `${branchId}|${cat}`;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const b of branches) {
      for (const c of FIXED_COST_CATEGORIES) {
        const found = lines.find((l) => l.branchId === b.id && l.category === c);
        v[key(b.id, c)] = found && found.amount ? String(found.amount) : "";
      }
    }
    return v;
  });

  const carried = new Set(
    lines.filter((l) => l.carried && l.amount).map((l) => key(l.branchId, l.category))
  );

  const num = (s: string) => {
    const n = Number((s ?? "").replace(/[,\s฿]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const branchTotal = (b: BranchCol) =>
    FIXED_COST_CATEGORIES.reduce((s, c) => s + num(values[key(b.id, c)]), 0);
  const grandTotal = branches.reduce((s, b) => s + branchTotal(b), 0);

  function submit() {
    setError(null);
    const entries = branches.flatMap((b) =>
      FIXED_COST_CATEGORIES.map((c) => ({
        branchId: b.id,
        category: c as FixedCostCategory,
        amount: num(values[key(b.id, c)]),
      }))
    );
    start(async () => {
      try {
        const res = await saveFixedCosts(month, entries);
        if (res.ok) {
          setSaved(true);
          router.refresh();
        } else {
          setError(res.error);
        }
      } catch (e: any) {
        setError(String(e?.message ?? e) || "Couldn't save. Reload the page and try again.");
      }
    });
  }

  const input =
    "w-full rounded-[8px] border px-2.5 py-1.5 text-[13px] text-right num outline-none focus:border-accent";
  const inputStyle = { borderColor: "var(--line-strong)", background: "var(--surface)" } as const;
  const cell = "py-2 px-2.5 text-[13px]";

  return (
    <div>
      <p className="text-[12px] text-inkMuted mb-3">
        Only bills paid <b>outside</b> the branch petty-cash sheets belong here — the landlord
        transfer, the utility bill from the company account. Anything already written into a shop
        ledger is counted above, and typing it here too would charge it twice.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="text-[11.5px] uppercase tracking-wide text-inkMuted">
              <th className="text-left py-2 px-2.5 font-semibold">&nbsp;</th>
              {branches.map((b) => (
                <th key={b.id} className="text-right py-2 px-2.5 font-semibold">
                  {b.name}
                </th>
              ))}
              <th
                className="text-right py-2 px-2.5 font-semibold"
                style={{ background: "var(--surface-2)" }}
              >
                Both
              </th>
            </tr>
          </thead>
          <tbody>
            {FIXED_COST_CATEGORIES.map((c) => {
              const rowTotal = branches.reduce((s, b) => s + num(values[key(b.id, c)]), 0);
              return (
                <tr key={c} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className={cell}>
                    {FIXED_COST_LABEL[c]}
                    {CARRIES_FORWARD[c] && (
                      <span className="text-inkMuted text-[11.5px]"> · carries over</span>
                    )}
                  </td>
                  {branches.map((b) => {
                    const k = key(b.id, c);
                    return (
                      <td key={b.id} className={`${cell} text-right`} style={{ width: 150 }}>
                        <input
                          className={`${input} no-print`}
                          style={{
                            ...inputStyle,
                            borderColor: carried.has(k) ? "var(--warning)" : "var(--line-strong)",
                          }}
                          inputMode="decimal"
                          placeholder="0"
                          value={values[k] ?? ""}
                          onChange={(e) => {
                            setSaved(false);
                            setValues((v) => ({ ...v, [k]: e.target.value }));
                          }}
                        />
                        <span className="num print-only">{fmtTHB(num(values[k]))}</span>
                      </td>
                    );
                  })}
                  <td
                    className={`${cell} text-right num font-semibold`}
                    style={{ background: "var(--surface-2)" }}
                  >
                    {fmtTHB(rowTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--line-strong)" }} className="font-semibold">
              <td className={cell}>Total rent &amp; utilities</td>
              {branches.map((b) => (
                <td key={b.id} className={`${cell} text-right num`}>
                  {fmtTHB(branchTotal(b))}
                </td>
              ))}
              <td
                className={`${cell} text-right num`}
                style={{ background: "var(--surface-2)" }}
              >
                {fmtTHB(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {carried.size > 0 && (
        <p className="text-[12px] mt-2" style={{ color: "var(--warning)" }}>
          The outlined boxes were carried over from an earlier month. Check them and press Save so
          they count towards {monthLabel}.
        </p>
      )}

      <div className="flex items-center gap-3 mt-3 no-print">
        <button
          onClick={submit}
          disabled={pending || branches.length === 0}
          className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          {pending ? "Saving…" : `Save ${monthLabel} rent & utilities`}
        </button>
        {saved && <span className="text-[12.5px]" style={{ color: "var(--good)" }}>Saved.</span>}
        {error && <span className="text-[12.5px]" style={{ color: "var(--critical)" }}>{error}</span>}
      </div>
    </div>
  );
}
