import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
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
}): Promise<Profile> {
  const admin = createAdminClient();
  const email = opts.email.toLowerCase();
  let { data: profile } = await admin.from("profiles").select("*").eq("email", email).maybeSingle();
  if (!profile) {
    const { data, error } = await admin.from("profiles").insert({ full_name: opts.name, email }).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't create your account");
    profile = data;
  }
  await admin
    .from("profile_logins")
    .upsert({ auth_user_id: opts.authUserId, profile_id: profile.id, method: opts.method }, { onConflict: "auth_user_id" });
  // Invited by email (in any group) and not linked yet: the verified email proves it's them.
  await admin.from("members").update({ profile_id: profile.id }).eq("email", email).is("profile_id", null);
  return profile as Profile;
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
 * - Claim invite (member_id set): the guest's history becomes this profile's.
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
  if (existing) {
    member = existing as Member;
    if (member.status === "inactive") {
      const { data } = await admin.from("members").update({ status }).eq("id", member.id).select("*").single();
      member = data as Member;
    }
  } else if (invite.member_id) {
    const { data: guest } = await admin
      .from("members")
      .select("*")
      .eq("org_id", org.id)
      .eq("id", invite.member_id)
      .is("profile_id", null)
      .maybeSingle();
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
        email: profile.email,
        role_key: invite.role_key,
        status,
        created_by: invite.created_by,
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't join");
    member = data as Member;
  }

  await admin.from("org_invites").update({ uses: invite.uses + 1 }).eq("id", invite.id);
  if (member.status === "active") await admin.from("profiles").update({ last_org_id: org.id }).eq("id", profile.id);
  return member;
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
