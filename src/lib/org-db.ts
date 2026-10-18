import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

type OrgTable =
  | "members"
  | "org_roles"
  | "org_settings"
  | "org_categories"
  | "org_meal_slots"
  | "org_invites"
  | "circles"
  | "circle_members"
  | "budgets"
  | "expenses"
  | "expense_shares"
  | "expense_copayers"
  | "menu_items"
  | "orders"
  | "meal_payers"
  | "meal_copayers"
  | "meal_days"
  | "meal_joins"
  | "settlements"
  | "sms_logs"
  | "org_closings"
  | "org_closing_balances"
  | "ledger";

type Row = Record<string, unknown>;

/**
 * The only way pages and actions touch group data. Every read, update and delete is filtered
 * to this group, and every insert is stamped with it. The service-role client bypasses RLS,
 * so this filter (plus the composite foreign keys in the schema) is what keeps groups apart.
 */
export function orgDb(orgId: string) {
  const db = createAdminClient();
  const stamp = (r: Row) => ({ ...r, org_id: orgId });
  const strip = (r: Row) => {
    const { org_id: _ignored, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
    return rest;
  };
  return {
    // Column lists are runtime strings, so they're typed as "*" (rows come back untyped; callers cast).
    select: (table: OrgTable, columns = "*", opts?: { count?: "exact"; head?: boolean }) =>
      db
        .from(table)
        .select(columns as "*", opts)
        .eq("org_id", orgId),
    insert: (table: OrgTable, rows: Row | Row[]) =>
      db.from(table).insert(Array.isArray(rows) ? rows.map(stamp) : stamp(rows)),
    upsert: (table: OrgTable, rows: Row | Row[], opts: { onConflict: string }) =>
      db.from(table).upsert(Array.isArray(rows) ? rows.map(stamp) : stamp(rows), opts),
    update: (table: OrgTable, values: Row) => db.from(table).update(strip(values)).eq("org_id", orgId),
    delete: (table: OrgTable) => db.from(table).delete().eq("org_id", orgId),
  };
}

export type OrgDb = ReturnType<typeof orgDb>;
