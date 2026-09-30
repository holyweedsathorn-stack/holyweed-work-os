"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  toggleChecklistItem,
  type ChecklistBusiness,
  type ChecklistFrequency,
  type ChecklistItem,
} from "@/app/(app)/checklist/actions";

const BUSINESS_ORDER: ChecklistBusiness[] = ["leadership", "holyweed", "bistro", "hostel"];
const BUSINESS_LABEL: Record<ChecklistBusiness, string> = {
  leadership: "You, as manager",
  holyweed: "Holyweed Dispensary",
  bistro: "Holy Bistro",
  hostel: "Holy Hostel",
};

const FREQUENCY_ORDER: ChecklistFrequency[] = ["daily", "weekly", "monthly"];
const FREQUENCY_LABEL: Record<ChecklistFrequency, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
};
const FREQUENCY_HINT: Record<ChecklistFrequency, string> = {
  daily: "Resets every day",
  weekly: "Resets every Monday",
  monthly: "Resets on the 1st",
};

/**
 * A first-time manager's recurring routine: leadership habits plus
 * per-business daily/weekly/monthly checks. Ticking a box persists it for
 * the current period only — it un-ticks itself once that period rolls over.
 */
export function ManagerChecklist({ items: initial }: { items: ChecklistItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(item: ChecklistItem) {
    const nextDone = !item.done;
    setError(null);
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, done: nextDone } : it)));
    start(async () => {
      const res = await toggleChecklistItem(item.id, item.frequency, nextDone);
      if (!res.ok) {
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, done: item.done } : it)));
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {FREQUENCY_ORDER.map((frequency) => {
        const freqItems = items.filter((it) => it.frequency === frequency);
        if (freqItems.length === 0) return null;
        const doneCount = freqItems.filter((it) => it.done).length;

        return (
          <div key={frequency} className="card">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="font-display text-[15px] font-semibold">{FREQUENCY_LABEL[frequency]}</h3>
              <span className="text-[12px] font-semibold text-inkMuted num">
                {doneCount}/{freqItems.length} done
              </span>
            </div>
            <div className="text-[11.5px] text-inkMuted mb-3">{FREQUENCY_HINT[frequency]}</div>

            <div className="w-full rounded-full h-1.5 mb-4 overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${freqItems.length ? (doneCount / freqItems.length) * 100 : 0}%`,
                  background: "var(--accent)",
                }}
              />
            </div>

            {BUSINESS_ORDER.map((business) => {
              const businessItems = freqItems.filter((it) => it.business === business);
              if (businessItems.length === 0) return null;
              return (
                <div key={business} className="mb-3.5 last:mb-0">
                  <div className="text-[11.5px] font-bold text-inkMuted mb-1.5">
                    {BUSINESS_LABEL[business]}
                  </div>
                  <div className="flex flex-col gap-1">
                    {businessItems.map((item) => (
                      <label key={item.id} className="flex items-start gap-2.5 py-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => toggle(item)}
                          className="mt-0.5 flex-none"
                          style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
                        />
                        <span
                          className="text-[13px] leading-snug"
                          style={{
                            color: item.done ? "var(--ink-muted)" : "var(--ink)",
                            textDecoration: item.done ? "line-through" : "none",
                          }}
                        >
                          {item.title}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
