"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const BRANCHES = [
  { id: "all", name: "All branches" },
  { id: "sathorn", name: "Sathorn", color: "var(--sathorn)" },
  { id: "sukhumvit", name: "Sukhumvit 22", color: "var(--sukhumvit)" },
];

export function BranchSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id === "all") next.delete("branch");
    else next.set("branch", id);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div
      className="flex rounded-full p-[3px]"
      style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
    >
      {BRANCHES.map((b) => {
        const active = current === b.id || (current === "" && b.id === "all");
        return (
          <button
            key={b.id}
            onClick={() => go(b.id)}
            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold flex items-center gap-1.5 whitespace-nowrap flex-none min-h-[40px] md:min-h-0"
            style={{
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--ink)" : "var(--ink-muted)",
              boxShadow: active ? "var(--shadow-card)" : "none",
            }}
          >
            {b.color && <span className="w-[7px] h-[7px] rounded-full" style={{ background: b.color }} />}
            {b.name}
          </button>
        );
      })}
    </div>
  );
}
