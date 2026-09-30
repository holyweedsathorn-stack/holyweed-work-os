import type { ReceivedItem } from "@/app/(app)/received-items/actions";
import { ReceivedItemTile } from "@/components/ReceivedItemTile";
import { CollapsibleSection } from "@/components/CollapsibleSection";

/** Group key: the item's calendar date in Bangkok, YYYY-MM-DD. */
function dateKeyBKK(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(iso));
}

function dateHeaderBKK(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

function groupByDate(items: ReceivedItem[]): [string, ReceivedItem[]][] {
  const groups = new Map<string, ReceivedItem[]>();
  for (const item of items) {
    const key = dateKeyBKK(item.createdAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()];
}

/**
 * One type's log (either low stock or received), collapsed behind its own
 * dropdown -- the count shows either way, so nobody has to open it just to
 * see whether there's anything worth looking at. Grouped date by date,
 * newest first, once opened.
 */
function ReceivedItemsSection({
  title,
  items,
  emptyText,
  defaultOpen,
  onChanged,
}: {
  title: string;
  items: ReceivedItem[];
  emptyText: string;
  defaultOpen: boolean;
  onChanged?: () => void;
}) {
  return (
    <CollapsibleSection
      title={title}
      subtitle={`${items.length} photo${items.length === 1 ? "" : "s"}`}
      defaultOpen={defaultOpen}
    >
      {items.length === 0 ? (
        <div className="card">
          <p className="text-[13px] text-inkMuted m-0">{emptyText}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupByDate(items).map(([key, dayItems]) => (
            <div key={key} className="card">
              <div className="flex items-baseline justify-between mb-3">
                <h4 className="font-display text-[14px] font-semibold">{dateHeaderBKK(dayItems[0].createdAt)}</h4>
                <span className="text-[12px] font-semibold text-inkMuted num">
                  {dayItems.length} {dayItems.length === 1 ? "photo" : "photos"}
                </span>
              </div>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
              >
                {dayItems.map((item) => (
                  <ReceivedItemTile key={item.id} item={item} onChanged={onChanged} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

/**
 * Everything staff have logged during a shift -- deliveries/stock received,
 * and low-stock flags -- split into two separate logs (low stock first,
 * since it's the one that usually needs a reply/action) rather than mixed
 * together in one feed, each grouped date by date newest first. Pure
 * viewing plus an optional reply per photo -- there's nothing here for a
 * manager to approve.
 */
export function ReceivedItemsGallery({
  items,
  onChanged,
}: {
  items: ReceivedItem[];
  onChanged?: () => void;
}) {
  if (items.length === 0) {
    return (
      <div className="card">
        <p className="text-[13px] text-inkMuted m-0">
          Nothing logged yet. Once staff start photographing deliveries, stock, or low-stock
          items, they&apos;ll show up here.
        </p>
      </div>
    );
  }

  const lowStock = items.filter((i) => i.type === "low_stock");
  const received = items.filter((i) => i.type !== "low_stock");

  return (
    <div className="flex flex-col gap-3">
      <ReceivedItemsSection
        title="Low stock"
        items={lowStock}
        emptyText="Nothing flagged as low stock."
        defaultOpen
        onChanged={onChanged}
      />
      <ReceivedItemsSection
        title="Received items"
        items={received}
        emptyText="Nothing logged as received yet."
        defaultOpen={false}
        onChanged={onChanged}
      />
    </div>
  );
}
