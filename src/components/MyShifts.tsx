import { addDays, fmtDateBKK, type Branch } from "@/lib/types";
import { shiftRangeLabel, typeFor, type ShiftCode, type ShiftType } from "@/lib/shifts";

const DAY_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Row = { shift_date: string; shift_type: ShiftCode; branch_id: string };

/**
 * "Am I working Saturday?" — answered without anyone having to ask the owner.
 *
 * Seven days from today. A shift is listed under the day it starts, so the
 * Close shift beginning 17:00 Monday appears on Monday even though it runs to
 * 02:00 Tuesday; the +1 on the time range makes that unambiguous.
 */
export function MyShifts({
  shifts,
  types,
  branches,
  today,
}: {
  shifts: Row[];
  types: ShiftType[];
  branches: Branch[];
  today: string;
}) {
  const branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const byDate = new Map(shifts.map((s) => [s.shift_date, s]));
  const working = days.filter((d) => byDate.has(d)).length;

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <h2 className="font-display text-[15px] font-semibold">Your next 7 days</h2>
        <span className="text-[12px] text-inkMuted">
          {working === 0 ? "nothing rostered" : `${working} shift${working === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="flex flex-col">
        {days.map((date, i) => {
          const s = byDate.get(date);
          const t = s ? typeFor(types, s.shift_type, s.branch_id) : null;
          const b = s ? branchById[s.branch_id] : null;
          const isToday = i === 0;
          const dow = DAY_NAME[new Date(date + "T00:00:00Z").getUTCDay()];

          return (
            <div
              key={date}
              className="flex items-center gap-3 py-2.5"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
            >
              <div style={{ minWidth: 62 }}>
                <div
                  className="text-[12.5px] font-semibold"
                  style={{ color: isToday ? "var(--accent)" : "var(--ink)" }}
                >
                  {isToday ? "Today" : dow}
                </div>
                <div className="text-[11px] text-inkMuted num">{fmtDateBKK(date)}</div>
              </div>

              {t && b ? (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold">{t.label}</div>
                    <div className="text-[11.5px] text-inkMuted num">{shiftRangeLabel(t)}</div>
                  </div>
                  <span
                    className="chip flex-none"
                    style={{
                      background: `var(--${b.slug}-soft)`,
                      color: `var(--${b.slug})`,
                    }}
                  >
                    {b.name}
                  </span>
                </>
              ) : (
                <div className="flex-1 text-[13px] text-inkMuted">Off</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
