/**
 * Talks to the Holy Hostel PMS (the separate Holy-Hostel app) over its two
 * private endpoints, api/workos/front-desk and api/workos/booking-status.
 *
 * Server-side only: PMS_API_SECRET is the shared secret both apps hold, and
 * it must never reach a browser. Only import this from "use server" files.
 * Without PMS_API_URL / PMS_API_SECRET set, every call returns
 * code "not_configured" and the clock screen falls back to the plain
 * hand-typed check-in form, same as before this existed.
 */

const TIMEOUT_MS = 8000;

export type PmsBooking = {
  id: string;
  ref: string;
  guestName: string;
  guests: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: "confirmed" | "checked_in" | "checked_out" | string;
  late: boolean;
  dueOut: boolean;
  channel: string;
  channelLabel: string;
  otaRef: string;
  unit: { id: string; label: string; type: string; group: string; name: string };
  balance: number;
  notes: string;
};

export type PmsFrontDesk = {
  date: string;
  arrivals: PmsBooking[];
  inHouse: PmsBooking[];
  checkedInToday: PmsBooking[];
};

export type PmsErrorCode =
  | "not_configured"
  | "unreachable"
  | "unauthorized"
  | "not_found"
  | "wrong_status"
  | "early_arrival"
  | "early_departure"
  | "balance_due"
  | "month_closed"
  | "room_taken"
  | "duplicate_guest"
  | "no_unit"
  | "ambiguous_unit"
  | "bad_request"
  | "pms_error";

export type PmsResult<T> = ({ ok: true } & T) | { ok: false; code: PmsErrorCode; message: string; balance?: number };

const MESSAGES: Partial<Record<PmsErrorCode, string>> = {
  not_configured: "The PMS link isn't set up.",
  unreachable: "Couldn't reach the PMS.",
  unauthorized: "The PMS refused the connection (check PMS_API_SECRET).",
  pms_error: "The PMS had a problem.",
};

async function call<T>(path: string, init?: RequestInit): Promise<PmsResult<T>> {
  const base = process.env.PMS_API_URL;
  const secret = process.env.PMS_API_SECRET;
  if (!base || !secret) return { ok: false, code: "not_configured", message: MESSAGES.not_configured! };

  let res: Response;
  try {
    res = await fetch(base.replace(/\/+$/, "") + path, {
      ...init,
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, code: "unreachable", message: MESSAGES.unreachable! };
  }

  const body = (await res.json().catch(() => null)) as
    | ({ ok: boolean; code?: PmsErrorCode; message?: string; balance?: number } & T)
    | null;
  if (body?.ok) return body as { ok: true } & T;
  const code: PmsErrorCode = body?.code ?? (res.status === 401 ? "unauthorized" : "pms_error");
  return { ok: false, code, message: body?.message || MESSAGES[code] || MESSAGES.pms_error!, balance: body?.balance };
}

/** Today's arrivals (incl. late ones) and in-house guests, as the PMS sees them. */
export function pmsFrontDesk(): Promise<PmsResult<PmsFrontDesk>> {
  return call<PmsFrontDesk>("/api/workos/front-desk");
}

/**
 * Mark a PMS booking checked in or out. Safe to repeat: a booking already
 * in that state comes back ok with `already: true`. Checking out a guest
 * who still owes money fails with "balance_due" unless allowBalance is set.
 */
export function pmsSetStatus(input: {
  bookingId: string;
  action: "check_in" | "check_out";
  staffName: string;
  allowBalance?: boolean;
}): Promise<PmsResult<{ already?: boolean; booking: PmsBooking }>> {
  return call("/api/workos/booking-status", { method: "POST", body: JSON.stringify(input) });
}

/** Current PMS status of these bookings ("cancelled", "checked_in", ...). Bookings the PMS doesn't have are left out. */
export function pmsBookingStatuses(ids: string[]): Promise<PmsResult<{ statuses: Record<string, string> }>> {
  return call("/api/workos/booking-statuses", { method: "POST", body: JSON.stringify({ ids }) });
}

/**
 * A guest checked in here by hand: the PMS checks in the booking it
 * already has for them (same OTA number, or same name arriving now), or
 * creates one, already checked in. Keyed by the Work OS stay id, so
 * sending the same stay again never creates a second booking. Refuses
 * with "room_taken" when that room/bed is booked in the PMS.
 */
export function pmsWalkIn(input: {
  stayId: string;
  guestName: string | null;
  roomNumber: string;
  bedNumber: string | null;
  checkIn: string;
  checkOut: string | null;
  bookingSource: string;
  paymentMethod: string;
  amountThb: number | null;
  otaRef?: string | null;
  notes: string | null;
  staffName: string;
}): Promise<PmsResult<{ created?: boolean; linked?: boolean; already?: boolean; booking: PmsBooking }>> {
  return call("/api/workos/walk-in", { method: "POST", body: JSON.stringify(input) });
}
