import { fmtTHB, type Branch } from "@/lib/types";

/**
 * "Right now" numbers straight from Silom, refreshed by a Vercel Cron job
 * every ~15 minutes (src/app/api/cron/silom-sync/route.ts) since Silom has
 * no live push of its own. Deliberately separate from the date-range charts
 * below it -- this ignores whatever period is selected and always shows the
 * latest snapshot per branch, because "what's happening right now" doesn't
 * have a date range.
 */
export function LiveSalesStrip({
  branches,
  latestByBranch,
}: {
  branches: Branch[];
  latestByBranch: Map<string, any>;
}) {
  const rows = branches
    .map((b) => ({ branch: b, snap: latestByBranch.get(b.id) }))
    .filter((r) => r.snap);

  // Nothing to show before the cron job has run for the first time -- fail
  // quiet rather than showing an empty "Live" card forever.
  if (rows.length === 0) return null;

  return (
    <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 mb-3.5">
      {rows.map(({ branch, snap }) => (
        <div key={branch.id} className="card">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
              {branch.name} · Live from Silom
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-[7px] h-[7px] rounded-full flex-none"
                style={{ background: "var(--good)" }}
              />
              <span className="text-[11.5px] text-inkMuted">
                as of {formatAsOf(snap.captured_at)}
              </span>
            </div>
          </div>

          <div className="flex items-end gap-5 mt-2.5 flex-wrap">
            <div>
              <div className="num text-[24px] font-semibold">{fmtTHB(Number(snap.sales) || 0)}</div>
              <div className="text-[11.5px] text-inkMuted">Sales today</div>
            </div>
            {snap.profit != null && (
              <div>
                <div className="num text-[16px] font-semibold" style={{ color: "var(--good)" }}>
                  {fmtTHB(Number(snap.profit) || 0)}
                </div>
                <div className="text-[11.5px] text-inkMuted">Profit</div>
              </div>
            )}
            {snap.bill_count != null && (
              <div>
                <div className="num text-[16px] font-semibold">{snap.bill_count}</div>
                <div className="text-[11.5px] text-inkMuted">Bills</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatAsOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}
