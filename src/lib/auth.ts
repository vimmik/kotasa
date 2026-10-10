import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Person, Settings } from "@/lib/types";

/** The logged-in auth user's id, or null. */
export async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}

/** The person linked to the current login (any status), or null. */
export const getCurrentPerson = cache(async (): Promise<Person | null> => {
  const uid = await getAuthUserId();
  if (!uid) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("person_logins")
    .select("people(*)")
    .eq("auth_user_id", uid)
    .maybeSingle();
  const p = (data as { people: Person | null } | null)?.people;
  return p ?? null;
});

export async function requireMember(): Promise<Person> {
  const p = await getCurrentPerson();
  if (!p) redirect("/login");
  if (p.status === "pending") redirect("/pending");
  if (p.status !== "active") redirect("/login?error=inactive");
  return p;
}

export async function requireAdmin(): Promise<Person> {
  const p = await requireMember();
  if (!p.is_admin) redirect("/");
  return p;
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await createAdminClient().from("settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Settings row missing — did you run the migration?");
  return data as Settings;
}
