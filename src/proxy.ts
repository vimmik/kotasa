import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = ["/login", "/signup", "/setup", "/auth", "/b/", "/privacy", "/terms"];
// Logged-out visitors to these are sent to /login?next=<path> and come back after signing in.
const RETURN_TO = ["/join/", "/g/"];

// Refreshes the Supabase session cookie and sends logged-out users to /login.
// "/" is the landing page for logged-out visitors and opens Me for everyone else.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  if (PUBLIC.some((p) => path.startsWith(p))) return response;

  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);
  if (path === "/") {
    if (!loggedIn) return response;
    const me = NextResponse.redirect(new URL("/start", request.url)); // Me or the group (app/start)
    response.cookies.getAll().forEach((c) => me.cookies.set(c)); // keep a refreshed session
    return me;
  }
  if (!loggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (RETURN_TO.some((p) => path.startsWith(p))) url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|icons|brand|icon.svg|apple-icon.png|manifest.webmanifest|.*\\.(?:png|jpg|svg|ico|webmanifest)$).*)",
  ],
};
