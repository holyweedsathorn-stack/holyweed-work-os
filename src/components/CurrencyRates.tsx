import { CurrencyConverter, type ConvertibleCurrency } from "./CurrencyConverter";

const CURRENCIES: { code: string; label: string; perHundred?: boolean }[] = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "JPY", label: "Japanese Yen", perHundred: true },
  { code: "AUD", label: "Australian Dollar" },
];

type RatesResult = { rates: Record<string, number>; updatedAtUtc: string } | null;

/**
 * Live THB rates from a free, keyless public endpoint (base=THB, so
 * rates[code] is "units of that currency per 1 THB" — we invert it below to
 * get "how many THB is 1 unit of that currency", which is what a cashier
 * actually needs when someone hands over foreign cash).
 *
 * Cached for an hour via Next's fetch cache so a busy shift doesn't hammer
 * the API, and never throws — a down API just means the card says so.
 */
async function fetchRates(): Promise<RatesResult> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/THB", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.result !== "success" || !data?.rates) return null;
    return { rates: data.rates as Record<string, number>, updatedAtUtc: data.time_last_update_utc as string };
  } catch {
    return null;
  }
}

/**
 * Staff-side card: pick the currency someone's actually paying with (a
 * dropdown, not a wall of six rates nobody needs most days), see today's
 * rate, and convert a THB price into that currency. Live market rate — a
 * check, not gospel; confirm with a manager for large or unusual amounts.
 */
export async function CurrencyRates() {
  const data = await fetchRates();

  const convertible: ConvertibleCurrency[] = data
    ? CURRENCIES.filter((c) => data.rates[c.code]).map((c) => ({
        code: c.code,
        label: c.label,
        perHundred: c.perHundred ?? false,
        thbPerUnit: 1 / data.rates[c.code],
      }))
    : [];

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-display text-[15px] font-semibold">Exchange rates</h2>
        {data && (
          <span className="text-[11px] text-inkMuted">
            {new Date(data.updatedAtUtc).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              timeZone: "Asia/Bangkok",
            })}
          </span>
        )}
      </div>
      <p className="text-[11.5px] text-inkMuted mb-3">
        Pick the currency they're paying with — live market rate, check with a manager for big
        amounts.
      </p>

      {convertible.length === 0 ? (
        <p className="text-[13px] text-inkMuted m-0">
          Rates unavailable right now — ask a manager for today's rate.
        </p>
      ) : (
        <CurrencyConverter currencies={convertible} />
      )}
    </div>
  );
}
