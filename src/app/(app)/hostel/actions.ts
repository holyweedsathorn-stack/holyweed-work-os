"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BookingSource, HostelStayExtension, PaymentMethod, RoomType } from "@/app/clock/hostel-actions";

const BUCKET = "hostel-checkins";
const SIGNED_URL_TTL = 60 * 10;

export type HostelStay = {
  id: string;
  guestName: string | null;
  branchName: string;
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
  pmsRef: string | null;
  pmsSyncError: string | null;
  extensions: HostelStayExtension[];
};

/**
 * Batch-load extension payments for a page of stays in one query, keyed by
 * stay id. Mirrors the private helper of the same name in
 * clock/hostel-actions.ts -- kept as its own small copy here rather than a
 * shared export, since exporting a function that takes an admin client
 * (not JSON-serializable) out of a "use server" file is asking for trouble.
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

/** Every guest stay, newest check-in first — currently in the building and history alike. */
export async function listHostelStays(): Promise<HostelStay[] | { error: string }> {
  const guard = await requireManager("hostel.list");
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const [{ data: rows, error }, { data: branches }] = await Promise.all([
    admin
      .from("hostel_stays")
      .select(
        "id, guest_name, branch_id, room_type, room_number, bed_number, booking_source, payment_method, amount_thb, expected_checkout_date, notes, notes_updated_by, notes_updated_at, passport_photo_paths, room_key_photo_path, checked_in_at, checked_in_employee_name, checked_out_at, checked_out_employee_name, pms_ref, pms_sync_error"
      )
      .eq("org_id", guard.orgId)
      .order("checked_in_at", { ascending: false })
      .limit(300),
    admin.from("branches").select("id, name").eq("org_id", guard.orgId),
  ]);

  if (error || !rows) return { error: error?.message ?? "Could not load the hostel log." };

  const branchById = new Map((branches ?? []).map((b) => [b.id as string, b.name as string]));
  const extensionsByStay = await fetchExtensionsByStay(admin, rows.map((r) => r.id as string));

  // Same reasoning as the clock-screen version of this list (see
  // clock/hostel-actions.ts): HostelStayRow only reads .length / truthiness
  // on these two fields to decide how many "view photo" buttons to render,
  // then signs a fresh URL on click via refreshHostelPhotoUrl. This page
  // pulls up to 300 stays, so eagerly signing every photo of every one of
  // them here was several hundred unused Supabase Storage calls blocking
  // every single page load. The stored paths are non-null strings, so they
  // satisfy the same shape with no Storage calls at all.
  return rows.map((r): HostelStay => {
    const passportPaths = (r.passport_photo_paths as string[] | null) ?? [];
    return {
      id: r.id as string,
      guestName: r.guest_name as string | null,
      branchName: branchById.get(r.branch_id as string) ?? "—",
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
      pmsRef: r.pms_ref as string | null,
      pmsSyncError: r.pms_sync_error as string | null,
    };
  });
}

/** Remove a mistaken entry (wrong room, test data, duplicate) — managers only, same pattern as the currency log. */
export async function deleteHostelStay(id: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireManager("hostel.delete");
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: stay } = await admin
    .from("hostel_stays")
    .select("passport_photo_paths, room_key_photo_path")
    .eq("id", id)
    .eq("org_id", guard.orgId)
    .maybeSingle();

  const { error } = await admin.from("hostel_stays").delete().eq("id", id).eq("org_id", guard.orgId);
  if (error) return { ok: false, error: error.message };

  if (stay) {
    const passportPaths = (stay.passport_photo_paths as string[] | null) ?? [];
    await admin.storage.from(BUCKET).remove([...passportPaths, stay.room_key_photo_path as string]);
  }

  revalidatePath("/hostel");
  return { ok: true };
}
