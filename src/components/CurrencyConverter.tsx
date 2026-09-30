"use client";

import { useMemo, useState, useTransition } from "react";
import { logCurrencyTransaction } from "@/app/clock/currency-actions";

// Flat fee added on top of the THB price before converting — covers the
// trip to actually exchange the foreign cash later, not proportional to the
// amount. Change this one number if the real cost of that trip changes.
const TRANSPORT_FEE_THB = 100;

export type ConvertibleCurrency = {
  code: string;
  label: string;
  thbPerUnit: number;
  perHundred: boolean;
};

/**
 * One currency at a time, picked from a dropdown — staff don't need to see
 * all six rates every day, just whichever one a customer is actually paying
 * with. Shows today's rate for that currency, converts a THB price into it
 * (plus the flat transport fee), and — once a transaction is actually
 * accepted — logs it (who, when, currency, rate used) so a manager can
 * reconstruct the month later.
 */
export function CurrencyConverter({ currencies }: { currencies: ConvertibleCurrency[] }) {
  const [code, setCode] = useState(currencies[0]?.code ?? "");
  const [amount, setAmount] = useState("");
  const [working, start] = useTransition();
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = currencies.find((c) => c.code === code) ?? currencies[0];

  const parsed = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const totalThb = useMemo(() => (valid ? parsed + TRANSPORT_FEE_THB : null), [valid, parsed]);

  if (!selected) return null;

  const rateDisplay = selected.perHundred ? selected.thbPerUnit * 100 : selected.thbPerUnit;
  const decimals = selected.code === "JPY" ? 0 : 2;
  const foreignAmount = totalThb !== null ? totalThb / selected.thbPerUnit : null;

  function logTransaction() {
    if (foreignAmount === null || totalThb === null) return;
    setError(null);
    start(async () => {
      const res = await logCurrencyTransaction({
        currencyCode: selected.code,
        foreignAmount,
        rateThbPerUnit: selected.thbPerUnit,
        feeThb: TRANSPORT_FEE_THB,
        totalThb,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLogged(true);
      setAmount("");
    });
  }

  return (
    <div>
      <select
        value={selected.code}
        onChange={(e) => {
          setCode(e.target.value);
          setLogged(false);
        }}
        className="w-full rounded-[9px] border px-3 text-[14px] font-semibold outline-none focus:border-accent mb-3"
        style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
      >
        {currencies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.label}
          </option>
        ))}
      </select>

      <div className="flex items-center justify-between mb-4">
        <span className="text-[12.5px] text-inkMuted">Today&apos;s rate</span>
        <span className="text-[15px] font-bold num">
          ฿{rateDisplay.toFixed(2)}
          <span className="text-[11px] text-inkMuted font-normal">
            {" "}
            / {selected.perHundred ? "100" : "1"} {selected.code}
          </span>
        </span>
      </div>

      <div className="text-[11.5px] font-bold text-inkMuted mb-2">QUICK CONVERT</div>
      <label className="text-[12px] font-semibold text-inkSecondary block mb-3">
        Price in THB
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setLogged(false);
            setError(null);
          }}
          placeholder="e.g. 850"
          className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent num mt-1.5"
          style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
        />
      </label>

      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {totalThb !== null && foreignAmount !== null ? (
        <div className="rounded-[9px] px-3 py-2.5" style={{ background: "var(--accent-soft)" }}>
          <div
            className="flex items-center justify-between text-[12.5px] mb-2 pb-2"
            style={{ color: "var(--accent)", borderBottom: "1px solid rgba(35,122,74,0.25)" }}
          >
            <span>Price + ฿{TRANSPORT_FEE_THB} transport fee</span>
            <span className="num font-bold">฿{totalThb.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-[15px] font-bold" style={{ color: "var(--accent)" }}>
            <span>Collect in {selected.code}</span>
            <span className="num">{foreignAmount.toFixed(decimals)}</span>
          </div>

          {logged ? (
            <div className="mt-3 pt-3 text-[13px] font-semibold text-center" style={{ color: "var(--accent)", borderTop: "1px solid rgba(35,122,74,0.25)" }}>
              Logged — your manager can see it.
            </div>
          ) : (
            <button
              type="button"
              disabled={working}
              onClick={logTransaction}
              className="w-full rounded-[10px] text-[13.5px] font-bold text-white mt-3 disabled:opacity-60"
              style={{ background: "var(--accent)", minHeight: 44 }}
            >
              {working ? "Logging…" : "Accepted — log this transaction"}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-inkMuted m-0">
          Enter the price in THB to see how much to collect in {selected.code}.
        </p>
      )}
    </div>
  );
}
