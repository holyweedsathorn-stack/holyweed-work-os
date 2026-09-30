import { Topbar } from "@/components/Topbar";
import { ManagerChecklist } from "@/components/ManagerChecklist";
import { listChecklist } from "./actions";

export const dynamic = "force-dynamic";

export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";

  const result = await listChecklist();
  const items = Array.isArray(result) ? result : [];
  const loadError = Array.isArray(result) ? null : result.error;

  return (
    <>
      <Topbar
        title="Manager Checklist"
        sub="Your daily, weekly & monthly routine across Holy Group"
        branch={branch}
      />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        {loadError && (
          <div
            className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3.5"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            {loadError}
          </div>
        )}
        <ManagerChecklist items={items} />
      </div>
    </>
  );
}
