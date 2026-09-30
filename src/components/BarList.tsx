export function BarList({
  rows,
  fmt = (v: number) => String(v),
}: {
  rows: { label: string; value: number; color?: string }[];
  fmt?: (v: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={i}
          title={`${r.label}: ${fmt(r.value)}`}
          className="grid items-center gap-2.5 py-[7px] grid-cols-[92px_1fr_64px] sm:grid-cols-[130px_1fr_78px]"
        >
          <div className="text-[12.5px] text-inkSecondary font-medium truncate">{r.label}</div>
          <div className="h-[9px] rounded-[5px] overflow-hidden" style={{ background: "var(--surface-2)" }}>
            <div
              className="h-full rounded-[5px]"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color || "var(--accent)" }}
            />
          </div>
          <div className="num text-[12px] text-right">{fmt(r.value)}</div>
        </div>
      ))}
    </div>
  );
}
