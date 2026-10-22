"use client";

import { useEffect, useState } from "react";
import { listMyBranchHostelStays, type MyBranchHostelStay } from "@/app/clock/hostel-actions";
import { HostelStayRow } from "@/components/HostelStayRow";

/**
 * Staff-side hostel log, scoped to the signed-in employee's own branch —
 * who's currently checked in (with a Check out button) plus recent
 * departures, so a shift can hand off without a call.
 *
 * Client-fetched on mount, same reasoning as ReceivedItemsFeed: this lives
 * inside a closed-by-default CollapsibleSection, and signing photo URLs
 * for every stay (passport pages + room key, times up to 60 stays) on
 * every /clock load regardless of whether anyone opened the section was
 * a large chunk of dead work.
 */
export function HostelStaysFeed() {
  const [state, setState] = useState<{ stays: MyBranchHostelStay[] } | { error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    load();
    async function load() {
      const result = await listMyBranchHostelStays().catch(() => null);
      if (!alive || !result) return;
      setState("error" in result ? { error: result.error } : { stays: result });
    }
    // Re-read every minute and when the screen comes back into view, so a
    // booking cancelled in the PMS drops off this log without a reload.
    const t = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, []);

  function refetch() {
    listMyBranchHostelStays().then((result) => {
      setState("error" in result ? { error: result.error } : { stays: result });
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

  const result = state.stays;
  const current = result.filter((s) => !s.checkedOutAt);
  const history = result.filter((s) => s.checkedOutAt);

  if (result.length === 0) {
    return (
      <div className="card">
        <h2 className="font-display text-[15px] font-semibold mb-1">Hostel log — your branch</h2>
        <p className="text-[13px] text-inkMuted m-0">No guests checked in yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-display text-[15px] font-semibold px-0.5">Hostel log — your branch</h2>

      {current.length > 0 && (
        <div className="card">
          <div className="text-[12px] font-semibold text-inkMuted mb-2">
            Currently checked in ({current.length})
          </div>
          <div className="flex flex-col gap-2">
            {current.map((s) => (
              <HostelStayRow key={s.id} stay={s} showCheckout onChanged={refetch} />
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card">
          <div className="text-[12px] font-semibold text-inkMuted mb-2">Recent check-outs</div>
          <div className="flex flex-col gap-2">
            {history.slice(0, 15).map((s) => (
              <HostelStayRow key={s.id} stay={s} onChanged={refetch} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
