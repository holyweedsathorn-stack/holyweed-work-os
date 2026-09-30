export type Branch = {
  id: string;
  org_id: string;
  name: string;
  slug: "sathorn" | "sukhumvit";
  /** Reference point for the clock-in check. Null = no check on this branch. */
  lat?: number | null;
  lng?: number | null;
  geofence_m?: number;
  location_set_at?: string | null;
};

export type Employee = {
  id: string;
  org_id: string;
  branch_id: string;
  full_name: string;
  role_title: string;
  phone: string | null;
  active: boolean;
  /** @deprecated live status now comes from open time_entries */
  status?: "on" | "break" | "off";
  /** @deprecated unused since the time clock was added */
  current_task?: string | null;
  /** @deprecated use time_entries.clock_in */
  clocked_in_at?: string | null;
};

export type Shift = {
  id: string;
  employee_id: string;
  branch_id: string;
  shift_date: string;
  shift_type: "open" | "mid" | "close";
};

export type ActivityLogEntry = {
  id: string;
  employee_id: string;
  branch_id: string;
  occurred_at: string;
  kind: "sale" | "ops" | "stock" | "alert";
  message: string;
  employee?: { full_name: string };
};

export type Alert = {
  id: string;
  branch_id: string | null;
  severity: "warning" | "critical";
  title: string;
  sub: string | null;
};

export type SalesDay = {
  branch_id: string;
  sale_date: string;
  revenue: number;
};

export type MonthlyFinance = {
  month: string;
  revenue: number;
  expenses: number;
};

export type Expense = {
  category: string;
  amount: number;
};

export type ProductSale = {
  name: string;
  category: string;
  units: number;
  revenue: number;
};

export type Project = {
  id: string;
  title: string;
  branch_id: string | null;
  due_date: string;
  priority: "low" | "med" | "high";
  status: "todo" | "inprogress" | "review" | "done";
  assignee?: { full_name: string } | null;
};

export type AppUser = {
  id: string;
  org_id: string;
  full_name: string;
  role: "owner" | "manager" | "staff";
  employee_id: string | null;
};

export type TimeEntry = {
  id: string;
  org_id: string;
  employee_id: string;
  branch_id: string;
  clock_in: string;
  clock_out: string | null;
  employee?: { full_name: string; role_title: string } | null;
};

/** Milliseconds between clock-in and clock-out (or now, if still open). */
export function entryDurationMs(e: Pick<TimeEntry, "clock_in" | "clock_out">, now = Date.now()) {
  const start = new Date(e.clock_in).getTime();
  const end = e.clock_out ? new Date(e.clock_out).getTime() : now;
  return Math.max(0, end - start);
}

/** "7h 24m" */
export function fmtDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Decimal hours, rounded to 2dp — for payroll totals. */
export function toDecimalHours(ms: number) {
  return Math.round((ms / 3600000) * 100) / 100;
}

export function fmtTimeBKK(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

export function fmtDateBKK(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
  });
}

export const BRANCH_COLOR: Record<string, string> = {
  sathorn: "var(--sathorn)",
  sukhumvit: "var(--sukhumvit)",
};

export function fmtTHB(n: number) {
  return "฿" + Math.round(n).toLocaleString("en-US");
}
export function fmtTHBk(n: number) {
  return "฿" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
}
export function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("");
}

/**
 * Today in Bangkok as YYYY-MM-DD.
 *
 * Never build a date by calling setDate()/setMonth() and then toISOString():
 * the setters work in the server's local timezone while toISOString() converts
 * to UTC, so on a server running ahead of UTC "the 1st of this month" lands on
 * the last day of the previous month. Formatting an explicit timezone avoids
 * the round trip entirely.
 */
export function bangkokToday(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "2026-08" — the current month in Bangkok. */
export function bangkokMonth(now: Date = new Date()) {
  return bangkokToday(now).slice(0, 7);
}

/** N days before today, as YYYY-MM-DD in Bangkok. */
export function bangkokDaysAgo(days: number, now: Date = new Date()) {
  return bangkokToday(new Date(now.getTime() - days * 86400000));
}

/** Monday of the current Bangkok week, as YYYY-MM-DD. */
export function bangkokWeekStart(now: Date = new Date()) {
  const today = bangkokToday(now);
  const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Add N days to a YYYY-MM-DD string, safely. */
export function addDays(isoDate: string, days: number) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Approvals & the access log (migration 0012)
// ---------------------------------------------------------------------------

export type ApprovalKind =
  | "shift_swap"
  | "leave"
  | "expense"
  | "discount"
  | "write_off"
  | "maintenance"
  | "other";

export type ApprovalStatus = "pending" | "approved" | "denied" | "cancelled";

export type Approval = {
  id: string;
  org_id: string;
  branch_id: string | null;
  requested_by: string;
  kind: ApprovalKind;
  title: string;
  note: string | null;
  amount: number | null;
  ref_date: string | null;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  requester?: { full_name: string; role_title: string } | null;
  completed_at: string | null;
  completed_by_name: string | null;
  completion_note: string | null;
  completion_photo_path: string | null;
  request_photo_path: string | null;
};

export type RefusalReason =
  | "not_signed_in"
  | "not_manager"
  | "wrong_employee"
  | "expired_token"
  | "used_token"
  | "wrong_location"
  | "other";

export type Refusal = {
  id: string;
  actor_label: string;
  action: string;
  reason: RefusalReason;
  detail: string | null;
  occurred_at: string;
};

/**
 * What each kind of request asks for. `amount` and `date` decide which of the
 * two nullable columns the form fills in — which is why the table needs no
 * catch-all payload column.
 */
export const APPROVAL_KINDS: {
  id: ApprovalKind;
  label: string;
  what: string;
  hint: string;
  amount: boolean;
  date: boolean;
}[] = [
  { id: "leave", label: "Leave", what: "Which day off", hint: "Friday off", amount: false, date: true },
  { id: "shift_swap", label: "Shift swap", what: "Swap what", hint: "Sat close with Mint", amount: false, date: true },
  { id: "expense", label: "Expense", what: "What for", hint: "Replacement grinder", amount: true, date: false },
  { id: "write_off", label: "Write-off", what: "What happened", hint: "3 jars damaged in transit", amount: true, date: false },
  { id: "discount", label: "Discount", what: "For whom", hint: "Staff discount", amount: true, date: false },
  { id: "maintenance", label: "Maintenance", what: "What's broken", hint: "AC not cooling upstairs", amount: false, date: false },
  { id: "other", label: "Something else", what: "What do you need", hint: "", amount: false, date: false },
];

export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = Object.fromEntries(
  APPROVAL_KINDS.map((k) => [k.id, k.label])
) as Record<ApprovalKind, string>;

export const REFUSAL_REASON_LABEL: Record<RefusalReason, string> = {
  not_signed_in: "Not signed in",
  not_manager: "Not a manager",
  wrong_employee: "No employee record",
  expired_token: "Invite expired",
  used_token: "Invite already used",
  wrong_location: "Away from the shop",
  other: "Other",
};

/** "2 days ago", "yesterday", "just now" — relative to Bangkok wall time. */
export function fmtAgo(iso: string, now: Date = new Date()) {
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return fmtDateBKK(iso);
}
