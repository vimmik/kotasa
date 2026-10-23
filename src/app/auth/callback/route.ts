import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeGoogleLogin, LINK_COOKIE, readLinkTicket } from "@/lib/accounts";

// Google sign-in by redirect lands here (the ID-token flow in actions/auth.ts doesn't).
// A "Connect Google" from Me › Settings carries a signed cookie naming the account to link to.
// What happens next is completeGoogleLogin (lib/accounts.ts).
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") ?? "/start";
  const next = nextRaw.startsWith("/") && nextRaw !== "/" && !nextRaw.startsWith("//") && !nextRaw.startsWith("/\\") ? nextRaw : "/start";
  const linking = request.cookies.has(LINK_COOKIE);
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url.origin));
    if (linking) res.cookies.set(LINK_COOKIE, "", { path: "/auth/callback", maxAge: 0 });
    return res;
  };
  if (!code) return to("/login?error=google");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/login?error=google");

  const linkTo = linking ? readLinkTicket(request.cookies.get(LINK_COOKIE)?.value) : null;
  // An expired or bad ticket: the session is already this Google account, so don't carry on as it.
  const outcome = linking && !linkTo
    ? ({ error: "link" } as const)
    : await completeGoogleLogin(data.user, { next, linkTo, country: request.headers.get("x-vercel-ip-country") });
  if ("path" in outcome) return to(outcome.path);
  await supabase.auth.signOut();
  return to(`/login?error=${outcome.error === "google" ? "google" : `google-${outcome.error}`}`);
}
