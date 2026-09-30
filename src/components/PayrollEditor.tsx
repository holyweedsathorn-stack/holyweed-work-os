"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePayroll } from "@/app/(app)/report/actions";
import { fmtTHB } from "@/lib/types";
import type { PayrollLine } from "@/lib/report";

/**
 * Salary is steady month to month; incentives are not. So the figures are
 * carried forward from the last month that was filled in, and the manager
 * adjusts the incentive column and saves.
 */
export function PayrollEditor({
  month,
  monthLabel,
  lines,
  carriedFrom,
}: {
  month: string;
  monthLabel: string;
  lines: PayrollLine[];
  carriedFrom: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [rows, setRows] = useState(() =>
    lines.map((l) => ({
      employeeId: l.employeeId,
      name: l.name,
      branchName: l.branchName,
      base: String(l.base || ""),
      incentive: String(l.incentive || ""),
    }))
  );

  const num = (s: string) => {
    const n = Number(s.replace(/[,\s฿]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const set = (id: string, field: "base" | "incentive", value: string) => {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r.employeeId === id ? { ...r, [field]: value } : r)));
  };

  const baseTotal = rows.reduce((s, r) => s + num(r.base), 0);
  const incTotal = rows.reduce((s, r) => s + num(r.incentive), 0);

  function submit() {
    setError(null);
    start(async () => {
      const res = await savePayroll(
        month,
        rows.map((r) => ({
          employeeId: r.employeeId,
          base: num(r.base),
          incentive: num(r.incentive),
        }))
      );
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const cell = "py-2 px-2 text-[13px]";
  const input =
    "w-[110px] rounded-[8px] border px-2.5 py-1.5 text-[13px] text-right num outline-none focus:border-accent";
  const inputStyle = { borderColor: "var(--line-strong)", background: "var(--surface)" } as const;

  return (
    <div>
      {carriedFrom && (
        <p
          className="text-[12.5px] rounded-[9px] px-3 py-2 mb-3"
          style={{ background: "var(--warning-soft, var(--surface-2))" }}
        >
          Nothing saved for {monthLabel} yet — these figures are carried over from{" "}
          {carriedFrom}. Adjust the incentives and press Save so the report is recorded.
        </p>
      )}

      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="text-[11.5px] uppercase tracking-wide text-inkMuted">
            <th className="text-left py-2 px-2 font-semibold">Employee</th>
            <th className="text-right py-2 px-2 font-semibold">Base salary</th>
            <th className="text-right py-2 px-2 font-semibold">Incentive</th>
            <th className="text-right py-2 px-2 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employeeId} style={{ borderTop: "1px solid var(--line)" }}>
              <td className={cell}>
                <span className="font-semibold">{r.name}</span>
                <span className="text-inkMuted"> · {r.branchName}</span>
              </td>
              <td className={`${cell} text-right`}>
                <input
                  className={`${input} no-print`}
                  style={inputStyle}
                  inputMode="decimal"
                  value={r.base}
                  placeholder="0"
                  onChange={(e) => set(r.employeeId, "base", e.target.value)}
                />
                <span className="num print-only">{fmtTHB(num(r.base))}</span>
              </td>
              <td className={`${cell} text-right`}>
                <input
                  className={`${input} no-print`}
                  style={inputStyle}
                  inputMode="decimal"
                  value={r.incentive}
                  placeholder="0"
                  onChange={(e) => set(r.employeeId, "incentive", e.target.value)}
                />
                <span className="num print-only">{fmtTHB(num(r.incentive))}</span>
              </td>
              <td className={`${cell} text-right num font-semibold`}>
                {fmtTHB(num(r.base) + num(r.incentive))}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className={`${cell} text-inkMuted`} colSpan={4}>
                No active staff on the roster yet — add them on the Team page.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--line-strong)" }} className="font-semibold">
            <td className={cell}>Total salary &amp; incentives earned</td>
            <td className={`${cell} text-right num`}>{fmtTHB(baseTotal)}</td>
            <td className={`${cell} text-right num`}>{fmtTHB(incTotal)}</td>
            <td className={`${cell} text-right num`}>{fmtTHB(baseTotal + incTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="flex items-center gap-3 mt-3 no-print">
        <button
          onClick={submit}
          disabled={pending || rows.length === 0}
          className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          {pending ? "Saving…" : `Save ${monthLabel} payroll`}
        </button>
        {saved && <span className="text-[12.5px]" style={{ color: "var(--good)" }}>Saved.</span>}
        {error && <span className="text-[12.5px]" style={{ color: "var(--critical)" }}>{error}</span>}
      </div>
    </div>
  );
}
