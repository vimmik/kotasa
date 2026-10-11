import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

type MeTable =
  | "personal_categories"
  | "personal_category_map"
  | "personal_group_feed"
  | "personal_expenses"
  | "personal_budgets";

type Row = Record<string, unknown>;

/**
 * The only way pages and actions touch someone's personal (Me) data. Like orgDb() for groups:
 * every read, update and delete is filtered to this profile and every insert is stamped with it.
 * Nobody else, group admins included, ever reads these tables.
 */
export function meDb(profileId: string) {
  const db = createAdminClient();
  const stamp = (r: Row) => ({ ...r, profile_id: profileId });
  const strip = (r: Row) => {
    const { profile_id: _ignored, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
    return rest;
  };
  return {
    select: (table: MeTable, columns = "*") =>
      db
        .from(table)
        .select(columns as "*")
        .eq("profile_id", profileId),
    insert: (table: MeTable, rows: Row | Row[]) =>
      db.from(table).insert(Array.isArray(rows) ? rows.map(stamp) : stamp(rows)),
    upsert: (table: MeTable, rows: Row | Row[], opts: { onConflict: string }) =>
      db.from(table).upsert(Array.isArray(rows) ? rows.map(stamp) : stamp(rows), opts),
    update: (table: MeTable, values: Row) => db.from(table).update(strip(values)).eq("profile_id", profileId),
    delete: (table: MeTable) => db.from(table).delete().eq("profile_id", profileId),
    /** Your own profile row (your name and money settings live there). */
    updateProfile: (values: { full_name?: string; currency?: string; monthly_income?: number | null; payday?: number | null }) =>
      db.from("profiles").update(values).eq("id", profileId),
    seed: () => db.rpc("seed_personal", { p_profile: profileId }),
    spend: (from: string, to: string) => db.rpc("personal_spend", { p_profile: profileId, p_from: from, p_to: to }),
  };
}

export type MeDb = ReturnType<typeof meDb>;
