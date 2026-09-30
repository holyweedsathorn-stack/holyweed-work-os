import { Topbar } from "@/components/Topbar";
import { HostelStayRow } from "@/components/HostelStayRow";
import { listHostelStays } from "./actions";

export const dynamic = "force-dynamic";

export default async function HostelPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";

  const result = await listHostelStays();
  const stays = Array.isArray(result) ? result : [];
  const loadError = Array.isArray(result) ? null : result.error;

  const current = stays.filter((s) => !s.checkedOutAt);
  const history = stays.filter((s) => s.checkedOutAt);

  return (
    <>
      <Topbar title="Hostel Log" sub="Guest check-ins and check-outs, passport and key photos included" branch={branch} />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        {loadError && (
          <div
            className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-4"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            {loadError}
          </div>
        )}

        <div className="grid gap-3.5 mb-4 grid-cols-1 sm:grid-cols-2">
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">Currently in-house</div>
            <div className="num text-[27px] font-semibold mt-2">{current.length}</div>
          </div>
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">Logged, all time</div>
            <div className="num text-[27px] font-semibold mt-2">{stays.length}</div>
          </div>
        </div>

        <div className="card mb-4">
          <h3 className="font-display text-[15px] font-semibold mb-3.5">Currently in-house</h3>
          {current.length === 0 ? (
            <p className="text-[13px] text-inkMuted m-0">No one currently checked in.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {current.map((s) => (
                <HostelStayRow key={s.id} stay={s} showDelete />
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-display text-[15px] font-semibold mb-3.5">History</h3>
          {history.length === 0 ? (
            <p className="text-[13px] text-inkMuted m-0">No completed stays logged yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((s) => (
                <HostelStayRow key={s.id} stay={s} showDelete />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
