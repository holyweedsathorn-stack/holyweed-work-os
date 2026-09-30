"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "@/app/invite/actions";

const inputStyle = { borderColor: "var(--line-strong)", background: "var(--surface)" } as const;
const inputClass =
  "mt-1 w-full rounded-[9px] border px-3 py-2.5 text-[14px] outline-none focus:border-accent";

export function InviteForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await acceptInvite(formData);
      if (res.ok) setDone(res.email);
      else setError(res.error);
    });
  }

  if (done) {
    return (
      <div>
        <p
          className="text-[13px] font-medium rounded-[9px] px-3 py-2.5 mb-4"
          style={{ background: "var(--good-soft)", color: "var(--good)" }}
        >
          Account created. Sign in with <b>{done}</b> and the password you just chose.
        </p>
        <a
          href="/login"
          className="block text-center rounded-[9px] py-2.5 text-[13.5px] font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />

      <label className="text-[12px] font-semibold text-inkSecondary">
        Your email
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={inputClass}
          style={inputStyle}
        />
      </label>

      <label className="text-[12px] font-semibold text-inkSecondary">
        Choose a password
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className={inputClass}
          style={inputStyle}
        />
      </label>

      <label className="text-[12px] font-semibold text-inkSecondary">
        Confirm password
        <input
          type="password"
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Type it again"
          className={inputClass}
          style={inputStyle}
        />
      </label>

      {error && (
        <p
          className="text-[12.5px] font-medium rounded-[9px] px-3 py-2"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-[9px] py-3 text-[14px] font-semibold disabled:opacity-60"
        style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
      >
        {pending ? "Creating account…" : "Create my account"}
      </button>
    </form>
  );
}
