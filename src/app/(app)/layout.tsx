import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { ChatWidget } from "@/components/ChatWidget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("full_name, role, employee_id")
    .eq("id", user.id)
    .single();

  // Staff have no business in the employer views — send them to their clock screen.
  if (appUser?.role === "staff") redirect("/clock");

  return (
    // Column on a phone (header above page), row on desktop (rail beside it).
    // print:h-auto / print:overflow-visible undo the fixed-viewport app shell
    // for printing -- otherwise a long report (like /report) only ever prints
    // whatever fits in one screen-height page, silently dropping the rest.
    <div className="flex flex-col md:flex-row h-[100dvh] w-full print:h-auto print:block">
      <Suspense
        fallback={
          <div
            className="hidden md:block w-[236px] flex-none"
            style={{ background: "var(--surface-2)" }}
          />
        }
      >
        <Sidebar userName={appUser?.full_name ?? user.email ?? "Owner"} userRole={appUser?.role ?? "owner"} />
      </Suspense>
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden print:overflow-visible print:h-auto print:block">
        {children}
      </main>
      <ChatWidget currentUserName={appUser?.full_name ?? user.email ?? "Manager"} />
    </div>
  );
}
