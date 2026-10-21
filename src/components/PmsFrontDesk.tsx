"use client";

import { useCallback, useEffect, useState } from "react";
import { listPmsFrontDesk, type BookingSource, type PaymentMethod, type PmsFrontDeskView } from "@/app/clock/hostel-actions";
import { HostelCheckinForm, type CheckinPrefill } from "@/components/HostelCheckinForm";
import { HOSTEL_ROOMS } from "@/lib/hostel-rooms";
import type { PmsBooking } from "@/lib/pms";

const REFRESH_MS = 60_000;

// PMS channel key -> Work OS booking source
const SOURCE_BY_CHANNEL: Record<string, BookingSource> = {
  booking: "booking_com",
  agoda: "agoda",
  airbnb: "airbnb",
  hostelworld: "hostelworld",
  expedia: "expedia",
  tripcom: "trip_com",
  walkin: "direct",
  direct: "direct",
};
const OTA_CHANNELS = new Set(["booking", "agoda", "airbnb", "hostelworld", "expedia", "tripcom"]);

/**
 * Match a PMS unit ("Room 202", or "Dorm 201 · Bed 3") to the Work OS room
 * list by its room number. No match leaves the room for staff to choose.
 */
function matchRoom(b: PmsBooking): { roomNumber: string; bedNumber: string } {
  const text = `${b.unit.group} ${b.unit.name}`;
  const room = HOSTEL_ROOMS.find((r) => new RegExp(`(^|\\D)${r.number}(\\D|$)`).test(text));
  if (!room) return { roomNumber: "", bedNumber: "" };
  if (room.type !== "dorm") return { roomNumber: room.number, bedNumber: "" };
  const bed = Number(b.unit.name.match(/bed\s*(\d+)/i)?.[1] ?? b.unit.name.match(/^\D*(\d{1,2})\D*$/)?.[1]);
  return { roomNumber: room.number, bedNumber: bed >= 1 && bed <= (room.beds ?? 0) ? String(bed) : "" };
}

function toPrefill(b: PmsBooking): CheckinPrefill {
  return {
    pmsBookingId: b.id,
    pmsRef: b.ref,
    unitLabel: b.unit.label,
    guestName: b.guestName,
    ...matchRoom(b),
    expectedCheckoutDate: b.checkOut,
    bookingSource: SOURCE_BY_CHANNEL[b.channel] ?? (b.channel ? "other" : ""),
    paymentMethod: (OTA_CHANNELS.has(b.channel) ? "ota_collect" : "cash") as PaymentMethod,
  };
}

function fmtDay(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/**
 * Hostel section of the clock screen: today's arrivals and who's due out,
 * straight from the Holy Hostel PMS. Tapping Check in opens the usual
 * check-in form filled in from the booking; submitting it also marks the
 * booking checked in on the PMS. Without the PMS link set up, this is just
 * the plain check-in form, same as before.
 */
export function PmsFrontDesk() {
  const [view, setView] = useState<PmsFrontDeskView | null>(null);
  const [prefill, setPrefill] = useState<CheckinPrefill | null>(null);

  const load = useCallback(() => {
    listPmsFrontDesk()
      .then(setView)
      .catch(() => setView({ ok: false, code: "unreachable", error: "Couldn't reach the PMS." }));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const form = (
    <HostelCheckinForm
      key={prefill?.pmsBookingId ?? "manual"}
      prefill={prefill}
      onDone={() => {
        setPrefill(null);
        load();
      }}
      onCancel={() => setPrefill(null)}
    />
  );

  if (view && !view.ok && view.code === "not_configured") return form;

  const dueOut = view?.ok ? view.inHouse.filter((b) => b.dueOut) : [];

  return (
    <>
      <div className="card">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[15px] font-semibold">Today in the PMS</h2>
          {view?.ok && (
            <span className="text-[12px] text-inkMuted">
              {view.arrivals.length} to arrive · {view.inHouse.length} in house
            </span>
          )}
        </div>

        {view === null && <p className="text-[13px] text-inkMuted m-0">Loading…</p>}

        {view && !view.ok && (
          <div
            className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium flex items-center gap-2"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            <span className="flex-1">{view.error} You can still check guests in by hand below.</span>
            <button type="button" onClick={load} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {view?.ok && (
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[12px] font-semibold text-inkMuted mb-2">Arriving</div>
              {view.arrivals.length === 0 ? (
                <p className="text-[13px] text-inkMuted m-0">No arrivals left today.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {view.arrivals.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-[11px] p-3 flex items-center gap-3"
                      style={{ border: "1px solid var(--line-strong)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold truncate">
                          {b.guestName || "Guest"}
                          {b.guests > 1 ? <span className="text-inkMuted font-normal"> · {b.guests} guests</span> : null}
                        </div>
                        <div className="text-[11.5px] text-inkMuted">
                          {b.unit.label} · {fmtDay(b.checkIn)} → {fmtDay(b.checkOut)} · {b.channelLabel || "—"} · #{b.ref}
                        </div>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          {b.late && (
                            <span className="chip" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>
                              Late, due {fmtDay(b.checkIn)}
                            </span>
                          )}
                          {b.balance > 0 && (
                            <span className="chip" style={{ background: "var(--critical-soft)", color: "var(--critical)" }}>
                              Owes {baht(b.balance)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPrefill(toPrefill(b))}
                        disabled={prefill?.pmsBookingId === b.id}
                        className="rounded-[10px] px-4 text-[13px] font-bold text-white disabled:opacity-60 flex-none"
                        style={{ background: "var(--accent)", minHeight: 44 }}
                      >
                        Check in
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {dueOut.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold text-inkMuted mb-2">Due out</div>
                <div className="flex flex-col gap-1.5">
                  {dueOut.map((b) => (
                    <div key={b.id} className="text-[12.5px] flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold">{b.guestName || "Guest"}</span>
                      <span className="text-inkMuted">{b.unit.label}</span>
                      {b.balance > 0 && (
                        <span className="chip" style={{ background: "var(--critical-soft)", color: "var(--critical)" }}>
                          Owes {baht(b.balance)}
                        </span>
                      )}
                      <span className="text-[11.5px] text-inkMuted">
                        {b.inLog ? "Check out from the log below" : "Checked in on the PMS: check out there"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {form}
    </>
  );
}
