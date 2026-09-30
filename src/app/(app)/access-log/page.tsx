import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import {
  REFUSAL_REASON_LABEL,
  bangkokDaysAgo,
  bangkokToday,
  fmtTimeBKK,
  fmtDateBKK,
  type Refusal,
  type RefusalReason,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES: Record<string, { label: string; days: number }> = {
  today: { label: "Today", days: 0 },
  "7": { label: "7 days", days: 7 },
  "30": { label: "30 days", days: 30 },
};

export default async function AccessLogPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const key = sp.range && RANGES[sp.range] ? sp.range : "today";
  const { days } = RANGES[key];

  const from = days === 0 ? bangkokToday() : bangkokDaysAgo(days);

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("refusals")
    .select("id, actor_label, action, reason, detail, occurred_at")
    .gte("occurred_at", `${from}T00:00:00+07:00`)
    .order("occurred_at", { ascending: false })
    .limit(300)
    .returns<Refusal[]>();

  const refusals = rows ?? [];

  const counts = refusals.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});

  const headline: RefusalReason[] = ["wrong_location", "not_manager", "not_signed_in"];

  const qs = (r: string) => {
    const p = new URLSearchParams();
    if (branch !== "all") p.set("branch", branch);
    p.set("range", r);
    return `/access-log?${p.toString()}`;
  };

  return (
    <>
      <Topbar
        title="Access log"
        sub="Everything the app refused. Owners and managers only."
        branch={branch}
      />

      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <div className="flex items-center gap-2 mb-4 no-print">
          {Object.entries(RANGES).map(([k, v]) => (
            <a
              key={k}
              href={qs(k)}
              className="rounded-[9px] px-3.5 py-2 text-[12.5px] font-semibold no-underline"
              style={
                k === key
                  ? { background: "var(--accent-soft)", color: "var(--accent)" }
                  : { background: "var(--surface)", color: "var(--ink-secondary)", border: "1px solid var(--line)" }
              }
            >
              {v.label}
            </a>
          ))}
        </div>

        <div className="grid gap-3.5 mb-4 grid-cols-2 lg:grid-cols-4">
          {headline.map((r) => (
            <div key={r} className="card">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
                {REFUSAL_REASON_LABEL[r]}
              </div>
              <div className="num text-[27px] font-semibold mt-2">{counts[r] ?? 0}</div>
            </div>
          ))}
          <div className="card">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">
              Kept for
            </div>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="num text-[27px] font-semibold">180</span>
              <span className="text-[12px] text-inkSecondary">days</span>
            </div>
          </div>
        </div>

        <div className="card p-0 overflow-x-auto">
          <div
            className="grid gap-4 px-4.5 py-2.5 text-[11px] font-bold uppercase tracking-wider min-w-[680px]"
            style={{
              gridTemplateColumns: "110px 200px minmax(0,1fr) 190px",
              background: "var(--surface-2)",
              color: "var(--ink-secondary)",
              borderBottom: "1px solid var(--line)",
              paddingLeft: 18,
              paddingRight: 18,
            }}
          >
            <div>Time</div>
            <div>Who</div>
            <div>Tried to</div>
            <div>Why refused</div>
          </div>

          {refusals.length === 0 ? (
            <div className="px-[18px] py-10 text-center">
              <div className="font-display text-[15px] font-semibold">Nothing was refused</div>
              <p className="text-[13px] text-inkSecondary mt-1.5">
                Nobody hit a wall they shouldn&apos;t have in this period.
              </p>
            </div>
          ) : (
            refusals.map((r, i) => (
              <div
                key={r.id}
                className="grid gap-4 items-center min-w-[680px]"
                style={{
                  gridTemplateColumns: "110px 200px minmax(0,1fr) 190px",
                  padding: "13px 18px",
                  borderBottom: i === refusals.length - 1 ? "none" : "1px solid var(--line)",
                  background: i % 2 ? "var(--surface-hover)" : "transparent",
                }}
              >
                <div className="num font-mono text-[12.5px] text-inkSecondary">
                  {days === 0 ? "" : fmtDateBKK(r.occurred_at) + " "}
                  {fmtTimeBKK(r.occurred_at)}
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold truncate">{r.actor_label}</div>
                </div>
                <div className="min-w-0">
                  <code
                    className="font-mono text-[12.5px] rounded-[6px] px-1.5 py-0.5"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
                  >
                    {r.action}
                  </code>
                  {r.detail && (
                    <div className="text-[12px] text-inkSecondary mt-1">{r.detail}</div>
                  )}
                </div>
                <div>
                  <span
                    className="chip"
                    style={{
                      background:
                        r.reason === "not_signed_in" ? "var(--surface-2)" : "var(--critical-soft)",
                      color:
                        r.reason === "not_signed_in" ? "var(--ink-secondary)" : "var(--critical)",
                    }}
                  >
                    {REFUSAL_REASON_LABEL[r.reason]}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div
          className="mt-4 rounded-card px-4 py-3.5 flex gap-3 items-start"
          style={{ background: "var(--warning-soft)", border: "1px solid var(--line-strong)" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--warning)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-[18px] h-[18px] flex-none mt-0.5"
            aria-hidden="true"
          >
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--warning)" }}>
            This records what the <b>app</b> refused. A request that reaches the database
            directly and is stopped by row-level security never runs this code and will not
            appear here — those are in Supabase&apos;s own logs. Worth knowing before calling
            this a complete access record.
          </p>
        </div>
      </div>
    </>
  );
}
