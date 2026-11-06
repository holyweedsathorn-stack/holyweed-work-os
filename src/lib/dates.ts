/**
 * Every date shown in Work OS is dd/mm/yyyy (owner's rule). Timestamps are shown in
 * Bangkok time. A plain "YYYY-MM-DD" is a calendar date and is rearranged as-is, so it
 * never shifts a day because of the server's or the phone's timezone.
 */
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function bkkParts(v: string | Date) {
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return p as Record<string, string>;
}

/** "05/11/2026". Accepts "YYYY-MM-DD", an ISO timestamp or a Date. */
export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (typeof v === "string") {
    const m = ISO_DAY.exec(v);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const p = bkkParts(v);
  return p ? `${p.day}/${p.month}/${p.year}` : "";
}

/** "05/11/2026 14:05" in Bangkok time. */
export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "";
  const p = bkkParts(v);
  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : "";
}

/** "Thu 05/11/2026", or "Thursday 05/11/2026" with long = true. */
export function fmtWeekdayDate(v: string | Date | null | undefined, long = false): string {
  if (!v) return "";
  const day = fmtDate(v);
  if (!day) return "";
  const at = typeof v === "string" && ISO_DAY.test(v) ? new Date(v + "T12:00:00+07:00") : new Date(v);
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", weekday: long ? "long" : "short" }).format(at);
  return `${wd} ${day}`;
}
