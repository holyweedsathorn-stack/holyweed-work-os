"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setBranchLocation,
  setBranchRadius,
  clearBranchLocation,
} from "@/app/(app)/team/actions";
import { getFix } from "@/lib/geo-client";
import { fmtDateBKK, fmtTimeBKK, BRANCH_COLOR, type Branch } from "@/lib/types";

const RADII = [100, 150, 200, 300, 500];

/**
 * Where each shop is, for the clock-in check.
 *
 * Until a branch has a point, clocking in there is not checked at all — which
 * is what lets this ship without locking anyone out. The card says so plainly
 * rather than looking like a feature that is simply off.
 */
export function BranchLocations({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [working, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function setHere(b: Branch) {
    setError(null);
    setDone(null);
    setBusyId(b.id);
    const fix = await getFix(15000);
    setBusyId(null);

    if (!fix) {
      setError(
        "Couldn't get your position. Allow location for this site in your browser, then try again."
      );
      return;
    }

    start(async () => {
      const res = await setBranchLocation(b.id, fix.lat, fix.lng, fix.accuracy);
      if (!res.ok) setError(res.error);
      else {
        setDone(`${b.name} anchored to where you're standing (±${Math.round(fix.accuracy)}m).`);
        router.refresh();
      }
    });
  }

  function radius(b: Branch, m: number) {
    setError(null);
    start(async () => {
      const res = await setBranchRadius(b.id, m);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function clear(b: Branch) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await clearBranchLocation(b.id);
      if (!res.ok) setError(res.error);
      else {
        setDone(`${b.name} is no longer location-checked.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="card">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="font-display text-[15px] font-semibold">Clock-in location</h3>
        <span className="text-[11.5px] text-inkMuted">Stand in the shop, then press Set</span>
      </div>
      <p className="text-[12.5px] text-inkSecondary m-0 mb-3.5 leading-relaxed">
        Staff can only clock in within the radius of each shop. Clocking{" "}
        <b className="font-semibold">out</b> is never blocked, so nobody is left with a shift
        they can&apos;t close.
      </p>

      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3 leading-relaxed"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}
      {done && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {done}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {branches.map((b) => {
          const isSet = b.lat != null && b.lng != null;
          const locating = busyId === b.id;
          return (
            <div
              key={b.id}
              className="rounded-[9px] p-3.5"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-none"
                  style={{ background: BRANCH_COLOR[b.slug] }}
                />
                <b className="text-[14px] font-semibold">{b.name}</b>
                <span
                  className="chip"
                  style={
                    isSet
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : { background: "var(--warning-soft)", color: "var(--warning)" }
                  }
                >
                  {isSet ? `Checked · ${b.geofence_m ?? 200}m` : "Not checked"}
                </span>

                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    disabled={working || locating}
                    onClick={() => setHere(b)}
                    className="rounded-[9px] px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "var(--accent)", minHeight: 40 }}
                  >
                    {locating ? "Finding you…" : isSet ? "Set again here" : "Set location"}
                  </button>
                  {isSet && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => clear(b)}
                      className="rounded-[9px] border px-3 text-[12.5px] font-semibold text-inkSecondary"
                      style={{ borderColor: "var(--line-strong)", minHeight: 40 }}
                    >
                      Turn off
                    </button>
                  )}
                </div>
              </div>

              {isSet ? (
                <div className="flex items-center gap-2 flex-wrap mt-2.5">
                  <span className="text-[12px] text-inkMuted">
                    Set {b.location_set_at ? `${fmtDateBKK(b.location_set_at)}, ${fmtTimeBKK(b.location_set_at)}` : ""}
                  </span>
                  <span className="text-[12px] text-inkMuted">·</span>
                  <label className="text-[12px] text-inkSecondary flex items-center gap-1.5">
                    Radius
                    <select
                      value={b.geofence_m ?? 200}
                      disabled={working}
                      onChange={(e) => radius(b, Number(e.target.value))}
                      className="rounded-[7px] border px-2 py-1 text-[12.5px] num"
                      style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
                    >
                      {RADII.map((m) => (
                        <option key={m} value={m}>
                          {m}m
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <p className="text-[12px] text-inkSecondary m-0 mt-2 leading-relaxed">
                  Clock-ins here aren&apos;t location-checked yet. Go to the shop, open this page
                  on your phone and press Set location.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
