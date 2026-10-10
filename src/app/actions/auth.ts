"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasAnyProfile, requireMemberFromForm, requireProfile } from "@/lib/auth";
import { acceptInvite, createGroup, findInvite } from "@/lib/accounts";
import { upsertPinLogin } from "@/lib/logins";
import { orgDb } from "@/lib/org-db";
import { isValidPin, normalizePhone } from "@/lib/phone";
import { ORG_KINDS, type ActionState, type OrgKind } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Only same-site paths, so a crafted ?next= can't bounce people to another site. */
function safeNext(v: unknown) {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

export async function loginWithPin(_: ActionState, form: FormData): Promise<ActionState> {
  const phone = normalizePhone(str(form, "phone"));
  const pin = str(form, "pin");
  if (!phone) return { error: "Enter a valid mobile number (07XXXXXXXX)" };
  if (!isValidPin(pin)) return { error: "Your PIN is 6 digits" };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (!profile) return { error: "This number has no Kotasa login yet. Ask your group admin to add you." };

  const { data: login } = await admin
    .from("profile_logins")
    .select("auth_user_id")
    .eq("profile_id", profile.id)
    .eq("method", "pin")
    .maybeSingle();
  if (!login) return { error: "PIN login isn't set up for you. Sign in with Google, or ask your admin for a PIN." };

  const { data: u } = await admin.auth.admin.getUserById(login.auth_user_id);
  if (!u.user?.email) return { error: "Login problem. Ask your admin to reset your PIN." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: u.user.email, password: pin });
  if (error) return { error: "Wrong PIN. Try again." };
  redirect(safeNext(form.get("next")));
}

async function origin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function loginWithGoogle(form: FormData) {
  const next = safeNext(form.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** First run only: the very first account, with phone + PIN, and its first group. */
export async function setupFirstAccount(_: ActionState, form: FormData): Promise<ActionState> {
  if (await hasAnyProfile()) return { error: "Kotasa is already set up here. Log in instead." };
  const name = str(form, "full_name");
  const phone = normalizePhone(str(form, "phone"));
  const pin = str(form, "pin");
  const groupName = str(form, "group_name") || "Office";
  if (!name) return { error: "Enter your name" };
  if (!phone) return { error: "Enter a valid mobile number" };
  if (!isValidPin(pin)) return { error: "PIN must be 6 digits" };

  const admin = createAdminClient();
  const { data: profile, error } = await admin.from("profiles").insert({ full_name: name, phone }).select("*").single();
  if (error || !profile) return { error: error?.message ?? "Couldn't create your account" };
  const err = await upsertPinLogin(profile.id, phone, pin);
  if (err) {
    await admin.from("profiles").delete().eq("id", profile.id);
    return { error: err };
  }
  const org = await createGroup(profile, groupName, "office");

  const { data: login } = await admin.from("profile_logins").select("auth_user_id").eq("profile_id", profile.id).single();
  const { data: u } = await admin.auth.admin.getUserById(login!.auth_user_id);
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: u.user!.email!, password: pin });
  redirect(`/g/${org.slug}/admin/people`);
}

/** Set or change your own PIN. Adding a mobile number here is allowed if no one else uses it. */
export async function setMyPin(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireProfile();
  const pin = str(form, "pin");
  const confirm = str(form, "confirm");
  if (!isValidPin(pin)) return { error: "PIN must be 6 digits" };
  if (pin !== confirm) return { error: "PINs don't match" };
  let phone = me.phone;
  if (!phone) {
    phone = normalizePhone(str(form, "phone"));
    if (!phone) return { error: "Enter your mobile number (07XXXXXXXX)" };
    const admin = createAdminClient();
    const { data: taken } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (taken) return { error: "That number already has a Kotasa login" };
    await admin.from("profiles").update({ phone }).eq("id", me.id);
  }
  const err = await upsertPinLogin(me.id, phone, pin);
  return err ? { error: err } : { ok: true, message: "PIN saved. You can now log in with your number." };
}

export async function createGroupAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireProfile();
  const name = str(form, "name");
  const kind = str(form, "kind") as OrgKind;
  if (!name || name.length > 60) return { error: "Give the group a name (up to 60 characters)" };
  if (!ORG_KINDS.some((k) => k.id === kind)) return { error: "Pick what kind of group it is" };
  const { count } = await createAdminClient()
    .from("orgs")
    .select("id", { count: "exact", head: true })
    .eq("created_by", me.id);
  if ((count ?? 0) >= 20) return { error: "You've created 20 groups, which is the limit for now" };
  const org = await createGroup(me, name, kind);
  redirect(`/g/${org.slug}`);
}

export async function joinGroup(form: FormData) {
  const me = await getCurrentProfile();
  const code = str(form, "code");
  if (!me) redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  const info = await findInvite(code);
  if (!info) redirect(`/join/${code}`);
  const member = await acceptInvite(me, info);
  redirect(member.status === "active" ? `/g/${info.org.slug}` : "/groups");
}

/** Leave a group. History stays; the member becomes inactive and admins still see the balance. */
export async function leaveGroup(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(form);
  const db = orgDb(ctx.org.id);
  if (ctx.member.role_key === "owner") {
    const { count } = await db
      .select("members", "id", { count: "exact", head: true })
      .eq("role_key", "owner")
      .eq("status", "active");
    if ((count ?? 0) <= 1) return { error: "You're the only owner. Make someone else owner first, in Admin › People." };
  }
  await db.update("members", { status: "inactive" }).eq("id", ctx.member.id);
  await createAdminClient().from("profiles").update({ last_org_id: null }).eq("id", ctx.profile.id).eq("last_org_id", ctx.org.id);
  redirect("/groups");
}
