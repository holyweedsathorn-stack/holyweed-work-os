import type { createAdminClient } from "@/lib/supabase/admin";
import { pmsBookingStatuses } from "@/lib/pms";

const BUCKET = "hostel-checkins";
const CANCELLED = new Set(["cancelled", "void"]);

type StayRow = {
  id: unknown;
  pms_booking_id?: unknown;
  passport_photo_paths?: unknown;
  room_key_photo_path?: unknown;
};

/**
 * Take guests off the hostel log once their booking is cancelled in the
 * PMS: the entry and its passport / room key photos are deleted, the same
 * as a manager pressing Delete on /hostel. Called while loading the log,
 * so a cancellation shows up the next time anyone looks.
 *
 * Only stays linked to a PMS booking are checked. If the PMS can't be
 * reached (or the link isn't set up), nothing is removed. Server-side
 * only: it uses the admin client and the PMS secret.
 *
 * @returns ids of the stays that were removed, to drop from the list.
 */
export async function removeCancelledPmsStays(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  rows: StayRow[]
): Promise<Set<string>> {
  const removed = new Set<string>();
  const linked = rows.filter((r) => typeof r.pms_booking_id === "string" && r.pms_booking_id);
  if (linked.length === 0) return removed;

  const pms = await pmsBookingStatuses([...new Set(linked.map((r) => r.pms_booking_id as string))]);
  if (!pms.ok) return removed;

  const gone = linked.filter((r) => CANCELLED.has(pms.statuses[r.pms_booking_id as string] ?? ""));
  if (gone.length === 0) return removed;

  const { error } = await admin
    .from("hostel_stays")
    .delete()
    .eq("org_id", orgId)
    .in(
      "id",
      gone.map((r) => r.id as string)
    );
  if (error) return removed;

  const photos = gone.flatMap((r) => [
    ...(((r.passport_photo_paths as string[] | null) ?? []) as string[]),
    ...(r.room_key_photo_path ? [r.room_key_photo_path as string] : []),
  ]);
  if (photos.length) await admin.storage.from(BUCKET).remove(photos);

  for (const r of gone) removed.add(r.id as string);
  return removed;
}
