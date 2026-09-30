"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logReceivedItem, type ItemReportType } from "@/app/clock/received-item-actions";

const TYPES: { id: ItemReportType; label: string; question: string; placeholder: string; button: string }[] = [
  {
    id: "received",
    label: "Received",
    question: "What is it? (optional)",
    placeholder: "5 boxes of napkins from Makro",
    button: "Log it",
  },
  {
    id: "low_stock",
    label: "Low stock",
    question: "What's running low? (optional)",
    placeholder: "Only 2 bottles of vodka left",
    button: "Flag it",
  },
];

/**
 * Staff-side: snap a photo during a shift — either something that arrived
 * (a delivery, stock, a package) or something running low that needs
 * reordering — with a short note. No approval step; it just lands in the
 * manager's log. Deliberately minimal: this gets filled in one-handed,
 * mid-shift, often right at the door or the shelf.
 */
export function ReceivedItemForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [working, start] = useTransition();
  const [type, setType] = useState<ItemReportType>("received");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const spec = TYPES.find((t) => t.id === type) ?? TYPES[0];

  function onFileChange() {
    const file = fileRef.current?.files?.[0];
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function reset() {
    formRef.current?.reset();
    setType("received");
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await logReceivedItem(formData);
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
        <h2 className="font-display text-[15px] font-semibold">Photo log</h2>
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
            Log a photo
          </button>
        )}
      </div>

      {sent && !open && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          Logged — your manager can see it.
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
        <form ref={formRef} action={submit} className="flex flex-col gap-3">
          <label className="text-[12px] font-semibold text-inkSecondary block">
            Type
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as ItemReportType)}
              className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
            >
              {TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[12px] font-semibold text-inkSecondary">
            Photo
            <input
              ref={fileRef}
              name="photo"
              type="file"
              accept="image/*"
              required
              onChange={onFileChange}
              className="w-full rounded-[9px] border px-3 py-2 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            />
          </label>

          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Preview"
              className="w-full max-h-[220px] object-cover rounded-[9px]"
              style={{ border: "1px solid var(--line-strong)" }}
            />
          )}

          <label className="text-[12px] font-semibold text-inkSecondary">
            {spec.question}
            <input
              name="note"
              maxLength={300}
              placeholder={spec.placeholder}
              className="w-full rounded-[9px] border px-3 text-[14px] outline-none focus:border-accent mt-1.5"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)", minHeight: 46 }}
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={working}
              className="flex-1 rounded-[11px] text-[15px] font-bold text-white disabled:opacity-60"
              style={{ background: "var(--accent)", minHeight: 50 }}
            >
              {working ? "Uploading…" : spec.button}
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
        </form>
      )}

      {!open && !sent && (
        <p className="text-[13px] text-inkMuted m-0">
          Deliveries, stock, packages, or something running low — snap a photo and it goes
          straight into the log.
        </p>
      )}
    </div>
  );
}
