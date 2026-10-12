"use server";

import { refresh } from "next/cache";
import { can, requireMemberFromForm, type OrgContext } from "@/lib/auth";
import { orgDb } from "@/lib/org-db";
import { isPastCutoff, isValidDate } from "@/lib/time";
import { splitEqually } from "@/lib/split";
import { isPooled, mealJoins, mealModes, resplitMeal } from "@/lib/meals";
import { readCopayers } from "@/lib/payers";
import { round2, type ActionState, type MealSlot, type MenuItem } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/;

async function mealsCtx(f: FormData): Promise<OrgContext | ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!ctx.settings.meals_enabled) return { error: "Meals are turned off for this group" };
  return ctx;
}
const isCtx = (x: OrgContext | ActionState): x is OrgContext => !!x && "org" in x;

async function getSlot(orgId: string, key: string): Promise<MealSlot | null> {
  if (!key) return null;
  const { data } = await orgDb(orgId).select("org_meal_slots").eq("key", key).eq("archived", false).maybeSingle();
  return (data as MealSlot | null) ?? null;
}

/** Put / change / remove one member's order for one meal slot on one day. */
async function setOrder(
  ctx: OrgContext,
  o: { personId: string; date: string; meal: string; menuItemId: string | null; qty: number },
): Promise<string | null> {
  const db = orgDb(ctx.org.id);
  const qty = Math.min(10, Math.max(1, Math.floor(o.qty || 1)));
  if (!o.menuItemId) {
    const { error } = await db.delete("orders").match({ person_id: o.personId, order_date: o.date, meal: o.meal });
    return error?.message ?? null;
  }
  if (!UUID.test(o.menuItemId)) return "That item isn't on this day's menu";
  // Independent reads: run together so each order costs one round trip less.
  const [{ data }, payee] = await Promise.all([
    db.select("menu_items").eq("id", o.menuItemId).maybeSingle(),
    mealPayer(ctx, o.date, o.meal),
  ]);
  const mi = data as MenuItem | null;
  if (!mi || mi.menu_date !== o.date || mi.meal !== o.meal) return "That item isn't on this day's menu";
  const { error } = await db.upsert(
    "orders",
    {
      person_id: o.personId,
      order_date: o.date,
      meal: o.meal,
      menu_item_id: mi.id,
      item_name: mi.name,
      unit_price: mi.price,
      qty,
      payee_id: payee,
      created_by: ctx.member.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "person_id,order_date,meal" },
  );
  return error?.message ?? null;
}

export async function saveMyOrder(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await mealsCtx(f);
  if (!isCtx(ctx)) return ctx;
  const date = str(f, "date");
  const slot = await getSlot(ctx.org.id, str(f, "meal"));
  const menuItemId = str(f, "menu_item_id") || null;
  if (!isValidDate(date) || !slot) return { error: "Invalid request" };
  if (isPastCutoff(date, slot.cutoff)) return { error: `Orders closed at ${slot.cutoff.slice(0, 5)}` };
  if (await isPooled(ctx.org.id, slot, date)) return { error: `${slot.label} is a shared bill that day. Join it instead` };
  if (menuItemId) {
    if (!UUID.test(menuItemId)) return { error: "That item isn't available any more" };
    const { data } = await orgDb(ctx.org.id).select("menu_items", "available").eq("id", menuItemId).maybeSingle();
    if (!(data as { available: boolean } | null)?.available) return { error: "That item isn't available any more" };
  }
  const err = await setOrder(ctx, {
    personId: ctx.member.id,
    date,
    meal: slot.key,
    menuItemId,
    qty: Number(f.get("qty") ?? 1),
  });
  if (err) return { error: err };
  refresh();
  return { ok: true, message: menuItemId ? "Saved" : "Removed" };
}

/** Join or leave a shared-bill meal yourself (before the cutoff). Field: eating = "1" | "0". */
export async function joinMeal(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await mealsCtx(f);
  if (!isCtx(ctx)) return ctx;
  const date = str(f, "date");
  const slot = await getSlot(ctx.org.id, str(f, "meal"));
  if (!isValidDate(date) || !slot) return { error: "Invalid request" };
  if (isPastCutoff(date, slot.cutoff)) return { error: `Closed at ${slot.cutoff.slice(0, 5)}. Ask the admin to add you` };
  if (!(await isPooled(ctx.org.id, slot, date))) return { error: `${slot.label} isn't a shared bill that day` };
  const db = orgDb(ctx.org.id);
  const eating = str(f, "eating") === "1";
  const row = { join_date: date, meal: slot.key, member_id: ctx.member.id };
  const { error } = eating
    ? await db.upsert("meal_joins", { ...row, created_by: ctx.member.id }, { onConflict: "org_id,join_date,meal,member_id" })
    : await db.delete("meal_joins").match(row);
  if (error) return { error: error.message };
  await resplitMeal(ctx.org.id, date, slot.key);
  refresh();
  return { ok: true, message: eating ? "You're in" : "Not eating" };
}

/**
 * Save a whole day for everyone.
 * Ordered meals: item_<slot>_<memberId>, qty_<slot>_<memberId>.
 * Shared-bill meals: pooled_slots lists them, join_<slot> = every member eating.
 */
export async function saveDayOrders(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await mealsCtx(f);
  if (!isCtx(ctx)) return ctx;
  if (!can(ctx, "meals.order_for_others")) return { error: "Your role can't change other people's orders" };
  const date = str(f, "date");
  if (!isValidDate(date)) return { error: "Invalid date" };
  const db = orgDb(ctx.org.id);
  const [{ data: existing }, { data: members }, { data: slots }] = await Promise.all([
    db.select("orders", "person_id, meal, menu_item_id, qty").eq("order_date", date),
    db.select("members", "id").eq("status", "active"),
    db.select("org_meal_slots").eq("archived", false),
  ]);
  const memberIds = new Set(((members ?? []) as { id: string }[]).map((m) => m.id));
  const slotList = (slots ?? []) as MealSlot[];
  const pooled = await mealModes(ctx.org.id, slotList, date, date);
  const slotKeys = new Set(slotList.filter((s) => !pooled(date, s.key)).map((s) => s.key));
  const current = new Map(
    ((existing ?? []) as { person_id: string; meal: string; menu_item_id: string | null; qty: number }[]).map((o) => [
      `${o.meal}_${o.person_id}`,
      `${o.menu_item_id ?? ""}|${o.qty}`,
    ]),
  );

  let changed = 0;
  const errors: string[] = [];
  const edits: Parameters<typeof setOrder>[1][] = [];
  for (const [key, value] of f.entries()) {
    const m = /^item_(.+)_([0-9a-f-]{36})$/.exec(key);
    if (!m) continue;
    const [, meal, personId] = m;
    if (!slotKeys.has(meal) || !memberIds.has(personId)) continue;
    const itemId = String(value) || null;
    const qty = Number(f.get(`qty_${meal}_${personId}`) ?? 1) || 1;
    const k = `${meal}_${personId}`;
    if (!itemId && !current.has(k)) continue;
    if (itemId && current.get(k) === `${itemId}|${qty}`) continue;
    edits.push({ personId, date, meal, menuItemId: itemId, qty });
  }
  // Each edit touches a different (person, meal) row, so they can run in parallel.
  for (const err of await Promise.all(edits.map((o) => setOrder(ctx, o)))) {
    if (err) errors.push(err);
    else changed++;
  }

  const shown = new Set(f.getAll("pooled_slots").map(String));
  for (const s of slotList.filter((x) => pooled(date, x.key) && shown.has(x.key))) {
    const want = new Set(f.getAll(`join_${s.key}`).map(String).filter((id) => memberIds.has(id)));
    const have = new Set(await mealJoins(ctx.org.id, date, s.key));
    const add = [...want].filter((id) => !have.has(id));
    const drop = [...have].filter((id) => !want.has(id));
    if (!add.length && !drop.length) continue;
    if (drop.length) await db.delete("meal_joins").eq("join_date", date).eq("meal", s.key).in("member_id", drop);
    if (add.length) {
      const { error } = await db.insert(
        "meal_joins",
        add.map((member_id) => ({ join_date: date, meal: s.key, member_id, created_by: ctx.member.id })),
      );
      if (error) errors.push(error.message);
    }
    await resplitMeal(ctx.org.id, date, s.key);
    changed += add.length + drop.length;
  }
  refresh();
  if (errors.length) return { error: `${errors.length} change(s) failed: ${errors[0]}` };
  return { ok: true, message: changed ? `Saved ${changed} change(s)` : "No changes" };
}

/** Switch one meal on one day between "everyone orders" and "shared bill". */
export async function setMealMode(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await menuCtx(f);
  if (!isCtx(ctx)) return ctx;
  const date = str(f, "date");
  const slot = await getSlot(ctx.org.id, str(f, "meal"));
  if (!isValidDate(date) || !slot) return { error: "Invalid request" };
  const pooled = str(f, "pooled") === "1";
  const { error } = await orgDb(ctx.org.id).upsert(
    "meal_days",
    { day: date, meal: slot.key, pooled },
    { onConflict: "org_id,day,meal" },
  );
  if (error) return { error: error.message };
  if (pooled) await resplitMeal(ctx.org.id, date, slot.key);
  refresh();
  return { ok: true, message: pooled ? "Shared bill" : "Everyone orders" };
}

/**
 * Who paid the vendor for one meal on one day ("" = back to the collector).
 * Moves that day's existing orders too, so everyone owes the person who actually paid.
 */
export async function setMealPayer(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await menuCtx(f);
  if (!isCtx(ctx)) return ctx;
  const date = str(f, "date");
  const slot = await getSlot(ctx.org.id, str(f, "meal"));
  const memberId = str(f, "member_id");
  if (!isValidDate(date) || !slot) return { error: "Invalid request" };
  const db = orgDb(ctx.org.id);
  const payee = memberId || ctx.settings.collector_id;
  const copayers = readCopayers(f, payee, null);
  if (!Array.isArray(copayers)) return copayers ?? { error: "Check who paid" };
  if (copayers.length && !payee) return { error: "Pick the main payer first, then who else paid part of it" };
  if (copayers.length) {
    const ids = copayers.map((c) => c.member_id);
    const { data: found } = await db.select("members", "id").in("id", ids).eq("status", "active");
    if ((found ?? []).length !== ids.length) return { error: "Someone who paid isn't an active member of this group" };
  }
  if (memberId) {
    if (!UUID.test(memberId)) return { error: "Choose who paid" };
    const { data: m } = await db.select("members", "id").eq("id", memberId).eq("status", "active").maybeSingle();
    if (!m) return { error: "That person isn't an active member of this group" };
    const { error } = await db.upsert(
      "meal_payers",
      { pay_date: date, meal: slot.key, member_id: memberId, set_by: ctx.member.id, updated_at: new Date().toISOString() },
      { onConflict: "org_id,pay_date,meal" },
    );
    if (error) return { error: error.message };
  } else {
    await db.delete("meal_payers").eq("pay_date", date).eq("meal", slot.key);
  }
  const { error } = await db.update("orders", { payee_id: payee }).eq("order_date", date).eq("meal", slot.key);
  if (error) return { error: error.message };
  // Shared items for this meal were paid by the same person.
  if (payee) await db.update("expenses", { paid_by: payee }).eq("meal_date", date).eq("meal", slot.key);
  // Others who chipped in: the main payer owes them their part. A failed clear with nothing to
  // save is ignored (the table may not exist yet).
  const { error: cDel } = await db.delete("meal_copayers").eq("pay_date", date).eq("meal", slot.key);
  if (copayers.length) {
    const rows = copayers.map((c) => ({ ...c, pay_date: date, meal: slot.key, payer_id: payee }));
    const cErr = cDel ?? (await db.insert("meal_copayers", rows)).error;
    if (cErr) return { error: "Saved the payer, but not the others who paid. Try again." };
  }
  refresh();
  return { ok: true, message: "Saved" };
}

/** Who paid for one meal slot on one day: the day's payer, else the collector. */
async function mealPayer(ctx: OrgContext, date: string, meal: string): Promise<string | null> {
  const { data } = await orgDb(ctx.org.id)
    .select("meal_payers", "member_id")
    .eq("pay_date", date)
    .eq("meal", meal)
    .maybeSingle();
  return (data as { member_id: string } | null)?.member_id ?? ctx.settings.collector_id;
}

/**
 * Something bought for the whole meal (family pack, drinks, delivery) split equally among
 * the people chosen (by default: everyone who ordered that meal). Saved as an expense tagged
 * with the day + slot, paid by that meal's payer. Uneven splits: edit it like any expense.
 */
export async function addSharedMealItem(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await menuCtx(f);
  if (!isCtx(ctx)) return ctx;
  const date = str(f, "date");
  const slot = await getSlot(ctx.org.id, str(f, "meal"));
  const title = str(f, "title");
  const amount = round2(Number(str(f, "amount")));
  const people = [...new Set(f.getAll("participants").map(String).filter((x) => UUID.test(x)))];
  if (!isValidDate(date) || !slot) return { error: "Invalid request" };
  if (!title) return { error: "Say what it was, like “Family pack + 2 Coke”" };
  if (!(amount > 0)) return { error: "Enter the amount" };
  const pooled = await isPooled(ctx.org.id, slot, date);
  if (pooled) {
    // A shared-bill meal is always split among everyone who joined it.
    people.splice(0, people.length, ...(await mealJoins(ctx.org.id, date, slot.key)));
    if (!people.length) return { error: `Nobody has joined ${slot.label.toLowerCase()} yet` };
  }
  if (!people.length) return { error: "Choose who shares it" };

  const db = orgDb(ctx.org.id);
  const paidBy = await mealPayer(ctx, date, slot.key);
  if (!paidBy) return { error: `Set who paid for ${slot.label.toLowerCase()} first` };
  const ids = [...new Set([paidBy, ...people])];
  const { data: found } = await db.select("members", "id").in("id", ids).eq("status", "active");
  if ((found ?? []).length !== ids.length) return { error: "Someone here isn't an active member of this group" };

  const { data: cats } = await db.select("org_categories", "key").eq("archived", false).order("sort");
  const keys = ((cats ?? []) as { key: string }[]).map((c) => c.key);
  const category = keys.includes("food") ? "food" : keys[0];
  if (!category) return { error: "Add an expense category in Settings first" };

  const { data, error } = await db
    .insert("expenses", {
      title,
      amount,
      category,
      expense_date: date,
      paid_by: paidBy,
      split_type: "equal",
      meal_date: date,
      meal: slot.key,
      note: `Shared ${slot.label.toLowerCase()}`,
      created_by: ctx.member.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't save" };
  const expenseId = (data as { id: string }).id;
  const { error: sErr } = await db.insert(
    "expense_shares",
    splitEqually(amount, people).map((s) => ({ ...s, expense_id: expenseId })),
  );
  if (sErr) {
    await db.delete("expenses").eq("id", expenseId);
    return { error: sErr.message };
  }
  refresh();
  return { ok: true, message: `Added ${title}, ${people.length} people` };
}

// ---------------- Menu ----------------

async function menuCtx(f: FormData): Promise<OrgContext | ActionState> {
  const ctx = await mealsCtx(f);
  if (isCtx(ctx) && !can(ctx, "meals.manage_menu")) return { error: "Your role can't change the menu" };
  return ctx;
}

export async function addMenuItem(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await menuCtx(f);
  if (!isCtx(ctx)) return ctx;
  const date = str(f, "date");
  const slot = await getSlot(ctx.org.id, str(f, "meal"));
  const name = str(f, "name");
  const price = round2(Number(str(f, "price")));
  if (!isValidDate(date) || !slot) return { error: "Invalid request" };
  if (!name) return { error: "Enter the item name" };
  if (!(price >= 0) || str(f, "price") === "") return { error: "Enter a price" };
  const { error } = await orgDb(ctx.org.id).insert("menu_items", { menu_date: date, meal: slot.key, name, price });
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: `Added ${name}` };
}

export async function updateMenuItem(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await menuCtx(f);
  if (!isCtx(ctx)) return ctx;
  const id = str(f, "id");
  const name = str(f, "name");
  const price = round2(Number(str(f, "price")));
  if (!UUID.test(id) || !name || !(price >= 0)) return { error: "Check the name and price" };
  const db = orgDb(ctx.org.id);
  const { error } = await db.update("menu_items", { name, price, available: f.get("available") === "on" }).eq("id", id);
  if (error) return { error: error.message };
  // A corrected price also fixes that day's orders for the item
  await db.update("orders", { item_name: name, unit_price: price }).eq("menu_item_id", id);
  refresh();
  return { ok: true, message: "Updated" };
}

export async function deleteMenuItem(f: FormData) {
  const ctx = await menuCtx(f);
  if (!isCtx(ctx)) return;
  const id = str(f, "id");
  if (!UUID.test(id)) return;
  const db = orgDb(ctx.org.id);
  const { count } = await db.select("orders", "id", { count: "exact", head: true }).eq("menu_item_id", id);
  if ((count ?? 0) > 0) await db.update("menu_items", { available: false }).eq("id", id);
  else await db.delete("menu_items").eq("id", id);
  refresh();
}

export async function copyMenu(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await menuCtx(f);
  if (!isCtx(ctx)) return ctx;
  const from = str(f, "from");
  const to = str(f, "to");
  if (!isValidDate(from) || !isValidDate(to) || from === to) return { error: "Pick a different date to copy from" };
  const db = orgDb(ctx.org.id);
  const { data: src } = await db.select("menu_items", "meal, name, price").eq("menu_date", from);
  if (!src?.length) return { error: "No menu on that date" };
  const { data: existing } = await db.select("menu_items", "meal, name").eq("menu_date", to);
  const have = new Set(((existing ?? []) as { meal: string; name: string }[]).map((e) => `${e.meal}|${e.name.toLowerCase()}`));
  const rows = (src as { meal: string; name: string; price: number }[])
    .filter((s) => !have.has(`${s.meal}|${s.name.toLowerCase()}`))
    .map((s) => ({ ...s, menu_date: to }));
  if (rows.length) {
    const { error } = await db.insert("menu_items", rows);
    if (error) return { error: error.message };
  }
  refresh();
  return { ok: true, message: `Copied ${rows.length} item(s)` };
}
