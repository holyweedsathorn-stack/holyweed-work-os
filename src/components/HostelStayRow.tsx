"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtTimeBKK, fmtDateBKK, initials } from "@/lib/types";
import {
  checkOutGuest,
  extendHostelStay,
  refreshHostelPhotoUrl,
  retryPmsSync,
  updateHostelStayNote,
  type PmsAwareResult,
  type BookingSource,
  type HostelStayExtension,
  type PaymentMethod,
  type RoomType,
} from "@/app/clock/hostel-actions";
import { deleteHostelStay } from "@/app/(app)/hostel/actions";

const BOOKING_LABELS: Record<BookingSource, string> = {
  booking_com: "Booking.com",
  agoda: "Agoda",
  airbnb: "Airbnb",
  hostelworld: "Hostelworld",
  expedia: "Expedia",
  trip_com: "Trip.com",
  direct: "Direct / walk-in",
  other: "Other",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  ota_collect: "OTA collected",
  cash: "Cash",
  bank_transfer: "Bank transfer",
};

export type StayLike = {
  id: string;
  guestName: string | null;
  branchName?: string;
  roomType: RoomType;
  roomNumber: string;
  bedNumber: string | null;
  bookingSource: BookingSource;
  paymentMethod: PaymentMethod;
  amountThb: number | null;
  expectedCheckoutDate: string | null;
  notes: string | null;
  notesUpdatedByName: string | null;
  notesUpdatedAt: string | null;
  checkedInAt: string;
  checkedInEmployeeName: string;
  checkedOutAt: string | null;
  checkedOutEmployeeName: string | null;
  passportPhotoUrls: string[];
  roomKeyPhotoUrl: string | null;
  extensions: HostelStayExtension[];
  pmsRef?: string | null;
  pmsSyncError?: string | null;
};

function fmtShortDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * One guest's stay — room/bed, booking source, payment, who checked them in
 * (and out, once they have), plus links to the two photos. Shared by the
 * staff clock-screen feed and the manager /hostel page: `showCheckout` is
 * for the desk (staff processing an actual departure), `showDelete` is for
 * managers fixing a mistaken entry — never both on the same row.
 */
export function HostelStayRow({
  stay,
  showCheckout = false,
  showDelete = false,
  onChanged,
}: {
  stay: StayLike;
  showCheckout?: boolean;
  showDelete?: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [working, start] = useTransition();
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(stay.notes ?? "");
  const [editingCheckout, setEditingCheckout] = useState(false);
  const [checkoutDraft, setCheckoutDraft] = useState(stay.expectedCheckoutDate ?? "");
  const [extAmount, setExtAmount] = useState("");
  const [extPaymentMethod, setExtPaymentMethod] = useState<PaymentMethod>("cash");

  const roomLabel =
    stay.roomType === "dorm" ? `Room ${stay.roomNumber} · Bed ${stay.bedNumber ?? "—"}` : `Room ${stay.roomNumber}`;

  /**
   * Re-signs the photo's URL at the moment it's tapped, rather than trusting
   * the one baked into the page at render time -- this screen can sit open
   * for a whole shift, well past the link's 10-minute signature. Opening a
   * blank tab synchronously (before the await) keeps Safari/iOS from
   * treating the eventual navigation as a blocked popup.
   */
  function openPhoto(kind: "passport" | "key", index = 0) {
    const win = window.open("", "_blank");
    refreshHostelPhotoUrl(stay.id, kind, index).then((res) => {
      if (!res.ok) {
        win?.close();
        alert(res.error);
        return;
      }
      if (win) win.location.href = res.url;
      else window.open(res.url, "_blank");
    });
  }

  function checkOut() {
    if (!confirm(`Check out ${stay.guestName || roomLabel}?`)) return;
    start(async () => {
      await withBalanceCheck((allowBalance) => checkOutGuest(stay.id, { allowBalance }));
    });
  }

  function retryPms() {
    start(async () => {
      await withBalanceCheck((allowBalance) => retryPmsSync(stay.id, { allowBalance }));
    });
  }

  /**
   * Runs a PMS-linked action. If the PMS says the guest still owes money,
   * show the amount and only go ahead (leaving the balance open in the PMS)
   * once staff confirm.
   */
  async function withBalanceCheck(run: (allowBalance: boolean) => Promise<PmsAwareResult>) {
    let res = await run(false);
    if (!res.ok && res.balanceDue != null) {
      const owed = `฿${res.balanceDue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      if (!confirm(`${stay.guestName || roomLabel} still owes ${owed} in the PMS.\n\nTake payment first, or check out anyway and leave the balance open?`)) return;
      res = await run(true);
    }
    if (!res.ok) {
      alert(res.error ?? "Something went wrong.");
      return;
    }
    if (res.warning) alert(res.warning);
    router.refresh();
    onChanged?.();
  }

  function saveNote() {
    start(async () => {
      const res = await updateHostelStayNote(stay.id, noteDraft);
      if (!res.ok) {
        alert(res.error ?? "Something went wrong.");
        return;
      }
      setEditingNote(false);
      router.refresh();      onChanged?.();
    });
  }

  function saveCheckout() {
    const trimmedAmount = extAmount.trim();
    const amountThb = trimmedAmount ? Number(trimmedAmount) : null;
    if (trimmedAmount && (!Number.isFinite(amountThb) || (amountThb as number) <= 0)) {
      alert("That amount doesn't look right.");
      return;
    }
    start(async () => {
      const res = await extendHostelStay({
        stayId: stay.id,
        newExpectedCheckoutDate: checkoutDraft,
        amountThb,
        paymentMethod: amountThb ? extPaymentMethod : null,
      });
      if (!res.ok) {
        alert(res.error ?? "Something went wrong.");
        return;
      }
      setEditingCheckout(false);
      setExtAmount("");
      setExtPaymentMethod("cash");
      router.refresh();      onChanged?.();
    });
  }

  function remove() {
    if (!confirm(`Delete this hostel log entry (${stay.guestName || roomLabel})? This can't be undone.`)) return;
    start(async () => {
      const res = await deleteHostelStay(stay.id);
      if (!res.ok) {
        alert(res.error ?? "Something went wrong.");
        return;
      }
      router.refresh();      onChanged?.();
    });
  }

  return (
    <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--line-strong)" }}>
      <div className="flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-none"
          style={{ background: "linear-gradient(155deg, var(--accent), #1a3d2b)" }}
        >
          {initials(stay.guestName || roomLabel)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[13.5px] font-semibold truncate">{stay.guestName || "Guest"}</div>
            {!stay.checkedOutAt ? (
              <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                Checked in
              </span>
            ) : (
              <span className="chip" style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}>
                Checked out
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-inkMuted">
            {roomLabel}
            {stay.branchName ? ` · ${stay.branchName}` : ""} · {BOOKING_LABELS[stay.bookingSource]} ·{" "}
            {PAYMENT_LABELS[stay.paymentMethod]}
            {stay.amountThb != null ? ` \u00b7 \u0e3f${stay.amountThb.toLocaleString()}` : ""}
            {stay.extensions.length > 0 ? " (original)" : ""}
          </div>
          {stay.pmsSyncError ? (
            <div
              className="text-[11.5px] rounded-[8px] px-2.5 py-1.5 mt-1.5 flex items-center gap-2"
              style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
            >
              <span className="flex-1">
                <span className="font-semibold">PMS not updated{stay.pmsRef ? ` (#${stay.pmsRef})` : ""}: </span>
                {stay.pmsSyncError}
              </span>
              <button type="button" disabled={working} onClick={retryPms} className="font-semibold underline">
                {working ? "…" : "Retry"}
              </button>
            </div>
          ) : (
            stay.pmsRef && <div className="text-[11px] text-inkMuted mt-0.5">PMS booking #{stay.pmsRef}</div>
          )}
          <div className="text-[11px] text-inkMuted mt-1">
            In: {stay.checkedInEmployeeName} · {fmtDateBKK(stay.checkedInAt)} {fmtTimeBKK(stay.checkedInAt)}
          </div>
          {!stay.checkedOutAt && !editingCheckout && (
            <div className="text-[11px] text-inkMuted flex items-center gap-2 mt-0.5">
              <span>
                {stay.expectedCheckoutDate
                  ? `Expected out: ${new Date(stay.expectedCheckoutDate + "T00:00:00").toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}`
                  : "No expected check-out date"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCheckoutDraft(stay.expectedCheckoutDate ?? "");
                  setExtAmount("");
                  setExtPaymentMethod("cash");
                  setEditingCheckout(true);
                }}
                className="font-semibold"
                style={{ color: "var(--accent)" }}
              >
                {stay.expectedCheckoutDate ? "Extend" : "Set date"}
              </button>
            </div>
          )}

          {editingCheckout && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <input
                type="date"
                value={checkoutDraft}
                onChange={(e) => setCheckoutDraft(e.target.value)}
                className="rounded-[8px] border px-2 py-1 text-[12px] outline-none focus:border-accent w-fit"
                style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  min={0}
                  step="1"
                  inputMode="decimal"
                  value={extAmount}
                  onChange={(e) => setExtAmount(e.target.value)}
                  placeholder="฿ charged for extra nights (optional)"
                  className="w-[190px] rounded-[8px] border px-2 py-1 text-[12px] outline-none focus:border-accent"
                  style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
                />
                {extAmount.trim() !== "" && Number(extAmount) > 0 && (
                  <div className="flex gap-1">
                    {(["cash", "ota_collect", "bank_transfer"] as PaymentMethod[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setExtPaymentMethod(m)}
                        className="rounded-full px-2.5 py-1 text-[11px] font-semibold border"
                        style={{
                          borderColor: extPaymentMethod === m ? "var(--accent)" : "var(--line-strong)",
                          background: extPaymentMethod === m ? "var(--accent-soft)" : "var(--surface)",
                          color: extPaymentMethod === m ? "var(--accent)" : "var(--ink-secondary)",
                        }}
                      >
                        {PAYMENT_LABELS[m]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={working}
                  onClick={saveCheckout}
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  {working ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutDraft(stay.expectedCheckoutDate ?? "");
                    setExtAmount("");
                    setExtPaymentMethod("cash");
                    setEditingCheckout(false);
                  }}
                  className="text-[12px] font-semibold text-inkMuted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {stay.extensions.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-1">
              {stay.extensions.map((e) => (
                <div key={e.id} className="text-[11px] text-inkMuted">
                  Extended{e.newExpectedCheckoutDate ? ` to ${fmtShortDate(e.newExpectedCheckoutDate)}` : ""}
                  {e.nights ? ` · +${e.nights} night${e.nights > 1 ? "s" : ""}` : ""}
                  {e.amountThb != null && (
                    <>
                      {" "}
                      · ฿{e.amountThb.toLocaleString()} · {e.paymentMethod ? PAYMENT_LABELS[e.paymentMethod] : "—"}
                    </>
                  )}
                  {" — "}
                  {e.recordedByName} · {fmtDateBKK(e.createdAt)}
                </div>
              ))}
            </div>
          )}

          {stay.checkedOutAt && (
            <div className="text-[11px] text-inkMuted">
              Out: {stay.checkedOutEmployeeName} · {fmtDateBKK(stay.checkedOutAt)} {fmtTimeBKK(stay.checkedOutAt)}
            </div>
          )}

          {!editingNote && stay.notes && (
            <div
              className="text-[11.5px] rounded-[8px] px-2.5 py-1.5 mt-2"
              style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
            >
              <span className="font-semibold">Note: </span>
              {stay.notes}
              {stay.notesUpdatedByName && <span className="opacity-70"> — {stay.notesUpdatedByName}</span>}
            </div>
          )}

          {editingNote && (
            <div className="mt-2 flex flex-col gap-1.5">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="e.g. has a dog, requested extra towel, late arrival ~11pm"
                className="w-full rounded-[8px] border px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
                style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={working}
                  onClick={saveNote}
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  {working ? "Saving…" : "Save note"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteDraft(stay.notes ?? "");
                    setEditingNote(false);
                  }}
                  className="text-[12px] font-semibold text-inkMuted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            {stay.passportPhotoUrls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => openPhoto("passport", i)}
                className="text-[12px] font-semibold"
                style={{ color: "var(--accent)" }}
              >
                {stay.passportPhotoUrls.length > 1 ? `Passport photo ${i + 1}` : "Passport photo"}
              </button>
            ))}
            {stay.roomKeyPhotoUrl && (
              <button type="button" onClick={() => openPhoto("key")} className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
                Room key photo
              </button>
            )}
            {!editingNote && (
              <button
                type="button"
                onClick={() => setEditingNote(true)}
                className="text-[12px] font-semibold"
                style={{ color: "var(--ink-secondary)" }}
              >
                {stay.notes ? "Edit note" : "Add note"}
              </button>
            )}
            {showCheckout && !stay.checkedOutAt && (
              <button
                type="button"
                disabled={working}
                onClick={checkOut}
                className="text-[12px] font-semibold ml-auto"
                style={{ color: "var(--accent)" }}
              >
                {working ? "…" : "Check out"}
              </button>
            )}
            {showDelete && (
              <button
                type="button"
                disabled={working}
                onClick={remove}
                className="text-[12px] font-semibold ml-auto"
                style={{ color: "var(--critical)" }}
              >
                {working ? "…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
