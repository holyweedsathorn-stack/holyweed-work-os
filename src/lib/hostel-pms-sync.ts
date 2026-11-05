import type { createAdminClient } from "@/lib/supabase/admin";
import { paymentForPmsChannel, roomForPmsUnit, sourceForPmsChannel } from "@/lib/hostel-rooms";
import { pmsCancel, pmsSetStatus, pmsSync, pmsWalkIn, type PmsSyncBooking } from "@/lib/pms";

/**
 * Keeps the hostel log and the Holy Hostel PMS the same, both ways.
 *
 * Work OS -> PMS happens at the moment staff act (check in, check out,
 * extend: see clock/hostel-actions.ts). When the PMS couldn't be reached,
 * the stay keeps a pms_sync_error and is sent again here (pushStayToPms).
 *
 * PMS -> Work OS happens here, whenever the log is loaded. The PMS is the
 * source of truth for status, dates, room and guest name:
 *   - a guest checked in (or in and out) on a PMS tablet appears on the log
 *     as "From PMS", with no photos until staff add them;
 *   - PMS check-outs, re-opened stays, new check-out dates, room moves and
 *     name corrections are copied onto the log;
 *   - a booking cancelled in the PMS takes the guest off the log (deleted
 *     with their photos, as a manager's Delete would).
 * Photos and notes are Work OS's own and are never touched. A stay with a
 * change still waiting to reach the PMS isn't overwritten until it has.
 *
 * Server-side only: it uses the admin client and the PMS secret.
 */

type Admin = ReturnType<typeof createAdminClient>;

const BUCKET = "hostel-checkins";
const CANCELLED = new Set(["cancelled", "void"]);
const WINDOW_DAYS = 7; // stays checked out longer ago than this are history and left alone
const MAX_RETRIES_PER_SYNC = 5;
const MIN_GAP_MS = 15_000; // several screens loading at once share one sync
const lastSync = new Map<string, number>();
const lastWarning = new Map<string, string | null>();

export type PushResult = { ok: true; bookingId: string } | { ok: false; error: string; balanceDue?: number };

const STAY_COLUMNS =
  "id, branch_id, guest_name, room_type, room_number, bed_number, booking_source, payment_method, amount_thb, expected_checkout_date, notes, checked_in_at, checked_in_employee_name, checked_out_at, checked_out_employee_name, passport_photo_paths, room_key_photo_path, origin, pms_booking_id, pms_ref, pms_sync_error";

type StayRow = {
  id: string;
  branch_id: string;
  guest_name: string | null;
  room_type: string;
  room_number: string;
  bed_number: string | null;
  booking_source: string;
  payment_method: string;
  amount_thb: number | string | null;
  expected_checkout_date: string | null;
  notes: string | null;
  checked_in_at: string;
  checked_in_employee_name: string;
  checked_out_at: string | null;
  checked_out_employee_name: string | null;
  passport_photo_paths: string[] | null;
  room_key_photo_path: string | null;
  origin: string;
  pms_booking_id: string | null;
  pms_ref: string | null;
  pms_sync_error: string | null;
};

/** YYYY-MM-DD in Bangkok, for a timestamp (now if none). */
export function bangkokDate(iso?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(iso ? new Date(iso) : new Date());
}

const norm = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Send one stay's state to the PMS: a hand check-in that never got there is
 * sent as a walk-in (keyed by the stay id, so it can't create a second
 * booking), then the booking is marked checked in / out to match the stay.
 * Clears pms_sync_error once it worked.
 */
export async function pushStayToPms(
  admin: Admin,
  orgId: string,
  stayId: string,
  staffName: string,
  allowBalance = false
): Promise<PushResult> {
  const { data } = await admin.from("hostel_stays").select(STAY_COLUMNS).eq("id", stayId).eq("org_id", orgId).maybeSingle();
  const stay = data as StayRow | null;
  if (!stay) return { ok: false, error: "Guest record not found." };

  let bookingId = stay.pms_booking_id;
  if (!bookingId) {
    const walkIn = await pmsWalkIn({
      stayId: stay.id,
      guestName: stay.guest_name,
      roomNumber: stay.room_number,
      bedNumber: stay.bed_number,
      checkIn: bangkokDate(stay.checked_in_at),
      checkOut: stay.expected_checkout_date,
      bookingSource: stay.booking_source,
      paymentMethod: stay.payment_method,
      amountThb: stay.amount_thb != null ? Number(stay.amount_thb) : null,
      notes: stay.notes,
      staffName: stay.checked_in_employee_name,
    });
    if (!walkIn.ok) return { ok: false, error: `PMS: ${walkIn.message}` };
    bookingId = walkIn.booking.id;
    const { error: linkError } = await admin
      .from("hostel_stays")
      .update({ pms_booking_id: bookingId, pms_ref: walkIn.booking.ref })
      .eq("id", stayId);
    if (linkError) return { ok: false, error: linkError.message };
  }

  const pms = await pmsSetStatus({
    bookingId,
    action: stay.checked_out_at ? "check_out" : "check_in",
    staffName,
    allowBalance,
  });
  if (!pms.ok && pms.code === "balance_due") return { ok: false, error: pms.message, balanceDue: pms.balance ?? 0 };
  if (!pms.ok) return { ok: false, error: `PMS: ${pms.message}` };

  const { error } = await admin
    .from("hostel_stays")
    .update({ pms_synced_at: new Date().toISOString(), pms_sync_error: null })
    .eq("id", stayId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, bookingId };
}

/**
 * Where guests checked in on the PMS go on the log: the branch the desk itself logs hostel guests
 * under (that of the latest check-in done on Work OS), so they show on the same "your branch"
 * list as everyone else; with no such check-in yet, the Sathorn branch.
 */
async function hostelBranchId(admin: Admin, orgId: string): Promise<string | null> {
  const { data: latest } = await admin
    .from("hostel_stays")
    .select("branch_id")
    .eq("org_id", orgId)
    .eq("origin", "workos")
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest?.branch_id) return latest.branch_id as string;
  const { data } = await admin.from("branches").select("id").eq("org_id", orgId).eq("slug", "sathorn").maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Delete log entries and their photos. Returns the database error, if any. */
async function deleteStays(admin: Admin, orgId: string, stays: StayRow[]): Promise<string | null> {
  if (stays.length === 0) return null;
  const { error } = await admin
    .from("hostel_stays")
    .delete()
    .eq("org_id", orgId)
    .in(
      "id",
      stays.map((s) => s.id)
    );
  if (error) return error.message;
  const photos = stays.flatMap((s) => [...(s.passport_photo_paths ?? []), ...(s.room_key_photo_path ? [s.room_key_photo_path] : [])]);
  if (photos.length) await admin.storage.from(BUCKET).remove(photos);
  return null;
}

export type CancelResult = { ok: true } | { ok: false; error: string; incomeCollected?: number };

/**
 * "Cancel booking" on the hostel log: cancel the PMS booking first -- exactly like the PMS's own
 * Cancel booking (red, crossed out, payments voided, room freed) -- then take the guest off the log,
 * the same as a cancellation made in the PMS does. If the PMS refuses or can't be reached nothing
 * is changed here either and the error is returned, so the two never disagree. Money already
 * collected comes back as incomeCollected for staff to confirm (then call again with allowIncome).
 */
export async function cancelStay(
  admin: Admin,
  orgId: string,
  stayId: string,
  reason: string,
  staffName: string,
  allowIncome = false
): Promise<CancelResult> {
  const why = reason.trim().slice(0, 200);
  if (!why) return { ok: false, error: "Enter a reason to cancel the booking." };
  const { data } = await admin.from("hostel_stays").select(STAY_COLUMNS).eq("id", stayId).eq("org_id", orgId).maybeSingle();
  const stay = data as StayRow | null;
  if (!stay) return { ok: false, error: "Guest record not found." };

  // The linked booking -- or, for a hand check-in whose link wasn't saved, the walk-in booking the PMS
  // made for it (keyed by the stay id, see api/workos/walk-in.js on the PMS).
  const bookingId = stay.pms_booking_id ?? "wos" + stay.id.replace(/-/g, "").toLowerCase();
  const pms = await pmsCancel({ bookingId, reason: why, staffName, allowIncome });
  if (!pms.ok) {
    if (pms.code === "income_collected") return { ok: false, error: pms.message, incomeCollected: pms.amount ?? 0 };
    // no PMS booking to cancel (not linked, already gone) or no PMS link set up: just the log entry
    if (pms.code !== "not_found" && pms.code !== "not_configured") {
      return { ok: false, error: `PMS: ${pms.message} Nothing was cancelled.` };
    }
  }

  const error = await deleteStays(admin, orgId, [stay]);
  if (error) return { ok: false, error: `Cancelled in the PMS, but the log entry wasn't removed (${error}). Reload to try again.` };
  return { ok: true };
}

/** Copy the PMS's status, dates, room and name onto a linked stay. Returns the columns that changed. */
function patchFromPms(stay: StayRow, b: PmsSyncBooking): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (b.status === "checked_out" && !stay.checked_out_at) {
    patch.checked_out_at = b.checkedOutAt || new Date().toISOString();
    patch.checked_out_employee_id = null;
    patch.checked_out_employee_name = "PMS";
  }
  if (b.status === "checked_in" && stay.checked_out_at) {
    // re-opened on the PMS
    patch.checked_out_at = null;
    patch.checked_out_employee_id = null;
    patch.checked_out_employee_name = null;
  }
  if (b.checkOut && b.checkOut !== stay.expected_checkout_date) patch.expected_checkout_date = b.checkOut;
  const r = roomForPmsUnit(b.unit);
  if (r.room && (r.roomNumber !== stay.room_number || (r.bedNumber || null) !== stay.bed_number)) {
    patch.room_number = r.roomNumber;
    patch.room_type = r.room.type;
    patch.bed_number = r.bedNumber || null;
  }
  if (b.guestName && b.guestName !== stay.guest_name) patch.guest_name = b.guestName;
  if (b.ref && b.ref !== stay.pms_ref) patch.pms_ref = b.ref;
  return patch;
}

/** A new log entry for a guest checked in on the PMS (no photos, no Work OS staff member). */
function stayFromPms(orgId: string, branchId: string, b: PmsSyncBooking) {
  const r = roomForPmsUnit(b.unit);
  const source = sourceForPmsChannel(b.channel);
  return {
    org_id: orgId,
    branch_id: branchId,
    guest_name: b.guestName || null,
    room_type: r.room?.type ?? (b.unit.type === "dorm" ? "dorm" : "private"),
    room_number: (r.roomNumber || b.unit.label || "?").slice(0, 40),
    bed_number: r.bedNumber || null,
    booking_source: source || "other",
    payment_method: paymentForPmsChannel(b.channel),
    amount_thb: null,
    expected_checkout_date: b.checkOut || null,
    passport_photo_paths: [],
    room_key_photo_path: null,
    checked_in_at: b.checkedInAt || `${b.checkIn}T07:00:00.000Z`, // no time recorded: 14:00 Bangkok on the check-in day
    checked_in_employee_id: null,
    checked_in_employee_name: "PMS",
    checked_out_at: b.status === "checked_out" ? b.checkedOutAt || new Date().toISOString() : null,
    checked_out_employee_name: b.status === "checked_out" ? "PMS" : null,
    origin: "pms",
    pms_booking_id: b.id,
    pms_ref: b.ref,
    pms_synced_at: new Date().toISOString(),
  };
}

/**
 * Bring the hostel log in line with the PMS (see the top of this file).
 * Never throws; if the PMS can't be reached nothing changes.
 *
 * @returns null when the log is in sync (or the PMS link isn't set up), otherwise a short
 *          explanation for staff of why it couldn't be -- shown above the log so a sync that
 *          can't run is never silent.
 */
export async function syncHostelWithPms(admin: Admin, orgId: string, opts: { force?: boolean } = {}): Promise<string | null> {
  const last = lastSync.get(orgId) ?? 0;
  if (!opts.force && Date.now() - last < MIN_GAP_MS) return lastWarning.get(orgId) ?? null;
  lastSync.set(orgId, Date.now());
  const warning = await runSync(admin, orgId);
  lastWarning.set(orgId, warning);
  if (warning) console.error("[hostel-pms-sync]", warning);
  return warning;
}

async function runSync(admin: Admin, orgId: string): Promise<string | null> {
  try {
    let writeError: string | null = null; // first failed write, reported at the end
    const noteError = (e: { message: string } | null) => { if (e && !writeError) writeError = e.message; };

    const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
    const { data, error: loadError } = await admin
      .from("hostel_stays")
      .select(STAY_COLUMNS)
      .eq("org_id", orgId)
      .or(`checked_out_at.is.null,checked_out_at.gt.${since}`)
      .order("checked_in_at", { ascending: false })
      .limit(300);
    // e.g. migration 0044 not run yet (no "origin" column)
    if (loadError) return `Couldn't sync the hostel log with the PMS: ${loadError.message}`;
    const stays = (data ?? []) as StayRow[];

    // 1. Changes made here that haven't reached the PMS yet: try again (no money prompts here --
    //    a guest who still owes stays flagged for staff to Retry from the log).
    const waiting = new Set<string>();
    let tries = 0;
    for (const s of stays.filter((x) => x.pms_sync_error)) {
      if (tries++ >= MAX_RETRIES_PER_SYNC) { waiting.add(s.id); continue; }
      const staff = (s.checked_out_at ? s.checked_out_employee_name : s.checked_in_employee_name) || "Work OS";
      const res = await pushStayToPms(admin, orgId, s.id, staff);
      if (res.ok) s.pms_booking_id = res.bookingId;
      waiting.add(s.id); // don't overwrite it this round either way
    }

    // 2. What the PMS has now.
    const linked = stays.filter((s) => s.pms_booking_id);
    const pms = await pmsSync([...new Set(linked.map((s) => s.pms_booking_id as string))]);
    if (!pms.ok) return pms.code === "not_configured" ? null : `Couldn't sync with the PMS: ${pms.message}`;
    const byBooking = new Map(pms.bookings.map((b) => [b.id, b]));

    // 3. Linked stays follow the PMS.
    const toDelete: StayRow[] = [];
    for (const s of linked) {
      if (waiting.has(s.id)) continue;
      const b = byBooking.get(s.pms_booking_id as string);
      if (!b) continue; // the PMS no longer has it: leave the log entry as it is
      if (CANCELLED.has(b.status)) { toDelete.push(s); continue; }
      if (b.status !== "checked_in" && b.status !== "checked_out") {
        // check-in undone / no-show on the PMS: a guest that only came from the PMS goes; one
        // checked in here (with photos) stays for a manager to look at
        if (s.origin === "pms") toDelete.push(s);
        continue;
      }
      const patch = patchFromPms(s, b);
      if (Object.keys(patch).length) {
        const { error } = await admin.from("hostel_stays").update({ ...patch, pms_synced_at: new Date().toISOString() }).eq("id", s.id);
        noteError(error);
      }
    }
    await deleteStays(admin, orgId, toDelete);

    // 4. Guests checked in on the PMS that the log doesn't have yet.
    const fresh = pms.bookings.filter(
      (b) => (b.status === "checked_in" || b.status === "checked_out") && !linked.some((s) => s.pms_booking_id === b.id)
    );
    if (fresh.length === 0) return writeError ? `Couldn't copy every PMS change onto the log: ${writeError}` : null;
    // linked to a stay outside the window we loaded?
    const { data: known } = await admin
      .from("hostel_stays")
      .select("pms_booking_id")
      .eq("org_id", orgId)
      .in(
        "pms_booking_id",
        fresh.map((b) => b.id)
      );
    const knownIds = new Set((known ?? []).map((k) => k.pms_booking_id as string));
    const branchId = await hostelBranchId(admin, orgId);
    if (!branchId) return "Couldn't add PMS guests to the log: no hostel branch found.";

    for (const b of fresh) {
      if (knownIds.has(b.id)) continue;
      // Typed into both apps the old way (before they were linked)? Link that entry instead of adding a second.
      const twin = stays.find(
        (s) => !s.pms_booking_id && !s.pms_sync_error && !s.checked_out_at && b.guestName && norm(s.guest_name) === norm(b.guestName)
      );
      if (twin && b.status === "checked_in") {
        const { error } = await admin
          .from("hostel_stays")
          .update({ ...patchFromPms(twin, b), pms_booking_id: b.id, pms_ref: b.ref, pms_synced_at: new Date().toISOString() })
          .eq("id", twin.id);
        noteError(error);
        twin.pms_booking_id = b.id;
        continue;
      }
      // A unique index on pms_booking_id stops two screens adding the same guest twice (23505: fine).
      const { error } = await admin.from("hostel_stays").insert(stayFromPms(orgId, branchId, b));
      if (error && (error as { code?: string }).code !== "23505") noteError(error);
    }
    return writeError ? `Couldn't copy every PMS guest onto the log: ${writeError}` : null;
  } catch (e) {
    return `Couldn't sync with the PMS: ${e instanceof Error ? e.message : String(e)}`;
  }
}
