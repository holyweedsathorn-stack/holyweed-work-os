"use client";

import { useEffect, useState } from "react";
import { fmtDateTime, fmtWeekdayDate } from "@/lib/dates";

export function Clock() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function tick() {
      const now = new Date();
      setLabel("Bangkok · " + fmtWeekdayDate(now) + " " + fmtDateTime(now).slice(11));
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
