"use client";

import { useEffect, useState } from "react";

export function Clock() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function tick() {
      const opts: Intl.DateTimeFormatOptions = {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      };
      setLabel("Bangkok · " + new Intl.DateTimeFormat("en-GB", opts).format(new Date()));
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="hidden lg:flex text-[12.5px] rounded-full px-3.5 py-2 items-center gap-2"
      style={{ border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-muted)" }}
    >
      {label || "Bangkok"}
    </div>
  );
}
