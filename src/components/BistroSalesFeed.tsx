import { fmtDateBKK, fmtTHB } from "@/lib/types";
import { listRecentBistroSales } from "@/app/clock/bistro-sales-actions";

/**
 * Recent Bistro daily entries -- so staff can see whether today's has
 * already gone in, without opening the reconciliation page.
 */
export async function BistroSalesFeed() {
  const result = await listRecentBistroSales();

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
        <p className="text-[13px] text-inkMuted m-0">No Bistro sales logged yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex flex-col">
        {result.map((r) => (
          <div key={r.id} className="py-2.5" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold">{fmtDateBKK(r.saleDate)}</span>
              <span className="text-[13px] font-semibold num">{fmtTHB(r.total)}</span>
            </div>
            <div className="text-[11.5px] text-inkMuted num">
              Cash {fmtTHB(r.cash)} · PromptPay {fmtTHB(r.promptpay)} · Grab {fmtTHB(r.grab)} · LINE MAN{" "}
              {fmtTHB(r.lineMan)}
            </div>
            {r.notes && <div className="text-[11.5px] text-inkMuted mt-0.5">{r.notes}</div>}
            <div className="text-[10.5px] text-inkMuted mt-0.5">Logged by {r.recordedByName}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
