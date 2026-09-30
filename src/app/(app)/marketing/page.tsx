import { Topbar } from "@/components/Topbar";
import { MarketingLibrary } from "@/components/MarketingLibrary";
import { ExecutionSchedule } from "@/components/ExecutionSchedule";
import { listMarketingDocuments } from "./actions";
import { listScheduleTasks } from "./schedule-actions";

export const dynamic = "force-dynamic";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";

  const [result, scheduleResult] = await Promise.all([
    listMarketingDocuments(),
    listScheduleTasks(),
  ]);
  const docs = Array.isArray(result) ? result : [];
  const loadError = Array.isArray(result) ? null : result.error;
  const scheduleTasks = Array.isArray(scheduleResult) ? scheduleResult : [];
  const scheduleError = Array.isArray(scheduleResult) ? null : scheduleResult.error;

  return (
    <>
      <Topbar
        title="Marketing"
        sub="Plans for Holy Bistro, Holy Hostel and Holyweed"
        branch={branch}
      />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        {loadError && (
          <div
            className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-4"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            {loadError}
          </div>
        )}
        <MarketingLibrary docs={docs} />
        {scheduleError ? (
          <div
            className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mt-3.5"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            {scheduleError}
          </div>
        ) : (
          <ExecutionSchedule tasks={scheduleTasks} />
        )}
      </div>
    </>
  );
}
