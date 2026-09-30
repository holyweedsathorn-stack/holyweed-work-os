/**
 * Shift arithmetic for a shop that never closes.
 *
 * Two of the three shifts cross midnight, so a shift is NOT a calendar day.
 * It is an instant plus a duration, anchored to the date it starts: the shift
 * beginning 01:00 on Tuesday belongs to Tuesday, and the Close shift that
 * starts 17:00 Monday is still Monday's shift when it ends at 02:00 Tuesday.
 *
 * Bangkok is UTC+7 all year with no daylight saving, so a fixed offset is
 * exact here — no timezone library, and no chance of the "setDate() then
 * toISOString()" bug the date helpers in types.ts warn about.
 */

export const BKK_OFFSET = "+07:00";

export type ShiftCode = "open" | "mid" | "close";

export type ShiftType = {
  id: string;
  branch_id: string | null;
  code: ShiftCode;
  label: string;
  /** "09:00:00" as Postgres returns a `time`. */
  start_time: string;
  duration_minutes: number;
  sort_order: number;
  active: boolean;
};

export type ShiftRequirement = {
  branch_id: string;
  code: ShiftCode;
  required_staff: number;
};

/** "09:00:00" or "09:00" -> "09:00". */
export function hhmm(time: string) {
  return time.slice(0, 5);
}

/** The exact instants a shift on `date` runs between. */
export function shiftWindow(date: string, type: Pick<ShiftType, "start_time" | "duration_minutes">) {
  const startsAt = new Date(`${date}T${hhmm(type.start_time)}:00${BKK_OFFSET}`);
  const endsAt = new Date(startsAt.getTime() + type.duration_minutes * 60000);
  return { startsAt, endsAt };
}

/** Does this shift run past midnight into the next calendar day? */
export function crossesMidnight(type: Pick<ShiftType, "start_time" | "duration_minutes">) {
  const [h, m] = hhmm(type.start_time).split(":").map(Number);
  return h * 60 + m + type.duration_minutes > 24 * 60;
}

/** "17:00 – 02:00 +1" — the +1 is the whole point, so it is never hidden. */
export function shiftRangeLabel(type: Pick<ShiftType, "start_time" | "duration_minutes">) {
  const [h, m] = hhmm(type.start_time).split(":").map(Number);
  const endMins = (h * 60 + m + type.duration_minutes) % (24 * 60);
  const end = `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`;
  return `${hhmm(type.start_time)}–${end}${crossesMidnight(type) ? " +1" : ""}`;
}

/** Hours a shift is worth, for coverage and rough cost maths. */
export function shiftHours(type: Pick<ShiftType, "duration_minutes">) {
  return Math.round((type.duration_minutes / 60) * 10) / 10;
}

export type AssignedShift = {
  shift_date: string;
  shift_type: ShiftCode;
  branch_id: string;
};

/**
 * Which of someone's rostered shifts is running right now.
 *
 * This is what `/clock` must ask instead of "what shift has today's date" —
 * at 00:30 the Close worker's shift is dated yesterday, and asking by date
 * finds nothing, which is how they ended up being shown every checklist item
 * in the app at half past midnight.
 *
 * Callers pass shifts for a window that includes yesterday, since a shift
 * starting yesterday can still be running now.
 */
export function activeShift<T extends AssignedShift>(
  shifts: T[],
  types: ShiftType[],
  now: Date = new Date()
): T | null {
  const t = now.getTime();
  for (const s of shifts) {
    const type = typeFor(types, s.shift_type, s.branch_id);
    if (!type) continue;
    const { startsAt, endsAt } = shiftWindow(s.shift_date, type);
    if (t >= startsAt.getTime() && t < endsAt.getTime()) return s;
  }
  return null;
}

/**
 * The next shift someone is due on, ignoring one already running.
 * Used for "you're next on Saturday" when they aren't working now.
 */
export function nextShift<T extends AssignedShift>(
  shifts: T[],
  types: ShiftType[],
  now: Date = new Date()
): T | null {
  const t = now.getTime();
  let best: { s: T; at: number } | null = null;
  for (const s of shifts) {
    const type = typeFor(types, s.shift_type, s.branch_id);
    if (!type) continue;
    const at = shiftWindow(s.shift_date, type).startsAt.getTime();
    if (at > t && (!best || at < best.at)) best = { s, at };
  }
  return best?.s ?? null;
}

/** A branch-specific definition wins over the org-wide one. */
export function typeFor(types: ShiftType[], code: ShiftCode, branchId: string | null) {
  return (
    types.find((t) => t.code === code && t.branch_id === branchId) ??
    types.find((t) => t.code === code && t.branch_id === null) ??
    null
  );
}

/** Sorted, for rendering a column per shift. */
export function orderedTypes(types: ShiftType[], branchId: string | null = null) {
  const codes: ShiftCode[] = ["open", "mid", "close"];
  return codes
    .map((c) => typeFor(types, c, branchId))
    .filter((t): t is ShiftType => !!t && t.active)
    .sort((a, b) => a.sort_order - b.sort_order);
}
