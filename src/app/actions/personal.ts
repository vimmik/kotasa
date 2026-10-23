"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getMemberships } from "@/lib/auth";
import { isCurrency } from "@/lib/currency";
import { meDb } from "@/lib/me-db";
import { PERIODS, type Period } from "@/lib/periods";
import { getMe } from "@/lib/personal";
import { slugify } from "@/lib/org-config";
import { isValidDate, todayColombo } from "@/lib/time";
import { CATEGORY_ICON_NAMES, round2, type ActionState } from "@/lib/types";

// Every action here works only on the logged-in person's own Me data: getMe() finds the profile
// from the session and meDb() scopes every query to it. Nothing in a form says whose data it is.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/;
const MAX = 99_999_999;

export type QuickState = (ActionState & { undoId?: string }) | null;

// ---------------- Spending ----------------

/** Add (or, with an id, edit) one of your own entries. */
export async function savePersonalExpense(_: QuickState, f: FormData): Promise<QuickState> {
  const me = await getMe();
  const id = str(f, "id");
  const amount = round2(Number(str(f, "amount").replace(/,/g, "")));
  const title = str(f, "title").slice(0, 80);
  const category = str(f, "category");
  const spentOn = str(f, "spent_on") || todayColombo();
  const source = str(f, "source") === "quick" ? "quick" : "manual";
  if (!(amount > 0) || amount > MAX) return { error: "Enter the amount, like 450" };
  if (!title) return { error: "Say what it was for, like “Lunch”" };
  if (!isValidDate(spentOn) || spentOn > todayColombo()) return { error: "Pick a date that isn't in the future" };
  if (!me.categories.some((c) => c.key === category)) return { error: "Pick a category" };

  const db = meDb(me.profile.id);
  const row = { amount, title, category, spent_on: spentOn, note: str(f, "note").slice(0, 300) || null };
  if (id) {
    if (!UUID.test(id)) return { error: "That entry is gone. Add it again." };
    const { data, error } = await db.update("personal_expenses", row).eq("id", id).select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "That entry is gone. Add it again." };
    refresh();
    redirect("/me/spending?saved=1");
  }
  const { data, error } = await db.insert("personal_expenses", { ...row, source }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't save it. Try again." };
  // The full form goes to the list; quick add stays put and offers an undo.
  if (source === "manual") redirect("/me/spending?saved=1");
  refresh();
  return { ok: true, message: `Added ${title}`, undoId: (data as { id: string }).id };
}

export async function deletePersonalExpense(f: FormData) {
  const me = await getMe();
  const id = str(f, "id");
  if (UUID.test(id)) await meDb(me.profile.id).delete("personal_expenses").eq("id", id);
  if (str(f, "back")) redirect("/me/spending");
  refresh();
}

// ---------------- Budgets ----------------

export async function savePersonalBudget(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await getMe();
  const id = str(f, "id");
  const name = str(f, "name").slice(0, 60);
  const amount = round2(Number(str(f, "amount").replace(/,/g, "")));
  const period = str(f, "period") as Period;
  const rollover = str(f, "rollover") === "carry" ? "carry" : "off";
  const isMain = f.get("is_main") === "on";
  const cats = f.getAll("categories").map(String);
  const today = todayColombo();
  let startsOn = str(f, "starts_on") || today;
  const endsOn = period === "custom" ? str(f, "ends_on") : null;

  if (!name) return { error: "Give the budget a name, like “Monthly spending”" };
  if (!(amount > 0) || amount > MAX) return { error: "Enter how much you want to spend" };
  if (!PERIODS.some((p) => p.id === period)) return { error: "Pick how often the budget resets" };
  if (!isValidDate(startsOn)) startsOn = today;
  if (period === "custom" && (!endsOn || !isValidDate(endsOn) || endsOn < startsOn))
    return { error: "Pick the first and last day, with the last one after the first" };
  const have = new Set(me.categories.map((c) => c.key));
  if (cats.some((c) => !have.has(c))) return { error: "One of those categories no longer exists. Reload and try again." };

  if (period === "payday") {
    const payday = Number(str(f, "payday"));
    if (!(payday >= 1 && payday <= 28)) return { error: "Pick your payday, a day from 1 to 28" };
    await meDb(me.profile.id).updateProfile({ payday });
  }

  const db = meDb(me.profile.id);
  const row = {
    name,
    amount,
    period,
    starts_on: startsOn,
    ends_on: endsOn,
    categories: cats.length ? cats : null,
    rollover,
    is_main: isMain,
  };
  // Only one main budget: making this one main takes it off the others.
  if (isMain) {
    let q = db.update("personal_budgets", { is_main: false }).eq("is_main", true);
    if (id) q = q.neq("id", id);
    await q;
  }
  if (id) {
    if (!UUID.test(id)) return { error: "Budget not found" };
    const { data, error } = await db.update("personal_budgets", row).eq("id", id).select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Budget not found" };
  } else {
    // The first budget you make is your main one.
    const { data: main } = await db.select("personal_budgets", "id").eq("archived", false).eq("is_main", true).limit(1);
    const { error } = await db.insert("personal_budgets", { ...row, is_main: isMain || !main?.length });
    if (error) return { error: error.message };
  }
  refresh();
  redirect("/me/budgets");
}

export async function archivePersonalBudget(f: FormData) {
  const me = await getMe();
  const id = str(f, "id");
  if (UUID.test(id)) await meDb(me.profile.id).update("personal_budgets", { archived: true, is_main: false }).eq("id", id);
  refresh();
  redirect("/me/budgets");
}

// ---------------- Settings ----------------

export async function saveMoneySettings(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await getMe();
  const currency = str(f, "currency");
  const incomeRaw = str(f, "monthly_income").replace(/,/g, "");
  const income = incomeRaw ? round2(Number(incomeRaw)) : null;
  const paydayRaw = str(f, "payday");
  const payday = paydayRaw ? Number(paydayRaw) : null;
  if (!isCurrency(currency)) return { error: "Pick a currency from the list" };
  if (income !== null && !(income > 0 && income <= MAX)) return { error: "Enter your take-home pay, or leave it empty" };
  if (payday !== null && !(Number.isInteger(payday) && payday >= 1 && payday <= 28))
    return { error: "Payday must be a day from 1 to 28, or leave it empty" };
  const { error } = await meDb(me.profile.id).updateProfile({ currency, monthly_income: income, payday });
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: "Saved" };
}

export async function savePersonalCategory(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await getMe();
  const key = str(f, "key");
  const label = str(f, "label").slice(0, 30);
  const icon = str(f, "icon");
  if (!label) return { error: "Give the category a name" };
  if (!(CATEGORY_ICON_NAMES as readonly string[]).includes(icon)) return { error: "Pick an icon" };
  const db = meDb(me.profile.id);
  if (key) {
    if (!me.categories.some((c) => c.key === key)) return { error: "Category not found" };
    const { error } = await db.update("personal_categories", { label, icon }).eq("key", key);
    if (error) return { error: error.message };
  } else {
    const newKey = slugify(label).slice(0, 30) || "category";
    if (me.categories.some((c) => c.key === newKey)) return { error: `You already have “${label}”` };
    const { error } = await db.insert("personal_categories", {
      key: newKey,
      label,
      icon,
      sort: Math.max(0, ...me.categories.filter((c) => c.key !== "other").map((c) => c.sort)) + 1,
    });
    if (error) return { error: error.message };
  }
  refresh();
  return { ok: true, message: "Saved" };
}

export async function toggleCategoryArchived(f: FormData) {
  const me = await getMe();
  const key = str(f, "key");
  const cat = me.categories.find((c) => c.key === key);
  // "other" catches everything without a better home, so it always stays.
  if (cat && key !== "other") await meDb(me.profile.id).update("personal_categories", { archived: !cat.archived }).eq("key", key);
  refresh();
}

/** Is this one of your groups? Feed and mapping settings only make sense for those. */
async function isMyGroup(profileId: string, orgId: string) {
  return UUID.test(orgId) && (await getMemberships(profileId)).some((m) => m.org.id === orgId);
}

export async function setGroupFeed(f: FormData) {
  const me = await getMe();
  const orgId = str(f, "org_id");
  if (!(await isMyGroup(me.profile.id, orgId))) return;
  await meDb(me.profile.id).upsert(
    "personal_group_feed",
    { org_id: orgId, enabled: f.get("enabled") === "1" },
    { onConflict: "profile_id,org_id" },
  );
  refresh();
}

export async function setCategoryMap(f: FormData) {
  const me = await getMe();
  const orgId = str(f, "org_id");
  const orgCategory = str(f, "org_category").slice(0, 40);
  const personalKey = str(f, "personal_key");
  if (!orgCategory || !(await isMyGroup(me.profile.id, orgId))) return;
  const db = meDb(me.profile.id);
  if (!personalKey) {
    await db.delete("personal_category_map").eq("org_id", orgId).eq("org_category", orgCategory);
  } else if (me.categories.some((c) => c.key === personalKey)) {
    await db.upsert(
      "personal_category_map",
      { org_id: orgId, org_category: orgCategory, personal_key: personalKey },
      { onConflict: "profile_id,org_id,org_category" },
    );
  }
  refresh();
}
