import "server-only";
import { cache } from "react";
import { getMemberships, requireProfile } from "@/lib/auth";
import { meDb } from "@/lib/me-db";
import { createAdminClient } from "@/lib/supabase/server";
import { closedPeriods, daysBetween, periodRange, suggestBudget, type Period, type Range } from "@/lib/periods";

export { suggestBudget };
import { nowColombo } from "@/lib/time";
import { round2, type Profile } from "@/lib/types";
import type { History } from "@/lib/quick-add";

export type PCategory = { key: string; label: string; icon: string; sort: number; archived: boolean };

export type PBudget = {
  id: string;
  name: string;
  amount: number;
  is_main: boolean;
  period: Period;
  starts_on: string;
  ends_on: string | null;
  /** null = all spending */
  categories: string[] | null;
  rollover: "off" | "carry" | "goal";
  archived: boolean;
  created_at: string;
};

/** One thing you spent on: your own entry, or your share of something in a group. */
export type SpendRow = {
  source: "manual" | "expense" | "meal" | "sms";
  ref_id: string;
  org_id: string | null;
  org_name: string | null;
  org_slug: string | null;
  spent_on: string;
  amount: number;
  category: string;
  title: string;
  currency: string;
  /** false: a group share in another currency, listed but never added to totals */
  counted: boolean;
  created_at: string;
};

export type MeContext = { profile: Profile; currency: string; categories: PCategory[] };

/** The logged-in person's Me: profile + categories, seeded on the first visit. Cached per request. */
export const getMe = cache(async (): Promise<MeContext> => {
  const profile = await requireProfile();
  const db = meDb(profile.id);
  const read = () => db.select("personal_categories").order("sort").order("label");
  let { data } = await read();
  if (!data?.length) {
    await db.seed();
    // A different query from the first read: identical GETs in one render are deduped, which
    // would hand back the empty result again.
    ({ data } = await read().limit(100));
  }
  return {
    profile: { ...profile, monthly_income: profile.monthly_income === null ? null : Number(profile.monthly_income) },
    currency: profile.currency ?? "LKR",
    categories: (data ?? []) as PCategory[],
  };
});

/** Everything you spent between two dates (both included), newest first. See personal_spend() in SQL. */
export async function getSpend(profileId: string, from: string, to: string): Promise<SpendRow[]> {
  const { data, error } = await meDb(profileId).spend(from, to);
  if (error) throw new Error(error.message);
  return ((data ?? []) as SpendRow[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function getBudgets(profileId: string, opts: { includeArchived?: boolean } = {}): Promise<PBudget[]> {
  let q = meDb(profileId).select("personal_budgets").order("is_main", { ascending: false }).order("created_at");
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as PBudget[]).map((b) => ({ ...b, amount: Number(b.amount) }));
}

export type BudgetStatus = {
  range: Range;
  /** Amount for this period plus what rolled over */
  limit: number;
  carry: number;
  spent: number;
  spentToday: number;
  left: number;
  /** Days left in the period, today included. 0 when today is outside it. */
  daysLeft: number;
  /** What you can spend per day from today on, before today's spending */
  perDay: number;
  /** What's still fine to spend today: perDay minus what you already spent today */
  safeToday: number;
  /** Where spending lands at the end of the period if the pace so far keeps up */
  projected: number;
  state: "upcoming" | "active" | "ended";
};

function inBudget(b: PBudget, r: SpendRow) {
  return r.counted && (!b.categories || b.categories.includes(r.category));
}

function sumIn(b: PBudget, rows: SpendRow[], r: Range) {
  return round2(rows.reduce((s, x) => (x.spent_on >= r.start && x.spent_on <= r.end && inBudget(b, x) ? s + x.amount : s), 0));
}

/** The dates to load spending for so every budget's status (rollover included) can be worked out. */
export function spendWindow(budgets: PBudget[], today: string, payday: number | null): Range {
  let start = today;
  let end = today;
  for (const b of budgets) {
    const opts = { payday, startsOn: b.starts_on, endsOn: b.ends_on };
    const cur = periodRange(b.period, today, opts);
    const from = b.rollover === "carry" ? periodRange(b.period, b.starts_on, opts).start : cur.start;
    if (from < start) start = from;
    if (cur.end > end) end = cur.end;
  }
  return { start, end };
}

/**
 * Where a budget stands today. Rollover "carry" adds what was left (or takes what was overspent)
 * in every closed period since the budget started (rule 5 in docs/personal-budget-plan.md).
 */
export function budgetStatus(b: PBudget, rows: SpendRow[], today: string, payday: number | null): BudgetStatus {
  const opts = { payday, startsOn: b.starts_on, endsOn: b.ends_on };
  const range = periodRange(b.period, today, opts);
  let carry = 0;
  if (b.rollover === "carry") {
    for (const r of closedPeriods(b.period, b.starts_on, today, opts)) carry += b.amount - sumIn(b, rows, r);
  }
  carry = round2(carry);
  const limit = round2(b.amount + carry);
  const spent = sumIn(b, rows, range);
  const state = today < range.start ? "upcoming" : today > range.end ? "ended" : "active";
  const spentToday = state === "active" ? sumIn(b, rows, { start: today, end: today }) : 0;
  const daysLeft = state === "active" ? daysBetween(today, range.end) : 0;
  const perDay = daysLeft ? round2((limit - (spent - spentToday)) / daysLeft) : 0;
  const elapsed = state === "active" ? daysBetween(range.start, today) : daysBetween(range.start, range.end);
  const total = daysBetween(range.start, range.end);
  return {
    range,
    limit,
    carry,
    spent,
    spentToday,
    left: round2(limit - spent),
    daysLeft,
    perDay,
    safeToday: round2(perDay - spentToday),
    projected: state === "upcoming" ? 0 : round2((spent / Math.max(1, elapsed)) * total),
    state,
  };
}

export type Chip = { title: string; amount: number; category: string };

/** Hour of day in Colombo for a timestamp. */
function colomboHour(ts: string) {
  return new Date(new Date(ts).getTime() + 5.5 * 3_600_000).getUTCHours();
}

/** Morning / midday / evening / night, so chips match the time you usually buy that thing. */
const slot = (h: number) => (h < 11 ? 0 : h < 15 ? 1 : h < 19 ? 2 : 3);

/**
 * From your own recent entries: what you typed before (for category guesses) and the
 * entries you repeat most, weighted towards this time of day (one-tap chips).
 */
export async function getHabits(profileId: string): Promise<{ history: History; chips: Chip[] }> {
  const { data } = await meDb(profileId)
    .select("personal_expenses", "title, amount, category, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as { title: string; amount: number; category: string; created_at: string }[];
  const seen = new Set<string>();
  const history: History = [];
  for (const r of rows) {
    const k = r.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    history.push({ title: r.title, category: r.category });
  }
  const now = slot(nowColombo().hour);
  const score = new Map<string, { chip: Chip; score: number; count: number }>();
  rows.forEach((r, i) => {
    const amount = Number(r.amount);
    const k = `${r.title.toLowerCase()}|${amount}`;
    const w = (slot(colomboHour(r.created_at)) === now ? 2 : 1) * (i < 30 ? 1.5 : 1);
    const cur = score.get(k);
    if (cur) {
      cur.score += w;
      cur.count += 1;
    } else score.set(k, { chip: { title: r.title, amount, category: r.category }, score: w, count: 1 });
  });
  const chips = [...score.values()]
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((c) => c.chip);
  return { history, chips };
}

/** Starter words for someone with no history yet, by time of day. They fill the box; you add the amount. */
export function starterChips(): string[] {
  const s = slot(nowColombo().hour);
  return [
    ["Breakfast", "Tea", "Bus", "Uber"],
    ["Lunch", "Coffee", "PickMe", "Groceries"],
    ["Tea", "Snacks", "Bus", "Groceries"],
    ["Dinner", "Uber", "Groceries", "Reload"],
  ][s];
}


export type GroupFeed = {
  orgId: string;
  name: string;
  currency: string;
  enabled: boolean;
  /** The group's categories (plus meal orders and the SMS fee) and where each lands in Me */
  categories: { key: string; label: string; mapped: string | null; fallback: string }[];
};

/** Your active groups, whether each feeds into Me, and how its categories map to yours. */
export async function getGroupFeeds(profileId: string, mine: PCategory[]): Promise<GroupFeed[]> {
  const groups = (await getMemberships(profileId)).filter((m) => m.member.status === "active");
  if (!groups.length) return [];
  const ids = groups.map((g) => g.org.id);
  const db = meDb(profileId);
  const [{ data: feeds }, { data: maps }, { data: cats }] = await Promise.all([
    db.select("personal_group_feed", "org_id, enabled"),
    db.select("personal_category_map", "org_id, org_category, personal_key"),
    // Only the categories of groups you're in (ids come from your own memberships).
    createAdminClient().from("org_categories").select("org_id, key, label, sort").in("org_id", ids).eq("archived", false).order("sort"),
  ]);
  const have = new Set(mine.map((c) => c.key));
  const off = new Set(((feeds ?? []) as { org_id: string; enabled: boolean }[]).filter((f) => !f.enabled).map((f) => f.org_id));
  const mapped = new Map(
    ((maps ?? []) as { org_id: string; org_category: string; personal_key: string }[]).map((m) => [`${m.org_id}|${m.org_category}`, m.personal_key]),
  );
  // Mirrors personal_default_key() in SQL.
  const ALIAS: Record<string, string> = { ride: "transport", fuel: "transport", stay: "travel", tickets: "fun", __meal: "food", __sms: "bills" };
  const fallback = (k: string) => {
    const d = ALIAS[k] ?? k;
    return have.has(d) ? d : "other";
  };
  return groups.map(({ org }) => ({
    orgId: org.id,
    name: org.name,
    currency: org.currency,
    enabled: !off.has(org.id),
    categories: [
      ...((cats ?? []) as { org_id: string; key: string; label: string }[]).filter((c) => c.org_id === org.id),
      { key: "__meal", label: "Meal orders" },
      { key: "__sms", label: "SMS fee" },
    ].map((c) => ({ key: c.key, label: c.label, mapped: mapped.get(`${org.id}|${c.key}`) ?? null, fallback: fallback(c.key) })),
  }));
}

/** suggestBudget for every period that has one (custom budgets don't). */
export function suggestionsFor(monthlyIncome: number | null): Partial<Record<Period, number>> {
  const out: Partial<Record<Period, number>> = {};
  for (const p of ["day", "week", "month", "payday", "year"] as const) {
    const v = suggestBudget(monthlyIncome, p);
    if (v !== null) out[p] = v;
  }
  return out;
}
