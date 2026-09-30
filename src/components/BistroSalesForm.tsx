"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordBistroSales } from "@/app/clock/bistro-sales-actions";

function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-[12px] font-semibold text-inkSecondary block">
      {label}
      <input
        type="number"
        min={0}
        step="1"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="฿0"
        className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
        style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
      />
    </label>
  );
}

/**
 * End-of-day Bistro sales entry: cash, PromptPay, Grab, LINE MAN, kept as
 * separate fields because they land in completely different places --
 * PromptPay hits the SAME bank account as the Sathorn dispensary (see the
 * reconciliation page), while Grab/LINE MAN are paid out separately by
 * those platforms and never touch this account at all. One row per date;
 * re-submitting the same date replaces it rather than adding a duplicate.
 */
export function BistroSalesForm() {
  const router = useRouter();
  const [working, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saleDate, setSaleDate] = useState(bangkokToday());
  const [cash, setCash] = useState("");
  const [promptpay, setPromptpay] = useState("");
  const [grab, setGrab] = useState("");
  const [lineMan, setLineMan] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setSaleDate(bangkokToday());
    setCash("");
    setPromptpay("");
    setGrab("");
    setLineMan("");
    setNotes("");
  }

  function submit() {
    setError(null);
    const n = (s: string) => (s.trim() ? Number(s) : 0);
    const cashN = n(cash);
    const promptpayN = n(promptpay);
    const grabN = n(grab);
    const lineManN = n(lineMan);
    if (![cashN, promptpayN, grabN, lineManN].every((v) => Number.isFinite(v))) {
      setError("Something about those amounts didn't add up.");
      return;
    }
    start(async () => {
      const res = await recordBistroSales({
        saleDate,
        cash: cashN,
        promptpay: promptpayN,
        grab: grabN,
        lineMan: lineManN,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reset();
      setSent(true);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-[15px] font-semibold">Bistro end-of-day sales</h2>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setSent(false);
            }}
            className="text-[12.5px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Log sales
          </button>
        )}
      </div>

      {sent && !open && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          Logged — see it in the list below.
        </div>
      )}

      {error && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-3">
          <label className="text-[12px] font-semibold text-inkSecondary block">
            Date
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              max={bangkokToday()}
              className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
            />
          </label>

          <div className="grid gap-3 grid-cols-2">
            <NumberField label="Cash" value={cash} onChange={setCash} />
            <NumberField label="PromptPay" value={promptpay} onChange={setPromptpay} />
            <NumberField label="Grab" value={grab} onChange={setGrab} />
            <NumberField label="LINE MAN" value={lineMan} onChange={setLineMan} />
          </div>

          <label className="text-[12px] font-semibold text-inkSecondary block">
            Anything worth noting? (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="e.g. slow night, event downstairs"
              className="w-full rounded-[9px] border px-3 py-2 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={working}
              className="flex-1 rounded-[11px] text-[15px] font-bold text-white disabled:opacity-60"
              style={{ background: "var(--accent)", minHeight: 50 }}
            >
              {working ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="rounded-[11px] border px-5 text-[14px] font-semibold text-inkSecondary"
              style={{ borderColor: "var(--line-strong)", minHeight: 50 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!open && !sent && (
        <p className="text-[13px] text-inkMuted m-0">
          Cash, PromptPay, Grab and LINE MAN totals for the day — PromptPay
          feeds straight into the bank reconciliation.
        </p>
      )}
    </div>
  );
}
