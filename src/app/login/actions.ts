"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/dashboard");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  // Staff get the clock screen; owners and managers get the dashboard.
  let role: string | null = null;
  if (data.user) {
    const { data: me } = await supabase
      .from("app_users")
      .select("role")
      .eq("id", data.user.id)
      .single();
    role = me?.role ?? null;
  }

  if (role === "staff") redirect("/clock");
  redirect(next && next !== "/" ? next : "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
