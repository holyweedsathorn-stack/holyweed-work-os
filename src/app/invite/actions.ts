"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logRefusal } from "@/lib/guard";

export type AcceptResult = { ok: true; email: string } | { ok: false; error: string };

/**
 * Accept an invite: create the login and link it to the org.
 *
 * This runs for a signed-OUT visitor, so it is the one place in the app where
 * an anonymous request can create an account. Everything therefore hinges on
 * the token: it must exist, be unused, and be unexpired. The token is 32 random
 * bytes, so it isn't guessable, and it is single-use.
 */
export async function acceptInvite(formData: FormData): Promise<AcceptResult> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!token) return { ok: false, error: "This invite link is missing its code." };
  if (!email) return { ok: false, error: "Please enter an email address." };
  if (password.length < 8) {
    return { ok: false, error: "Please choose a password of at least 8 characters." };
  }
  if (password !== confirm) return { ok: false, error: "The two passwords don't match." };

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return { ok: false, error: "This invite link isn't valid." };
  if (invite.accepted_at) {
    await logRefusal({
      action: "invite.acceptInvite",
      reason: "used_token",
      orgId: invite.org_id,
      actorLabel: `invite for ${invite.full_name}`,
      detail: `Link already used on ${invite.accepted_at}`,
    });
    return { ok: false, error: "This invite has already been used. Ask for a new link." };
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await logRefusal({
      action: "invite.acceptInvite",
      reason: "expired_token",
      orgId: invite.org_id,
      actorLabel: `invite for ${invite.full_name}`,
      detail: `Link expired on ${invite.expires_at}`,
    });
    return { ok: false, error: "This invite link has expired. Ask for a new one." };
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr) {
    const msg = /already/i.test(authErr.message)
      ? "That email address is already in use. Try another, or ask for a password reset."
      : authErr.message;
    return { ok: false, error: msg };
  }

  const { error: linkErr } = await admin.from("app_users").insert({
    id: authUser.user.id,
    org_id: invite.org_id,
    full_name: invite.full_name,
    role: invite.role,
    employee_id: invite.employee_id,
  });

  if (linkErr) {
    // Don't leave a usable login that isn't attached to the org.
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { ok: false, error: linkErr.message };
  }

  await admin
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return { ok: true, email };
}
