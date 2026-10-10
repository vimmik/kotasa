import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { phoneToAuthEmail } from "@/lib/phone";

/**
 * Create or update the phone+PIN login for a profile.
 * PIN logins use an internal email derived from the phone number.
 */
export async function upsertPinLogin(profileId: string, phone94: string, pin: string): Promise<string | null> {
  const admin = createAdminClient();
  const email = phoneToAuthEmail(phone94);
  const { data: existing } = await admin
    .from("profile_logins")
    .select("auth_user_id")
    .eq("profile_id", profileId)
    .eq("method", "pin")
    .maybeSingle();

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.auth_user_id, {
      email,
      email_confirm: true,
      password: pin,
    });
    return error?.message ?? null;
  }

  const { data, error } = await admin.auth.admin.createUser({ email, password: pin, email_confirm: true });
  if (error || !data.user) return error?.message ?? "Could not create login";
  const { error: lErr } = await admin
    .from("profile_logins")
    .insert({ auth_user_id: data.user.id, profile_id: profileId, method: "pin" });
  if (lErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return lErr.message;
  }
  return null;
}

/** Login methods a profile has ("pin", "google", "email"). */
export async function loginMethods(profileId: string): Promise<Set<string>> {
  const { data } = await createAdminClient().from("profile_logins").select("method").eq("profile_id", profileId);
  return new Set((data ?? []).map((l) => l.method as string));
}

/**
 * An admin may reset someone's PIN only if that profile lives entirely inside the admin's group
 * (they made it there, it has no Google/email login, and it isn't in any other group).
 * Otherwise one group's admin could take over an account used elsewhere.
 */
export async function profileOwnedByOrg(profileId: string, orgId: string): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: memberships }, methods] = await Promise.all([
    admin.from("members").select("org_id").eq("profile_id", profileId),
    loginMethods(profileId),
  ]);
  const orgs = new Set((memberships ?? []).map((m) => m.org_id));
  return orgs.size === 1 && orgs.has(orgId) && [...methods].every((m) => m === "pin");
}

/** Remove every login (auth user) of a profile. */
export async function deleteLogins(profileId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profile_logins").select("auth_user_id").eq("profile_id", profileId);
  for (const l of data ?? []) await admin.auth.admin.deleteUser(l.auth_user_id);
}
