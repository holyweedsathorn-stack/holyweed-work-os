import { signIn } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-[9px] bg-accent text-white flex items-center justify-center font-display font-bold text-lg">
            H
          </div>
          <div>
            <h1 className="font-display font-semibold text-base leading-tight">Holyweed</h1>
            <span className="block text-[11px] uppercase tracking-wide text-inkMuted">Work OS</span>
          </div>
        </div>

        <div className="card">
          <h2 className="font-display text-xl font-semibold mb-1">Sign in</h2>
          <p className="text-inkMuted text-[13px] mb-5">Employer &amp; manager access to Holyweed Group.</p>

          {searchParams.error && (
            <div className="mb-4 rounded-[9px] bg-critical-soft px-3 py-2 text-[12.5px] font-medium" style={{ background: "var(--critical-soft)", color: "var(--critical)" }}>
              {searchParams.error}
            </div>
          )}

          <form action={signIn} className="flex flex-col gap-3">
            <input type="hidden" name="next" value={searchParams.next || "/dashboard"} />
            <label className="text-[12px] font-semibold text-inkSecondary">
              Email
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="owner@holyweed.co"
                className="mt-1 w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent"
                style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
              />
            </label>
            <label className="text-[12px] font-semibold text-inkSecondary">
              Password
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="mt-1 w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent"
                style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
              />
            </label>
            <button
              type="submit"
              className="mt-2 rounded-[9px] py-2.5 font-semibold text-[13.5px]"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              Sign in
            </button>
          </form>
        </div>
        <p className="text-center text-[12px] text-inkMuted mt-5">
          Accounts are created by an administrator via Supabase — see the README.
        </p>
      </div>
    </div>
  );
}
