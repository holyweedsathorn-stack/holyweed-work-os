"use client";

import { useEffect, useState } from "react";
import { listReceivedItemsForStaff, type StaffReceivedItem } from "@/app/clock/received-item-actions";
import { ReceivedItemsGallery } from "@/components/ReceivedItemsGallery";

/**
 * Staff-side view of the received/low-stock log, across every branch — so
 * anyone can check "did it arrive, and when, and who has it" without
 * calling around, regardless of which branch they're clocked in at right
 * now. Read-only; logging a new one still happens through <ReceivedItemForm />.
 *
 * Client-fetched on mount rather than a server component awaited by the
 * page: this sits inside a closed-by-default CollapsibleSection, and
 * {open && children} only mounts this once it's actually opened. Fetching
 * it as part of the page's own server render meant every /clock load was
 * signing a URL for up to 150 photos nobody had asked to see yet -- the
 * single biggest chunk of that page's load time.
 */
export function ReceivedItemsFeed() {
  const [state, setState] = useState<{ items: StaffReceivedItem[] } | { error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    load();
    async function load() {
      const result = await listReceivedItemsForStaff();
      if (!alive) return;
      setState("error" in result ? { error: result.error } : { items: result });
    }
    return () => {
      alive = false;
    };
  }, []);

  function refetch() {
    listReceivedItemsForStaff().then((result) => {
      setState("error" in result ? { error: result.error } : { items: result });
    });
  }

  if (state === null) {
    return (
      <div className="card">
        <p className="text-[13px] text-inkMuted m-0">Loading…</p>
      </div>
    );
  }

  if ("error" in state) {
    return (
      <div className="card">
        <p className="text-[13px]" style={{ color: "var(--critical)" }}>
          {state.error}
        </p>
      </div>
    );
  }

  // No heading here -- the CollapsibleSection wrapping this on the clock
  // page already labels the section ("Received & low stock"), so this is
  // just the gallery itself once expanded.
  return <ReceivedItemsGallery items={state.items} onChanged={refetch} />;
}
