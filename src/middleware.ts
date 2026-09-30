import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every request EXCEPT static assets and the cron endpoints.
     * The web manifest and icons must be excluded too — a phone fetches
     * them while signed out when installing the app, and redirecting them
     * breaks "Add to Home Screen". `api/cron` is excluded because those
     * routes are called by an external scheduler (no Supabase session
     * cookie ever exists) and gate themselves with their own CRON_SECRET
     * check in each src/app/api/cron/.../route.ts — letting this middleware run
     * on them first was redirecting the unauthenticated request to
     * /login before that check ever ran.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt)$).*)",
  ],
};
