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
