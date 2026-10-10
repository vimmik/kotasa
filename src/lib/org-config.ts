import "server-only";
import { orgDb } from "@/lib/org-db";
import type { Category, Invite, MealSlot, Role } from "@/lib/types";

export async function getCategories(orgId: string, opts: { includeArchived?: boolean } = {}): Promise<Category[]> {
  let q = orgDb(orgId).select("org_categories", "key, label, icon, sort, archived").order("sort").order("label");
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as Category[];
}

export async function getMealSlots(orgId: string, opts: { includeArchived?: boolean } = {}): Promise<MealSlot[]> {
  let q = orgDb(orgId).select("org_meal_slots", "key, label, cutoff, sort, archived, pooled").order("sort").order("label");
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as MealSlot[];
}

export async function getRoles(orgId: string): Promise<Role[]> {
  const { data } = await orgDb(orgId).select("org_roles", "key, label, permissions, is_system, sort").order("sort");
  return (data ?? []) as Role[];
}

export async function getInvites(orgId: string): Promise<Invite[]> {
  const { data } = await orgDb(orgId)
    .select("org_invites")
    .eq("revoked", false)
    .order("created_at", { ascending: false });
  const now = Date.now();
  return ((data ?? []) as Invite[]).filter(
    (i) => (!i.expires_at || new Date(i.expires_at).getTime() > now) && (i.max_uses === null || i.uses < i.max_uses),
  );
}

/** "Colombo Office" -> "colombo-office" (2–40 chars, a–z 0–9 and dashes). */
export function slugify(name: string) {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return s.length >= 3 ? s : `group-${s || "x"}`.slice(0, 32);
}

/** Make a key for a category or meal slot from its label: "Evening tea" -> "evening_tea". */
export function keyify(label: string) {
  const k = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return k.length >= 2 ? k : `k_${k || "x"}`;
}

/** expense id -> its category's icon name, for activity lists. */
export async function expenseIconMap(orgId: string, expenseIds: string[]): Promise<Record<string, string>> {
  if (!expenseIds.length) return {};
  const [{ data: ex }, cats] = await Promise.all([
    orgDb(orgId).select("expenses", "id, category").in("id", expenseIds),
    getCategories(orgId, { includeArchived: true }),
  ]);
  const icon = new Map(cats.map((c) => [c.key, c.icon]));
  return Object.fromEntries(((ex ?? []) as { id: string; category: string }[]).map((e) => [e.id, icon.get(e.category) ?? "receipt"]));
}
