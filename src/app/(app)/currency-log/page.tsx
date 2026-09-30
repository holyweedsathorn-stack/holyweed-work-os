import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { fmtTHB, initials } from "@/lib/types";
import { listCurrencyTransactions } from "./actions";
import { DeleteTransactionButton } from "@/components/DeleteTransactionButton";

export const dynamic = "force-dynamic";

/** Current Bangkok month as "YYYY-MM" (Bangkok is a fixed UTC+7, no DST). */
function currentBangkokMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function CurrencyLogPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? (sp.month as string) : currentBangkokMonth();

  const result = await listCurrencyTransactions(month);
  const loadError = "error" in result ? result.error : null;
  const transactions = "transactions" in result ? result.transactions : [];
  const summary = "summary" in result ? result.summary : null;

  function monthHref(m: string) {
    const p = new URLSearchParams();
    if (branch !== "all") p.set("branch", branch);
    if (m !== currentBangkokMonth()) p.set("month", m);
    return `/currency-log${p.toString() ? "?" + p.toString() : ""}`;
  }

  return (
    <>
      <Topbar
        title="Currency Log"
        sub="Foreign-cash transactions staff have accepted, month by month"
        branch={branch}
      />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <div className="flex items-center gap-2 mb-4">
          <Link
            href={monthHref(shiftMonth(month, -1))}
            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold border"
            style={{ borderColor: "var(--line-strong)", color: "var(--ink-secondary)" }}
          >
            ← Prev
          </Link>
          <span className="text-[13.5px] font-semibold flex-1 text-center">{monthLabel(month)}</span>
          <Link
            href={monthHref(shiftMonth(month, 1))}
            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold border"
            style={{ borderColor: "var(--line-strong)", color: "var(--ink-secondary)" }}
          >
            Next →
          </Link>
        </div>

        {loadError && (
          <div
            className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-4"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            {loadError}
          </div>
        )}

        {summary && (
          <div className="grid gap-3.5 mb-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <div className="card">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">Collected (THB)</div>
              <div className="num text-[27px] font-semibold mt-2">{fmtTHB(summary.totalThb)}</div>
            </div>
            <div className="card">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">Transactions</div>
              <div className="num text-[27px] font-semibold mt-2">{summary.count}</div>
            </div>
            <div className="card">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted mb-2">By currency</div>
              {summary.byCurrency.length === 0 ? (
                <p className="text-[13px] text-inkMuted m-0">None yet</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {summary.byCurrency.map((c) => (
                    <div key={c.code} className="flex items-center justify-between text-[13px]">
                      <span className="font-semibold">{c.code}</span>
                      <span className="text-inkMuted num">
                        {c.count} · {fmtTHB(c.totalThb)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <h3 className="font-display text-[15px] font-semibold mb-3.5">Transactions</h3>
          {transactions.length === 0 ? (
            <p className="text-[13px] text-inkMuted m-0">
              No foreign-cash transactions logged for {monthLabel(month)}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Staff", "Branch", "Currency", "Amount", "Rate (THB)", "Fee", "Total THB", "When", ""].map(
                      (h, i) => (
                        <th
                          key={h}
                          className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold pb-2.5"
                          style={{ textAlign: i >= 3 ? "right" : "left" }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2.5" style={{ borderTop: "1px solid var(--line)" }}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-none"
                            style={{ background: "linear-gradient(155deg, var(--accent), #1a3d2b)" }}
                          >
                            {initials(t.employeeName)}
                          </div>
                          <span className="text-[12.5px] font-semibold">{t.employeeName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-[12.5px] text-inkSecondary" style={{ borderTop: "1px solid var(--line)" }}>
                        {t.branchName}
                      </td>
                      <td className="py-2.5 text-[12.5px] font-semibold" style={{ borderTop: "1px solid var(--line)" }}>
                        {t.currencyCode}
                      </td>
                      <td className="py-2.5 text-[12.5px] text-right num" style={{ borderTop: "1px solid var(--line)" }}>
                        {t.foreignAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 text-[12.5px] text-right num text-inkMuted" style={{ borderTop: "1px solid var(--line)" }}>
                        ฿{t.rateThbPerUnit.toFixed(4)}
                      </td>
                      <td className="py-2.5 text-[12.5px] text-right num text-inkMuted" style={{ borderTop: "1px solid var(--line)" }}>
                        ฿{t.feeThb.toFixed(0)}
                      </td>
                      <td className="py-2.5 text-[13px] text-right num font-semibold" style={{ borderTop: "1px solid var(--line)" }}>
                        {fmtTHB(t.totalThb)}
                      </td>
                      <td className="py-2.5 text-[11.5px] text-right text-inkMuted" style={{ borderTop: "1px solid var(--line)" }}>
                        {new Date(t.createdAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Bangkok",
                        })}
                      </td>
                      <td className="py-2.5 text-right" style={{ borderTop: "1px solid var(--line)" }}>
                        <DeleteTransactionButton
                          id={t.id}
                          label={`${t.employeeName} · ${t.currencyCode}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
