"use client";

import { useRef, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { checkInGuest, type BookingSource, type PaymentMethod } from "@/app/clock/hostel-actions";
import { HOSTEL_ROOMS, findHostelRoom } from "@/lib/hostel-rooms";
import { compressImage } from "@/lib/compress-image";

const BOOKING_SOURCES: { id: BookingSource; label: string }[] = [
  { id: "booking_com", label: "Booking.com" },
  { id: "agoda", label: "Agoda" },
  { id: "airbnb", label: "Airbnb" },
  { id: "hostelworld", label: "Hostelworld" },
  { id: "expedia", label: "Expedia" },
  { id: "trip_com", label: "Trip.com" },
  { id: "direct", label: "Direct / walk-in" },
  { id: "other", label: "Other" },
];

const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "ota_collect", label: "OTA collected" },
  { id: "cash", label: "Cash" },
  { id: "bank_transfer", label: "Bank transfer" },
];

function PhotoField({
  label,
  name,
  inputRef,
  onChange,
  preview,
}: {
  label: string;
  name: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: () => void;
  preview: string | null;
}) {
  return (
    <label className="text-[12px] font-semibold text-inkSecondary block">
      {label}
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept="image/*"
        required
        onChange={onChange}
        className="w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent mt-1.5"
        style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
      />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="w-full max-h-[160px] object-cover rounded-[9px] mt-2"
          style={{ border: "1px solid var(--line-strong)" }}
        />
      )}
    </label>
  );
}

/**
 * Same idea as PhotoField, but for more than one photo at once — a room
 * with several guests checking in together, or a passport that needs more
 * than one page. Picking files again replaces the whole selection, same as
 * any file input; there's no per-photo remove, just reselect if it was wrong.
 */
function MultiPhotoField({
  label,
  name,
  inputRef,
  onChange,
  previews,
}: {
  label: string;
  name: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: () => void;
  previews: string[];
}) {
  return (
    <label className="text-[12px] font-semibold text-inkSecondary block">
      {label}
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept="image/*"
        multiple
        required
        onChange={onChange}
        className="w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent mt-1.5"
        style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
      />
      {previews.length > 0 && (
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))" }}>
          {previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              className="w-full aspect-square object-cover rounded-[8px]"
              style={{ border: "1px solid var(--line-strong)" }}
            />
          ))}
        </div>
      )}
      {previews.length > 1 && (
        <div className="text-[11px] text-inkMuted mt-1">{previews.length} photos selected</div>
      )}
    </label>
  );
}

/**
 * Front-desk check-in: passport photo, room key photo, which room (and
 * bed, for a dorm), where the booking came from, and how it was paid. No
 * approval — same "snap it and it's logged" pattern as the rest of the
 * clock screen — but this holds guest ID photos, so it stays deliberately
 * minimal: nothing extra collected beyond what's needed to run the desk.
 */
export type CheckinPrefill = {
  pmsBookingId: string;
  pmsRef: string;
  unitLabel: string;
  guestName: string;
  roomNumber: string; // "" when the PMS unit doesn't match a room in HOSTEL_ROOMS
  bedNumber: string;
  expectedCheckoutDate: string;
  bookingSource: BookingSource | "";
  paymentMethod: PaymentMethod;
};

/**
 * With `prefill` (a PMS arrival picked on the clock screen) the form opens
 * filled in from the booking and checks the booking in on the PMS too;
 * staff still add the photos and confirm room and payment.
 */
export function HostelCheckinForm({
  prefill,
  onDone,
  onCancel,
}: {
  prefill?: CheckinPrefill | null;
  onDone?: () => void;
  onCancel?: () => void;
} = {}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const passportRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  const [working, start] = useTransition();
  const [open, setOpen] = useState(!!prefill);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomNumber, setRoomNumber] = useState(prefill?.roomNumber ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(prefill?.paymentMethod ?? "cash");
  const [amountThb, setAmountThb] = useState("");
  const [bookingSource, setBookingSource] = useState<string>(prefill?.bookingSource ?? "");
  const [passportPreviews, setPassportPreviews] = useState<string[]>([]);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);

  function preview(file: File | undefined, set: Dispatch<SetStateAction<string | null>>) {
    set((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function previewMany(files: FileList | null | undefined, set: Dispatch<SetStateAction<string[]>>) {
    set((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return files ? Array.from(files).map((f) => URL.createObjectURL(f)) : [];
    });
  }

  const selectedRoom = findHostelRoom(roomNumber);

  function reset() {
    formRef.current?.reset();
    setRoomNumber("");
    setPaymentMethod("cash");
    setAmountThb("");
    setBookingSource("");
    previewMany(null, setPassportPreviews);
    preview(undefined, setKeyPreview);
  }

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      // Compress photos before they go over the wire -- raw phone camera
      // shots run 5-20MB each, and a few of them together can blow past
      // the server action's body size limit. That failure happens before
      // checkInGuest ever runs, so it shows up as a hard page-load error
      // instead of the friendly one below -- compressing first is what
      // keeps check-in working on an ordinary phone photo.
      const passportFiles = formData.getAll("passport_photos").filter((f): f is File => f instanceof File);
      if (passportFiles.length > 0) {
        const compressed = await Promise.all(passportFiles.map((f) => compressImage(f)));
        formData.delete("passport_photos");
        for (const f of compressed) formData.append("passport_photos", f);
      }
      const keyFile = formData.get("room_key_photo");
      if (keyFile instanceof File) {
        formData.set("room_key_photo", await compressImage(keyFile));
      }

      const res = await checkInGuest(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reset();
      setSent(true);
      setOpen(false);
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-[15px] font-semibold">
          {prefill && open ? `Check in PMS #${prefill.pmsRef}` : "Guest check-in"}
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setSent(false);
            }}
            className="text-[12.5px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Check in a guest
          </button>
        )}
      </div>

      {sent && !open && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          Checked in — everyone on shift can see it in the log below.
        </div>
      )}

      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {open && (
        <form ref={formRef} action={submit} className="flex flex-col gap-3">
          <input type="hidden" name="payment_method" value={paymentMethod} />
          <input type="hidden" name="amount_thb" value={amountThb} />
          {prefill && <input type="hidden" name="pms_booking_id" value={prefill.pmsBookingId} />}
          {prefill && (
            <div className="text-[12.5px] rounded-[9px] px-3 py-2" style={{ background: "var(--surface-2)" }}>
              PMS: <span className="font-semibold">{prefill.unitLabel}</span>
              {prefill.roomNumber ? "" : " · choose the matching room below"}. Submitting also checks this
              booking in on the PMS.
            </div>
          )}

          <label className="text-[12px] font-semibold text-inkSecondary block">
            Guest name (optional)
            <input
              name="guest_name"
              defaultValue={prefill?.guestName}
              maxLength={200}
              placeholder="e.g. Somchai Jaidee"
              className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
            />
          </label>

          <div className="grid gap-3 grid-cols-2">
            <label className="text-[12px] font-semibold text-inkSecondary block">
              Room
              <select
                name="room_number"
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
                style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
              >
                <option value="" disabled>
                  Choose a room
                </option>
                {HOSTEL_ROOMS.map((r) => (
                  <option key={r.number} value={r.number}>
                    {r.number} — {r.type === "dorm" ? `Dorm (${r.beds} beds)` : "Private"}
                  </option>
                ))}
              </select>
            </label>
            {selectedRoom?.type === "dorm" && (
              <label className="text-[12px] font-semibold text-inkSecondary block">
                Bed
                <select
                  key={roomNumber}
                  name="bed_number"
                  required
                  defaultValue={prefill && roomNumber === prefill.roomNumber ? prefill.bedNumber : ""}
                  className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
                  style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
                >
                  <option value="" disabled>
                    Choose a bed
                  </option>
                  {Array.from({ length: selectedRoom.beds ?? 0 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="text-[12px] font-semibold text-inkSecondary block">
            Expected check-out date (optional)
            <input
              name="expected_checkout_date"
              type="date"
              defaultValue={prefill?.expectedCheckoutDate}
              className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
            />
          </label>

          <label className="text-[12px] font-semibold text-inkSecondary block">
            Booking source
            <select
              name="booking_source"
              required
              value={bookingSource}
              onChange={(e) => setBookingSource(e.target.value)}
              className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
            >
              <option value="" disabled>
                Choose one
              </option>
              {BOOKING_SOURCES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          {/* Hand check-ins go to the PMS too. The booking site's number lets the PMS match the
              booking it already imported (and stops the next import adding the guest twice). */}
          {!prefill && bookingSource !== "" && bookingSource !== "direct" && bookingSource !== "other" && (
            <label className="text-[12px] font-semibold text-inkSecondary block">
              Booking number from the booking site (optional)
              <input
                name="ota_ref"
                maxLength={60}
                autoComplete="off"
                placeholder="e.g. 4512 889 301"
                className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
                style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
              />
            </label>
          )}

          <div>
            <div className="text-[12px] font-semibold text-inkSecondary mb-1.5">Payment</div>
            <div className="flex gap-1.5">
              {PAYMENT_METHODS.map((p) => {
                const on = p.id === paymentMethod;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPaymentMethod(p.id)}
                    className="flex-1 rounded-full px-3 text-[13px] font-semibold border"
                    style={{
                      minHeight: 44,
                      borderColor: on ? "var(--accent)" : "var(--line-strong)",
                      background: on ? "var(--accent-soft)" : "var(--surface)",
                      color: on ? "var(--accent)" : "var(--ink-secondary)",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {(paymentMethod === "cash" || paymentMethod === "bank_transfer") && (
            <label className="text-[12px] font-semibold text-inkSecondary block">
              Amount {paymentMethod === "bank_transfer" ? "(so it can be matched to the bank statement)" : "(optional)"}
              <input
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                value={amountThb}
                onChange={(e) => setAmountThb(e.target.value)}
                placeholder="฿"
                className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
                style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
              />
            </label>
          )}

          <label className="text-[12px] font-semibold text-inkSecondary block">
            Anything everyone should know? (optional)
            <textarea
              name="notes"
              maxLength={1000}
              rows={2}
              placeholder="e.g. has a dog, requested extra towel, late arrival ~11pm"
              className="w-full rounded-[9px] border px-3 py-2 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            />
          </label>

          <MultiPhotoField
            label="Passport photo(s)"
            name="passport_photos"
            inputRef={passportRef}
            onChange={() => previewMany(passportRef.current?.files, setPassportPreviews)}
            previews={passportPreviews}
          />
          <PhotoField
            label="Room key photo"
            name="room_key_photo"
            inputRef={keyRef}
            onChange={() => preview(keyRef.current?.files?.[0], setKeyPreview)}
            preview={keyPreview}
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={working}
              className="flex-1 rounded-[11px] text-[15px] font-bold text-white disabled:opacity-60"
              style={{ background: "var(--accent)", minHeight: 50 }}
            >
              {working ? "Uploading…" : "Check in"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
                onCancel?.();
              }}
              className="rounded-[11px] border px-5 text-[14px] font-semibold text-inkSecondary"
              style={{ borderColor: "var(--line-strong)", minHeight: 50 }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!open && !sent && (
        <p className="text-[13px] text-inkMuted m-0">
          Passport + room key photo, room (and bed, for a dorm), booking source and payment —
          goes straight into the log below, and into the PMS.
        </p>
      )}
    </div>
  );
}
