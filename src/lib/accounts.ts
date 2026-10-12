import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { currencyForCountry } from "@/lib/currency";
import { slugify } from "@/lib/org-config";
import type { Invite, Member, Org, OrgKind, OrgSettings, Profile } from "@/lib/types";

/** A free slug based on the name: "office", "office-2", ... */
export async function freeSlug(name: string): Promise<string> {
  const base = slugify(name);
  const { data } = await createAdminClient().from("orgs").select("slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((o) => o.slug as string));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const s = `${base}-${i}`;
    if (!taken.has(s)) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Create a group with this profile as owner (roles, settings, categories, meal slots seeded). */
export async function createGroup(profile: Profile, name: string, kind: OrgKind): Promise<Org> {
  const admin = createAdminClient();
  const slug = await freeSlug(name);
  const { data: orgId, error } = await admin.rpc("create_org", {
    p_name: name,
    p_kind: kind,
    p_slug: slug,
    p_profile: profile.id,
    p_owner_name: profile.full_name,
    p_owner_phone: profile.phone,
    p_owner_email: profile.email,
  });
  if (error || !orgId) throw new Error(error?.message ?? "Couldn't create the group");
  const { data: org } = await admin.from("orgs").select("*").eq("id", orgId).single();
  return org as Org;
}

/** Find or create the profile for a verified email login (Google / email OTP) and link the login. */
export async function profileForVerifiedEmail(opts: {
  authUserId: string;
  email: string;
  name: string;
  method: "google" | "email";
  /** Me currency for a new profile, from the visitor's country */
  currency?: string;
}): Promise<{ profile: Profile; created: boolean }> {
  const admin = createAdminClient();
  const email = opts.email.toLowerCase();
  let { data: profile } = await admin.from("profiles").select("*").eq("email", email).maybeSingle();
  const created = !profile;
  if (!profile) {
    const { data, error } = await admin.from("profiles").insert({ full_name: opts.name, email, currency: opts.currency ?? "LKR" }).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't create your account");
    profile = data;
  }
  await admin
    .from("profile_logins")
    .upsert({ auth_user_id: opts.authUserId, profile_id: profile.id, method: opts.method }, { onConflict: "auth_user_id" });
  // Invited by email (in any group) and not linked yet: the verified email proves it's them.
  await claimGuestsByEmail(profile.id, email);
  await syncMemberContacts(profile.id);
  return { profile: profile as Profile, created };
}

export type InviteInfo = { invite: Invite; org: Org };

/** A usable invite (not revoked, expired or used up), or null. */
export async function findInvite(code: string): Promise<InviteInfo | null> {
  if (!/^[0-9a-f]{16}$/.test(code)) return null;
  const { data } = await createAdminClient()
    .from("org_invites")
    .select("*, orgs(*)")
    .eq("code", code)
    .eq("revoked", false)
    .maybeSingle();
  if (!data) return null;
  const { orgs, ...invite } = data as Invite & { orgs: Org };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return null;
  if (invite.max_uses !== null && invite.uses >= invite.max_uses) return null;
  return { invite, org: orgs };
}

/**
 * Join a group with an invite. Returns the member row.
 * - Already a member: active stays active; inactive comes back (pending if the invite needs approval).
 * - Claim invite (member_id set), or a guest here with the same mobile number or email: the
 *   guest's history becomes this profile's, so the person isn't in the group twice.
 */
export async function acceptInvite(profile: Profile, info: InviteInfo): Promise<Member> {
  const admin = createAdminClient();
  const { invite, org } = info;
  const status = invite.needs_approval ? "pending" : "active";

  const { data: existing } = await admin
    .from("members")
    .select("*")
    .eq("org_id", org.id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  let member: Member;
  let guest: Member | null = null;
  if (existing) {
    member = existing as Member;
    if (member.status === "inactive") {
      const { data } = await admin.from("members").update({ status }).eq("id", member.id).select("*").single();
      member = data as Member;
    }
  } else if (invite.member_id || (guest = await guestFor(org.id, profile, invite))) {
    if (invite.member_id) {
      const { data } = await admin
        .from("members")
        .select("*")
        .eq("org_id", org.id)
        .eq("id", invite.member_id)
        .is("profile_id", null)
        .maybeSingle();
      guest = data as Member | null;
    }
    if (!guest) throw new Error("This invite was already used");
    const { data } = await admin
      .from("members")
      .update({ profile_id: profile.id, status: guest.status === "inactive" ? status : guest.status })
      .eq("id", guest.id)
      .select("*")
      .single();
    member = data as Member;
  } else {
    const { data, error } = await admin
      .from("members")
      .insert({
        org_id: org.id,
        profile_id: profile.id,
        full_name: profile.full_name,
        email: await freeIn(org.id, "email", profile.email),
        phone: await freeIn(org.id, "phone", profile.phone),
        role_key: invite.role_key,
        status,
        created_by: invite.created_by,
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't join");
    member = data as Member;
  }

  await syncMemberContacts(profile.id);
  await admin.from("org_invites").update({ uses: invite.uses + 1 }).eq("id", invite.id);
  if (member.status === "active") await admin.from("profiles").update({ last_org_id: org.id }).eq("id", profile.id);
  return member;
}

// ---------- One person, one member per group ----------

/** The value, if nobody in this group uses it yet (members.phone / email are unique per group). */
async function freeIn(orgId: string, col: "phone" | "email", value: string | null): Promise<string | null> {
  if (!value) return null;
  const { data } = await createAdminClient().from("members").select("id").eq("org_id", orgId).eq(col, value).limit(1);
  return data?.length ? null : value;
}

/**
 * A guest (added by mobile or Gmail, no login yet) in this group who is this profile: same mobile
 * number or same verified email. Joining then takes over the guest instead of adding a second row.
 * Not for invites that need approval: a pending row can be rejected (deleted), and a guest's
 * history must never go with it.
 */
async function guestFor(orgId: string, profile: Profile, invite: Invite): Promise<Member | null> {
  if (invite.needs_approval) return null;
  for (const col of ["email", "phone"] as const) {
    if (!profile[col]) continue;
    const { data } = await createAdminClient()
      .from("members")
      .select("*")
      .eq("org_id", orgId)
      .eq(col, profile[col])
      .is("profile_id", null)
      .maybeSingle();
    if (data) return data as Member;
  }
  return null;
}

/** Guests invited by this (verified) email become this profile, in groups it isn't in yet. */
async function claimGuestsByEmail(profileId: string, email: string) {
  const admin = createAdminClient();
  const [{ data: guests }, { data: mine }] = await Promise.all([
    admin.from("members").select("id, org_id").eq("email", email).is("profile_id", null),
    admin.from("members").select("org_id").eq("profile_id", profileId),
  ]);
  const inOrg = new Set((mine ?? []).map((m) => m.org_id as string));
  for (const g of guests ?? []) {
    if (!inOrg.has(g.org_id)) await admin.from("members").update({ profile_id: profileId }).eq("id", g.id);
  }
}

/**
 * Copy the account's mobile number and email onto its member rows that have none, so People
 * shows them and the weekly SMS reaches them. Skips a group where someone else already has the
 * value: that is usually an old guest row of the same person, which an admin merges (People).
 */
export async function syncMemberContacts(profileId: string) {
  const admin = createAdminClient();
  const [{ data: p }, { data: rows }] = await Promise.all([
    admin.from("profiles").select("phone, email").eq("id", profileId).single(),
    admin.from("members").select("id, org_id, phone, email").eq("profile_id", profileId),
  ]);
  if (!p) return;
  for (const m of rows ?? []) {
    const patch: Record<string, string> = {};
    if (!m.phone && (await freeIn(m.org_id, "phone", p.phone))) patch.phone = p.phone!;
    if (!m.email && (await freeIn(m.org_id, "email", p.email))) patch.email = p.email!;
    if (Object.keys(patch).length) await admin.from("members").update(patch).eq("id", m.id);
  }
}

/** Move all of one member's history onto another in the same group and delete the first. */
export async function mergeMembers(orgId: string, fromId: string, toId: string): Promise<string | null> {
  const { error } = await createAdminClient().rpc("merge_members", { p_org: orgId, p_from: fromId, p_to: toId });
  if (!error) return null;
  if (error.message.includes("same day")) return "Both have a meal order for the same day. Remove one of them first, then merge.";
  return "Couldn't merge them. Try again.";
}

/**
 * Guests in a group who look like a member with an account: same mobile number or email, on the
 * member row or on their account. Shown on People so an admin can merge the two.
 */
export async function duplicateGuests(orgId: string, members: Member[]): Promise<Map<string, Member>> {
  const guests = members.filter((m) => !m.profile_id && (m.phone || m.email));
  const withLogin = members.filter((m) => m.profile_id);
  const found = new Map<string, Member>();
  if (!guests.length || !withLogin.length) return found;
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, phone, email")
    .in("id", withLogin.map((m) => m.profile_id!));
  const profiles = new Map((data ?? []).map((p) => [p.id as string, p as { phone: string | null; email: string | null }]));
  for (const g of guests) {
    const match = withLogin.find((m) => {
      const p = profiles.get(m.profile_id!);
      const phones = [m.phone, p?.phone].filter(Boolean);
      const emails = [m.email, p?.email].filter(Boolean);
      return (g.phone && phones.includes(g.phone)) || (g.email && emails.includes(g.email));
    });
    if (match) found.set(g.id, match);
  }
  return found;
}

/** Remember the group someone opened last, so "/" can send them back there. Server-only. */
export async function rememberGroup(profile: Profile, orgId: string) {
  if (profile.last_org_id === orgId) return;
  await createAdminClient().from("profiles").update({ last_org_id: orgId }).eq("id", profile.id);
}

/** This profile's status in a group, or null if not a member. */
export async function membershipStatus(orgId: string, profileId: string) {
  const { data } = await createAdminClient()
    .from("members")
    .select("status")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return (data?.status as Member["status"] | undefined) ?? null;
}

/** The member behind a public bill link (/b/<token>), with their group. */
export async function memberByViewToken(token: string): Promise<{ member: Member; org: Org } | null> {
  if (!/^[0-9a-f]{24}$/.test(token)) return null;
  const { data } = await createAdminClient().from("members").select("*, orgs!members_org_id_fkey(*)").eq("view_token", token).maybeSingle();
  if (!data) return null;
  const { orgs, ...member } = data as Member & { orgs: Org };
  return { member, org: orgs };
}

/** Groups that have real SMS sending switched on (for the weekly cron). */
export async function groupsWithSmsOn(): Promise<{ org: Org; settings: OrgSettings }[]> {
  const { data } = await createAdminClient().from("org_settings").select("*, orgs(*)").eq("sms_enabled", true);
  return ((data ?? []) as (OrgSettings & { orgs: Org })[]).map(({ orgs, ...settings }) => ({
    org: orgs,
    settings: { ...settings, sms_fee: Number(settings.sms_fee) },
  }));
}

// ---------- Connecting logins ----------

/** Cookie that carries a signed "link the next Google login to this profile" ticket (10 minutes). */
export const LINK_COOKIE = "kotasa_link";

const signTicket = (body: string) =>
  createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`link:${body}`).digest("base64url");

export function linkTicket(profileId: string) {
  const body = `${profileId}.${Date.now() + 10 * 60_000}`;
  return `${body}.${signTicket(body)}`;
}

/** The profile id in a valid, unexpired ticket, or null. */
export function readLinkTicket(ticket: string | undefined): string | null {
  const [id, exp, sig] = (ticket ?? "").split(".");
  if (!id || !exp || !sig) return null;
  const want = Buffer.from(signTicket(`${id}.${exp}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return Number(exp) > Date.now() ? id : null;
}

/** Add a verified Google login to an existing profile. Returns an error sentence, or null. */
export async function linkGoogle(profileId: string, authUserId: string, email: string): Promise<string | null> {
  const admin = createAdminClient();
  email = email.toLowerCase();
  const [{ data: google }, { data: owner }] = await Promise.all([
    admin.from("profile_logins").select("auth_user_id").eq("profile_id", profileId).eq("method", "google").maybeSingle(),
    admin.from("profiles").select("id").eq("email", email).maybeSingle(),
  ]);
  if (google && google.auth_user_id !== authUserId) return "Your account already has a different Google login.";
  if (owner && owner.id !== profileId) return "That Google account is already used by another Kotasa account.";
  const { error } = await admin
    .from("profile_logins")
    .upsert({ auth_user_id: authUserId, profile_id: profileId, method: "google" }, { onConflict: "auth_user_id" });
  if (error) return "Couldn't connect Google. Try again.";
  await admin.from("profiles").update({ email }).eq("id", profileId).is("email", null);
  await claimGuestsByEmail(profileId, email);
  await syncMemberContacts(profileId);
  return null;
}

/**
 * Someone signed up with Google, then shows (with the PIN) that they already had a Kotasa account
 * on their mobile number. Move the new account's logins and groups onto the old one and delete the
 * new one. Only for a new account with no Me entries or budgets yet, so nothing personal is lost.
 * Returns an error sentence, or null.
 */
export async function mergeNewProfileInto(fromId: string, toId: string): Promise<string | null> {
  if (fromId === toId) return null;
  const admin = createAdminClient();
  const [{ count: spent }, { count: budgets }, { data: fromLogins }, { data: toGoogle }, { data: from }] = await Promise.all([
    admin.from("personal_expenses").select("id", { count: "exact", head: true }).eq("profile_id", fromId),
    admin.from("personal_budgets").select("id", { count: "exact", head: true }).eq("profile_id", fromId),
    admin.from("profile_logins").select("method").eq("profile_id", fromId),
    admin.from("profile_logins").select("auth_user_id").eq("profile_id", toId).eq("method", "google").maybeSingle(),
    admin.from("profiles").select("email").eq("id", fromId).single(),
  ]);
  if ((spent ?? 0) > 0 || (budgets ?? 0) > 0)
    return "This Google account already has its own budget or spending in Me, so it can't be joined to another account.";
  if (toGoogle && (fromLogins ?? []).some((l) => l.method === "google"))
    return "That mobile account is already connected to a different Google account.";

  // Groups: move each membership over, unless the old account is already in that group.
  const [{ data: fromMembers }, { data: toMembers }] = await Promise.all([
    admin.from("members").select("id, org_id").eq("profile_id", fromId),
    admin.from("members").select("id, org_id").eq("profile_id", toId),
  ]);
  const toMember = new Map((toMembers ?? []).map((m) => [m.org_id as string, m.id as string]));
  for (const m of fromMembers ?? []) {
    const keep = toMember.get(m.org_id);
    // Already in that group with the old account: one person, so fold the new row into it.
    if (keep) {
      const err = await mergeMembers(m.org_id, m.id, keep);
      if (err) return err;
    } else await admin.from("members").update({ profile_id: toId }).eq("id", m.id);
  }
  await admin.from("orgs").update({ created_by: toId }).eq("created_by", fromId);

  // Logins first, so a failure later never leaves a login pointing at nothing.
  const { error } = await admin.from("profile_logins").update({ profile_id: toId }).eq("profile_id", fromId);
  if (error) return "Couldn't connect the accounts. Try again.";
  if (from?.email) {
    await admin.from("profiles").update({ email: null }).eq("id", fromId);
    await admin.from("profiles").update({ email: from.email }).eq("id", toId).is("email", null);
  }
  await admin.from("profiles").delete().eq("id", fromId); // its Me categories go with it
  await syncMemberContacts(toId);
  return null;
}

export type GoogleOutcome = { path: string } | { error: "in-use" | "link" | "google" };

/**
 * What happens after Google has signed someone in, by redirect (/auth/callback) or by ID token
 * (signInWithGoogleToken). The caller signs the session out on an error.
 * - linkTo set: "Connect Google" for that profile. Link this login to it, or fail.
 * - Already linked: go on.
 * - Otherwise find or create the profile by the verified email. A new one goes through /welcome
 *   first, unless it came from an invite link.
 */
export async function completeGoogleLogin(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  opts: { next: string; linkTo?: string | null; country?: string | null },
): Promise<GoogleOutcome> {
  const { data: linked } = await createAdminClient()
    .from("profile_logins")
    .select("profile_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const email = user.email?.toLowerCase();

  if (opts.linkTo) {
    if (linked) return linked.profile_id === opts.linkTo ? { path: opts.next } : { error: "in-use" };
    if (!email) return { error: "google" };
    const err = await linkGoogle(opts.linkTo, user.id, email);
    if (!err) return { path: opts.next };
    return { error: err.includes("another Kotasa account") ? "in-use" : "link" };
  }

  if (linked) return { path: opts.next };
  if (!email) return { error: "google" };
  const meta = user.user_metadata ?? {};
  try {
    const { created } = await profileForVerifiedEmail({
      authUserId: user.id,
      email,
      name: String(meta.full_name || meta.name || email.split("@")[0]),
      method: "google",
      currency: currencyForCountry(opts.country),
    });
    return { path: created && !opts.next.startsWith("/join/") ? "/welcome" : opts.next };
  } catch {
    return { error: "google" };
  }
}
