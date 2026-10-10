import "server-only";
import { orgDb } from "@/lib/org-db";
import { splitEqually } from "@/lib/split";
import type { MealSlot } from "@/lib/types";

/**
 * Is a meal "shared bill" on a day? The day's override (meal_days) wins, else the slot's default.
 * Returns a lookup for every day in [from, to].
 */
export async function mealModes(orgId: string, slots: MealSlot[], from: string, to: string) {
  const { data } = await orgDb(orgId).select("meal_days", "day, meal, pooled").gte("day", from).lte("day", to);
  const days = new Map(((data ?? []) as { day: string; meal: string; pooled: boolean }[]).map((r) => [`${r.day}|${r.meal}`, r.pooled]));
  const def = new Map(slots.map((s) => [s.key, s.pooled]));
  return (date: string, meal: string) => days.get(`${date}|${meal}`) ?? def.get(meal) ?? false;
}

export async function isPooled(orgId: string, slot: MealSlot, date: string) {
  return (await mealModes(orgId, [slot], date, date))(date, slot.key);
}

/** Who has joined a shared-bill meal on a day. */
export async function mealJoins(orgId: string, date: string, meal: string): Promise<string[]> {
  const { data } = await orgDb(orgId).select("meal_joins", "member_id").eq("join_date", date).eq("meal", meal);
  return ((data ?? []) as { member_id: string }[]).map((r) => r.member_id);
}

/**
 * Split every equal-split bill of a shared-bill meal among the people who joined it.
 * Called whenever the join list changes. Bills someone split by hand (custom) are left alone,
 * and with nobody joined the old shares stay (a bill must always have someone paying for it).
 */
export async function resplitMeal(orgId: string, date: string, meal: string) {
  const db = orgDb(orgId);
  const [joined, { data: bills }] = await Promise.all([
    mealJoins(orgId, date, meal),
    db.select("expenses", "id, amount").eq("meal_date", date).eq("meal", meal).eq("split_type", "equal"),
  ]);
  if (!joined.length) return;
  for (const b of (bills ?? []) as { id: string; amount: number }[]) {
    await db.delete("expense_shares").eq("expense_id", b.id);
    await db.insert(
      "expense_shares",
      splitEqually(Number(b.amount), joined).map((s) => ({ ...s, expense_id: b.id })),
    );
  }
}
