"use server";

import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getSettings, requireAdmin, requireMember } from "@/lib/auth";
import { isPastCutoff, isValidDate } from "@/lib/time";
import { round2, type ActionState, type Meal, type MenuItem } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const parseMeal = (v: unknown): Meal | null => (v === "breakfast" || v === "lunch" ? v : null);

/** Put / change / remove one person's order for one meal on one day. */
async function setOrder(o: {
  personId: string;
  date: string;
  meal: Meal;
  menuItemId: string | null;
  qty: number;
  actorId: string;
  payeeId: string | null;
}): Promise<string | null> {
  const admin = createAdminClient();
  const qty = Math.min(10, Math.max(1, Math.floor(o.qty || 1)));
  if (!o.menuItemId) {
    const { error } = await admin.from("orders").delete().match({ person_id: o.personId, order_date: o.date, meal: o.meal });
    return error?.message ?? null;
  }
  const { data } = await admin.from("menu_items").select("*").eq("id", o.menuItemId).maybeSingle();
  const mi = data as MenuItem | null;
  if (!mi || mi.menu_date !== o.date || mi.meal !== o.meal) return "That item isn't on this day's menu";
  const { error } = await admin.from("orders").upsert(
    {
      person_id: o.personId,
      order_date: o.date,
      meal: o.meal,
      menu_item_id: mi.id,
      item_name: mi.name,
      unit_price: mi.price,
      qty,
      payee_id: o.payeeId,
      created_by: o.actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "person_id,order_date,meal" },
  );
  return error?.message ?? null;
}

export async function saveMyOrder(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireMember();
  const date = str(f, "date");
  const meal = parseMeal(f.get("meal"));
  const menuItemId = str(f, "menu_item_id") || null;
  if (!isValidDate(date) || !meal) return { error: "Invalid request" };
  const settings = await getSettings();
  const cutoff = meal === "breakfast" ? settings.breakfast_cutoff : settings.lunch_cutoff;
  if (isPastCutoff(date, cutoff)) return { error: `Orders closed at ${cutoff.slice(0, 5)}` };
  if (menuItemId) {
    const { data } = await createAdminClient().from("menu_items").select("available").eq("id", menuItemId).maybeSingle();
    if (!data?.available) return { error: "That item isn't available any more" };
  }
  const err = await setOrder({
    personId: me.id,
    date,
    meal,
    menuItemId,
    qty: Number(f.get("qty") ?? 1),
    actorId: me.id,
    payeeId: settings.collector_id,
  });
  if (err) return { error: err };
  refresh();
  return { ok: true, message: menuItemId ? "Saved" : "Removed" };
}

/** Admin saves a whole day. Fields: item_<meal>_<personId>, qty_<meal>_<personId> */
export async function saveDayOrders(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const date = str(f, "date");
  if (!isValidDate(date)) return { error: "Invalid date" };
  const settings = await getSettings();
  const { data: existing } = await createAdminClient()
    .from("orders")
    .select("person_id, meal, menu_item_id, qty")
    .eq("order_date", date);
  const current = new Map((existing ?? []).map((o) => [`${o.meal}_${o.person_id}`, `${o.menu_item_id ?? ""}|${o.qty}`]));

  let changed = 0;
  const errors: string[] = [];
  for (const [key, value] of f.entries()) {
    const m = /^item_(breakfast|lunch)_(.+)$/.exec(key);
    if (!m) continue;
    const meal = m[1] as Meal;
    const personId = m[2];
    const itemId = String(value) || null;
    const qty = Number(f.get(`qty_${meal}_${personId}`) ?? 1) || 1;
    const k = `${meal}_${personId}`;
    if (!itemId && !current.has(k)) continue;
    if (itemId && current.get(k) === `${itemId}|${qty}`) continue;
    const err = await setOrder({ personId, date, meal, menuItemId: itemId, qty, actorId: me.id, payeeId: settings.collector_id });
    if (err) errors.push(err);
    else changed++;
  }
  refresh();
  if (errors.length) return { error: `${errors.length} change(s) failed: ${errors[0]}` };
  return { ok: true, message: changed ? `Saved ${changed} change(s)` : "No changes" };
}

// ---------------- Menu (admin) ----------------

export async function addMenuItem(_: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  const date = str(f, "date");
  const meal = parseMeal(str(f, "meal"));
  const name = str(f, "name");
  const price = round2(Number(str(f, "price")));
  if (!isValidDate(date) || !meal) return { error: "Invalid request" };
  if (!name) return { error: "Enter the item name" };
  if (!(price >= 0) || str(f, "price") === "") return { error: "Enter a price" };
  const { error } = await createAdminClient().from("menu_items").insert({ menu_date: date, meal, name, price });
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: `Added ${name}` };
}

export async function updateMenuItem(_: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = str(f, "id");
  const name = str(f, "name");
  const price = round2(Number(str(f, "price")));
  if (!id || !name || !(price >= 0)) return { error: "Check the name and price" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("menu_items")
    .update({ name, price, available: f.get("available") === "on" })
    .eq("id", id);
  if (error) return { error: error.message };
  // A corrected price also fixes that day's orders for the item
  await admin.from("orders").update({ item_name: name, unit_price: price }).eq("menu_item_id", id);
  refresh();
  return { ok: true, message: "Updated" };
}

export async function deleteMenuItem(f: FormData) {
  await requireAdmin();
  const id = str(f, "id");
  const admin = createAdminClient();
  const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("menu_item_id", id);
  if ((count ?? 0) > 0) await admin.from("menu_items").update({ available: false }).eq("id", id);
  else await admin.from("menu_items").delete().eq("id", id);
  refresh();
}

export async function copyMenu(_: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  const from = str(f, "from");
  const to = str(f, "to");
  if (!isValidDate(from) || !isValidDate(to) || from === to) return { error: "Pick a different date to copy from" };
  const admin = createAdminClient();
  const { data: src } = await admin.from("menu_items").select("meal, name, price").eq("menu_date", from);
  if (!src?.length) return { error: "No menu on that date" };
  const { data: existing } = await admin.from("menu_items").select("meal, name").eq("menu_date", to);
  const have = new Set((existing ?? []).map((e) => `${e.meal}|${e.name.toLowerCase()}`));
  const rows = src.filter((s) => !have.has(`${s.meal}|${s.name.toLowerCase()}`)).map((s) => ({ ...s, menu_date: to }));
  if (rows.length) {
    const { error } = await admin.from("menu_items").insert(rows);
    if (error) return { error: error.message };
  }
  refresh();
  return { ok: true, message: `Copied ${rows.length} item(s)` };
}
