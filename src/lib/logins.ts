import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { phoneToAuthEmail } from "@/lib/phone";

/**
 * Create or update the phone+PIN login for a person.
 * PIN logins use an internal email derived from the phone number.
 */
export async function upsertPinLogin(personId: string, phone94: string, pin: string): Promise<string | null> {
  const admin = createAdminClient();
  const email = phoneToAuthEmail(phone94);
  const { data: existing } = await admin
    .from("person_logins")
    .select("auth_user_id")
    .eq("person_id", personId)
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
    .from("person_logins")
    .insert({ auth_user_id: data.user.id, person_id: personId, method: "pin" });
  if (lErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return lErr.message;
  }
  return null;
}

/** Keep the PIN login's internal email in sync when a phone number changes. */
export async function syncPinLoginPhone(personId: string, phone94: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("person_logins")
    .select("auth_user_id")
    .eq("person_id", personId)
    .eq("method", "pin")
    .maybeSingle();
  if (data) {
    await admin.auth.admin.updateUserById(data.auth_user_id, { email: phoneToAuthEmail(phone94), email_confirm: true });
  }
}

/** Remove every login (auth user) of a person. */
export async function deleteLogins(personId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("person_logins").select("auth_user_id").eq("person_id", personId);
  for (const l of data ?? []) await admin.auth.admin.deleteUser(l.auth_user_id);
}
