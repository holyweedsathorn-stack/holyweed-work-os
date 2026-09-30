import { createAdminClient } from "@/lib/supabase/admin";
import { InviteForm } from "@/components/InviteForm";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  staff: "clock in and out of your shifts",
  manager: "see the dashboards and manage the team",
  owner: "full access to the business dashboards",
};

/**
 * Public page — reached by anyone holding the link. It reveals only the
 * invited person's first name and what the account is for; no org data,
 * and nothing that would help someone guess another token.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("invites")
    .select("full_name, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  const invalid = !invite;
  const used = !!invite?.accepted_at;
  const expired = !!invite && new Date(invite.expires_at).getTime() < Date.now();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 rounded-[9px] bg-accent text-white flex items-center justify-center font-display font-bold text-lg">
            H
          </div>
          <div>
            <h1 className="font-display font-semibold text-base leading-tight">Holyweed</h1>
            <span className="block text-[11px] uppercase tracking-wide text-inkMuted">Work OS</span>
          </div>
        </div>

        {invalid || used || expired ? (
          <div className="card">
            <h2 className="font-display text-xl font-semibold mb-2">
              {used ? "Already used" : expired ? "Link expired" : "Invalid link"}
            </h2>
            <p className="text-[13px] text-inkSecondary">
              {used
                ? "This invite has already been used to create an account. If that was you, sign in instead."
                : expired
                ? "This invite link has expired. Ask for a new one to be sent."
                : "This invite link isn't valid. Check you copied the whole link, or ask for a new one."}
            </p>
            <a
              href="/login"
              className="inline-block mt-4 rounded-[9px] px-4 py-2 text-[13px] font-semibold"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              Go to sign in
            </a>
          </div>
        ) : (
          <div className="card">
            <h2 className="font-display text-xl font-semibold mb-1">
              Welcome, {invite!.full_name.split(" ")[0]}
            </h2>
            <p className="text-[13px] text-inkMuted mb-5">
              Set a password to create your account. You&apos;ll be able to{" "}
              {ROLE_LABEL[invite!.role] ?? "use the app"}.
            </p>
            <InviteForm token={token} />
          </div>
        )}
      </div>
    </div>
  );
}
