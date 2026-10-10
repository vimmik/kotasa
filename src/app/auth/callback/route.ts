import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

// Google sign-in lands here. We link the Google account to a person:
// 1. already linked -> done
// 2. a person with the same email exists (admin added it) -> link
// 3. nobody exists at all yet -> this is the first admin
// 4. otherwise -> create a "pending" person the admin must approve
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  if (!code) return to("/login?error=google");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/login?error=google");
  const user = data.user;
  const email = user.email?.toLowerCase() ?? null;

  const admin = createAdminClient();
  const { data: linked } = await admin
    .from("person_logins")
    .select("people(status)")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (linked) {
    const status = (linked as unknown as { people: { status: string } | null }).people?.status;
    return to(status === "pending" ? "/pending" : "/");
  }

  if (email) {
    const { data: match } = await admin.from("people").select("id, status").eq("email", email).maybeSingle();
    if (match && match.status !== "inactive") {
      await admin.from("person_logins").insert({ auth_user_id: user.id, person_id: match.id, method: "google" });
      return to(match.status === "pending" ? "/pending" : "/");
    }
    if (match) {
      await supabase.auth.signOut();
      return to("/login?error=inactive");
    }
  }

  const meta = user.user_metadata ?? {};
  const name = String(meta.full_name || meta.name || email?.split("@")[0] || "New member");
  const { count } = await admin.from("people").select("id", { count: "exact", head: true });
  const firstEver = (count ?? 0) === 0;

  const { data: person, error: pErr } = await admin
    .from("people")
    .insert({ full_name: name, email, status: firstEver ? "active" : "pending", is_admin: firstEver })
    .select("id")
    .single();
  if (pErr || !person) return to("/login?error=google");
  await admin.from("person_logins").insert({ auth_user_id: user.id, person_id: person.id, method: "google" });
  if (firstEver) {
    await admin.from("settings").update({ collector_id: person.id }).eq("id", 1);
    return to("/admin/people");
  }
  return to("/pending");
}
