import { Topbar } from "@/components/Topbar";
import { ReceivedItemsGallery } from "@/components/ReceivedItemsGallery";
import { listReceivedItems } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReceivedItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";

  const result = await listReceivedItems();
  const items = Array.isArray(result) ? result : [];
  const loadError = Array.isArray(result) ? null : result.error;

  return (
    <>
      <Topbar
        title="Received Items"
        sub="Received items & low-stock photos staff have logged, by date"
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
        <ReceivedItemsGallery items={items} />
      </div>
    </>
  );
}
