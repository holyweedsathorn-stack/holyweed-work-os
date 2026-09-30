import { fmtTimeBKK, initials } from "@/lib/types";
import { listMyBranchCurrencyTransactions } from "@/app/clock/currency-actions";

/** Group key: the entry's calendar date in Bangkok, YYYY-MM-DD. */
function dateKeyBKK(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(iso));
}

function dateHeaderBKK(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Bangkok",
  });
}

/**
 * Staff-side view of accepted foreign-cash transactions, scoped to the
 * signed-in employee's own branch — so a shift can check "who took the USD
 * this morning, and at what rate" without calling around. Read-only; the
 * full month rollup with totals stays on the manager-only /currency-log
 * page. Logging a new one still happens through <CurrencyConverter />.
 */
export async function CurrencyLogFeed() {
  const result = await listMyBranchCurrencyTransactions();

  if ("error" in result) {
    return (
      <div className="card">
        <p className="text-[13px]" style={{ color: "var(--critical)" }}>
          {result.error}
        </p>
      </div>
    );
  }

  if (result.length === 0) {
    return (
      <div className="card">
        <h2 className="font-display text-[15px] font-semibold mb-1">Currency log — your branch</h2>
        <p className="text-[13px] text-inkMuted m-0">No foreign-cash transactions logged yet.</p>
      </div>
    );
  }

  const groups = new Map<string, typeof result>();
  for (const t of result) {
    const key = dateKeyBKK(t.createdAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-display text-[15px] font-semibold px-0.5">Currency log — your branch</h2>
      {[...groups.entries()].map(([key, dayItems]) => (
        <div key={key} className="card">
          <div className="text-[12px] font-semibold text-inkMuted mb-2">
            {dateHeaderBKK(dayItems[0].createdAt)}
          </div>
          <div className="flex flex-col">
            {dayItems.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2.5 py-2.5"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10.5px] font-semibold flex-none"
                  style={{ background: "linear-gradient(155deg, var(--accent), #1a3d2b)" }}
                >
                  {initials(t.employeeName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold truncate">{t.employeeName}</div>
                  <div className="text-[11px] text-inkMuted">
                    {fmtTimeBKK(t.createdAt)} · ฿{t.rateThbPerUnit.toFixed(4)}/{t.currencyCode}
                  </div>
                </div>
                <div className="text-right flex-none">
                  <div className="text-[12.5px] font-semibold num">
                    {t.foreignAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} {t.currencyCode}
                  </div>
                  <div className="text-[11px] text-inkMuted num">฿{t.totalThb.toFixed(0)} total</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
