"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setShift } from "@/app/(app)/schedule/actions";
import { initials, type Branch, type Employee } from "@/lib/types";
import {
  orderedTypes,
  shiftRangeLabel,
  typeFor,
  type ShiftCode,
  type ShiftRequirement,
  type ShiftType,
} from "@/lib/shifts";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Row = { employee_id: string; shift_date: string; shift_type: ShiftCode; branch_id: string };
type Cell = { code: ShiftCode; branchId: string } | null;

/**
 * The roster grid. Tapping a cell opens a picker: which shift, and which shop.
 *
 * A picker rather than tap-to-cycle because the branch belongs to the shift —
 * three shifts across two branches is seven states, and cycling through seven
 * to clear a cell is worse than one extra tap. It also has to be a centred
 * modal rather than a popover: the table sits inside `overflow-x-auto`, which
 * would clip anything positioned against a cell.
 *
 * Writes are optimistic. Every one is a round trip to Tokyo and a roster is
 * thirty of them in a row.
 */
export function ScheduleGrid({
  employees,
  branches,
  shifts,
  types,
  weekDates,
  today,
  requirements,
}: {
  employees: Employee[];
  branches: Branch[];
  shifts: Row[];
  types: ShiftType[];
  weekDates: string[];
  today: string;
  requirements: ShiftRequirement[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<Record<string, Cell>>({});
  const [picking, setPicking] = useState<{ empId: string; date: string } | null>(null);

  const branchById = Object.fromEntries(branches.map((b) => [b.id, b]));

  // Server data is a fresh array each render, so reset optimistic state
  // against its CONTENT, not its identity.
  const signature = useMemo(
    () =>
      shifts
        .map((s) => `${s.employee_id}${s.shift_date}${s.shift_type}${s.branch_id}`)
        .sort()
        .join("|"),
    [shifts]
  );
  useEffect(() => setOver({}), [signature]);

  const assigned = useMemo(() => {
    const m: Record<string, Cell> = {};
    for (const s of shifts) {
      m[`${s.employee_id}:${s.shift_date}`] = { code: s.shift_type, branchId: s.branch_id };
    }
    return m;
  }, [shifts]);

  function current(empId: string, date: string): Cell {
    const key = `${empId}:${date}`;
    return key in over ? over[key] : (assigned[key] ?? null);
  }

  function apply(empId: string, date: string, next: Cell) {
    const key = `${empId}:${date}`;
    setError(null);
    setPicking(null);
    setOver((o) => ({ ...o, [key]: next }));

    start(async () => {
      const res = await setShift(empId, date, next?.code ?? null, next?.branchId);
      if (!res.ok) {
        setError(res.error);
        setOver((o) => {
          const { [key]: _drop, ...rest } = o;
          return rest;
        });
        return;
      }
      router.refresh();
    });
  }

  const picked = picking ? current(picking.empId, picking.date) : null;
  const pickedEmp = picking ? employees.find((e) => e.id === picking.empId) : null;

  /**
   * How many OTHER people are on this branch + shift + day, and how many are
   * needed. Excludes the person being edited, so the number answers "what is
   * there without them" — which is the question when you are moving someone
   * to cover a sick shift somewhere else.
   */
  function cover(branchId: string, code: ShiftCode, date: string, exceptEmpId: string) {
    const on = employees.filter((e) => {
      if (e.id === exceptEmpId) return false;
      const c = current(e.id, date);
      return c?.code === code && c.branchId === branchId;
    });
    const need =
      requirements.find((r) => r.branch_id === branchId && r.code === code)?.required_staff ?? 0;
    return { names: on.map((e) => e.full_name), have: on.length, need };
  }

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-display text-[15px] font-semibold">Roster</h3>
        <span className="text-[11.5px] text-inkMuted">Tap a cell to set the shift and shop</span>
      </div>

      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      <div className="flex gap-3 flex-wrap mb-3">
        {orderedTypes(types).map((t) => (
          <span key={t.code} className="text-[11.5px] text-inkSecondary">
            <b className="font-semibold">{t.label}</b> <span className="num">{shiftRangeLabel(t)}</span>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 880 }}>
          <thead>
            <tr>
              <th className="text-left text-[11px] uppercase tracking-wide text-inkMuted font-semibold pb-2.5">
                Team member
              </th>
              {weekDates.map((date, i) => (
                <th
                  key={date}
                  className="text-left text-[11px] uppercase tracking-wide font-semibold pb-2.5"
                  style={{ color: date === today ? "var(--accent)" : "var(--ink-muted)" }}
                >
                  {DAYS[i]} {date.slice(8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const home = branchById[e.branch_id];
              return (
                <tr key={e.id}>
                  <td className="py-2" style={{ borderTop: "1px solid var(--line)" }}>
                    <div className="flex items-center gap-2.5" style={{ minWidth: 160 }}>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-none"
                        style={{ background: `linear-gradient(155deg, var(--${home?.slug}), #1a3d2b)` }}
                      >
                        {initials(e.full_name)}
                      </div>
                      <div className="min-w-0">
                        <b className="block text-[12.5px] font-semibold truncate">{e.full_name}</b>
                        <span className="text-[11px] text-inkMuted truncate block">
                          {e.role_title}
                        </span>
                      </div>
                    </div>
                  </td>
                  {weekDates.map((date) => {
                    const cell = current(e.id, date);
                    const t = cell ? typeFor(types, cell.code, cell.branchId) : null;
                    const b = cell ? branchById[cell.branchId] : null;
                    return (
                      <td key={date} className="py-2 pr-1" style={{ borderTop: "1px solid var(--line)" }}>
                        <button
                          type="button"
                          onClick={() => setPicking({ empId: e.id, date })}
                          aria-label={`${e.full_name}, ${date}: ${t && b ? `${t.label} at ${b.name}` : "not working"}`}
                          className="rounded-[8px] text-[11px] font-semibold flex flex-col items-start justify-center px-2 w-full"
                          style={{
                            minWidth: 86,
                            minHeight: 44,
                            border: t ? "1px solid transparent" : "1px dashed var(--line-strong)",
                            background: t && b ? `var(--${b.slug}-soft)` : "transparent",
                            color: t && b ? `var(--${b.slug})` : "var(--line-strong)",
                          }}
                        >
                          {t && b ? (
                            <>
                              <span>{t.label}</span>
                              <small className="font-medium opacity-80 text-[10px] truncate w-full text-left">
                                {b.name}
                              </small>
                            </>
                          ) : (
                            <span className="w-full text-center">—</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {employees.length === 0 && (
        <p className="text-inkMuted text-[13px] mt-2">No team members at this branch.</p>
      )}

      {picking && pickedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setPicking(null)}
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.45)" }}
          />
          <div
            className="relative card w-full"
            style={{ maxWidth: 380, background: "var(--surface)" }}
          >
            <div className="mb-3">
              <b className="text-[15px] font-semibold block">{pickedEmp.full_name}</b>
              <span className="text-[12.5px] text-inkMuted">
                {new Date(picking.date + "T00:00:00Z").toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}
              </span>
            </div>

            {branches.map((b) => (
              <div key={b.id} className="mb-3">
                <div
                  className="text-[11px] font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: `var(--${b.slug})` }}
                >
                  {b.name}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {orderedTypes(types, b.id).map((t) => {
                    const on = picked?.code === t.code && picked?.branchId === b.id;
                    const c = cover(b.id, t.code, picking.date, picking.empId);
                    const short = c.need > 0 && c.have < c.need;
                    return (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => apply(picking.empId, picking.date, { code: t.code, branchId: b.id })}
                        title={c.names.length ? `Also on: ${c.names.join(", ")}` : "Nobody else on this shift"}
                        className="rounded-[9px] px-3 text-[12.5px] font-semibold border flex flex-col items-start justify-center"
                        style={{
                          minHeight: 52,
                          borderColor: on ? `var(--${b.slug})` : "var(--line-strong)",
                          background: on ? `var(--${b.slug}-soft)` : "var(--surface)",
                          color: on ? `var(--${b.slug})` : "var(--ink-secondary)",
                        }}
                      >
                        <span>{t.label}</span>
                        <small className="font-medium opacity-75 text-[10px] num">
                          {shiftRangeLabel(t)}
                        </small>
                        <small
                          className="text-[10px] font-semibold num"
                          style={{ color: short ? "var(--critical)" : "var(--ink-muted)" }}
                        >
                          {c.need > 0 ? `${c.have} of ${c.need} without them` : `${c.have} others on`}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => apply(picking.empId, picking.date, null)}
                className="rounded-[9px] border px-4 text-[13px] font-semibold flex-1"
                style={{ borderColor: "var(--line-strong)", color: "var(--critical)", minHeight: 44 }}
              >
                Not working
              </button>
              <button
                type="button"
                onClick={() => setPicking(null)}
                className="rounded-[9px] border px-4 text-[13px] font-semibold text-inkSecondary"
                style={{ borderColor: "var(--line-strong)", minHeight: 44 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
