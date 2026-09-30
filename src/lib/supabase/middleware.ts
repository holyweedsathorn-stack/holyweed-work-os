import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and gates the app
 * behind login. Without this, sessions expire silently instead of refreshing.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // This runs on every request, so it must never be allowed to hang. If
  // Supabase is slow or unreachable (a paused project, an outage), waiting
  // for it takes the whole site down with a gateway timeout instead of
  // showing a page. Give up after 4 seconds and treat it as "not signed in",
  // which fails closed: protected pages send you to login rather than open.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
  const lookup = supabase.auth
    .getUser()
    .then((r) => r.data.user)
    .catch(() => null);
  const user = await Promise.race([lookup, timeout]);

  const path = request.nextUrl.pathname;
  // Routes reachable without being signed in: the login page, invite links
  // (where the person is creating their account in the first place), and
  // the install card — which is meant to be printed and pinned up in the
  // staff room, so a budtender scans it BEFORE they have an account. A
  // card that needs a login is no use taped to a wall.
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/invite") ||
    path.startsWith("/install");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
