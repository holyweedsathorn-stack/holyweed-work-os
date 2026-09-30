"use server";

import { revalidatePath } from "next/cache";
import { requireEmployee, requireEmployeeOrManager } from "@/lib/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWorkingBranch } from "@/lib/working-branch";
import { notifyManagers } from "@/lib/notify";
import { findHostelRoom } from "@/lib/hostel-rooms";

const BUCKET = "hostel-checkins";
const SIGNED_URL_TTL = 60 * 10; // 10 minutes, same as the other photo logs.
const MAX_PASSPORT_PHOTOS = 8;

export type RoomType = "private" | "dorm";
export type BookingSource = "booking_com" | "agoda" | "airbnb" | "hostelworld" | "expedia" | "trip_com" | "direct" | "other";
export type PaymentMethod = "ota_collect" | "cash" | "bank_transfer";

export type Result = { ok: true } | { ok: false; error: string };

const BOOKING_SOURCES = new Set<BookingSource>([
  "booking_com",
  "agoda",
  "airbnb",
  "hostelworld",
  "expedia",
  "trip_com",
  "direct",
  "other",
]);
const PAYMENT_METHODS = new Set<PaymentMethod>(["ota_collect", "cash", "bank_transfer"]);

function checkPhoto(file: FormDataEntryValue | null, label: string): File | { error: string } {
  if (!(file instanceof File) || file.size === 0) return { error: `Please attach a ${label}.` };
  if (!file.type.startsWith("image/")) return { error: "Only photos are supported." };
  if (file.size > 10 * 1024 * 1024) return { error: "That photo is too big (10MB max)." };
  return file;
}

/**
 * A guest checking in: passport photo(s) — more than one guest in the room
 * may be signing in together, or a passport may need more than one page
 * photographed — room key photo, which room (and bed, for a dorm), where
 * the booking came from, and how it was paid. No approval step — same "it
 * just lands in the log" pattern as received items — but this is guest ID
 * data, so every photo stays in a private bucket behind a short-lived
 * signed URL, same as everywhere else.
 */
export async function checkInGuest(formData: FormData): Promise<Result> {
  const guard = await requireEmployee("clock.checkInGuest");
  if (!guard.ok) return { ok: false, error: guard.error };

  const roomNumber = String(formData.get("room_number") || "").trim().slice(0, 40);
  if (!roomNumber) return { ok: false, error: "Choose a room." };

  // The room list — which rooms exist, which are dorms, how many beds — is
  // decided here, server-side, from the real inventory. A hidden room_type
  // field from the client is never trusted for this.
  const room = findHostelRoom(roomNumber);
  if (!room) return { ok: false, error: "That room number isn't in the hostel's room list." };
  const roomType: RoomType = room.type;

  const bedNumberRaw = String(formData.get("bed_number") || "").trim().slice(0, 40);
  let bedNumber: string | null = null;
  if (roomType === "dorm") {
    const bedNum = Number(bedNumberRaw);
    if (!bedNumberRaw || !Number.isInteger(bedNum) || bedNum < 1 || bedNum > (room.beds ?? 0)) {
      return { ok: false, error: `Choose a bed number (1–${room.beds ?? "?"}) for room ${room.number}.` };
    }
    bedNumber = bedNumberRaw;
  }

  const bookingSource = String(formData.get("booking_source") || "");
  if (!BOOKING_SOURCES.has(bookingSource as BookingSource)) {
    return { ok: false, error: "Choose where the booking came from." };
  }

  const paymentMethod = String(formData.get("payment_method") || "");
  if (!PAYMENT_METHODS.has(paymentMethod as PaymentMethod)) {
    return { ok: false, error: "Choose how it was paid." };
  }

  // Only meaningful for cash and bank_transfer -- ota_collect means the OTA
  // took the payment, not this app. Optional even then (front desk may not
  // always know/enter the figure), but for bank_transfer it's the whole
  // point: without it, a guest's wire has nothing to match against on the
  // reconciliation page.
  const amountRaw = String(formData.get("amount_thb") || "").trim();
  let amountThb: number | null = null;
  if (amountRaw) {
    const n = Number(amountRaw);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: "That amount doesn't look right." };
    amountThb = n;
  }

  const guestName = String(formData.get("guest_name") || "").trim().slice(0, 200) || null;
  const notes = String(formData.get("notes") || "").trim().slice(0, 1000) || null;

  const expectedCheckoutRaw = String(formData.get("expected_checkout_date") || "").trim();
  if (expectedCheckoutRaw && !/^\d{4}-\d{2}-\d{2}$/.test(expectedCheckoutRaw)) {
    return { ok: false, error: "That checkout date doesn't look right." };
  }
  const expectedCheckoutDate = expectedCheckoutRaw || null;

  const passportFiles = formData.getAll("passport_photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (passportFiles.length === 0) return { ok: false, error: "Please attach at least one passport photo." };
  if (passportFiles.length > MAX_PASSPORT_PHOTOS) {
    return { ok: false, error: `That's a lot of passport photos — ${MAX_PASSPORT_PHOTOS} max per check-in.` };
  }
  for (const f of passportFiles) {
    const checked = checkPhoto(f, "passport photo");
    if ("error" in checked) return { ok: false, error: checked.error };
  }

  const roomKey = checkPhoto(formData.get("room_key_photo"), "room key photo");
  if ("error" in roomKey) return { ok: false, error: roomKey.error };

  const admin = createAdminClient();
  const branchId = await resolveWorkingBranch(guard.employeeId, guard.branchId);

  const extOf = (name: string) => (name.match(/\.[a-zA-Z0-9]+$/)?.[0] || ".jpg").toLowerCase();
  const passportPaths = passportFiles.map(
    (f) => `${guard.orgId}/${guard.employeeId}/passport-${crypto.randomUUID()}${extOf(f.name)}`
  );
  const roomKeyPath = `${guard.orgId}/${guard.employeeId}/key-${crypto.randomUUID()}${extOf(roomKey.name)}`;

  const passportUploads = await Promise.all(
    passportFiles.map((f, i) =>
      admin.storage.from(BUCKET).upload(passportPaths[i], f, { contentType: f.type || "image/jpeg" })
    )
  );
  const keyUpload = await admin.storage
    .from(BUCKET)
    .upload(roomKeyPath, roomKey, { contentType: roomKey.type || "image/jpeg" });

  const failedPassport = passportUploads.some((u) => u.error);
  if (failedPassport || keyUpload.error) {
    // Clean up whatever DID make it, so a half-failed check-in doesn't
    // leave orphaned photos behind.
    const uploadedPassportPaths = passportPaths.filter((_, i) => !passportUploads[i].error);
    await admin.storage
      .from(BUCKET)
      .remove([...uploadedPassportPaths, ...(!keyUpload.error ? [roomKeyPath] : [])]);
    const firstError = passportUploads.find((u) => u.error)?.error ?? keyUpload.error;
    return { ok: false, error: firstError!.message };
  }

  const { error: insertError } = await admin.from("hostel_stays").insert({
    org_id: guard.orgId,
    branch_id: branchId,
    guest_name: guestName,
    room_type: roomType,
    room_number: roomNumber,
    bed_number: bedNumber,
    booking_source: bookingSource,
    payment_method: paymentMethod,
    amount_thb: amountThb,
    expected_checkout_date: expectedCheckoutDate,
    notes,
    notes_updated_by: notes ? guard.fullName : null,
    notes_updated_at: notes ? new Date().toISOString() : null,
    passport_photo_paths: passportPaths,
    room_key_photo_path: roomKeyPath,
    checked_in_employee_id: guard.employeeId,
    checked_in_employee_name: guard.fullName,
  });

  if (insertError) {
    await admin.storage.from(BUCKET).remove([...passportPaths, roomKeyPath]);
    return { ok: false, error: insertError.message };
  }

  void notifyManagers({
    orgId: guard.orgId,
    kind: "hostel_checkin",
    title: `${guard.fullName} checked in a guest`,
    body: `${roomType === "dorm" ? `Room ${roomNumber}, bed ${bedNumber}` : `Room ${roomNumber}`}${
      guestName ? ` — ${guestName}` : ""
    }`,
    link: "/hostel",
  });

  revalidatePath("/clock");
  revalidatePath("/hostel");
  return { ok: true };
}

/** Mark a guest as checked out — whoever's at the desk when they leave, not necessarily who checked them in. */
export async function checkOutGuest(stayId: string): Promise<Result> {
  const guard = await requireEmployee("clock.checkOutGuest");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: stay } = await admin
    .from("hostel_stays")
    .select("id, org_id, checked_out_at")
    .eq("id", stayId)
    .maybeSingle();

  if (!stay || stay.org_id !== guard.orgId) return { ok: false, error: "Guest record not found." };
  if (stay.checked_out_at) return { ok: false, error: "Already checked out." };

  const { error } = await admin
    .from("hostel_stays")
    .update({
      checked_out_at: new Date().toISOString(),
      checked_out_employee_id: guard.employeeId,
      checked_out_employee_name: guard.fullName,
    })
    .eq("id", stayId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clock");
  revalidatePath("/hostel");
  return { ok: true };
}

/**
 * The one field both staff and management can edit any time, not just at
 * check-in — "has a dog", "late arrival ~11pm", any guest request or fact
 * the next shift needs without a phone call. Blank clears it.
 */
export async function updateHostelStayNote(stayId: string, note: string): Promise<Result> {
  const guard = await requireEmployeeOrManager("hostel.updateNote");
  if (!guard.ok) return { ok: false, error: guard.error };

  const trimmed = note.trim().slice(0, 1000);

  const admin = createAdminClient();
  const { data: stay } = await admin
    .from("hostel_stays")
    .select("id")
    .eq("id", stayId)
    .eq("org_id", guard.orgId)
    .maybeSingle();
  if (!stay) return { ok: false, error: "Guest record not found." };

  const { error } = await admin
    .from("hostel_stays")
    .update({
      notes: trimmed || null,
      notes_updated_by: trimmed ? guard.actorName : null,
      notes_updated_at: trimmed ? new Date().toISOString() : null,
    })
    .eq("id", stayId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clock");
  revalidatePath("/hostel");
  return { ok: true };
}

export type HostelStayExtension = {
  id: string;
  previousExpectedCheckoutDate: string | null;
  newExpectedCheckoutDate: string | null;
  nights: number | null;
  amountThb: number | null;
  paymentMethod: PaymentMethod | null;
  recordedByName: string;
  createdAt: string;
};

/**
 * Change the planned check-out date on a stay that's still in-house — a
 * guest extending (or cutting short) their stay after check-in. Refuses
 * once they've actually checked out; that date is history at that point.
 *
 * If the extra nights were paid for, that payment is logged as its own
 * row (amount + cash/OTA collect) rather than overwriting the original
 * booking's payment_method — an OTA booking extended and paid in cash at
 * the desk still shows "OTA collected" for the original stay and "Cash"
 * for the extension, separately.
 */
export async function extendHostelStay(input: {
  stayId: string;
  newExpectedCheckoutDate: string;
  amountThb?: number | null;
  paymentMethod?: PaymentMethod | null;
}): Promise<Result> {
  const guard = await requireEmployeeOrManager("hostel.extendStay");
  if (!guard.ok) return { ok: false, error: guard.error };

  const newDate = input.newExpectedCheckoutDate.trim();
  if (newDate && !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { ok: false, error: "That checkout date doesn't look right." };
  }

  const admin = createAdminClient();
  const { data: stay } = await admin
    .from("hostel_stays")
    .select("id, branch_id, checked_out_at, expected_checkout_date")
    .eq("id", input.stayId)
    .eq("org_id", guard.orgId)
    .maybeSingle();
  if (!stay) return { ok: false, error: "Guest record not found." };
  if (stay.checked_out_at) return { ok: false, error: "Already checked out." };

  const charged = input.amountThb != null && Number.isFinite(input.amountThb) && input.amountThb > 0;
  if (charged) {
    if (!input.paymentMethod || !PAYMENT_METHODS.has(input.paymentMethod)) {
      return { ok: false, error: "Choose how the extra nights were paid." };
    }
  }

  const { error: updateError } = await admin
    .from("hostel_stays")
    .update({ expected_checkout_date: newDate || null })
    .eq("id", input.stayId);
  if (updateError) return { ok: false, error: updateError.message };

  if (charged) {
    let nights: number | null = null;
    if (stay.expected_checkout_date && newDate) {
      const prev = new Date(stay.expected_checkout_date + "T00:00:00");
      const next = new Date(newDate + "T00:00:00");
      const diffDays = Math.round((next.getTime() - prev.getTime()) / 86400000);
      nights = diffDays > 0 ? diffDays : null;
    }
    const { error: extError } = await admin.from("hostel_stay_extensions").insert({
      org_id: guard.orgId,
      branch_id: stay.branch_id,
      stay_id: input.stayId,
      previous_expected_checkout_date: stay.expected_checkout_date,
      new_expected_checkout_date: newDate || null,
      nights,
      amount_thb: input.amountThb,
      payment_method: input.paymentMethod,
      recorded_by_name: guard.actorName,
    });
    if (extError) return { ok: false, error: extError.message };
  }

  revalidatePath("/clock");
  revalidatePath("/hostel");
  return { ok: true };
}

/**
 * Batch-load extension payments for a page of stays in one query, keyed by
 * stay id -- same "one query, not N" shape as the signed-URL fetches below.
 */
async function fetchExtensionsByStay(
  admin: ReturnType<typeof createAdminClient>,
  stayIds: string[]
): Promise<Map<string, HostelStayExtension[]>> {
  const map = new Map<string, HostelStayExtension[]>();
  if (stayIds.length === 0) return map;

  const { data: rows } = await admin
    .from("hostel_stay_extensions")
    .select(
      "id, stay_id, previous_expected_checkout_date, new_expected_checkout_date, nights, amount_thb, payment_method, recorded_by_name, created_at"
    )
    .in("stay_id", stayIds)
    .order("created_at", { ascending: false });

  for (const r of rows ?? []) {
    const stayId = r.stay_id as string;
    const list = map.get(stayId) ?? [];
    list.push({
      id: r.id as string,
      previousExpectedCheckoutDate: r.previous_expected_checkout_date as string | null,
      newExpectedCheckoutDate: r.new_expected_checkout_date as string | null,
      nights: r.nights as number | null,
      amountThb: r.amount_thb != null ? Number(r.amount_thb) : null,
      paymentMethod: r.payment_method as PaymentMethod | null,
      recordedByName: r.recorded_by_name as string,
      createdAt: r.created_at as string,
    });
    map.set(stayId, list);
  }
  return map;
}

export type MyBranchHostelStay = {
  id: string;
  guestName: string | null;
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
};

/**
 * The hostel log for the CURRENT staff member's own branch — currently
 * checked-in guests plus recent history, so the desk can hand off a shift
 * without a call: who's in which room, and who's already left.
 */
export async function listMyBranchHostelStays(): Promise<MyBranchHostelStay[] | { error: string }> {
  const guard = await requireEmployee("clock.listHostelStays");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const branchId = await resolveWorkingBranch(guard.employeeId, guard.branchId);

  const { data: rows, error } = await admin
    .from("hostel_stays")
    .select(
      "id, guest_name, room_type, room_number, bed_number, booking_source, payment_method, amount_thb, expected_checkout_date, notes, notes_updated_by, notes_updated_at, passport_photo_paths, room_key_photo_path, checked_in_at, checked_in_employee_name, checked_out_at, checked_out_employee_name"
    )
    .eq("org_id", guard.orgId)
    .eq("branch_id", branchId)
    .order("checked_in_at", { ascending: false })
    .limit(60);

  if (error || !rows) return { error: error?.message ?? "Could not load the hostel log." };

  const extensionsByStay = await fetchExtensionsByStay(admin, rows.map((r) => r.id as string));

  // HostelStayRow never renders these as <img src> -- it only reads
  // .length / truthiness to decide how many "view photo" buttons to show,
  // then calls refreshHostelPhotoUrl to sign a fresh URL at the moment
  // someone actually taps one (see openPhoto() there). Signing every photo
  // of every stay here too was pure waste: up to ~60 stays x a few photos
  // each = a hundred-plus Supabase Storage calls, on every load of this
  // page, for values nothing ever displayed. The stored paths themselves
  // are non-null strings, so they satisfy the same string[] / string|null
  // shape without touching Storage at all.
  return rows.map((r): MyBranchHostelStay => {
    const passportPaths = (r.passport_photo_paths as string[] | null) ?? [];
    return {
      id: r.id as string,
      guestName: r.guest_name as string | null,
      roomType: r.room_type as RoomType,
      roomNumber: r.room_number as string,
      bedNumber: r.bed_number as string | null,
      bookingSource: r.booking_source as BookingSource,
      paymentMethod: r.payment_method as PaymentMethod,
      amountThb: r.amount_thb != null ? Number(r.amount_thb) : null,
      expectedCheckoutDate: r.expected_checkout_date as string | null,
      notes: r.notes as string | null,
      notesUpdatedByName: r.notes_updated_by as string | null,
      notesUpdatedAt: r.notes_updated_at as string | null,
      checkedInAt: r.checked_in_at as string,
      checkedInEmployeeName: r.checked_in_employee_name as string,
      checkedOutAt: r.checked_out_at as string | null,
      checkedOutEmployeeName: r.checked_out_employee_name as string | null,
      passportPhotoUrls: passportPaths,
      roomKeyPhotoUrl: (r.room_key_photo_path as string | null) ?? null,
      extensions: extensionsByStay.get(r.id as string) ?? [],
    };
  });
}

export type PhotoKind = "passport" | "key";

/**
 * Re-sign one photo's URL right now, on click, instead of relying on the
 * one baked into the page at render time. The clock and hostel pages sit
 * open for a whole shift, far longer than SIGNED_URL_TTL (10 min), so a
 * stale link fails with Supabase's "exp claim timestamp check failed" the
 * moment someone actually taps it hours later. This is called from the
 * click handler itself, so the URL handed back is always fresh.
 */
export async function refreshHostelPhotoUrl(
  stayId: string,
  kind: PhotoKind,
  index = 0
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const guard = await requireEmployeeOrManager("clock.refreshHostelPhotoUrl");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: stay, error } = await admin
    .from("hostel_stays")
    .select("passport_photo_paths, room_key_photo_path")
    .eq("id", stayId)
    .eq("org_id", guard.orgId)
    .maybeSingle();

  if (error || !stay) return { ok: false, error: "Could not find that stay." };

  const path =
    kind === "key"
      ? (stay.room_key_photo_path as string | null)
      : ((stay.passport_photo_paths as string[] | null) ?? [])[index];

  if (!path) return { ok: false, error: "That photo is missing." };

  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !signed?.signedUrl) return { ok: false, error: "Could not open that photo right now." };

  return { ok: true, url: signed.signedUrl };
}
