import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { profileForVerifiedEmail } from "@/lib/accounts";

// Google sign-in lands here.
// 1. Login already linked to a profile -> done.
// 2. Otherwise find or create the profile by the verified email, link this login, and link any
//    group memberships that were invited by that email.
// Then go to ?next= (same-site only) or "/", which picks a group or shows /groups.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") ?? "/";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") && !nextRaw.startsWith("/\\") ? nextRaw : "/";
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
  if (linked) return to(next);

  const email = user.email?.toLowerCase();
  if (!email) {
    await supabase.auth.signOut();
    return to("/login?error=google");
  }
  const meta = user.user_metadata ?? {};
  try {
    await profileForVerifiedEmail({
      authUserId: user.id,
      email,
      name: String(meta.full_name || meta.name || email.split("@")[0]),
      method: "google",
    });
  } catch {
    await supabase.auth.signOut();
    return to("/login?error=google");
  }
  return to(next);
}
