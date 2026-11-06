"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * A date field that always reads and types as dd/mm/yyyy, whatever the phone's language.
 * (A plain <input type="date"> shows the device's own format, often mm/dd/yyyy.)
 * The value it hands back, and posts under `name`, is still "YYYY-MM-DD", so server code
 * is unchanged. The calendar button opens the device's own date picker.
 */
type Props = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function toText(iso: string): string {
  const m = ISO.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function parse(text: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function mask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

export function DateInput({ name, value, defaultValue, onChange, required, min, max, className, style, ...rest }: Props) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const iso = controlled ? value ?? "" : inner;
  const [text, setText] = useState(toText(iso));
  const textRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  // Follow changes made from outside (a parent setting the value, a preset button).
  useEffect(() => {
    if (parse(text) !== iso) setText(toText(iso));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  // A form reset puts the field back to its starting value, like a native input.
  useEffect(() => {
    const form = textRef.current?.form;
    if (!form || controlled) return;
    const onReset = () => {
      setInner(defaultValue ?? "");
      setText(toText(defaultValue ?? ""));
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [controlled, defaultValue]);

  const outOfRange = (d: string) => (!!min && d < min) || (!!max && d > max);

  function commit(next: string) {
    if (!controlled) setInner(next);
    onChange?.(next);
  }

  function onType(raw: string) {
    const t = mask(raw);
    setText(t);
    const d = parse(t);
    const el = textRef.current;
    if (!t) {
      el?.setCustomValidity("");
      commit("");
    } else if (!d) {
      el?.setCustomValidity("Enter the date as dd/mm/yyyy");
    } else if (outOfRange(d)) {
      el?.setCustomValidity(max && d > max ? `Pick a date on or before ${toText(max)}` : `Pick a date on or after ${toText(min!)}`);
    } else {
      el?.setCustomValidity("");
      commit(d);
    }
  }

  function openPicker() {
    const p = pickRef.current;
    if (!p) return;
    try {
      p.showPicker();
    } catch {
      p.focus();
      p.click();
    }
  }

  // Top margins go on the wrapper so the calendar button stays centred on the box.
  const cls = (className ?? "").split(/\s+/).filter(Boolean);
  const outer = cls.filter((c) => /^mt-/.test(c)).join(" ");
  const own = cls.filter((c) => !/^mt-/.test(c)).join(" ");

  return (
    <span className={`relative block ${outer}`}>
      <input
        ref={textRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        value={text}
        required={required}
        onChange={(e) => onType(e.target.value)}
        className={own}
        style={{ ...style, paddingRight: 40 }}
        aria-label={rest["aria-label"]}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Pick a date"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-[7px] px-2 py-1 text-inkMuted hover:text-ink"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      <input
        ref={pickRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={iso}
        min={min}
        max={max}
        onChange={(e) => {
          setText(toText(e.target.value));
          textRef.current?.setCustomValidity("");
          commit(e.target.value);
        }}
        style={{ position: "absolute", right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none", border: 0, padding: 0 }}
      />
      {name && <input type="hidden" name={name} value={iso} />}
    </span>
  );
}
