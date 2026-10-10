"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getCurrentPerson, requireMember } from "@/lib/auth";
import { upsertPinLogin } from "@/lib/logins";
import { isValidPin, normalizePhone } from "@/lib/phone";
import type { ActionState } from "@/lib/types";

export async function loginWithPin(_: ActionState, form: FormData): Promise<ActionState> {
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const pin = String(form.get("pin") ?? "");
  if (!phone) return { error: "Enter a valid mobile number (07XXXXXXXX)" };
  if (!isValidPin(pin)) return { error: "Your PIN is 6 digits" };

  const admin = createAdminClient();
  const { data: person } = await admin.from("people").select("id, status").eq("phone", phone).maybeSingle();
  if (!person) return { error: "This number isn't registered yet. Ask your admin to add you." };
  if (person.status === "inactive") return { error: "Your account is inactive. Contact your admin." };

  const { data: login } = await admin
    .from("person_logins")
    .select("auth_user_id")
    .eq("person_id", person.id)
    .eq("method", "pin")
    .maybeSingle();
  if (!login) return { error: "PIN login isn't set up for you. Sign in with Google or ask your admin for a PIN." };

  const { data: u } = await admin.auth.admin.getUserById(login.auth_user_id);
  if (!u.user?.email) return { error: "Login problem. Ask your admin to reset your PIN." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: u.user.email, password: pin });
  if (error) return { error: "Wrong PIN. Try again." };
  redirect("/");
}

async function origin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function loginWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** First-run: create the first admin with phone + PIN. Only works while nobody exists yet. */
export async function setupFirstAdmin(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = createAdminClient();
  const { count } = await admin.from("people").select("id", { count: "exact", head: true }).eq("is_admin", true);
  if ((count ?? 0) > 0) return { error: "An admin already exists. Log in instead." };

  const name = String(form.get("full_name") ?? "").trim();
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const pin = String(form.get("pin") ?? "");
  if (!name) return { error: "Enter your name" };
  if (!phone) return { error: "Enter a valid mobile number" };
  if (!isValidPin(pin)) return { error: "PIN must be 6 digits" };

  const { data: person, error } = await admin
    .from("people")
    .insert({ full_name: name, phone, is_admin: true })
    .select("id")
    .single();
  if (error || !person) return { error: error?.message ?? "Couldn't create admin" };

  const err = await upsertPinLogin(person.id, phone, pin);
  if (err) {
    await admin.from("people").delete().eq("id", person.id);
    return { error: err };
  }
  await admin.from("settings").update({ collector_id: person.id }).eq("id", 1);

  const { data: login } = await admin.from("person_logins").select("auth_user_id").eq("person_id", person.id).single();
  const { data: u } = await admin.auth.admin.getUserById(login!.auth_user_id);
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: u.user!.email!, password: pin });
  redirect("/admin/people");
}

/** Member sets/changes their own PIN (needs a phone number on file). */
export async function setMyPin(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMember();
  const pin = String(form.get("pin") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!isValidPin(pin)) return { error: "PIN must be 6 digits" };
  if (pin !== confirm) return { error: "PINs don't match" };
  if (!me.phone) return { error: "Ask your admin to add your mobile number first" };
  const err = await upsertPinLogin(me.id, me.phone, pin);
  return err ? { error: err } : { ok: true, message: "PIN saved. You can now log in with your number." };
}

/** Used by /pending to let someone withdraw their request. */
export async function cancelPending() {
  const me = await getCurrentPerson();
  if (me?.status === "pending") {
    const admin = createAdminClient();
    const { data } = await admin.from("person_logins").select("auth_user_id").eq("person_id", me.id);
    await admin.from("people").delete().eq("id", me.id);
    for (const l of data ?? []) await admin.auth.admin.deleteUser(l.auth_user_id);
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
