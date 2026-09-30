import { Icon } from "./Icons";

export function KpiCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { dir: "up" | "down"; text: string };
}) {
  return (
    <div className="card">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-inkMuted">{label}</div>
      <div className="num text-[27px] font-semibold mt-2">{value}</div>
      {delta && (
        <div
          className="mt-2 text-[12.5px] font-semibold flex items-center gap-1.5"
          style={{ color: delta.dir === "up" ? "var(--good)" : "var(--critical)" }}
        >
          <Icon name={delta.dir} className="w-3 h-3" />
          {delta.text}
        </div>
      )}
    </div>
  );
}
