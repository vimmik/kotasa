import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { orgDb } from "@/lib/org-db";

/**
 * Where to send money to each member of a group: their bank details for this group, else the ones
 * on their profile (every group). Members with neither aren't in the map. Empty before the
 * 20261112 migration, so pages never break on it.
 */
export async function payDetailsFor(orgId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data, error } = await orgDb(orgId).select("members", "id, profile_id, pay_details").in("status", ["active", "inactive"]);
  if (error || !data) return out;
  const rows = data as { id: string; profile_id: string | null; pay_details: string | null }[];
  const profileIds = [...new Set(rows.filter((r) => !r.pay_details?.trim() && r.profile_id).map((r) => r.profile_id!))];
  const profiles = new Map<string, string>();
  if (profileIds.length) {
    const { data: p } = await createAdminClient().from("profiles").select("id, pay_details").in("id", profileIds);
    for (const r of (p ?? []) as { id: string; pay_details: string | null }[]) if (r.pay_details?.trim()) profiles.set(r.id, r.pay_details.trim());
  }
  for (const r of rows) {
    const d = r.pay_details?.trim() || (r.profile_id ? profiles.get(r.profile_id) : undefined);
    if (d) out.set(r.id, d);
  }
  return out;
}
