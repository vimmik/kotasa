import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isPermission, type Permission } from "@/lib/permissions";
import type { Member, Org, OrgSettings, Profile } from "@/lib/types";

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** The logged-in auth user's id, or null. */
export async function getAuthUserId(): Promise<string | null> {
  // getClaims() checks token expiry with Date.now(); defer to request time so
  // Cache Components doesn't flag it during prerender validation.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}

/** The profile behind the current login, or null. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const uid = await getAuthUserId();
  if (!uid) return null;
  const { data } = await createAdminClient()
    .from("profile_logins")
    .select("profiles(*)")
    .eq("auth_user_id", uid)
    .maybeSingle();
  return (data as { profiles: Profile | null } | null)?.profiles ?? null;
});

export async function requireProfile(): Promise<Profile> {
  const p = await getCurrentProfile();
  if (!p) redirect("/login");
  return p;
}

export type OrgContext = {
  profile: Profile;
  member: Member;
  org: Org;
  settings: OrgSettings;
  perms: Set<Permission>;
  /** URL prefix for this group, e.g. "/g/office" */
  base: string;
};

/** The current profile's membership in the group with this slug (any status), or null. */
export const getOrgContext = cache(async (slug: string): Promise<OrgContext | null> => {
  if (!SLUG_RE.test(slug)) return null;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const admin = createAdminClient();
  const { data: org } = await admin.from("orgs").select("*").eq("slug", slug).maybeSingle();
  if (!org) return null;
  const [{ data: member }, { data: settings }] = await Promise.all([
    admin.from("members").select("*").eq("org_id", org.id).eq("profile_id", profile.id).maybeSingle(),
    admin.from("org_settings").select("*").eq("org_id", org.id).single(),
  ]);
  if (!member || !settings) return null;
  const { data: role } = await admin
    .from("org_roles")
    .select("permissions")
    .eq("org_id", org.id)
    .eq("key", member.role_key)
    .single();
  const perms = new Set(((role?.permissions ?? []) as string[]).filter(isPermission));
  return {
    profile,
    member: member as Member,
    org: org as Org,
    settings: { ...(settings as OrgSettings), sms_fee: Number(settings.sms_fee) },
    perms,
    base: `/g/${org.slug}`,
  };
});

/**
 * Gate for everything under /g/[slug]. Not a member (or no such group) is a 404, so group
 * names can't be probed. Pending and inactive members go back to /groups.
 */
export async function requireMember(slug: string): Promise<OrgContext> {
  await requireProfile();
  const ctx = await getOrgContext(slug);
  if (!ctx) notFound();
  if (ctx.member.status === "pending") redirect("/groups");
  if (ctx.member.status !== "active") redirect("/groups");
  return ctx;
}

export function can(ctx: OrgContext, p: Permission) {
  return ctx.perms.has(p);
}

/** For pages: no permission sends you to the group's home. */
export async function requirePermission(slug: string, p: Permission): Promise<OrgContext> {
  const ctx = await requireMember(slug);
  if (!can(ctx, p)) redirect(ctx.base);
  return ctx;
}

/** For server actions: forms inside a group post a hidden "org" field (see OrgField). It only
 *  picks which membership to check; the membership itself is verified here. */
export async function requireMemberFromForm(f: FormData): Promise<OrgContext> {
  return requireMember(String(f.get("org") ?? ""));
}

/** For pages of optional modules. */
export function requireModule(ctx: OrgContext, module: "meals" | "budgets" | "circles") {
  const on = { meals: ctx.settings.meals_enabled, budgets: ctx.settings.budgets_enabled, circles: ctx.settings.circles_enabled };
  if (!on[module]) notFound();
}

/** True once anyone has an account; /setup only works before that. */
export async function hasAnyProfile(): Promise<boolean> {
  await connection();
  const { count } = await createAdminClient().from("profiles").select("id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}

export type Membership = { member: Member; org: Org };

/** Every group this profile belongs to (any status), newest first. */
export async function getMemberships(profileId: string): Promise<Membership[]> {
  const { data } = await createAdminClient()
    .from("members")
    .select("*, orgs!members_org_id_fkey(*)") // named: meal_joins is a second members↔orgs path
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as (Member & { orgs: Org })[]).map(({ orgs, ...member }) => ({ member, org: orgs }));
}
