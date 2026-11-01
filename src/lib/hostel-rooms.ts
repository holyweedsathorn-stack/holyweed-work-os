/**
 * Holy Hostel's actual room inventory — private rooms 202, 302, 402, 501,
 * and two dorms: 201 (8 beds) and 401 (6 beds). Kept in one place so the
 * check-in form's dropdown and the server-side validation in
 * checkInGuest() can never disagree about which rooms exist, which are
 * dorms, or how many beds a dorm has.
 */

export type HostelRoomType = "private" | "dorm";

export type HostelRoom = {
  number: string;
  type: HostelRoomType;
  beds?: number; // only set for a dorm
};

export const HOSTEL_ROOMS: HostelRoom[] = [
  { number: "201", type: "dorm", beds: 8 },
  { number: "202", type: "private" },
  { number: "302", type: "private" },
  { number: "401", type: "dorm", beds: 6 },
  { number: "402", type: "private" },
  { number: "501", type: "private" },
];

export function findHostelRoom(roomNumber: string): HostelRoom | undefined {
  return HOSTEL_ROOMS.find((r) => r.number === roomNumber);
}

// PMS channel key -> hostel log booking source / payment method
const SOURCE_BY_CHANNEL: Record<string, "booking_com" | "agoda" | "airbnb" | "hostelworld" | "expedia" | "trip_com" | "direct"> = {
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

/** The hostel log's booking source for a PMS channel ("" when the booking has none). */
export function sourceForPmsChannel(channel: string) {
  return SOURCE_BY_CHANNEL[channel] ?? (channel ? ("other" as const) : ("" as const));
}

/** How a PMS booking is paid, as the hostel log records it: the booking site for OTA channels, else cash. */
export function paymentForPmsChannel(channel: string): "ota_collect" | "cash" {
  return OTA_CHANNELS.has(channel) ? "ota_collect" : "cash";
}

/**
 * Match a PMS unit ("Room 202", or "Dorm 201 · Bed 3") to this room list by
 * its room number (and bed number for a dorm bed). No match gives an empty
 * roomNumber; a dorm bed number outside the dorm's beds gives an empty
 * bedNumber.
 */
export function roomForPmsUnit(unit: { group: string; name: string }): { room: HostelRoom | null; roomNumber: string; bedNumber: string } {
  const text = `${unit.group} ${unit.name}`;
  const room = HOSTEL_ROOMS.find((r) => new RegExp(`(^|\\D)${r.number}(\\D|$)`).test(text));
  if (!room) return { room: null, roomNumber: "", bedNumber: "" };
  if (room.type !== "dorm") return { room, roomNumber: room.number, bedNumber: "" };
  const bed = Number(unit.name.match(/bed\s*(\d+)/i)?.[1] ?? unit.name.match(/^\D*(\d{1,2})\D*$/)?.[1]);
  return { room, roomNumber: room.number, bedNumber: bed >= 1 && bed <= (room.beds ?? 0) ? String(bed) : "" };
}
