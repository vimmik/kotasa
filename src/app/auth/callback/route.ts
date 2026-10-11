import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { LINK_COOKIE, linkGoogle, profileForVerifiedEmail, readLinkTicket } from "@/lib/accounts";
import { currencyForCountry } from "@/lib/currency";

// Google sign-in lands here.
// 0. "Connect Google" from Me › Settings: a signed cookie names the account to add this login to.
// 1. Login already linked to a profile -> done.
// 2. Otherwise find or create the profile by the verified email, link this login, and link any
//    group memberships that were invited by that email.
// Then go to ?next= (same-site only) or /me. A brand-new account goes through /welcome first,
// unless it came in through an invite link (it joins that group instead).
const linkErrors = { inUse: "That Google account is already used by another Kotasa account." };

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") ?? "/me";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") && !nextRaw.startsWith("/\\") ? nextRaw : "/me";
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  if (!code) return to("/login?error=google");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/login?error=google");
  const user = data.user;

  const { data: linked } = await createAdminClient()
    .from("profile_logins")
    .select("profile_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const linkTo = readLinkTicket(request.cookies.get(LINK_COOKIE)?.value);
  if (request.cookies.has(LINK_COOKIE)) {
    const done = (path: string) => {
      const res = to(path);
      res.cookies.set(LINK_COOKIE, "", { path: "/auth/callback", maxAge: 0 });
      return res;
    };
    if (!linkTo) return done("/me/settings?google=expired"); // still logged in with the PIN
    const err =
      linked && linked.profile_id !== linkTo
        ? linkErrors.inUse
        : user.email
          ? linked
            ? null
            : await linkGoogle(linkTo, user.id, user.email)
          : "Google didn't share an email address.";
    if (err) {
      // The session is now this Google account, which isn't (or can't be) linked: log out.
      await supabase.auth.signOut();
      return done(`/login?error=${encodeURIComponent(err === linkErrors.inUse ? "google-in-use" : "google-link")}`);
    }
    return done(next);
  }

  if (linked) return to(next);

  const email = user.email?.toLowerCase();
  if (!email) {
    await supabase.auth.signOut();
    return to("/login?error=google");
  }
  const meta = user.user_metadata ?? {};
  let created = false;
  try {
    ({ created } = await profileForVerifiedEmail({
      authUserId: user.id,
      email,
      name: String(meta.full_name || meta.name || email.split("@")[0]),
      method: "google",
      currency: currencyForCountry(request.headers.get("x-vercel-ip-country")),
    }));
  } catch {
    await supabase.auth.signOut();
    return to("/login?error=google");
  }
  return to(created && !next.startsWith("/join/") ? "/welcome" : next);
}
