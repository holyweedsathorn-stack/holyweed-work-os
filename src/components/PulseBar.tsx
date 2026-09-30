import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Pulse = {
  on_shift: number;
  on_shift_sathorn: number;
  on_shift_sukhumvit: number;
  pending_approvals: number;
  refused_today: number;
  hours_this_week: number;
};

function Cell({
  label,
  children,
  sub,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  sub: string;
  tone?: "warn";
}) {
  const ink = tone === "warn" ? "var(--warning)" : undefined;
  return (
    <div
      className="px-4 md:px-7 py-3"
      style={{ background: tone === "warn" ? "var(--warning-soft)" : "var(--bg)" }}
    >
      <div
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: ink ?? "var(--ink-muted)" }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-2.5 mt-1">
        {children}
        <span className="text-[12px]" style={{ color: ink ?? "var(--ink-secondary)" }}>
          {sub}
        </span>
      </div>
    </div>
  );
}

/**
 * The four numbers that say whether today needs you. One round trip: the
 * counting happens in pulse(), in Postgres, in Bangkok time.
 */
export async function PulseBar() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("pulse");
  const p: Pulse | undefined = Array.isArray(data) ? data[0] : (data as Pulse | undefined);
  if (!p) return null;

  return (
    <div
      className="grid no-print grid-cols-2 lg:grid-cols-4"
      style={{
        gap: 1,
        background: "var(--line)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <Cell label="On shift now" sub={`${p.on_shift_sathorn} Sathorn · ${p.on_shift_sukhumvit} Sukhumvit`}>
        <span className="num text-[25px] font-semibold leading-none">{p.on_shift}</span>
      </Cell>

      <Cell
        label="Waiting on you"
        sub={p.pending_approvals === 0 ? "all clear" : "to decide"}
        tone={p.pending_approvals > 0 ? "warn" : undefined}
      >
        <Link
          href="/approvals"
          className="num text-[25px] font-semibold leading-none no-underline"
          style={{ color: p.pending_approvals > 0 ? "var(--warning)" : "var(--ink)" }}
        >
          {p.pending_approvals}
        </Link>
      </Cell>

      <Cell label="Turned away today" sub="see the log">
        <Link
          href="/access-log"
          className="num text-[25px] font-semibold leading-none"
          style={{ color: "var(--accent)" }}
        >
          {p.refused_today}
        </Link>
      </Cell>

      <Cell label="Hours this week" sub="across the team">
        <span className="num text-[25px] font-semibold leading-none">{p.hours_this_week}</span>
      </Cell>
    </div>
  );
}
