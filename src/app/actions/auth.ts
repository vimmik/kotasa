"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasAnyProfile, landingPath, requireMemberFromForm, requireProfile } from "@/lib/auth";
import {
  acceptInvite,
  completeGoogleLogin,
  createGroup,
  findInvite,
  LINK_COOKIE,
  linkTicket,
  mergeNewProfileInto,
  syncMemberContacts,
} from "@/lib/accounts";
import { loginMethods, pinMatches, upsertPinLogin } from "@/lib/logins";
import { orgDb } from "@/lib/org-db";
import { isValidPin, normalizePhone } from "@/lib/phone";
import { getMe } from "@/lib/personal";
import { isCurrency } from "@/lib/currency";
import { meDb } from "@/lib/me-db";
import { todayColombo } from "@/lib/time";
import { ORG_KINDS, round2, type ActionState, type Org, type OrgKind, type Profile } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const MAX_AMOUNT = 99_999_999;

/**
 * Only same-site paths, so a crafted ?next= can't bounce people to another site. Defaults to /start
 * (Me or the group, see land()), not "/": a redirect from a server action is rendered without going
 * through src/proxy.ts, so "/" would show the logged-out landing page.
 */
function safeNext(v: unknown) {
  const s = String(v ?? "");
  return s.startsWith("/") && s !== "/" && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/start";
}

/**
 * Where a login goes. "/start" (no ?next=) is resolved here rather than redirecting to the route:
 * a server action's redirect is rendered as a page, and /start is a route handler.
 */
async function land(next: string, authUserId: string) {
  if (next !== "/start") return next;
  const { data } = await createAdminClient().from("profile_logins").select("profiles(*)").eq("auth_user_id", authUserId).maybeSingle();
  const profile = (data as { profiles: Profile | null } | null)?.profiles;
  return profile ? landingPath(profile) : "/me";
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
  redirect(await land(safeNext(form.get("next")), login.auth_user_id));
}

async function origin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function loginWithGoogle(form: FormData) {
  await googleRedirect(safeNext(form.get("next")));
}

async function googleRedirect(next: string): Promise<never> {
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

const GOOGLE_ERRORS: Record<string, string> = {
  google: "Google sign-in didn't complete. Try again.",
  "in-use": "That Google account is already used by another Kotasa account. Log in with it, or use a different Google account.",
  link: "Couldn't connect that Google account. Try again.",
};

/**
 * Google sign-in that stays on our own domain: the Google button on the page hands over an ID
 * token, and Supabase checks it (with the raw nonce whose hash Google signed into the token).
 * - "login": sign in as that Google account, then the same steps as /auth/callback.
 * - "connect": add it to the logged-in account. A throwaway client checks the token, so the
 *   current (PIN) session stays as it is whatever happens.
 */
export async function signInWithGoogleToken(token: string, nonce: string, intent: "login" | "connect", nextRaw: string): Promise<ActionState> {
  if (typeof token !== "string" || typeof nonce !== "string" || !token || !nonce) return { error: GOOGLE_ERRORS.google };
  const country = (await headers()).get("x-vercel-ip-country");

  if (intent === "connect") {
    const me = await requireProfile();
    const probe = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await probe.auth.signInWithIdToken({ provider: "google", token, nonce });
    if (error || !data.user) return { error: GOOGLE_ERRORS.google };
    const outcome = await completeGoogleLogin(data.user, { next: "/me/settings?google=connected", linkTo: me.id, country });
    await probe.auth.signOut();
    if ("error" in outcome) return { error: GOOGLE_ERRORS[outcome.error] };
    redirect(outcome.path);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce });
  if (error || !data.user) return { error: GOOGLE_ERRORS.google };
  const outcome = await completeGoogleLogin(data.user, { next: safeNext(nextRaw), country });
  if ("error" in outcome) {
    await supabase.auth.signOut();
    return { error: GOOGLE_ERRORS[outcome.error] };
  }
  redirect(await land(outcome.path, data.user.id));
}

/**
 * Logged in with phone + PIN: add Google as a second way in (redirect flow, used when the
 * on-page Google button isn't set up). A signed, short-lived cookie tells the
 * auth callback which account the Google login belongs to.
 */
export async function connectGoogle() {
  const me = await requireProfile();
  if ((await loginMethods(me.id)).has("google")) redirect("/me/settings");
  (await cookies()).set(LINK_COOKIE, linkTicket(me.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/callback",
    maxAge: 600,
  });
  await googleRedirect("/me/settings?google=connected");
}

/**
 * Signed up with Google but already had a Kotasa account on a mobile number: the PIN proves it's
 * theirs, and the new account is folded into the old one (see mergeNewProfileInto).
 */
export async function connectPhoneAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireProfile();
  if (me.phone) return { error: "Your account already has a mobile number." };
  const phone = normalizePhone(str(form, "phone"));
  const pin = str(form, "pin");
  if (!phone) return { error: "Enter a valid mobile number (07XXXXXXXX)" };
  if (!isValidPin(pin)) return { error: "The PIN is 6 digits" };
  const { data: old } = await createAdminClient().from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (!old || !(await pinMatches(old.id, pin)))
    return { error: "That number and PIN don't match a Kotasa account. Check them and try again." };
  const err = await mergeNewProfileInto(me.id, old.id);
  if (err) return { error: err };
  redirect(str(form, "back") === "settings" ? "/me/settings?phone=connected" : "/me");
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
    if (taken)
      return { error: "That number already has a Kotasa account. If it's yours, connect it with its PIN in Me › Settings." };
    await admin.from("profiles").update({ phone }).eq("id", me.id);
  }
  const err = await upsertPinLogin(me.id, phone, pin);
  if (!me.phone) await syncMemberContacts(me.id);
  return err ? { error: err } : { ok: true, message: "PIN saved. You can now log in with your number." };
}

/** Checks a new group's name, kind and the per-person limit, then creates it. A string is an error. */
async function newGroup(me: Profile, form: FormData): Promise<Org | string> {
  const name = str(form, "name");
  const kind = str(form, "kind") as OrgKind;
  if (!name || name.length > 60) return "Give the group a name (up to 60 characters)";
  if (!ORG_KINDS.some((k) => k.id === kind)) return "Pick what kind of group it is";
  const { count } = await createAdminClient()
    .from("orgs")
    .select("id", { count: "exact", head: true })
    .eq("created_by", me.id);
  if ((count ?? 0) >= 20) return "You've created 20 groups, which is the limit for now";
  return createGroup(me, name, kind);
}

export async function createGroupAction(_: ActionState, form: FormData): Promise<ActionState> {
  const org = await newGroup(await requireProfile(), form);
  if (typeof org === "string") return { error: org };
  redirect(`/g/${org.slug}`);
}

/**
 * The last step of /welcome, after a new sign-up. Saves your name and money settings, then does
 * the one thing you picked: set a monthly main budget, create a group, open an invite, or nothing.
 */
export async function finishWelcome(_: ActionState, form: FormData): Promise<ActionState> {
  const { profile } = await getMe(); // also seeds your Me categories
  const name = str(form, "full_name").slice(0, 60);
  const currency = str(form, "currency");
  const incomeRaw = str(form, "monthly_income").replace(/,/g, "");
  const income = incomeRaw ? round2(Number(incomeRaw)) : null;
  const choice = str(form, "choice");
  if (!name) return { error: "Enter your name, so your groups know who you are" };
  if (!isCurrency(currency)) return { error: "Pick a currency from the list" };
  if (income !== null && !(income > 0 && income <= MAX_AMOUNT)) return { error: "Enter your take-home pay, or leave it empty" };

  const db = meDb(profile.id);
  if (choice === "budget") {
    const amount = round2(Number(str(form, "budget").replace(/,/g, "")));
    if (!(amount > 0) || amount > MAX_AMOUNT) return { error: "Enter how much you want to spend in a month" };
    await db.updateProfile({ full_name: name, currency, monthly_income: income });
    const { data: main } = await db.select("personal_budgets", "id").eq("archived", false).eq("is_main", true).limit(1);
    if (!main?.length) {
      const { error } = await db.insert("personal_budgets", {
        name: "Monthly spending",
        amount,
        period: "month",
        starts_on: todayColombo(),
        is_main: true,
      });
      if (error) return { error: "Couldn't save your budget. Try again." };
    }
    redirect("/me");
  }

  if (choice === "group") {
    // Group checks first, so a bad group name doesn't half-save the rest.
    const kind = str(form, "kind");
    if (!str(form, "name") || !ORG_KINDS.some((k) => k.id === kind)) return { error: "Give the group a name and pick what it's for" };
    await db.updateProfile({ full_name: name, currency, monthly_income: income });
    const org = await newGroup({ ...profile, full_name: name }, form);
    if (typeof org === "string") return { error: org };
    redirect(`/g/${org.slug}`);
  }

  if (choice === "join") {
    // A whole invite link or just its code.
    const code = str(form, "invite").toLowerCase().match(/(?:^|\/join\/)([0-9a-f]{16})(?:[/?#]|$)/)?.[1];
    if (!code) return { error: "Paste the invite link someone sent you. It looks like …/join/ followed by 16 letters and numbers." };
    await db.updateProfile({ full_name: name, currency, monthly_income: income });
    redirect(`/join/${code}`);
  }

  await db.updateProfile({ full_name: name, currency, monthly_income: income });
  redirect("/me");
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
  refresh();
  redirect("/groups");
}
