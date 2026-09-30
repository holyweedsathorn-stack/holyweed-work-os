import { bangkokToday, addDays } from "@/lib/types";

/**
 * Shared date-range handling for the dashboards, so Overview and Shop always
 * agree on what "last 30 days" or "this month" means.
 */

export const CATEGORY_LABEL: Record<string, string> = {
  operating: "Operating",
  cogs: "Cost of goods",
  salary: "Salary advances",
  other: "Uncategorised",
};

export type ResolvedRange = { preset: string; from: string; to: string };

/** Turn the chosen preset (or custom dates) into a concrete range. */
export function resolveRange(
  period: string | undefined,
  from?: string,
  to?: string
): ResolvedRange {
  const today = bangkokToday();

  if (period === "custom" && from && to) {
    const [a, b] = from <= to ? [from, to] : [to, from];
    return { preset: "custom", from: a, to: b };
  }

  const monthStart = today.slice(0, 7) + "-01";

  switch (period) {
    case "today":
      return { preset: "today", from: today, to: today };
    case "7d":
      return { preset: "7d", from: addDays(today, -6), to: today };
    case "30d":
      return { preset: "30d", from: addDays(today, -29), to: today };
    case "90d":
      return { preset: "90d", from: addDays(today, -89), to: today };
    case "lastmonth": {
      const lastMonthEnd = addDays(monthStart, -1);
      return { preset: "lastmonth", from: lastMonthEnd.slice(0, 7) + "-01", to: lastMonthEnd };
    }
    default:
      return { preset: "month", from: monthStart, to: today };
  }
}

/** Days between two dates, inclusive. */
export function daysBetween(a: string, b: string) {
  return (
    Math.round(
      (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000
    ) + 1
  );
}
